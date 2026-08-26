package catalogbackup

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSignedEvidenceRejectsTampering(t *testing.T) {
	key := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{9}, ed25519.SeedSize))
	evidence := Evidence{
		ManifestID: uuid.New(), ArtifactURI: "r2://bucket/archive.dump.age",
		EvidenceURI: "r2://bucket/archive.dump.age.manifest.json",
		SHA256:      "abcd", ByteSize: 42, Source: completeState(MinimumSchemaVersion, 1), Restore: completeState(MinimumSchemaVersion, 1),
		BackupCompletedAt: time.Now().UTC(), RestoreStartedAt: time.Now().UTC(), RestoreCompletedAt: time.Now().UTC(),
		VerificationVersion: 1,
	}
	signed, _, err := SignEvidence(evidence, key)
	if err != nil {
		t.Fatal(err)
	}
	trusted := key.Public().(ed25519.PublicKey)
	if err := VerifyEvidence(signed, trusted); err != nil {
		t.Fatal(err)
	}
	signed.Evidence.ByteSize++
	if err := VerifyEvidence(signed, trusted); err == nil {
		t.Fatal("tampered evidence was accepted")
	}
}

func TestParseSigningKeyAcceptsSeedAndRejectsInconsistentPrivateKey(t *testing.T) {
	seed := bytes.Repeat([]byte{2}, ed25519.SeedSize)
	if _, err := ParseSigningKey(base64.StdEncoding.EncodeToString(seed)); err != nil {
		t.Fatal(err)
	}
	inconsistent := bytes.Repeat([]byte{4}, ed25519.PrivateKeySize)
	if _, err := ParseSigningKey(base64.StdEncoding.EncodeToString(inconsistent)); err == nil {
		t.Fatal("inconsistent private key was accepted")
	}
}
