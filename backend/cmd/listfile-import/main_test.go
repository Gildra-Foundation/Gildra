package main

import "testing"

func TestParseBuildNumber(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name    string
		version string
		want    int
		wantErr bool
	}{
		{name: "retail", version: "12.1.0.69497", want: 69497},
		{name: "missing", version: "", wantErr: true},
		{name: "short", version: "12.1.69497", wantErr: true},
		{name: "invalid major", version: "retail.1.0.69497", wantErr: true},
		{name: "not numeric", version: "12.1.0.latest", wantErr: true},
		{name: "non positive", version: "12.1.0.0", wantErr: true},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseBuildNumber(test.version)
			if test.wantErr {
				if err == nil {
					t.Fatalf("parseBuildNumber(%q) unexpectedly succeeded with %d", test.version, got)
				}
				return
			}
			if err != nil || got != test.want {
				t.Fatalf("parseBuildNumber(%q) = (%d,%v), want (%d,nil)", test.version, got, err, test.want)
			}
		})
	}
}
