package catalogtaxonomy

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Definition struct {
	EntityType string
	Facet      string
	Slug       string
	Path       string
	ParentPath string
	NameEN     string
	NameRU     string
	SortOrder  int16
	Attributes map[string]any
}

type Result struct {
	Categories     int64 `json:"categories"`
	Assignments    int64 `json:"assignments"`
	Tooltips       int64 `json:"tooltips"`
	Icons          int64 `json:"icons,omitempty"`
	SpellEffects   int64 `json:"spellEffects,omitempty"`
	SpellDetails   int64 `json:"spellDetails,omitempty"`
	QuestRewards   int64 `json:"questRewards,omitempty"`
	Links          int64 `json:"links,omitempty"`
	Variants       int64 `json:"variants,omitempty"`
	VariantStats   int64 `json:"variantStats,omitempty"`
	VariantEffects int64 `json:"variantEffects,omitempty"`
	Descriptions   int64 `json:"descriptions,omitempty"`
}

type Indexer struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Indexer { return &Indexer{db: db} }

func (i *Indexer) RebuildItemsAndTooltips(ctx context.Context) (Result, error) {
	return i.rebuildItems(ctx, true)
}

func (i *Indexer) Rebuild(ctx context.Context) (Result, error) { return i.rebuild(ctx, true) }

func (i *Indexer) RebuildTaxonomy(ctx context.Context) (Result, error) { return i.rebuild(ctx, false) }

func (i *Indexer) rebuild(ctx context.Context, includeTooltips bool) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var productID int16
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug = 'wow'`).Scan(&productID); err != nil {
			return fmt.Errorf("find wow product: %w", err)
		}
		definitions, err := i.definitions(ctx, tx)
		if err != nil {
			return err
		}
		categoryIDs, err := upsertDefinitions(ctx, tx, productID, definitions)
		if err != nil {
			return err
		}
		result.Categories = int64(len(categoryIDs))
		if _, err := tx.Exec(ctx, `
			DELETE FROM game_entity_categories ec
			USING catalog_categories c
			WHERE c.id = ec.category_id AND c.product_id = $1 AND ec.source = 'gildra_classifier'`, productID); err != nil {
			return fmt.Errorf("clear classified categories: %w", err)
		}
		for _, definition := range definitions {
			categoryID := categoryIDs[categoryKey(definition.EntityType, definition.Path)]
			written, err := classify(ctx, tx, categoryID, definition)
			if err != nil {
				return fmt.Errorf("classify %s %s: %w", definition.EntityType, definition.Path, err)
			}
			result.Assignments += written
		}
		if includeTooltips {
			carried, err := carryForwardOfficialLocalizations(ctx, tx)
			if err != nil {
				return err
			}
			result.Descriptions += carried
			canonical, err := rebuildCanonicalDescriptions(ctx, tx)
			if err != nil {
				return err
			}
			result.Descriptions += canonical
			if err := rebuildSpellRelationships(ctx, tx); err != nil {
				return err
			}
			result.Icons, err = rebuildEntityIcons(ctx, tx)
			if err != nil {
				return err
			}
			command, err := tx.Exec(ctx, tooltipSQL)
			if err != nil {
				return fmt.Errorf("rebuild entity tooltips: %w", err)
			}
			result.Tooltips = command.RowsAffected()
		}
		return nil
	})
	return result, err
}
