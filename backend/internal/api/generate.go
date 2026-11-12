package api

// Match CI: Go versions can encode the embedded gzip schema differently.
//go:generate env GOTOOLCHAIN=go1.26.6 go tool oapi-codegen -config oapi-codegen.yaml ../../api/openapi.yaml
