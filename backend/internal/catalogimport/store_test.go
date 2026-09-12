package catalogimport

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestSourceRecordManifestProofIsOrderIndependent(t *testing.T) {
	t.Parallel()
	first := sha256.Sum256([]byte("first"))
	second := sha256.Sum256([]byte("second"))
	records := []sourceRecordProofEntry{
		{Key: "2", ContentHash: second[:]},
		{Key: "1", ContentHash: first[:]},
	}
	proof, err := sourceRecordManifestProof(records)
	if err != nil {
		t.Fatal(err)
	}
	slices.Reverse(records)
	reversed, err := sourceRecordManifestProof(records)
	if err != nil {
		t.Fatal(err)
	}
	if proof.SHA256 != reversed.SHA256 || proof.ByteSize != reversed.ByteSize || proof.RecordCount != 2 {
		t.Fatalf("manifest proof changed with record order: %#v != %#v", proof, reversed)
	}
}

func TestClassifyImportFailure(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name      string
		err       error
		code      string
		retryable bool
	}{
		{"rate limited", &battlenet.RemoteError{StatusCode: 429, Status: "429 Too Many Requests", RetryAfter: time.Minute}, "source_rate_limited", true},
		{"authentication", &battlenet.OAuthError{StatusCode: 401, Status: "401 Unauthorized"}, "source_authorization", false},
		{"source unavailable", &battlenet.RemoteError{StatusCode: 503, Status: "503 Service Unavailable"}, "source_unavailable", true},
		{"missing wago artifact", &wago.UnavailableError{StatusCode: 404}, "source_unavailable_artifact", false},
		{"database conflict", &pgconn.PgError{Code: "23505"}, "database_integrity_conflict", false},
		{"deadline", context.DeadlineExceeded, "source_timeout", true},
		{"unknown", errors.New("broken projection"), "unclassified", false},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got := classifyImportFailure(test.err)
			if got.Code != test.code || got.Retryable != test.retryable {
				t.Fatalf("classifyImportFailure(%v) = %#v, want code=%q retryable=%v", test.err, got, test.code, test.retryable)
			}
			if test.retryable && got.RetryAfter == nil {
				t.Fatal("retryable failure has no retry time")
			}
			if !test.retryable && got.RetryAfter != nil {
				t.Fatalf("non-retryable failure retry time = %v", got.RetryAfter)
			}
		})
	}
}

func TestSourceRecordManifestProofRejectsInvalidHash(t *testing.T) {
	t.Parallel()
	if _, err := sourceRecordManifestProof([]sourceRecordProofEntry{{Key: "1", ContentHash: []byte("short")}}); err == nil {
		t.Fatal("expected invalid source record hash rejection")
	}
}

func TestLocalizedString(t *testing.T) {
	t.Parallel()
	value := map[string]any{"en_US": "Thunderfury", "ru_RU": "Громовая Ярость"}
	if got := localizedString(value, "ru_RU"); got != "Громовая Ярость" {
		t.Fatalf("localizedString = %q", got)
	}
}

func TestBattleNetUnavailableDetailEvidenceIsLocaleScopedAndStable(t *testing.T) {
	t.Parallel()
	evidence := battleNetUnavailableDetailEvidence{
		EntityType: "quest", ExternalID: 8446, Locale: "ru_RU",
		Status: "unavailable", HTTPStatus: 404,
		SourceURL: "https://eu.api.blizzard.com/data/wow/quest/8446?locale=ru_RU",
		Reason:    "detail_not_found",
	}
	payload, err := encodeBattleNetUnavailableDetailEvidence(evidence)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := battleNetUnavailableDetailRecordKey(evidence.ExternalID), "unavailable/8446"; got != want {
		t.Fatalf("record key = %q, want %q", got, want)
	}
	var decoded battleNetUnavailableDetailEvidence
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded != evidence {
		t.Fatalf("decoded evidence = %#v, want %#v", decoded, evidence)
	}
}

func TestMissingBattleNetLocalizationConditionIncludesNamesAndDescriptions(t *testing.T) {
	t.Parallel()
	for _, field := range []string{"localization.name", "localization.description"} {
		if !strings.Contains(missingBattleNetLocalizationCondition, field) {
			t.Fatalf("missing enrichment condition does not include %s", field)
		}
	}
}

func TestInteger32RejectsUnsignedProtocolSentinel(t *testing.T) {
	t.Parallel()
	if got := integer32(float64(4294967295)); got != nil {
		t.Fatalf("UINT32_MAX sentinel = %d, want nil", *got)
	}
	want := int64(70)
	if got := integer32(float64(want)); got == nil || *got != want {
		t.Fatalf("ordinary int32 = %v, want %d", got, want)
	}
}

func TestDecodePayloadIsCanonical(t *testing.T) {
	t.Parallel()
	_, first, err := decodePayload(json.RawMessage(`{"name":"A","id":1}`))
	if err != nil {
		t.Fatal(err)
	}
	_, second, err := decodePayload(json.RawMessage(`{"id":1,"name":"A"}`))
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) {
		t.Fatalf("canonical payloads differ: %s != %s", first, second)
	}
}

func TestSlugify(t *testing.T) {
	t.Parallel()
	if got := slugify("  Громовая Ярость, благословенный клинок  "); got != "громовая-ярость-благословенный-клинок" {
		t.Fatalf("slugify = %q", got)
	}
}

func TestReleaseIDFromEnvironment(t *testing.T) {
	t.Setenv(releaseIDEnvironment, "7280d437-f27a-4354-9876-b672285611c7")
	releaseID, err := ReleaseIDFromEnvironment()
	if err != nil {
		t.Fatal(err)
	}
	if releaseID == nil || releaseID.String() != "7280d437-f27a-4354-9876-b672285611c7" {
		t.Fatalf("release ID = %v", releaseID)
	}
}

func TestReleaseIDFromEnvironmentRejectsInvalidValue(t *testing.T) {
	t.Setenv(releaseIDEnvironment, "not-a-uuid")
	if _, err := ReleaseIDFromEnvironment(); err == nil || !strings.Contains(err.Error(), releaseIDEnvironment) {
		t.Fatalf("expected a named environment parse error, got %v", err)
	}
}
