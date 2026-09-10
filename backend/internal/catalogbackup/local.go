package catalogbackup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// LocalStore keeps encrypted backup objects on a dedicated directory of the
// same server. Object keys are still relative and immutable, matching the S3
// layout so storage can be migrated later without changing manifests.
type LocalStore struct {
	root string
}

func NewLocalStore(root string) (*LocalStore, error) {
	if !filepath.IsAbs(root) {
		return nil, errors.New("local backup directory must be absolute")
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("create local backup directory: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, fmt.Errorf("resolve local backup directory: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return nil, fmt.Errorf("inspect local backup directory: %w", err)
	}
	if !info.IsDir() {
		return nil, errors.New("local backup path must be a directory")
	}
	if info.Mode().Perm()&0o077 != 0 {
		return nil, errors.New("local backup directory must not be accessible by group or other users")
	}
	return &LocalStore{root: resolved}, nil
}

func (s *LocalStore) URI(key string) string {
	if validateObjectKey(key) != nil {
		return ""
	}
	return (&url.URL{Scheme: "file", Path: filepath.Join(s.root, filepath.FromSlash(key))}).String()
}

func (s *LocalStore) Put(ctx context.Context, key string, source io.Reader, size int64, _ string, _ map[string]string) error {
	if err := validateObjectKey(key); err != nil {
		return err
	}
	if size < 0 {
		return errors.New("object size cannot be negative")
	}
	target, err := s.objectPath(key, true)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(target); err == nil {
		return fmt.Errorf("local backup object %s already exists", filepath.Base(target))
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect local backup object: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(target), ".gildra-backup-*.tmp")
	if err != nil {
		return fmt.Errorf("create local backup temporary object: %w", err)
	}
	temporaryName := temporary.Name()
	defer func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryName)
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return fmt.Errorf("restrict local backup object: %w", err)
	}
	written, err := io.Copy(temporary, &contextReader{ctx: ctx, source: source})
	if err != nil {
		return fmt.Errorf("write local backup object: %w", err)
	}
	if written != size {
		return fmt.Errorf("local backup object size mismatch: expected=%d written=%d", size, written)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync local backup object: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close local backup object: %w", err)
	}
	// Link is atomic and refuses an existing target, preserving immutable
	// backup object semantics even if two runners produce the same key.
	if err := os.Link(temporaryName, target); err != nil {
		return fmt.Errorf("publish local backup object: %w", err)
	}
	directory, err := os.Open(filepath.Dir(target))
	if err != nil {
		return fmt.Errorf("open local backup object directory: %w", err)
	}
	if err := directory.Sync(); err != nil {
		directory.Close()
		return fmt.Errorf("sync local backup object directory: %w", err)
	}
	if err := directory.Close(); err != nil {
		return fmt.Errorf("close local backup object directory: %w", err)
	}
	return nil
}

func (s *LocalStore) Get(ctx context.Context, key string) (StoredObject, error) {
	if err := validateObjectKey(key); err != nil {
		return StoredObject{}, err
	}
	target, err := s.objectPath(key, false)
	if err != nil {
		return StoredObject{}, err
	}
	linkInfo, err := os.Lstat(target)
	if err != nil {
		return StoredObject{}, fmt.Errorf("inspect local backup object %s: %w", filepath.Base(target), err)
	}
	if linkInfo.Mode()&os.ModeSymlink != 0 {
		return StoredObject{}, errors.New("local backup object must not be a symbolic link")
	}
	file, err := os.Open(target)
	if err != nil {
		return StoredObject{}, fmt.Errorf("open local backup object %s: %w", filepath.Base(target), err)
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return StoredObject{}, fmt.Errorf("inspect local backup object %s: %w", filepath.Base(target), err)
	}
	if !info.Mode().IsRegular() {
		file.Close()
		return StoredObject{}, errors.New("local backup object must be a regular file")
	}
	return StoredObject{Body: &contextReadCloser{ctx: ctx, file: file}, Size: info.Size()}, nil
}

// Delete removes one exact local backup object. Retention callers must derive
// keys from verified manifest URIs and call this method for each artifact and
// sidecar; the object-key validation and root/symlink checks prevent a
// retention pass from deleting arbitrary files on the host.
func (s *LocalStore) Delete(key string) error {
	if err := validateObjectKey(key); err != nil {
		return err
	}
	target, err := s.objectPath(key, false)
	if err != nil {
		return err
	}
	info, err := os.Lstat(target)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("inspect local backup object %s: %w", filepath.Base(target), err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return errors.New("local backup object must not be a symbolic link")
	}
	if !info.Mode().IsRegular() {
		return errors.New("local backup object must be a regular file")
	}
	if err := os.Remove(target); err != nil {
		return fmt.Errorf("remove local backup object %s: %w", filepath.Base(target), err)
	}
	return nil
}

// KeyFromURI converts only a file URI rooted below this store into an object
// key. It is intentionally strict because retention URIs originate in the
// database and must never become arbitrary filesystem paths.
func (s *LocalStore) KeyFromURI(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "file" || u.Host != "" || u.Path == "" {
		return "", errors.New("local backup URI must be an absolute file URI")
	}
	resolved, err := filepath.Abs(filepath.Clean(u.Path))
	if err != nil {
		return "", fmt.Errorf("resolve local backup URI: %w", err)
	}
	relative, err := filepath.Rel(s.root, resolved)
	if err != nil || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errors.New("local backup URI escapes the configured root")
	}
	key := filepath.ToSlash(relative)
	if err := validateObjectKey(key); err != nil {
		return "", fmt.Errorf("local backup URI object key: %w", err)
	}
	return key, nil
}

type contextReader struct {
	ctx    context.Context
	source io.Reader
}

func (r *contextReader) Read(buffer []byte) (int, error) {
	select {
	case <-r.ctx.Done():
		return 0, r.ctx.Err()
	default:
		return r.source.Read(buffer)
	}
}

type contextReadCloser struct {
	ctx  context.Context
	file *os.File
}

func (r *contextReadCloser) Read(buffer []byte) (int, error) {
	select {
	case <-r.ctx.Done():
		return 0, r.ctx.Err()
	default:
		return r.file.Read(buffer)
	}
}

func (r *contextReadCloser) Close() error { return r.file.Close() }

func (s *LocalStore) objectPath(key string, createDirectory bool) (string, error) {
	target := filepath.Join(s.root, filepath.FromSlash(key))
	directory := filepath.Dir(target)
	if createDirectory {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			return "", fmt.Errorf("create local backup object directory: %w", err)
		}
	}
	resolvedDirectory, err := filepath.EvalSymlinks(directory)
	if err != nil {
		return "", fmt.Errorf("resolve local backup object directory: %w", err)
	}
	if resolvedDirectory != s.root && !strings.HasPrefix(resolvedDirectory, s.root+string(filepath.Separator)) {
		return "", errors.New("local backup object directory escapes the configured root")
	}
	return filepath.Join(resolvedDirectory, filepath.Base(target)), nil
}
