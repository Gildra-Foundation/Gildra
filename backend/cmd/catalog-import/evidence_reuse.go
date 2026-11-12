package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
)

// maxEvidenceArtifacts bounds how many earlier artifacts of one enrichment
// family are searched for a preserved response.
const maxEvidenceArtifacts = 8

// evidenceReuse completes enrichment records from responses preserved by an
// earlier import of the same build-pinned Battle.net namespace. The Battle.net
// quota is 36,000 requests an hour while one fresh client build has roughly
// two million enrichment targets, so repeating identical requests for every
// client build is what kept an import from ever finishing (run 207).
type evidenceReuse struct {
	artifacts []uuid.UUID
	notBefore time.Time
	namespace string
	resource  string
	reused    atomic.Int64
	requested atomic.Int64
}

func newEvidenceReuse(ctx context.Context, store *catalogimport.Store, ic catalogimport.ImportContext, opts options, artifactID uuid.UUID, artifactKey, locale, namespace, resource string) (*evidenceReuse, error) {
	reuse := &evidenceReuse{namespace: namespace, resource: resource}
	// A moving alias ("static-us") is not a statement about one build, so its
	// earlier responses cannot stand in for a new request.
	if opts.evidenceReuseMaxAge <= 0 || !pinnedNamespace(namespace) {
		return reuse, nil
	}
	artifacts, err := store.BattleNetEvidenceArtifacts(ctx, ic, artifactKey, locale, artifactID, maxEvidenceArtifacts)
	if err != nil {
		return nil, err
	}
	reuse.artifacts, reuse.notBefore = artifacts, time.Now().Add(-opts.evidenceReuseMaxAge)
	return reuse, nil
}

func pinnedNamespace(namespace string) bool {
	return strings.Contains(namespace, "_") && strings.HasPrefix(namespace, "static-")
}

// sameNamespaceResource reports whether href addresses exactly this resource
// path in the namespace that would be requested now.
func sameNamespaceResource(href, namespace, path string) bool {
	parsed, err := url.Parse(strings.TrimSpace(href))
	if err != nil || parsed.Scheme != "https" {
		return false
	}
	return parsed.Path == path && parsed.Query().Get("namespace") == namespace
}

func selfLink(payload json.RawMessage) string {
	var document struct {
		Links struct {
			Self struct {
				Href string `json:"href"`
			} `json:"self"`
		} `json:"_links"`
	}
	if json.Unmarshal(payload, &document) != nil {
		return ""
	}
	return document.Links.Self.Href
}

func localizedSourceURL(href, locale string) string {
	parsed, err := url.Parse(href)
	if err != nil {
		return href
	}
	query := parsed.Query()
	query.Set("locale", locale)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

// apply completes one record from preserved evidence. It returns nil when
// nothing usable is preserved and the caller has to ask the API.
func (r *evidenceReuse) apply(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	pacer *requestPacer,
	artifactID uuid.UUID,
	region, entityType, locale string,
	id int64,
	includeMedia bool,
) (origin *catalogimport.EvidenceOrigin, detail bool, err error) {
	if len(r.artifacts) == 0 {
		return nil, false, nil
	}
	evidence, err := store.BattleNetEvidenceFor(ctx, r.artifacts, id, r.notBefore)
	if err != nil {
		return nil, false, err
	}
	detailKey := strconv.FormatInt(id, 10)
	detailPath := fmt.Sprintf("/data/wow/%s/%d", r.resource, id)
	for _, candidate := range evidence {
		switch {
		case candidate.RecordKey == detailKey:
			href := selfLink(candidate.Payload)
			if !sameNamespaceResource(href, r.namespace, detailPath) {
				continue
			}
			if err := storeBattleNetRecord(ctx, store, importContext, artifactID, entityType, locale, id,
				candidate.Payload, localizedSourceURL(href, locale)); err != nil {
				return nil, false, err
			}
			if includeMedia {
				if err := r.applyMedia(ctx, client, store, importContext, pacer, artifactID, region, entityType, locale, id, candidate.Payload, evidence); err != nil {
					return nil, false, err
				}
			}
			return &catalogimport.EvidenceOrigin{ArtifactID: candidate.ArtifactID, ObservedAt: candidate.ImportedAt}, true, nil
		case strings.HasPrefix(candidate.RecordKey, "unavailable/"):
			var observed struct {
				EntityType string `json:"entity_type"`
				ExternalID int64  `json:"external_id"`
				Locale     string `json:"locale"`
				Status     string `json:"status"`
				HTTPStatus int64  `json:"http_status"`
				SourceURL  string `json:"source_url"`
				Reason     string `json:"reason"`
			}
			if json.Unmarshal(candidate.Payload, &observed) != nil {
				continue
			}
			if observed.EntityType != entityType || observed.ExternalID != id || observed.Locale != locale ||
				observed.Status != "unavailable" || observed.HTTPStatus != 404 || observed.Reason != "detail_not_found" ||
				!sameNamespaceResource(observed.SourceURL, r.namespace, detailPath) {
				continue
			}
			if err := store.RecordBattleNetUnavailableDetail(ctx, artifactID, entityType, locale, id,
				observed.HTTPStatus, observed.SourceURL, observed.Reason); err != nil {
				return nil, false, err
			}
			return &catalogimport.EvidenceOrigin{ArtifactID: candidate.ArtifactID, ObservedAt: candidate.ImportedAt}, false, nil
		}
	}
	return nil, false, nil
}

// applyMedia stores the preserved media response of a reused detail. A media
// link with no preserved response is requested: an earlier 404 or 403 for
// media left no record, so absence here is not evidence of absence.
func (r *evidenceReuse) applyMedia(
	ctx context.Context,
	client *battlenet.Client,
	store *catalogimport.Store,
	importContext catalogimport.ImportContext,
	pacer *requestPacer,
	artifactID uuid.UUID,
	region, entityType, locale string,
	id int64,
	detail json.RawMessage,
	evidence []catalogimport.BattleNetEvidence,
) error {
	mediaKey := fmt.Sprintf("media/%d", id)
	for _, link := range battleNetMediaLinks(detail) {
		linked, err := url.Parse(link.Href)
		if err != nil {
			return fmt.Errorf("parse %s media link %d: %w", entityType, id, err)
		}
		reused := false
		if link.AssetPrefix == "" {
			for _, candidate := range evidence {
				href := selfLink(candidate.Payload)
				if candidate.RecordKey != mediaKey || !sameNamespaceResource(href, linked.Query().Get("namespace"), linked.Path) ||
					!sameNamespaceResource(href, r.namespace, linked.Path) {
					continue
				}
				if err := storeBattleNetMedia(ctx, store, importContext, artifactID, entityType, locale, id, link,
					candidate.Payload, localizedSourceURL(href, locale)); err != nil {
					return err
				}
				reused = true
				break
			}
		}
		if reused {
			continue
		}
		if err := pacer.Wait(ctx); err != nil {
			return err
		}
		r.requested.Add(1)
		if err := fetchAndStoreBattleNetMediaLink(ctx, client, store, importContext, artifactID, region, entityType, locale, id, link); err != nil {
			return err
		}
	}
	return nil
}

// requestPacer spaces enrichment requests so a long pass leaves part of the
// shared hourly Battle.net quota to the live site. A nil pacer does not wait.
type requestPacer struct {
	mu       sync.Mutex
	interval time.Duration
	next     time.Time
}

func newRequestPacer(requestsPerHour int) *requestPacer {
	if requestsPerHour <= 0 {
		return nil
	}
	return &requestPacer{interval: time.Hour / time.Duration(requestsPerHour)}
}

func (p *requestPacer) Wait(ctx context.Context) error {
	if p == nil {
		return ctx.Err()
	}
	p.mu.Lock()
	now := time.Now()
	if p.next.Before(now) {
		p.next = now
	}
	wait := p.next.Sub(now)
	p.next = p.next.Add(p.interval)
	p.mu.Unlock()
	if wait <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// canonicalLocale answers, for a second-locale pass, whether the canonical
// (first) locale pass of the same snapshot already showed that the official
// document has nothing for this record: the document does not exist in this
// API build, or it carries no description and the record already has its
// localized name. Documents are the same in every locale and region of one
// build (57,571 quests requested in en_US/us and ru_RU/eu for API build 70077
// gave identical 404 sets), so asking again spends quota on a known answer.
// Quests are excluded: their publication rule needs an observed 404 per locale.
type canonicalLocale struct {
	artifact []uuid.UUID
	skipped  atomic.Int64
}

func newCanonicalLocale(ctx context.Context, store *catalogimport.Store, ic catalogimport.ImportContext, opts options, artifactKey, entityType, locale string) (*canonicalLocale, error) {
	follow := &canonicalLocale{}
	if !opts.localeFollowsCanonical || entityType == "quest" || len(opts.locales) == 0 || locale == opts.locales[0] {
		return follow, nil
	}
	artifact, err := store.ReadyArtifact(ctx, ic, artifactKey, opts.locales[0])
	if err != nil {
		return nil, err
	}
	if artifact != uuid.Nil {
		follow.artifact = []uuid.UUID{artifact}
	}
	return follow, nil
}

func (c *canonicalLocale) nothingToRequest(ctx context.Context, store *catalogimport.Store, ic catalogimport.ImportContext, entityType, locale string, id int64) (bool, error) {
	if len(c.artifact) == 0 {
		return false, nil
	}
	evidence, err := store.BattleNetEvidenceFor(ctx, c.artifact, id, time.Time{})
	if err != nil {
		return false, err
	}
	detailKey := strconv.FormatInt(id, 10)
	for _, candidate := range evidence {
		switch {
		case candidate.RecordKey == detailKey:
			var document struct {
				Description json.RawMessage `json:"description"`
			}
			if json.Unmarshal(candidate.Payload, &document) != nil {
				return false, nil
			}
			var description any
			if len(document.Description) > 0 && json.Unmarshal(document.Description, &description) != nil {
				return false, nil
			}
			if strings.TrimSpace(localizedText(description)) != "" {
				return false, nil
			}
			missing, err := store.LocalizedNameMissing(ctx, ic, entityType, id, locale)
			if err != nil || missing {
				return false, err
			}
			c.skipped.Add(1)
			return true, nil
		case strings.HasPrefix(candidate.RecordKey, "unavailable/"):
			var observed struct {
				ExternalID int64  `json:"external_id"`
				HTTPStatus int64  `json:"http_status"`
				Reason     string `json:"reason"`
			}
			if json.Unmarshal(candidate.Payload, &observed) != nil || observed.ExternalID != id ||
				observed.HTTPStatus != 404 || observed.Reason != "detail_not_found" {
				return false, nil
			}
			c.skipped.Add(1)
			return true, nil
		}
	}
	return false, nil
}
