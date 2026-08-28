package main

import (
	"strings"
	"testing"
	"time"
)

func TestValidateAllowedDecision(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	input := options{
		source:        "blizzard_api",
		environment:   "production",
		surface:       "public_api",
		decision:      "allowed",
		approvedBy:    "owner@example.com",
		reason:        "approved for the registered application",
		evidenceSHA:   strings.Repeat("ab", 32),
		expiresAtText: now.Add(30 * 24 * time.Hour).Format(time.RFC3339),
	}
	expiresAt, hash, err := validate(input, now)
	if err != nil {
		t.Fatal(err)
	}
	if expiresAt == nil || len(hash) != 32 {
		t.Fatalf("expiresAt=%v hashBytes=%d", expiresAt, len(hash))
	}
}

func TestValidateRejectsUnsafeApproval(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	base := options{
		source:        "blizzard_api",
		environment:   "production",
		surface:       "asset_cache",
		decision:      "allowed",
		approvedBy:    "owner@example.com",
		reason:        "approved",
		evidenceSHA:   strings.Repeat("ab", 32),
		expiresAtText: now.Add(30 * 24 * time.Hour).Format(time.RFC3339),
	}
	tests := map[string]func(*options){
		"missing owner":   func(value *options) { value.approvedBy = "" },
		"unknown surface": func(value *options) { value.surface = "other" },
		"bad hash":        func(value *options) { value.evidenceSHA = "abcd" },
		"expired":         func(value *options) { value.expiresAtText = now.Add(-time.Hour).Format(time.RFC3339) },
		"too long": func(value *options) {
			value.expiresAtText = now.Add(maximumApprovalDuration + time.Hour).Format(time.RFC3339)
		},
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			input := base
			mutate(&input)
			if _, _, err := validate(input, now); err == nil {
				t.Fatal("validation unexpectedly succeeded")
			}
		})
	}
}

func TestValidateBlockedDecision(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	input := options{
		source:      "blizzard_api",
		environment: "production",
		surface:     "asset_cache",
		decision:    "blocked",
		approvedBy:  "owner@example.com",
		reason:      "revoked",
	}
	if expiresAt, hash, err := validate(input, now); err != nil || expiresAt != nil || hash != nil {
		t.Fatalf("expiresAt=%v hash=%x err=%v", expiresAt, hash, err)
	}
	input.expiresAtText = now.Add(time.Hour).Format(time.RFC3339)
	if _, _, err := validate(input, now); err == nil {
		t.Fatal("blocked decision accepted an expiry")
	}
}
