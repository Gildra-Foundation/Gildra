package transmog

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// indexTTL is how long a loaded index serves before the next request
// reloads it in the background; catalog builds change rarely.
const indexTTL = 6 * time.Hour

// Service loads the transmog index from the published catalog build and
// keeps it in memory.
type Service struct {
	db  *pgxpool.Pool
	now func() time.Time

	mu       sync.Mutex
	index    *Index
	loadedAt time.Time
	loading  chan struct{}
	lastErr  error
}

func NewService(db *pgxpool.Pool) *Service { return &Service{db: db, now: time.Now} }

// Index returns the loaded index, loading it on first use. A stale index
// keeps serving while a fresh one loads.
func (s *Service) Index(ctx context.Context) (*Index, error) {
	s.mu.Lock()
	if s.index != nil {
		index := s.index
		if s.now().Sub(s.loadedAt) > indexTTL && s.loading == nil {
			s.startLoadLocked()
		}
		s.mu.Unlock()
		return index, nil
	}
	if s.loading == nil {
		s.startLoadLocked()
	}
	loading := s.loading
	s.mu.Unlock()
	select {
	case <-loading:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.index == nil {
		if s.lastErr == nil {
			s.lastErr = errors.New("transmog index is not available")
		}
		return nil, s.lastErr
	}
	return s.index, nil
}

// Warm loads the index in the background after delay, so the first visitor
// does not wait for it. It is a no-op once the index is loaded or loading.
func (s *Service) Warm(ctx context.Context, delay time.Duration) {
	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		s.mu.Lock()
		if s.index == nil && s.loading == nil {
			s.startLoadLocked()
		}
		s.mu.Unlock()
	}()
}

func (s *Service) startLoadLocked() {
	done := make(chan struct{})
	s.loading = done
	go func() {
		// Detached from the request: one slow first visitor must not cancel
		// the load every later request waits for.
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		index, err := s.load(ctx)
		s.mu.Lock()
		if err == nil {
			s.index, s.loadedAt = index, s.now()
		}
		s.lastErr = err
		s.loading = nil
		s.mu.Unlock()
		close(done)
	}()
}

// publishedBuild is the build most published transmog sets belong to: the
// DB2 rows of that build describe what the library shows.
func (s *Service) publishedBuild(ctx context.Context) (int64, error) {
	var buildID int64
	err := s.db.QueryRow(ctx, `
		SELECT version.build_id FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.published_version_id
		WHERE entity.entity_type='transmog_set' AND entity.deleted_at IS NULL
		GROUP BY version.build_id ORDER BY count(*) DESC, version.build_id DESC LIMIT 1`).Scan(&buildID)
	if err != nil {
		return 0, fmt.Errorf("find published transmog build: %w", err)
	}
	return buildID, nil
}

func (s *Service) load(ctx context.Context) (*Index, error) {
	buildID, err := s.publishedBuild(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(ctx, `
		SELECT ima.row_id, item.row_id, appearance.row_id,
			COALESCE(NULLIF(appearance.payload->>'ItemDisplayInfoID','')::bigint,0),
			COALESCE(NULLIF(item.payload->>'InventoryType','')::int,0),
			COALESCE(NULLIF(item.payload->>'ClassID','')::int,0),
			COALESCE(NULLIF(item.payload->>'SubclassID','')::int,0),
			COALESCE(NULLIF(en.payload->>'OverallQualityID','')::int,1),
			COALESCE(icon.icon_name,''), COALESCE(en.payload->>'Display_lang',''), COALESCE(ru.payload->>'Display_lang','')
		FROM catalog_db2_rows ima
		JOIN catalog_db2_rows appearance ON appearance.build_id=ima.build_id AND appearance.table_name='ItemAppearance'
			AND appearance.locale='en_US' AND appearance.row_id=NULLIF(ima.payload->>'ItemAppearanceID','')::bigint
		JOIN catalog_db2_rows item ON item.build_id=ima.build_id AND item.table_name='Item'
			AND item.locale='en_US' AND item.row_id=NULLIF(ima.payload->>'ItemID','')::bigint
		LEFT JOIN catalog_db2_rows en ON en.build_id=ima.build_id AND en.table_name='ItemSparse' AND en.locale='en_US' AND en.row_id=item.row_id
		LEFT JOIN catalog_db2_rows ru ON ru.build_id=ima.build_id AND ru.table_name='ItemSparse' AND ru.locale='ru_RU' AND ru.row_id=item.row_id
		LEFT JOIN catalog_file_assets icon ON icon.file_data_id=NULLIF(appearance.payload->>'DefaultIconFileDataID','')::bigint
		WHERE ima.build_id=$1 AND ima.table_name='ItemModifiedAppearance' AND ima.locale='en_US'
			AND COALESCE(NULLIF(appearance.payload->>'ItemDisplayInfoID','')::bigint,0)>0`, buildID)
	if err != nil {
		return nil, fmt.Errorf("load item appearances: %w", err)
	}
	looks := make([]*look, 0, 160_000)
	for rows.Next() {
		item := &look{}
		var en, ru string
		if err := rows.Scan(&item.ModifiedAppearanceID, &item.ItemID, &item.AppearanceID, &item.DisplayID, &item.InventoryType,
			&item.ClassID, &item.SubclassID, &item.Quality, &item.IconName, &en, &ru); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan item appearance: %w", err)
		}
		if en == "" && ru == "" {
			continue // unnamed internal items are not something a player can pick
		}
		item.Names = map[string]string{"en_US": en, "ru_RU": ru}
		looks = append(looks, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read item appearances: %w", err)
	}

	setRows, err := s.db.Query(ctx, `
		SELECT entry.row_id, COALESCE(NULLIF(entry.payload->>'ClassMask','')::bigint,0),
			COALESCE(NULLIF(entry.payload->>'ExpansionID','')::int,0),
			COALESCE(entry.payload->>'Name_lang',''), COALESCE(ru.payload->>'Name_lang',''),
			COALESCE(array_agg(NULLIF(part.payload->>'ItemModifiedAppearanceID','')::bigint
				ORDER BY (COALESCE(NULLIF(part.payload->>'Flags','')::int,0) & 1) DESC, part.row_id)
				FILTER (WHERE part.row_id IS NOT NULL), '{}')
		FROM catalog_db2_rows entry
		LEFT JOIN catalog_db2_rows ru ON ru.build_id=entry.build_id AND ru.table_name='TransmogSet' AND ru.locale='ru_RU' AND ru.row_id=entry.row_id
		LEFT JOIN catalog_db2_rows part ON part.build_id=entry.build_id AND part.table_name='TransmogSetItem' AND part.locale='en_US'
			AND NULLIF(part.payload->>'TransmogSetID','')::bigint=entry.row_id
		WHERE entry.build_id=$1 AND entry.table_name='TransmogSet' AND entry.locale='en_US'
		GROUP BY entry.row_id, entry.payload, ru.payload`, buildID)
	if err != nil {
		return nil, fmt.Errorf("load transmog sets: %w", err)
	}
	sets := make([]*set, 0, 6_000)
	for setRows.Next() {
		entry := &set{}
		var en, ru string
		if err := setRows.Scan(&entry.ID, &entry.ClassMask, &entry.ExpansionID, &en, &ru, &entry.Looks); err != nil {
			setRows.Close()
			return nil, fmt.Errorf("scan transmog set: %w", err)
		}
		entry.Names = map[string]string{"en_US": en, "ru_RU": ru}
		sets = append(sets, entry)
	}
	setRows.Close()
	if err := setRows.Err(); err != nil {
		return nil, fmt.Errorf("read transmog sets: %w", err)
	}
	return newIndex(buildID, looks, sets), nil
}

func encodeOffset(offset int) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(offset)))
}

func decodeOffset(cursor string) (int, error) {
	if cursor == "" {
		return 0, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return 0, err
	}
	offset, err := strconv.Atoi(string(raw))
	if err != nil || offset < 0 {
		return 0, errors.New("invalid cursor")
	}
	return offset, nil
}
