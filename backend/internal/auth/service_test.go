package auth

import "testing"

func TestPasswordHashRoundTrip(t *testing.T) {
	t.Parallel()
	encoded, err := HashPassword("This-is-a-strong-test-password-42")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	if !VerifyPassword("This-is-a-strong-test-password-42", encoded) {
		t.Fatal("VerifyPassword() rejected the correct password")
	}
	if VerifyPassword("wrong-password", encoded) {
		t.Fatal("VerifyPassword() accepted a wrong password")
	}
}

func TestHashPasswordRejectsShortPassword(t *testing.T) {
	t.Parallel()
	if _, err := HashPassword("too-short"); err == nil {
		t.Fatal("HashPassword() accepted a short password")
	}
}

func TestVerifyPasswordRejectsMalformedHash(t *testing.T) {
	t.Parallel()
	for _, encoded := range []string{"", "plain-text", "$argon2id$v=19$bad"} {
		if VerifyPassword("password", encoded) {
			t.Fatalf("VerifyPassword() accepted malformed hash %q", encoded)
		}
	}
}
