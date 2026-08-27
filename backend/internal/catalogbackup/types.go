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

const MinimumSchemaVersion int64 = 85

var CriticalTables = []string{
	"users",
	"game_products",
	"game_builds",
	"game_entities",
	"game_entity_versions",
	"catalog_entity_version_artifacts",
	"game_entity_localizations",
	"catalog_entity_localization_artifacts",
	"game_entity_links",
	"catalog_snapshots",
	"catalog_import_runs",
	"catalog_entity_source_documents",
	"catalog_entity_media",
	"catalog_file_assets",
	"catalog_file_asset_versions",
	"catalog_item_stats",
	"catalog_item_effects",
	"catalog_item_acquisition_sources",
	"catalog_spell_effects",
	"catalog_profession_recipes",
	"catalog_recipe_reagents",
	"catalog_recipe_outputs",
	"catalog_quest_rewards",
	"catalog_npc_roles",
	"catalog_npc_locations",
	"catalog_verified_item_drops",
	"catalog_releases",
	"catalog_public_release_state",
}

type State struct {
	DatabaseVersion int64            `json:"databaseVersion"`
	Counts          map[string]int64 `json:"counts"`
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
}

func (o Options) Validate() error {
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
	RestoreVerified    bool      `json:"restoreVerified"`
	SourceRestoreMatch bool      `json:"sourceRestoreMatch"`
}
