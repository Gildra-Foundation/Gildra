package catalogbackup

import (
	"context"
	"crypto/ed25519"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path"
	"sort"
	"strings"
	"time"

	"filippo.io/age"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Keep backup verification aligned with the latest production migration. A
// backup that predates the active entity-type quality profiles cannot be
// promoted safely because public completeness would be unverified.
const MinimumSchemaVersion int64 = 177

var CriticalTables = []string{
	"users",
	"game_products",
	"game_builds",
	"game_entities",
	"game_entity_versions",
	"catalog_entity_version_artifacts",
	"game_entity_localizations",
	"catalog_entity_localization_artifacts",
	"catalog_entity_usability",
	"catalog_entity_usability_audit",
	"catalog_entity_type_quality_profiles",
	"game_entity_links",
	"catalog_snapshots",
	"catalog_import_runs",
	"catalog_entity_source_documents",
	"catalog_entity_media",
	"catalog_entity_icons",
	"catalog_file_assets",
	"catalog_file_asset_versions",
	"catalog_library_dataset_definitions",
	"catalog_library_dataset_localizations",
	"catalog_library_dataset_stats",
	"catalog_item_variants",
	"catalog_item_variant_stats",
	"catalog_item_variant_effects",
	"catalog_item_stats",
	"catalog_item_effects",
	"catalog_item_acquisition_sources",
	"catalog_loot_tables",
	"catalog_loot_entries",
	"catalog_spell_effects",
	"catalog_profession_recipes",
	"catalog_recipe_reagents",
	"catalog_recipe_outputs",
	"catalog_quest_rewards",
	"catalog_quest_registry",
	"catalog_npc_roles",
	"catalog_npc_locations",
	"catalog_verified_item_drops",
	"catalog_releases",
	"catalog_public_release_state",
	"genshin_catalog_releases",
	"genshin_media_assets",
	"genshin_characters",
	"genshin_character_localizations",
	"genshin_character_talents",
	"genshin_character_talent_localizations",
	"genshin_character_constellations",
	"genshin_character_constellation_localizations",
	"genshin_weapons",
	"genshin_weapon_localizations",
	"genshin_weapon_level_stats",
	"genshin_artifact_sets",
	"genshin_artifact_set_localizations",
	"genshin_artifact_pieces",
	"genshin_artifact_piece_localizations",
	"genshin_content_entries",
	"genshin_content_localizations",
	"genshin_content_media",
}

type State struct {
	DatabaseVersion int64            `json:"databaseVersion"`
	Counts          map[string]int64 `json:"counts"`
	// TableBytes is pg_total_relation_size per counted table; light restore
	// uses it to keep large tables out of the scratch database.
	TableBytes map[string]int64 `json:"tableBytes,omitempty"`
}

func (s State) Validate() error {
	if s.DatabaseVersion < MinimumSchemaVersion {
		return fmt.Errorf("catalog schema version %d is below required version %d", s.DatabaseVersion, MinimumSchemaVersion)
	}
	for _, table := range CriticalTables {
		if _, ok := s.Counts[table]; !ok {
			return fmt.Errorf("critical count for %s is missing", table)
		}
	}
	return nil
}

// EqualExcept compares like Equal, but tables listed in skipped must be empty
// in other instead of matching the source count.
func (s State) EqualExcept(other State, skipped []string) error {
	skippedSet := make(map[string]bool, len(skipped))
	for _, table := range skipped {
		skippedSet[table] = true
		if count, ok := other.Counts[table]; !ok || count != 0 {
			return fmt.Errorf("skipped table %s must be empty after light restore: restore=%d", table, count)
		}
	}
	reduced := State{DatabaseVersion: other.DatabaseVersion, Counts: make(map[string]int64, len(other.Counts))}
	source := State{DatabaseVersion: s.DatabaseVersion, Counts: make(map[string]int64, len(s.Counts))}
	for table, count := range other.Counts {
		if !skippedSet[table] {
			reduced.Counts[table] = count
		}
	}
	for table, count := range s.Counts {
		if !skippedSet[table] {
			source.Counts[table] = count
		}
	}
	return source.Equal(reduced)
}

func (s State) Equal(other State) error {
	if s.DatabaseVersion != other.DatabaseVersion {
		return fmt.Errorf("database version mismatch: source=%d restore=%d", s.DatabaseVersion, other.DatabaseVersion)
	}
	keys := make([]string, 0, len(s.Counts))
	for key := range s.Counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		otherCount, ok := other.Counts[key]
		if !ok {
			return fmt.Errorf("critical count missing after restore for %s", key)
		}
		if s.Counts[key] != otherCount {
			return fmt.Errorf("critical count mismatch for %s: source=%d restore=%d", key, s.Counts[key], other.Counts[key])
		}
	}
	for key := range other.Counts {
		if _, ok := s.Counts[key]; !ok {
			return fmt.Errorf("unexpected restored table count for %s", key)
		}
	}
	return nil
}

type DatabaseOperator interface {
	SnapshotAndDump(context.Context, string, io.Writer) (State, error)
	RestoreAndInspect(context.Context, string, io.Reader) (State, error)
}

// Restore proof modes. "full" restores the whole archive into the isolated
// restore database and compares every critical table count. "light" is for
// hosts that cannot hold a second copy of the database: it still decrypts and
// parses the whole archive, restores the schema and the data of small tables,
// and proves the large tables are present but empty.
const (
	RestoreProofFull  = "full"
	RestoreProofLight = "light"

	// DefaultLightMaxTableRows is the largest critical-table row count whose
	// data is restored in light mode.
	DefaultLightMaxTableRows int64 = 20000
	// DefaultLightMaxTableBytes keeps wide tables (few rows, large JSON or
	// TOAST data) out of the light restore.
	DefaultLightMaxTableBytes int64 = 64 << 20
)

// LightRestoreReport describes what a light restore proved.
type LightRestoreReport struct {
	// RestoredTables had their data restored and counted against the source.
	RestoredTables []string `json:"restoredTables"`
	// SkippedDataTables were restored as empty tables (schema only).
	SkippedDataTables []string `json:"skippedDataTables"`
}

// LightRestoreOperator is implemented by operators that can prove a backup
// without a full restore. open must return a fresh decrypted stream of the
// archive on every call because the proof reads it more than once.
type LightRestoreOperator interface {
	RestoreLightAndInspect(ctx context.Context, restoreURL string, open func() (io.ReadCloser, error), source State, maxTableRows, maxTableBytes int64) (State, LightRestoreReport, error)
}

type StoredObject struct {
	Body io.ReadCloser
	Size int64
}

type ObjectStore interface {
	URI(string) string
	Put(context.Context, string, io.Reader, int64, string, map[string]string) error
	Get(context.Context, string) (StoredObject, error)
}

type ManifestStart struct {
	ID         uuid.UUID
	Product    string
	StorageURI string
}

type ManifestCreated struct {
	Hash            [32]byte
	ByteSize        int64
	DatabaseVersion int64
}

type ManifestVerified struct {
	RestoreStartedAt   time.Time
	RestoreCompletedAt time.Time
	RestoreDuration    time.Duration
	Verification       []byte
}

type ManifestRepository interface {
	Create(context.Context, ManifestStart) error
	MarkCreated(context.Context, uuid.UUID, ManifestCreated) error
	MarkVerifying(context.Context, uuid.UUID, time.Time) error
	MarkVerified(context.Context, uuid.UUID, ManifestVerified) error
	MarkFailed(context.Context, uuid.UUID, string) error
}

type Options struct {
	SourceDatabaseURL  string
	RestoreDatabaseURL string
	Product            string
	ObjectPrefix       string
	TempDirectory      string
	Recipient          age.Recipient
	Identity           age.Identity
	SigningKey         ed25519.PrivateKey
	// RestoreProof is RestoreProofFull (default) or RestoreProofLight.
	RestoreProof string
	// LightMaxTableRows bounds which tables get data in light mode; zero
	// means DefaultLightMaxTableRows.
	LightMaxTableRows int64
	// LightMaxTableBytes likewise bounds table size; zero means
	// DefaultLightMaxTableBytes.
	LightMaxTableBytes int64
}

func (o Options) Validate() error {
	switch o.RestoreProof {
	case "", RestoreProofFull, RestoreProofLight:
	default:
		return fmt.Errorf("restore proof must be %q or %q", RestoreProofFull, RestoreProofLight)
	}
	if o.LightMaxTableRows < 0 || o.LightMaxTableBytes < 0 {
		return errors.New("light restore limits cannot be negative")
	}
	if strings.TrimSpace(o.SourceDatabaseURL) == "" {
		return errors.New("source database URL is required")
	}
	if strings.TrimSpace(o.RestoreDatabaseURL) == "" {
		return errors.New("restore database URL is required")
	}
	if strings.TrimSpace(o.Product) == "" {
		return errors.New("product is required")
	}
	if o.Recipient == nil || o.Identity == nil {
		return errors.New("age recipient and identity are required")
	}
	if len(o.SigningKey) != ed25519.PrivateKeySize {
		return errors.New("an Ed25519 signing key is required")
	}
	signingProbe := []byte("gildra-catalog-backup-key-validation")
	if !ed25519.Verify(o.SigningKey.Public().(ed25519.PublicKey), signingProbe, ed25519.Sign(o.SigningKey, signingProbe)) {
		return errors.New("Ed25519 signing key is internally inconsistent")
	}
	if err := validateAgePair(o.Recipient, o.Identity); err != nil {
		return err
	}
	if err := validateSeparateDatabases(o.SourceDatabaseURL, o.RestoreDatabaseURL); err != nil {
		return err
	}
	return validateObjectPrefix(o.ObjectPrefix)
}

func validateAgePair(recipient age.Recipient, identity age.Identity) error {
	var ciphertext strings.Builder
	encrypted, err := age.Encrypt(&ciphertext, recipient)
	if err != nil {
		return fmt.Errorf("validate age recipient: %w", err)
	}
	if _, err := encrypted.Write([]byte("gildra-backup-key-check")); err != nil {
		return fmt.Errorf("validate age encryption: %w", err)
	}
	if err := encrypted.Close(); err != nil {
		return fmt.Errorf("validate age encryption: %w", err)
	}
	decrypted, err := age.Decrypt(strings.NewReader(ciphertext.String()), identity)
	if err != nil {
		return errors.New("age identity does not match the configured recipient")
	}
	plain, err := io.ReadAll(decrypted)
	if err != nil || string(plain) != "gildra-backup-key-check" {
		return errors.New("age identity does not match the configured recipient")
	}
	return nil
}

func validateSeparateDatabases(sourceURL, restoreURL string) error {
	source, err := pgx.ParseConfig(sourceURL)
	if err != nil {
		return fmt.Errorf("parse source database URL: %w", err)
	}
	restore, err := pgx.ParseConfig(restoreURL)
	if err != nil {
		return fmt.Errorf("parse restore database URL: %w", err)
	}
	if source.Host == restore.Host && source.Port == restore.Port && source.Database == restore.Database {
		return errors.New("restore database must be separate from the source database")
	}
	return nil
}

func validateObjectPrefix(prefix string) error {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		return nil
	}
	if strings.HasPrefix(prefix, "/") || strings.Contains(prefix, "..") || strings.Contains(prefix, "\\") {
		return errors.New("object prefix must be a relative clean path")
	}
	clean := path.Clean(prefix)
	if clean == "." || clean != strings.Trim(prefix, "/") {
		return errors.New("object prefix must be a relative clean path")
	}
	if _, err := url.PathUnescape(prefix); err != nil {
		return fmt.Errorf("decode object prefix: %w", err)
	}
	return nil
}

type Evidence struct {
	ManifestID          uuid.UUID `json:"manifestId"`
	ArtifactURI         string    `json:"artifactUri"`
	EvidenceURI         string    `json:"evidenceUri"`
	SHA256              string    `json:"sha256"`
	ByteSize            int64     `json:"byteSize"`
	Source              State     `json:"source"`
	Restore             State     `json:"restore"`
	BackupCompletedAt   time.Time `json:"backupCompletedAt"`
	RestoreStartedAt    time.Time `json:"restoreStartedAt"`
	RestoreCompletedAt  time.Time `json:"restoreCompletedAt"`
	RestoreDurationMS   int64     `json:"restoreDurationMs"`
	VerificationVersion int       `json:"verificationVersion"`
	// RestoreMode is empty for full restores (older evidence) or "light".
	RestoreMode       string   `json:"restoreMode,omitempty"`
	SkippedDataTables []string `json:"skippedDataTables,omitempty"`
}

type SignedEvidence struct {
	Evidence             Evidence `json:"evidence"`
	Algorithm            string   `json:"algorithm"`
	PublicKey            string   `json:"publicKey"`
	PublicKeyFingerprint string   `json:"publicKeyFingerprint"`
	Signature            string   `json:"signature"`
}

type Result struct {
	ManifestID         uuid.UUID `json:"manifestId"`
	ArtifactURI        string    `json:"artifactUri"`
	EvidenceURI        string    `json:"evidenceUri"`
	SHA256             string    `json:"sha256"`
	ByteSize           int64     `json:"byteSize"`
	DatabaseVersion    int64     `json:"databaseVersion"`
	RestoreDurationMS  int64     `json:"restoreDurationMs"`
	SignerFingerprint  string    `json:"signerFingerprint"`
	RestoreMode        string    `json:"restoreMode"`
	RestoreVerified    bool      `json:"restoreVerified"`
	SourceRestoreMatch bool      `json:"sourceRestoreMatch"`
}
