package catalogbackup

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
	"time"

	"filippo.io/age"
	"github.com/google/uuid"
)

type Runner struct {
	Database  DatabaseOperator
	Store     ObjectStore
	Manifests ManifestRepository
	Now       func() time.Time
}

func (r Runner) Run(ctx context.Context, options Options) (result Result, err error) {
	if err := options.Validate(); err != nil {
		return Result{}, err
	}
	if r.Database == nil || r.Store == nil || r.Manifests == nil {
		return Result{}, errors.New("database operator, object store, and manifest repository are required")
	}
	now := r.Now
	if now == nil {
		now = time.Now
	}
	manifestID := uuid.New()
	startedAt := now().UTC()
	objectKey := backupObjectKey(options.ObjectPrefix, options.Product, startedAt, manifestID)
	artifactURI := r.Store.URI(objectKey)
	evidenceKey := objectKey + ".manifest.json"
	evidenceURI := r.Store.URI(evidenceKey)
	if err := r.Manifests.Create(ctx, ManifestStart{ID: manifestID, Product: options.Product, StorageURI: artifactURI}); err != nil {
		return Result{}, err
	}
	defer func() {
		if err == nil {
			return
		}
		failureContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		summary := redactDatabaseURL(redactDatabaseURL(err.Error(), options.SourceDatabaseURL), options.RestoreDatabaseURL)
		if failureErr := r.Manifests.MarkFailed(failureContext, manifestID, summary); failureErr != nil {
			err = errors.Join(err, failureErr)
		}
	}()

	temporary, err := os.CreateTemp(options.TempDirectory, "gildra-postgres-*.dump.age")
	if err != nil {
		return Result{}, fmt.Errorf("create encrypted backup temporary file: %w", err)
	}
	temporaryName := temporary.Name()
	defer func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryName)
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return Result{}, fmt.Errorf("restrict encrypted backup temporary file: %w", err)
	}

	hasher := sha256.New()
	encrypted, err := age.Encrypt(io.MultiWriter(temporary, hasher), options.Recipient)
	if err != nil {
		return Result{}, fmt.Errorf("initialize backup encryption: %w", err)
	}
	sourceState, dumpErr := r.Database.SnapshotAndDump(ctx, options.SourceDatabaseURL, encrypted)
	closeErr := encrypted.Close()
	if dumpErr != nil {
		return Result{}, fmt.Errorf("create consistent PostgreSQL archive: %w", dumpErr)
	}
	if closeErr != nil {
		return Result{}, fmt.Errorf("finalize backup encryption: %w", closeErr)
	}
	if err := sourceState.Validate(); err != nil {
		return Result{}, fmt.Errorf("validate source backup state: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return Result{}, fmt.Errorf("sync encrypted backup: %w", err)
	}
	info, err := temporary.Stat()
	if err != nil {
		return Result{}, fmt.Errorf("inspect encrypted backup: %w", err)
	}
	if info.Size() <= 0 {
		return Result{}, errors.New("encrypted backup is empty")
	}
	var localHash [32]byte
	copy(localHash[:], hasher.Sum(nil))
	if _, err := temporary.Seek(0, io.SeekStart); err != nil {
		return Result{}, fmt.Errorf("rewind encrypted backup: %w", err)
	}
	metadata := map[string]string{
		"gildra-manifest-id": manifestID.String(),
		"gildra-sha256":      hex.EncodeToString(localHash[:]),
		"gildra-product":     options.Product,
	}
	if err := r.Store.Put(ctx, objectKey, temporary, info.Size(), "application/vnd.gildra.postgresql.dump+age", metadata); err != nil {
		return Result{}, fmt.Errorf("upload encrypted backup: %w", err)
	}
	backupCompletedAt := now().UTC()
	if err := r.Manifests.MarkCreated(ctx, manifestID, ManifestCreated{
		Hash: localHash, ByteSize: info.Size(), DatabaseVersion: sourceState.DatabaseVersion,
	}); err != nil {
		return Result{}, err
	}

	restoreStartedAt := now().UTC()
	if err := r.Manifests.MarkVerifying(ctx, manifestID, restoreStartedAt); err != nil {
		return Result{}, err
	}
	remote, err := r.Store.Get(ctx, objectKey)
	if err != nil {
		return Result{}, fmt.Errorf("download uploaded backup: %w", err)
	}
	defer remote.Body.Close()
	if remote.Size != info.Size() {
		return Result{}, fmt.Errorf("remote backup size mismatch: uploaded=%d downloaded=%d", info.Size(), remote.Size)
	}
	remoteHasher := sha256.New()
	remoteCiphertext := io.TeeReader(remote.Body, remoteHasher)
	plaintext, err := age.Decrypt(remoteCiphertext, options.Identity)
	if err != nil {
		return Result{}, fmt.Errorf("decrypt downloaded backup: %w", err)
	}
	restoreState, err := r.Database.RestoreAndInspect(ctx, options.RestoreDatabaseURL, plaintext)
	if err != nil {
		return Result{}, fmt.Errorf("restore downloaded backup: %w", err)
	}
	if _, err := io.Copy(io.Discard, plaintext); err != nil {
		return Result{}, fmt.Errorf("authenticate downloaded backup remainder: %w", err)
	}
	if err := restoreState.Validate(); err != nil {
		return Result{}, fmt.Errorf("validate restored backup state: %w", err)
	}
	remoteHash := remoteHasher.Sum(nil)
	if !equalHash(localHash[:], remoteHash) {
		return Result{}, errors.New("remote backup SHA-256 does not match the uploaded archive")
	}
	if err := sourceState.Equal(restoreState); err != nil {
		return Result{}, err
	}
	restoreCompletedAt := now().UTC()
	restoreDuration := restoreCompletedAt.Sub(restoreStartedAt)
	evidence := Evidence{
		ManifestID: manifestID, ArtifactURI: artifactURI, EvidenceURI: evidenceURI,
		SHA256: hex.EncodeToString(localHash[:]), ByteSize: info.Size(),
		Source: sourceState, Restore: restoreState,
		BackupCompletedAt: backupCompletedAt, RestoreStartedAt: restoreStartedAt,
		RestoreCompletedAt: restoreCompletedAt, RestoreDurationMS: restoreDuration.Milliseconds(),
		VerificationVersion: 1,
	}
	signed, evidencePayload, err := SignEvidence(evidence, options.SigningKey)
	if err != nil {
		return Result{}, err
	}
	if err := r.Store.Put(ctx, evidenceKey, strings.NewReader(string(evidencePayload)), int64(len(evidencePayload)), "application/json", map[string]string{
		"gildra-manifest-id":        manifestID.String(),
		"gildra-signer-fingerprint": signed.PublicKeyFingerprint,
	}); err != nil {
		return Result{}, fmt.Errorf("upload signed backup evidence: %w", err)
	}
	verification, err := json.Marshal(map[string]any{
		"restore_verified":      true,
		"source_restore_match":  true,
		"artifact_sha256":       evidence.SHA256,
		"evidence_uri":          evidenceURI,
		"signature_algorithm":   signed.Algorithm,
		"signer_fingerprint":    signed.PublicKeyFingerprint,
		"critical_table_counts": sourceState.Counts,
	})
	if err != nil {
		return Result{}, fmt.Errorf("encode database verification evidence: %w", err)
	}
	if err := r.Manifests.MarkVerified(ctx, manifestID, ManifestVerified{
		RestoreStartedAt: restoreStartedAt, RestoreCompletedAt: restoreCompletedAt,
		RestoreDuration: restoreDuration, Verification: verification,
	}); err != nil {
		return Result{}, err
	}
	return Result{
		ManifestID: manifestID, ArtifactURI: artifactURI, EvidenceURI: evidenceURI,
		SHA256: evidence.SHA256, ByteSize: info.Size(), DatabaseVersion: sourceState.DatabaseVersion,
		RestoreDurationMS: restoreDuration.Milliseconds(), SignerFingerprint: signed.PublicKeyFingerprint,
		RestoreVerified: true, SourceRestoreMatch: true,
	}, nil
}

func backupObjectKey(prefix, product string, timestamp time.Time, id uuid.UUID) string {
	filename := fmt.Sprintf("postgres-%s-%s.dump.age", timestamp.Format("20060102T150405Z"), id)
	parts := []string{strings.Trim(prefix, "/"), product, timestamp.Format("2006/01/02"), filename}
	return path.Join(parts...)
}

func equalHash(left, right []byte) bool {
	if len(left) != len(right) {
		return false
	}
	var difference byte
	for index := range left {
		difference |= left[index] ^ right[index]
	}
	return difference == 0
}
