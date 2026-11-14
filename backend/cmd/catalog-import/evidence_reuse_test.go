package main

import (
	"context"
	"testing"
	"time"
)

func TestEvidenceIsReusedOnlyForTheSamePinnedNamespaceAndResource(t *testing.T) {
	const namespace = "static-12.1.5_70077-us"
	const href = "https://us.api.blizzard.com/data/wow/item/25?namespace=static-12.1.5_70077-us"
	cases := []struct {
		name           string
		href, ns, path string
		want           bool
	}{
		{"same namespace and resource", href, namespace, "/data/wow/item/25", true},
		{"with a locale parameter", href + "&locale=en_US", namespace, "/data/wow/item/25", true},
		{"another API build", href, "static-12.1.5_70783-us", "/data/wow/item/25", false},
		{"another region", href, "static-12.1.5_70077-eu", "/data/wow/item/25", false},
		{"another record", href, namespace, "/data/wow/item/26", false},
		{"another resource", href, namespace, "/data/wow/spell/25", false},
		{"not https", "http://us.api.blizzard.com/data/wow/item/25?namespace=" + namespace, namespace, "/data/wow/item/25", false},
		{"no link", "", namespace, "/data/wow/item/25", false},
	}
	for _, test := range cases {
		if got := sameNamespaceResource(test.href, test.ns, test.path); got != test.want {
			t.Errorf("%s: got %t, want %t", test.name, got, test.want)
		}
	}
	if pinnedNamespace("static-us") || pinnedNamespace("dynamic-us") || !pinnedNamespace(namespace) || !pinnedNamespace("static-classic-5.5.3_66666-eu") {
		t.Error("only build-pinned static namespaces may be reused")
	}
	if got := selfLink([]byte(`{"_links":{"self":{"href":"` + href + `"}},"id":25}`)); got != href {
		t.Errorf("self link %q", got)
	}
	if got := localizedSourceURL(href, "ru_RU"); got != "https://us.api.blizzard.com/data/wow/item/25?locale=ru_RU&namespace=static-12.1.5_70077-us" {
		t.Errorf("localized source URL %q", got)
	}
}

func TestRequestPacerSpacesRequests(t *testing.T) {
	var none *requestPacer
	if err := none.Wait(context.Background()); err != nil {
		t.Fatal(err)
	}
	if newRequestPacer(0) != nil {
		t.Fatal("no limit must not pace")
	}
	pacer := newRequestPacer(360000) // one request per 10 ms
	started := time.Now()
	for range 6 {
		if err := pacer.Wait(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if elapsed := time.Since(started); elapsed < 45*time.Millisecond {
		t.Fatalf("six paced requests took %s, want at least 50 ms", elapsed)
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	slow := newRequestPacer(1)
	_ = slow.Wait(context.Background())
	if err := slow.Wait(cancelled); err == nil {
		t.Fatal("a cancelled wait must return")
	}
}
