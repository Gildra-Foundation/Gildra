package catalogbackup

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

func ParseSigningKey(value string) (ed25519.PrivateKey, error) {
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("decode Ed25519 signing key: %w", err)
	}
	var key ed25519.PrivateKey
	switch len(decoded) {
	case ed25519.SeedSize:
		key = ed25519.NewKeyFromSeed(decoded)
	case ed25519.PrivateKeySize:
		key = append(ed25519.PrivateKey(nil), decoded...)
	default:
		return nil, fmt.Errorf("Ed25519 signing key must decode to %d-byte seed or %d-byte private key", ed25519.SeedSize, ed25519.PrivateKeySize)
	}
	message := []byte("gildra-backup-signing-key-check")
	signature := ed25519.Sign(key, message)
	if !ed25519.Verify(key.Public().(ed25519.PublicKey), message, signature) {
		return nil, errors.New("Ed25519 private key is internally inconsistent")
	}
	return key, nil
}

func SignEvidence(evidence Evidence, key ed25519.PrivateKey) (SignedEvidence, []byte, error) {
	if len(key) != ed25519.PrivateKeySize {
		return SignedEvidence{}, nil, errors.New("invalid Ed25519 signing key")
	}
	canonical, err := json.Marshal(evidence)
	if err != nil {
		return SignedEvidence{}, nil, fmt.Errorf("encode backup evidence: %w", err)
	}
	publicKey := key.Public().(ed25519.PublicKey)
	fingerprint := sha256.Sum256(publicKey)
	signed := SignedEvidence{
		Evidence:             evidence,
		Algorithm:            "Ed25519",
		PublicKey:            base64.StdEncoding.EncodeToString(publicKey),
		PublicKeyFingerprint: hex.EncodeToString(fingerprint[:]),
		Signature:            base64.StdEncoding.EncodeToString(ed25519.Sign(key, canonical)),
	}
	payload, err := json.MarshalIndent(signed, "", "  ")
	if err != nil {
		return SignedEvidence{}, nil, fmt.Errorf("encode signed backup evidence: %w", err)
	}
	return signed, append(payload, '\n'), nil
}

func VerifyEvidence(signed SignedEvidence, trustedKey ed25519.PublicKey) error {
	if signed.Algorithm != "Ed25519" {
		return fmt.Errorf("unsupported evidence algorithm %q", signed.Algorithm)
	}
	if len(trustedKey) != ed25519.PublicKeySize {
		return errors.New("trusted Ed25519 public key is invalid")
	}
	publicFingerprint := sha256.Sum256(trustedKey)
	if signed.PublicKeyFingerprint != hex.EncodeToString(publicFingerprint[:]) {
		return errors.New("evidence signer fingerprint does not match the trusted key")
	}
	encodedPublicKey, err := base64.StdEncoding.DecodeString(signed.PublicKey)
	if err != nil {
		return fmt.Errorf("decode evidence public key: %w", err)
	}
	if !ed25519.PublicKey(encodedPublicKey).Equal(trustedKey) {
		return errors.New("evidence public key does not match the trusted key")
	}
	signature, err := base64.StdEncoding.DecodeString(signed.Signature)
	if err != nil {
		return fmt.Errorf("decode evidence signature: %w", err)
	}
	canonical, err := json.Marshal(signed.Evidence)
	if err != nil {
		return fmt.Errorf("encode evidence for verification: %w", err)
	}
	if !ed25519.Verify(trustedKey, canonical, signature) {
		return errors.New("backup evidence signature is invalid")
	}
	return nil
}
