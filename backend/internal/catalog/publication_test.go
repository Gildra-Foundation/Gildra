package catalog

import "testing"

func TestPolicyStatusCanBeGranted(t *testing.T) {
	for _, status := range []string{"allowed", "restricted", "permission_required"} {
		if !policyStatusCanBeGranted(status) {
			t.Fatalf("status %q should permit an explicit grant", status)
		}
	}
	for _, status := range []string{"unknown", "prohibited", "pending", ""} {
		if policyStatusCanBeGranted(status) {
			t.Fatalf("status %q unexpectedly permits a grant", status)
		}
	}
}
