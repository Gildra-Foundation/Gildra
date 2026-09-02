package catalog

import "testing"

func TestPrivatePublicationStatusAllowsEveryContributingSource(t *testing.T) {
	status := privatePublicationStatus(PublicationStatus{
		Environment: "production",
		Surface:     "public_api",
		Ready:       true,
		Sources: []PublicationSource{
			{Source: "wago_tools", Allowed: true},
			{Source: "raidbots", Allowed: false, BlockingReasons: []string{"stale caller state"}},
		},
	})
	if status.Surface != "private_api" || !status.Ready {
		t.Fatalf("private status = %#v", status)
	}
	for _, source := range status.Sources {
		if !source.Allowed || len(source.BlockingReasons) != 0 {
			t.Fatalf("every contributing source is publishable: %#v", source)
		}
	}
}
