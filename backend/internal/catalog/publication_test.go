package catalog

import "testing"

func TestPrivatePublicationStatusRequiresReviewedPoliciesButNotPublicGrants(t *testing.T) {
	status := privatePublicationStatus(PublicationStatus{
		Environment: "production",
		Surface:     "public_api",
		Ready:       false,
		Sources: []PublicationSource{
			{Source: "wago_tools", ReviewStatus: "reviewed", Allowed: false, BlockingReasons: []string{"grant missing"}},
			{Source: "wow_listfile", ReviewStatus: "pending", Allowed: true},
		},
	})
	if status.Surface != "private_api" || status.Ready {
		t.Fatalf("private status = %#v", status)
	}
	if !status.Sources[0].Allowed || len(status.Sources[0].BlockingReasons) != 0 {
		t.Fatalf("reviewed private source should be allowed: %#v", status.Sources[0])
	}
	if status.Sources[1].Allowed || len(status.Sources[1].BlockingReasons) != 1 {
		t.Fatalf("unreviewed private source should be blocked: %#v", status.Sources[1])
	}
}
