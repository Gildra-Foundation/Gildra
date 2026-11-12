package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
)

// Uses the importer's OAuth, discovery, linked details and media paths but
// returns before opening a database. Status probes are not publication evidence.
func battleNetPreflight(ctx context.Context, client *battlenet.Client, opts options) error {
	enc := json.NewEncoder(os.Stdout)
	for _, locale := range opts.locales {
		region, err := regionForLocale(locale)
		if err != nil {
			return err
		}
		moving, err := battleNetNamespace(opts.product, region)
		if err != nil {
			return err
		}
		_, version, err := client.CurrentBuildForNamespace(ctx, region, locale, moving)
		if err != nil {
			return err
		}
		pinned, err := pinnedBattleNetNamespace(opts.product, version, region)
		if err != nil {
			return err
		}
		target, err := pinnedBattleNetNamespace(opts.product, opts.buildVersion, region)
		if err != nil {
			return err
		}
		namespaces := []string{moving, pinned}
		if target != pinned {
			namespaces = append(namespaces, target)
		}
		for _, namespace := range namespaces {
			probe := func(kind string, request func() (json.RawMessage, string, error)) (json.RawMessage, error) {
				started := time.Now()
				payload, url, callErr := request()
				status := 200
				if callErr != nil {
					var ok bool
					status, ok = battlenet.RemoteStatusCode(callErr)
					if !ok {
						return nil, fmt.Errorf("preflight %s %s: %w", kind, locale, callErr)
					}
				}
				if err := enc.Encode(map[string]any{"type": kind, "locale": locale, "namespace": namespace, "api_build": version, "target_build": opts.buildVersion, "url": url, "status": status, "seconds": time.Since(started).Seconds()}); err != nil {
					return nil, err
				}
				if callErr != nil {
					return nil, nil
				}
				return payload, nil
			}
			fetch := func(kind, href string) (json.RawMessage, error) {
				return probe(kind, func() (json.RawMessage, string, error) { return client.FetchLink(ctx, region, locale, href) })
			}
			for _, entityType := range opts.entityTypes {
				spec := battleNetEntitySpecs[entityType]
				detailHref := ""
				payload, err := probe(entityType, func() (json.RawMessage, string, error) {
					if spec.Search {
						url, _ := client.SearchURL(region, namespace, locale, spec.Resource, 1, 1)
						page, err := client.Search(ctx, region, namespace, locale, spec.Resource, 1, 1)
						if err == nil && len(page.Results) > 0 {
							detailHref = page.Results[0].Key.Href
						}
						return nil, url, err
					}
					return client.Index(ctx, region, namespace, locale, spec.Resource)
				})
				if err != nil {
					return err
				}
				if len(payload) > 0 {
					fields := spec.IndexFields
					if spec.QuestCategories {
						href, err := linkedHref(payload, "categories")
						if err != nil {
							return err
						}
						payload, err = fetch("quest-category-index", href)
						if err != nil {
							return err
						}
						fields = []string{"categories"}
					}
					if len(payload) > 0 && len(fields) > 0 {
						entries, err := indexResultEntries(payload, fields...)
						if err != nil {
							return err
						}
						if len(entries) > 0 {
							detailHref = entries[0].Href
						}
					}
				}
				if detailHref != "" {
					detail, err := fetch(entityType+"-detail-sample", detailHref)
					if err != nil {
						return err
					}
					if spec.QuestCategories && len(detail) > 0 {
						entries, err := indexResultEntries(detail, "quests")
						if err != nil {
							return err
						}
						if len(entries) > 0 {
							if _, err := fetch("quest-category-detail-sample", entries[0].Href); err != nil {
								return err
							}
						}
					}
					if spec.FetchMedia && locale == "en_US" {
						for _, link := range battleNetMediaLinks(detail) {
							if _, err := fetch(entityType+"-media-sample", link.Href); err != nil {
								return err
							}
						}
					}
				}
			}
			for _, id := range []int64{1, 5, 6, 54, 8446, 91981} {
				if _, err := probe("quest-detail", func() (json.RawMessage, string, error) {
					return client.Detail(ctx, region, namespace, locale, "quest", id)
				}); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
