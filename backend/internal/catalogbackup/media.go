package catalogbackup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"filippo.io/age"
	"github.com/google/uuid"
)

const (
	mediaArchiveFormat   = "gildra-media-archive"
	mediaArchiveVersion  = 1
	mediaManifestName    = "__gildra_media_manifest.json"
	mediaMaxFileBytes    = 32 << 20
	mediaManifestMaxSize = 16 << 20
)

// MediaSnapshotOptions bounds a media snapshot and optionally verifies the
// cache keys referenced by catalog_entity_media. The limits are deliberately
// explicit so a corrupted or unexpectedly large volume cannot consume all
// backup storage.
type MediaSnapshotOptions struct {
	MaxFiles       int64
	MaxBytes       int64
	ReferencedKeys []string
}

func (o MediaSnapshotOptions) validate() error {
	if o.MaxFiles < 1 {
		return errors.New("media snapshot max files must be positive")
	}
	if o.MaxBytes < 1 {
		return errors.New("media snapshot max bytes must be positive")
	}
	return nil
}

// MediaFile is a canonical entry in a media archive manifest. Paths always
// use slash separators and are relative to the media root.
type MediaFile struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

// MediaManifest is embedded as the first archive entry. It is canonical JSON
// (sorted files and stable field order), making ManifestSHA256 reproducible.
// The same bytes are suitable for the sidecar manifest stored next to the
// encrypted archive.
type MediaManifest struct {
	Format  string      `json:"format"`
	Version int         `json:"version"`
	Files   []MediaFile `json:"files"`
}

// MediaSnapshot describes the plaintext media tree and, after CreateArchive,
// the encrypted archive that contains it. ArchiveSHA256 is over the exact
// encrypted bytes written to the ObjectStore.
type MediaSnapshot struct {
	FileCount             int64  `json:"fileCount"`
	ByteSize              int64  `json:"byteSize"`
	ManifestSHA256        string `json:"manifestSha256"`
	ReferencedFileCount   int64  `json:"referencedFileCount"`
	MissingReferenceCount int64  `json:"missingReferenceCount"`
	ArchiveSHA256         string `json:"archiveSha256,omitempty"`
	ArchiveByteSize       int64  `json:"archiveByteSize,omitempty"`
}

// MediaArchive contains a snapshot result and the canonical sidecar manifest.
// The archive itself is streamed to the destination supplied to
// CreateArchive; the package never writes an unencrypted archive to disk.
type MediaArchive struct {
	Snapshot MediaSnapshot
	Manifest []byte
}

// MediaReference is the minimal projection of a catalog_entity_media row
// needed to prove that the restored volume contains the exact bytes referenced
// by PostgreSQL.
type MediaReference struct {
	CacheKey string
	SHA256   string
	Bytes    int64
}

// MediaSnapshotter is intentionally independent from Runner. The existing
// PostgreSQL runner can adopt it after the caller has acquired the media-cache
// advisory lock and is ready to atomically publish a component='media'
// catalog_backup_manifests row.
type MediaSnapshotter struct{}

// MediaManifestRepository is the optional extension implemented by the
// PostgreSQL manifest repository. Keeping it separate from ManifestRepository
// preserves all existing PostgreSQL-only backup fakes and callers while
// giving the combined orchestrator an explicit media row insertion point.
type MediaManifestRepository interface {
	ManifestRepository
	CreateMedia(context.Context, ManifestStart) error
}

// Snapshot inventories a media root without writing anything. Every regular
// file is hashed and sorted. Symlinks and non-regular entries fail closed.
func (MediaSnapshotter) Snapshot(ctx context.Context, root string, options MediaSnapshotOptions) (MediaSnapshot, MediaManifest, error) {
	if err := options.validate(); err != nil {
		return MediaSnapshot{}, MediaManifest{}, err
	}
	files, referenced, missing, err := inventoryMedia(ctx, root, options)
	if err != nil {
		return MediaSnapshot{}, MediaManifest{}, err
	}
	manifest := MediaManifest{Format: mediaArchiveFormat, Version: mediaArchiveVersion, Files: files}
	manifestBytes, err := marshalMediaManifest(manifest)
	if err != nil {
		return MediaSnapshot{}, MediaManifest{}, err
	}
	hash := sha256.Sum256(manifestBytes)
	snapshot := MediaSnapshot{
		FileCount:             int64(len(files)),
		ByteSize:              sumMediaBytes(files),
		ManifestSHA256:        hex.EncodeToString(hash[:]),
		ReferencedFileCount:   referenced,
		MissingReferenceCount: missing,
	}
	if missing != 0 {
		return snapshot, manifest, fmt.Errorf("media snapshot has %d missing referenced files", missing)
	}
	return snapshot, manifest, nil
}

// CreateArchive takes a deterministic inventory, streams a tar.gz archive
// through age encryption, and re-inventories the root before returning. The
// second inventory detects a concurrent mutation instead of silently creating
// a DB/media mismatch. Callers should hold the media-cache advisory lock while
// both passes execute.
func (s MediaSnapshotter) CreateArchive(ctx context.Context, root string, options MediaSnapshotOptions, recipient age.Recipient, destination io.Writer) (MediaArchive, error) {
	if recipient == nil {
		return MediaArchive{}, errors.New("media archive age recipient is required")
	}
	if destination == nil {
		return MediaArchive{}, errors.New("media archive destination is required")
	}
	snapshot, manifest, err := s.Snapshot(ctx, root, options)
	if err != nil {
		return MediaArchive{}, err
	}
	manifestBytes, err := marshalMediaManifest(manifest)
	if err != nil {
		return MediaArchive{}, err
	}
	archiveWriter := &hashCountWriter{destination: destination, hasher: sha256.New()}
	encrypted, err := age.Encrypt(archiveWriter, recipient)
	if err != nil {
		return MediaArchive{}, fmt.Errorf("initialize media archive encryption: %w", err)
	}
	if err := writeMediaTar(ctx, root, manifestBytes, manifest.Files, encrypted); err != nil {
		return MediaArchive{}, err
	}
	if err := encrypted.Close(); err != nil {
		return MediaArchive{}, fmt.Errorf("finalize media archive encryption: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return MediaArchive{}, err
	}
	archiveHash := archiveWriter.hasher.Sum(nil)
	snapshot.ArchiveSHA256 = hex.EncodeToString(archiveHash)
	snapshot.ArchiveByteSize = archiveWriter.bytes
	current, _, err := s.Snapshot(ctx, root, options)
	if err != nil {
		return MediaArchive{}, fmt.Errorf("verify media tree after archive: %w", err)
	}
	if current.ManifestSHA256 != snapshot.ManifestSHA256 || current.FileCount != snapshot.FileCount || current.ByteSize != snapshot.ByteSize {
		return MediaArchive{}, errors.New("media tree changed while creating archive")
	}
	return MediaArchive{Snapshot: snapshot, Manifest: manifestBytes}, nil
}

// RestoreAndVerify decrypts and extracts an archive into an empty, isolated
// directory. It rejects traversal, symlinks, duplicate entries, changed file
// bytes, missing files, extra files, and an archive hash mismatch. The caller
// must only expose root to consumers after this function succeeds.
func (MediaSnapshotter) RestoreAndVerify(ctx context.Context, root string, archive io.Reader, identity age.Identity, expected MediaSnapshot) (MediaSnapshot, error) {
	if archive == nil {
		return MediaSnapshot{}, errors.New("media archive source is required")
	}
	if identity == nil {
		return MediaSnapshot{}, errors.New("media archive age identity is required")
	}
	if expected.ManifestSHA256 == "" || expected.ArchiveSHA256 == "" {
		return MediaSnapshot{}, errors.New("expected media snapshot hashes are required")
	}
	if err := ensureEmptyDirectory(root); err != nil {
		return MediaSnapshot{}, err
	}
	archiveHasher := &hashCountReader{source: archive, hasher: sha256.New()}
	decrypted, err := age.Decrypt(archiveHasher, identity)
	if err != nil {
		return MediaSnapshot{}, fmt.Errorf("decrypt media archive: %w", err)
	}
	gzipReader, err := gzip.NewReader(decrypted)
	if err != nil {
		return MediaSnapshot{}, fmt.Errorf("open media archive compression: %w", err)
	}
	tarReader := tar.NewReader(gzipReader)
	manifestBytes, err := readArchiveManifest(ctx, tarReader)
	if err != nil {
		gzipReader.Close()
		return MediaSnapshot{}, err
	}
	var manifest MediaManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		gzipReader.Close()
		return MediaSnapshot{}, fmt.Errorf("decode media archive manifest: %w", err)
	}
	if err := validateMediaManifest(manifest); err != nil {
		gzipReader.Close()
		return MediaSnapshot{}, err
	}
	manifestHash := sha256.Sum256(manifestBytes)
	if hex.EncodeToString(manifestHash[:]) != expected.ManifestSHA256 {
		gzipReader.Close()
		return MediaSnapshot{}, errors.New("media archive manifest hash mismatch")
	}
	if err := extractMediaFiles(ctx, root, tarReader, manifest.Files); err != nil {
		gzipReader.Close()
		return MediaSnapshot{}, err
	}
	trailing, err := io.Copy(io.Discard, gzipReader)
	closeErr := gzipReader.Close()
	if err != nil {
		return MediaSnapshot{}, fmt.Errorf("authenticate media archive: %w", err)
	}
	if closeErr != nil {
		return MediaSnapshot{}, fmt.Errorf("close media archive compression: %w", closeErr)
	}
	if trailing != 0 {
		return MediaSnapshot{}, errors.New("media archive contains trailing data")
	}
	archiveHash := archiveHasher.hasher.Sum(nil)
	archiveHashHex := hex.EncodeToString(archiveHash)
	if archiveHashHex != expected.ArchiveSHA256 {
		return MediaSnapshot{}, errors.New("media archive hash mismatch")
	}
	observed, _, _, err := inventoryMedia(ctx, root, MediaSnapshotOptions{MaxFiles: maxInt64(expected.FileCount, 1), MaxBytes: maxInt64(expected.ByteSize, 1)})
	if err != nil {
		return MediaSnapshot{}, fmt.Errorf("verify restored media tree: %w", err)
	}
	observedManifest := MediaManifest{Format: mediaArchiveFormat, Version: mediaArchiveVersion, Files: observed}
	observedBytes, err := marshalMediaManifest(observedManifest)
	if err != nil {
		return MediaSnapshot{}, err
	}
	observedHash := sha256.Sum256(observedBytes)
	result := MediaSnapshot{
		FileCount:       int64(len(observed)),
		ByteSize:        sumMediaBytes(observed),
		ManifestSHA256:  hex.EncodeToString(observedHash[:]),
		ArchiveSHA256:   archiveHashHex,
		ArchiveByteSize: archiveHasher.bytes,
	}
	if result.ManifestSHA256 != expected.ManifestSHA256 || result.FileCount != expected.FileCount || result.ByteSize != expected.ByteSize ||
		result.ArchiveByteSize != expected.ArchiveByteSize {
		return MediaSnapshot{}, errors.New("restored media tree does not match archive manifest")
	}
	return result, nil
}

// VerifyReferencedMediaKeys checks the cache_key values read from the
// restored catalog database against the restored media root. It is kept
// separate from RestoreAndVerify because the backup package deliberately does
// not own a PostgreSQL connection or SQL schema queries.
func VerifyReferencedMediaKeys(ctx context.Context, root string, keys []string) (int64, error) {
	if err := validateMediaRoot(root); err != nil {
		return 0, err
	}
	missing := int64(0)
	for _, key := range uniqueSortedReferences(keys) {
		if err := ctx.Err(); err != nil {
			return missing, err
		}
		if err := validateArchivePath(key); err != nil {
			return missing, fmt.Errorf("invalid referenced media key %q: %w", key, err)
		}
		path := filepath.Join(root, filepath.FromSlash(key))
		info, err := os.Lstat(path)
		if errors.Is(err, os.ErrNotExist) {
			missing++
			continue
		}
		if err != nil {
			return missing, fmt.Errorf("inspect referenced media key %q: %w", key, err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return missing, fmt.Errorf("referenced media key %q is not a regular file", key)
		}
	}
	return missing, nil
}

// VerifyReferencedMedia verifies cache_key, cached_byte_size and
// cached_content_hash values read from the restored catalog database. Missing
// keys are returned as a count so the caller can include that count in signed
// restore evidence without exposing entity data in an error message.
func VerifyReferencedMedia(ctx context.Context, root string, references []MediaReference) (int64, error) {
	if err := validateMediaRoot(root); err != nil {
		return 0, err
	}
	missing := int64(0)
	seen := make(map[string]struct{}, len(references))
	for _, reference := range references {
		if err := ctx.Err(); err != nil {
			return missing, err
		}
		if _, ok := seen[reference.CacheKey]; ok {
			continue
		}
		seen[reference.CacheKey] = struct{}{}
		if err := validateArchivePath(reference.CacheKey); err != nil {
			return missing, fmt.Errorf("invalid referenced media key %q: %w", reference.CacheKey, err)
		}
		if reference.Bytes < 1 || !isSHA256Hex(reference.SHA256) {
			return missing, fmt.Errorf("referenced media proof for %q is invalid", reference.CacheKey)
		}
		path := filepath.Join(root, filepath.FromSlash(reference.CacheKey))
		info, err := os.Lstat(path)
		if errors.Is(err, os.ErrNotExist) {
			missing++
			continue
		}
		if err != nil {
			return missing, fmt.Errorf("inspect referenced media key %q: %w", reference.CacheKey, err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return missing, fmt.Errorf("referenced media key %q is not a regular file", reference.CacheKey)
		}
		if info.Size() != reference.Bytes {
			return missing, fmt.Errorf("referenced media key %q size mismatch", reference.CacheKey)
		}
		hash, size, err := hashMediaFile(ctx, root, reference.CacheKey, reference.Bytes)
		if err != nil {
			return missing, fmt.Errorf("verify referenced media key %q: %w", reference.CacheKey, err)
		}
		if size != reference.Bytes || hex.EncodeToString(hash) != reference.SHA256 {
			return missing, fmt.Errorf("referenced media key %q hash mismatch", reference.CacheKey)
		}
	}
	return missing, nil
}

// MediaManifestRecord is the metadata to put in the existing
// catalog_backup_manifests.verification JSON for a component='media' row.
// PostgresManifestID correlates the media sidecar with the logical DB backup;
// no schema migration is required because verification is JSONB.
type MediaManifestRecord struct {
	ManifestID         uuid.UUID     `json:"manifestId"`
	Product            string        `json:"product"`
	Component          string        `json:"component"`
	BackupKind         string        `json:"backupKind"`
	PostgresManifestID *uuid.UUID    `json:"postgresManifestId,omitempty"`
	ArtifactURI        string        `json:"artifactUri"`
	SidecarURI         string        `json:"sidecarUri"`
	Snapshot           MediaSnapshot `json:"snapshot"`
	RestoreVerified    bool          `json:"restoreVerified"`
}

// Validate checks the media manifest contract before writing it into the
// existing catalog backup manifest repository.
func (m MediaManifestRecord) Validate() error {
	if m.ManifestID == uuid.Nil {
		return errors.New("media manifest ID is required")
	}
	if strings.TrimSpace(m.Product) == "" {
		return errors.New("media manifest product is required")
	}
	if m.Component != "media" {
		return errors.New("media manifest component must be media")
	}
	if m.BackupKind != "full" {
		return errors.New("media manifest backup kind must be full")
	}
	if err := validateBackupURI(m.ArtifactURI); err != nil {
		return fmt.Errorf("media manifest artifact URI: %w", err)
	}
	if err := validateBackupURI(m.SidecarURI); err != nil {
		return fmt.Errorf("media manifest sidecar URI: %w", err)
	}
	if m.Snapshot.FileCount < 0 || m.Snapshot.ByteSize < 0 || m.Snapshot.ArchiveByteSize <= 0 ||
		!isSHA256Hex(m.Snapshot.ManifestSHA256) || !isSHA256Hex(m.Snapshot.ArchiveSHA256) {
		return errors.New("media manifest snapshot is invalid")
	}
	if !m.RestoreVerified {
		return errors.New("media manifest must be restore verified")
	}
	return nil
}

// ManifestStart returns the values needed by
// PostgresManifestRepository.CreateMedia. The caller should only mark this
// row verified after RestoreAndVerify and the PostgreSQL cache-key check pass.
func (m MediaManifestRecord) ManifestStart() (ManifestStart, error) {
	if err := m.Validate(); err != nil {
		return ManifestStart{}, err
	}
	return ManifestStart{ID: m.ManifestID, Product: m.Product, StorageURI: m.ArtifactURI}, nil
}

func inventoryMedia(ctx context.Context, root string, options MediaSnapshotOptions) ([]MediaFile, int64, int64, error) {
	if err := validateMediaRoot(root); err != nil {
		return nil, 0, 0, err
	}
	references := uniqueSortedReferences(options.ReferencedKeys)
	referenceSet := make(map[string]struct{}, len(references))
	for _, reference := range references {
		if err := validateArchivePath(reference); err != nil {
			return nil, 0, 0, fmt.Errorf("invalid referenced media key %q: %w", reference, err)
		}
		referenceSet[reference] = struct{}{}
	}
	files := make([]MediaFile, 0)
	seenReferences := make(map[string]struct{}, len(references))
	var totalBytes int64
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if path == root {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if err := validateArchivePath(relative); err != nil {
			return fmt.Errorf("invalid media path %q: %w", relative, err)
		}
		if entry.IsDir() {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("media tree contains symlink %q", relative)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("media tree contains non-regular file %q", relative)
		}
		if relative == mediaManifestName {
			return fmt.Errorf("media path %q is reserved", relative)
		}
		if info.Size() < 1 || info.Size() > mediaMaxFileBytes {
			return fmt.Errorf("media file %q is empty or exceeds %d bytes", relative, mediaMaxFileBytes)
		}
		if info.Size() > options.MaxBytes-totalBytes {
			return fmt.Errorf("media snapshot exceeds max bytes at %q", relative)
		}
		if int64(len(files)) >= options.MaxFiles {
			return fmt.Errorf("media snapshot exceeds max files at %q", relative)
		}
		hash, size, err := hashMediaFile(ctx, root, relative, info.Size())
		if err != nil {
			return fmt.Errorf("hash media file %q: %w", relative, err)
		}
		if size != info.Size() {
			return fmt.Errorf("media file %q changed while hashing", relative)
		}
		files = append(files, MediaFile{Path: relative, Bytes: size, SHA256: hex.EncodeToString(hash)})
		totalBytes += size
		if _, ok := referenceSet[relative]; ok {
			seenReferences[relative] = struct{}{}
		}
		return nil
	})
	if err != nil {
		return nil, 0, 0, err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	missing := int64(len(references) - len(seenReferences))
	return files, int64(len(seenReferences)), missing, nil
}

func writeMediaTar(ctx context.Context, root string, manifest []byte, files []MediaFile, destination io.Writer) error {
	gzipWriter := gzip.NewWriter(destination)
	gzipWriter.Header.ModTime = time.Unix(0, 0).UTC()
	gzipWriter.Header.Name = ""
	gzipWriter.Header.Comment = ""
	tarWriter := tar.NewWriter(gzipWriter)
	if err := writeTarEntry(ctx, tarWriter, mediaManifestName, manifest, 0o640); err != nil {
		tarWriter.Close()
		gzipWriter.Close()
		return fmt.Errorf("write media archive manifest: %w", err)
	}
	for _, mediaFile := range files {
		if err := ctx.Err(); err != nil {
			tarWriter.Close()
			gzipWriter.Close()
			return err
		}
		path := filepath.Join(root, filepath.FromSlash(mediaFile.Path))
		info, err := os.Lstat(path)
		if err != nil {
			tarWriter.Close()
			gzipWriter.Close()
			return fmt.Errorf("open media file %q: %w", mediaFile.Path, err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || info.Size() != mediaFile.Bytes {
			tarWriter.Close()
			gzipWriter.Close()
			return fmt.Errorf("media file %q changed before archive", mediaFile.Path)
		}
		file, err := os.OpenInRoot(root, filepath.FromSlash(mediaFile.Path))
		if err != nil {
			tarWriter.Close()
			gzipWriter.Close()
			return fmt.Errorf("open media file %q: %w", mediaFile.Path, err)
		}
		hasher := sha256.New()
		if err := writeTarHeader(tarWriter, mediaFile.Path, mediaFile.Bytes, 0o640); err != nil {
			file.Close()
			tarWriter.Close()
			gzipWriter.Close()
			return err
		}
		written, copyErr := io.Copy(tarWriter, io.TeeReader(io.LimitReader(file, mediaMaxFileBytes+1), hasher))
		closeErr := file.Close()
		if copyErr != nil || closeErr != nil {
			tarWriter.Close()
			gzipWriter.Close()
			return errors.Join(copyErr, closeErr)
		}
		if written != mediaFile.Bytes || hex.EncodeToString(hasher.Sum(nil)) != mediaFile.SHA256 {
			tarWriter.Close()
			gzipWriter.Close()
			return fmt.Errorf("media file %q changed while archiving", mediaFile.Path)
		}
	}
	if err := tarWriter.Close(); err != nil {
		gzipWriter.Close()
		return fmt.Errorf("close media archive tar: %w", err)
	}
	if err := gzipWriter.Close(); err != nil {
		return fmt.Errorf("close media archive compression: %w", err)
	}
	return nil
}

func readArchiveManifest(ctx context.Context, reader *tar.Reader) ([]byte, error) {
	header, err := reader.Next()
	if err != nil {
		return nil, fmt.Errorf("read media archive manifest entry: %w", err)
	}
	if header.Name != mediaManifestName || !isRegularTarHeader(header) || header.Size < 1 || header.Size > mediaManifestMaxSize {
		return nil, errors.New("media archive manifest entry is invalid")
	}
	manifest, err := io.ReadAll(io.LimitReader(reader, mediaManifestMaxSize+1))
	if err != nil {
		return nil, fmt.Errorf("read media archive manifest: %w", err)
	}
	if int64(len(manifest)) != header.Size || int64(len(manifest)) > mediaManifestMaxSize {
		return nil, errors.New("media archive manifest size mismatch")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return manifest, nil
}

func extractMediaFiles(ctx context.Context, root string, reader *tar.Reader, files []MediaFile) error {
	byPath := make(map[string]MediaFile, len(files))
	for _, file := range files {
		byPath[file.Path] = file
	}
	seen := make(map[string]struct{}, len(files))
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read media archive entry: %w", err)
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if !isRegularTarHeader(header) || header.Name == mediaManifestName {
			return fmt.Errorf("media archive entry %q is not a regular file", header.Name)
		}
		if err := validateArchivePath(header.Name); err != nil {
			return fmt.Errorf("invalid media archive path %q: %w", header.Name, err)
		}
		file, ok := byPath[header.Name]
		if !ok {
			return fmt.Errorf("media archive contains undeclared file %q", header.Name)
		}
		if _, ok := seen[header.Name]; ok {
			return fmt.Errorf("media archive contains duplicate file %q", header.Name)
		}
		if header.Size != file.Bytes || header.Size < 1 || header.Size > mediaMaxFileBytes {
			return fmt.Errorf("media archive size mismatch for %q", header.Name)
		}
		path := filepath.Join(root, filepath.FromSlash(header.Name))
		if err := makeSafeParentDirectories(root, path); err != nil {
			return err
		}
		output, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
		if err != nil {
			return fmt.Errorf("create restored media file %q: %w", header.Name, err)
		}
		hasher := sha256.New()
		written, copyErr := io.Copy(output, io.TeeReader(io.LimitReader(reader, mediaMaxFileBytes+1), hasher))
		closeErr := output.Close()
		if copyErr != nil || closeErr != nil {
			return errors.Join(copyErr, closeErr)
		}
		if written != file.Bytes || hex.EncodeToString(hasher.Sum(nil)) != file.SHA256 {
			return fmt.Errorf("restored media file %q failed hash verification", header.Name)
		}
		seen[header.Name] = struct{}{}
	}
	if len(seen) != len(files) {
		return fmt.Errorf("media archive is missing %d declared files", len(files)-len(seen))
	}
	return nil
}

func validateMediaManifest(manifest MediaManifest) error {
	if manifest.Format != mediaArchiveFormat || manifest.Version != mediaArchiveVersion {
		return errors.New("unsupported media archive manifest")
	}
	previous := ""
	seen := make(map[string]struct{}, len(manifest.Files))
	for _, file := range manifest.Files {
		if err := validateArchivePath(file.Path); err != nil {
			return fmt.Errorf("invalid media manifest path %q: %w", file.Path, err)
		}
		if file.Path == mediaManifestName || file.Path <= previous {
			return errors.New("media manifest paths are not unique and sorted")
		}
		if _, ok := seen[file.Path]; ok {
			return fmt.Errorf("media manifest contains duplicate path %q", file.Path)
		}
		if file.Bytes < 1 || file.Bytes > mediaMaxFileBytes || !isSHA256Hex(file.SHA256) {
			return fmt.Errorf("media manifest file %q is invalid", file.Path)
		}
		seen[file.Path] = struct{}{}
		previous = file.Path
	}
	return nil
}

func marshalMediaManifest(manifest MediaManifest) ([]byte, error) {
	if err := validateMediaManifest(manifest); err != nil {
		return nil, err
	}
	payload, err := json.Marshal(manifest)
	if err != nil {
		return nil, fmt.Errorf("encode media archive manifest: %w", err)
	}
	return append(payload, '\n'), nil
}

func hashMediaFile(ctx context.Context, root, relative string, expectedSize int64) ([]byte, int64, error) {
	file, err := os.OpenInRoot(root, filepath.FromSlash(relative))
	if err != nil {
		return nil, 0, err
	}
	hasher := sha256.New()
	read, copyErr := io.Copy(hasher, io.LimitReader(file, expectedSize+1))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		return nil, read, errors.Join(copyErr, closeErr)
	}
	if err := ctx.Err(); err != nil {
		return nil, read, err
	}
	if read != expectedSize {
		return nil, read, errors.New("media file size changed while hashing")
	}
	return hasher.Sum(nil), read, nil
}

func validateMediaRoot(root string) error {
	if !filepath.IsAbs(root) {
		return errors.New("media root must be absolute")
	}
	info, err := os.Lstat(root)
	if err != nil {
		return fmt.Errorf("inspect media root: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return errors.New("media root must be a real directory")
	}
	return nil
}

func ensureEmptyDirectory(root string) error {
	if err := validateMediaRoot(root); err != nil {
		return err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return fmt.Errorf("list media restore root: %w", err)
	}
	if len(entries) != 0 {
		return errors.New("media restore root must be empty")
	}
	return nil
}

func makeSafeParentDirectories(root, path string) error {
	relative, err := filepath.Rel(root, path)
	if err != nil || relative == "." || filepath.IsAbs(relative) || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errors.New("media archive path escapes restore root")
	}
	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0o750); err != nil {
		return fmt.Errorf("create media restore directory: %w", err)
	}
	current := root
	for _, part := range strings.Split(filepath.Dir(relative), string(filepath.Separator)) {
		if part == "." || part == "" {
			continue
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return fmt.Errorf("inspect media restore directory: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return errors.New("media restore path contains a symlink or non-directory")
		}
	}
	return nil
}

func validateArchivePath(value string) error {
	if value == "" || strings.ContainsRune(value, '\x00') || strings.Contains(value, "\\") || filepath.IsAbs(value) {
		return errors.New("path must be a relative slash-separated path")
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(value)))
	if clean != value || clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return errors.New("path is not clean and relative")
	}
	return nil
}

func writeTarEntry(ctx context.Context, writer *tar.Writer, name string, content []byte, mode int64) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := writeTarHeader(writer, name, int64(len(content)), mode); err != nil {
		return err
	}
	if _, err := writer.Write(content); err != nil {
		return fmt.Errorf("write tar entry %q: %w", name, err)
	}
	return nil
}

func writeTarHeader(writer *tar.Writer, name string, size, mode int64) error {
	return writer.WriteHeader(&tar.Header{
		Name: name, Mode: mode, Size: size, ModTime: time.Unix(0, 0).UTC(),
		Typeflag: tar.TypeReg, Uid: 0, Gid: 0, Uname: "", Gname: "",
	})
}

func isRegularTarHeader(header *tar.Header) bool {
	return header != nil && header.Typeflag == tar.TypeReg && header.Linkname == "" && header.Mode&0o170000 == 0
}

func uniqueSortedReferences(references []string) []string {
	result := append([]string(nil), references...)
	sort.Strings(result)
	unique := result[:0]
	for _, value := range result {
		if len(unique) == 0 || unique[len(unique)-1] != value {
			unique = append(unique, value)
		}
	}
	return unique
}

func sumMediaBytes(files []MediaFile) int64 {
	var total int64
	for _, file := range files {
		total += file.Bytes
	}
	return total
}

func isSHA256Hex(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	for _, character := range value {
		if !((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f')) {
			return false
		}
	}
	return true
}

func validateBackupURI(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return errors.New("URI is required")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" {
		return errors.New("URI must have a valid scheme")
	}
	switch parsed.Scheme {
	case "file":
		if !filepath.IsAbs(parsed.Path) || parsed.Host != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return errors.New("file URI must contain an absolute path without host or query")
		}
	case "s3", "r2", "swift":
		if parsed.Host == "" || strings.Trim(parsed.Path, "/") == "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return errors.New("object-store URI must contain a bucket and key")
		}
	default:
		return fmt.Errorf("unsupported backup URI scheme %q", parsed.Scheme)
	}
	return nil
}

func maxInt64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

type hashCountWriter struct {
	destination io.Writer
	hasher      hash.Hash
	bytes       int64
}

func (w *hashCountWriter) Write(value []byte) (int, error) {
	written, err := w.destination.Write(value)
	if written > 0 {
		_, _ = w.hasher.Write(value[:written])
		w.bytes += int64(written)
	}
	return written, err
}

type hashCountReader struct {
	source io.Reader
	hasher hash.Hash
	bytes  int64
}

func (r *hashCountReader) Read(buffer []byte) (int, error) {
	read, err := r.source.Read(buffer)
	if read > 0 {
		_, _ = r.hasher.Write(buffer[:read])
		r.bytes += int64(read)
	}
	return read, err
}
