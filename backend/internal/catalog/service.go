package catalog

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("game entity not found")

type Product struct {
	ID   int32
	Slug string
	Name string
}

type Entity struct {
	ID          uuid.UUID
	Product     string
	Type        string
	ExternalID  int64
	Slug        string
	Locale      string
	Name        string
	Description string
	BuildID     *int64
	Payload     map[string]any
	UpdatedAt   time.Time
}

type ListParams struct {
	Product string
	Type    string
	Locale  string
	Query   string
	Cursor  string
	Limit   int
}

type Page struct {
	Entities   []Entity
	NextCursor string
	HasMore    bool
}

type Service struct {
	postgres *pgxpool.Pool
}

func NewService(postgres *pgxpool.Pool) *Service {
	return &Service{postgres: postgres}
}

func (s *Service) Products(ctx context.Context) ([]Product, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT id, slug, name
		FROM game_products
		ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("list game products: %w", err)
	}
	defer rows.Close()

	products := make([]Product, 0, 8)
	for rows.Next() {
		var product Product
		if err := rows.Scan(&product.ID, &product.Slug, &product.Name); err != nil {
			return nil, fmt.Errorf("scan game product: %w", err)
		}
		products = append(products, product)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate game products: %w", err)
	}
	return products, nil
}

func (s *Service) List(ctx context.Context, params ListParams) (Page, error) {
	if params.Limit < 1 || params.Limit > 100 {
		return Page{}, errors.New("limit must be between 1 and 100")
	}
	cursorID, err := decodeCursor(params.Cursor)
	if err != nil {
		return Page{}, err
	}

	rows, err := s.postgres.Query(ctx, `
		SELECT
			e.id, p.slug, e.entity_type, e.external_id, e.canonical_slug,
			$4::text AS locale, COALESCE(l.name, ''), COALESCE(l.description, ''),
			v.build_id, COALESCE(v.payload, '{}'::jsonb), e.updated_at
		FROM game_entities e
		JOIN game_products p ON p.id = e.product_id
		LEFT JOIN game_entity_versions v ON v.id = e.latest_version_id
		LEFT JOIN game_entity_localizations l ON l.version_id = v.id AND l.locale = $4
		WHERE e.deleted_at IS NULL
		  AND ($1 = '' OR p.slug = $1)
		  AND ($2 = '' OR e.entity_type = $2)
		  AND e.id > $3
		  AND (
			$5 = ''
			OR l.search_document @@ websearch_to_tsquery('simple', $5)
			OR l.name % $5
		  )
		ORDER BY e.id
		LIMIT $6`,
		strings.TrimSpace(params.Product), strings.TrimSpace(params.Type), cursorID,
		normalizeLocale(params.Locale), strings.TrimSpace(params.Query), params.Limit+1,
	)
	if err != nil {
		return Page{}, fmt.Errorf("list game entities: %w", err)
	}
	defer rows.Close()

	entities := make([]Entity, 0, params.Limit+1)
	for rows.Next() {
		entity, err := scanEntity(rows)
		if err != nil {
			return Page{}, err
		}
		entities = append(entities, entity)
	}
	if err := rows.Err(); err != nil {
		return Page{}, fmt.Errorf("iterate game entities: %w", err)
	}

	hasMore := len(entities) > params.Limit
	if hasMore {
		entities = entities[:params.Limit]
	}
	nextCursor := ""
	if hasMore && len(entities) > 0 {
		nextCursor = encodeCursor(entities[len(entities)-1].ID)
	}
	return Page{Entities: entities, NextCursor: nextCursor, HasMore: hasMore}, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID, locale string) (Entity, error) {
	row := s.postgres.QueryRow(ctx, `
		SELECT
			e.id, p.slug, e.entity_type, e.external_id, e.canonical_slug,
			$2::text AS locale, COALESCE(l.name, ''), COALESCE(l.description, ''),
			v.build_id, COALESCE(v.payload, '{}'::jsonb), e.updated_at
		FROM game_entities e
		JOIN game_products p ON p.id = e.product_id
		LEFT JOIN game_entity_versions v ON v.id = e.latest_version_id
		LEFT JOIN game_entity_localizations l ON l.version_id = v.id AND l.locale = $2
		WHERE e.id = $1 AND e.deleted_at IS NULL`, id, normalizeLocale(locale))
	entity, err := scanEntity(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entity{}, ErrNotFound
	}
	if err != nil {
		return Entity{}, err
	}
	return entity, nil
}

type rowScanner interface {
	Scan(...any) error
}

func scanEntity(row rowScanner) (Entity, error) {
	var entity Entity
	var encodedPayload []byte
	if err := row.Scan(
		&entity.ID, &entity.Product, &entity.Type, &entity.ExternalID, &entity.Slug,
		&entity.Locale, &entity.Name, &entity.Description, &entity.BuildID,
		&encodedPayload, &entity.UpdatedAt,
	); err != nil {
		return Entity{}, fmt.Errorf("scan game entity: %w", err)
	}
	if err := json.Unmarshal(encodedPayload, &entity.Payload); err != nil {
		return Entity{}, fmt.Errorf("decode game entity payload: %w", err)
	}
	return entity, nil
}

func normalizeLocale(locale string) string {
	if locale == "ru_RU" {
		return locale
	}
	return "en_US"
}

func encodeCursor(id uuid.UUID) string {
	return base64.RawURLEncoding.EncodeToString([]byte(id.String()))
}

func decodeCursor(cursor string) (uuid.UUID, error) {
	if cursor == "" {
		return uuid.Nil, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return uuid.Nil, errors.New("cursor is invalid")
	}
	id, err := uuid.Parse(string(decoded))
	if err != nil {
		return uuid.Nil, errors.New("cursor is invalid")
	}
	return id, nil
}
