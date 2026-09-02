package api_test

import (
	"context"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

func TestLeagueOpenAPIContract(t *testing.T) {
	loader := openapi3.NewLoader()
	document, err := loader.LoadFromFile("league-of-legends-openapi.yaml")
	if err != nil {
		t.Fatalf("load League OpenAPI document: %v", err)
	}
	if err := document.Validate(context.Background()); err != nil {
		t.Fatalf("validate League OpenAPI document: %v", err)
	}
}
