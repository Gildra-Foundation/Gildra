package catalogquality

import "testing"

func TestValidatePublicTemplatePayloadIgnoresRawSourceTokens(t *testing.T) {
	got := ValidatePublicTemplatePayload(map[string]any{
		"description": "Deals 10 damage.",
		"tooltip": map[string]any{
			"plainText": "Deals 10 damage.",
			"raw_text":  "Deals $s1 damage.",
		},
		"rawDescription": "Deals $s1 damage.",
	})
	if got.RawTokens != 0 || got.FallbackPhrases != 0 {
		t.Fatalf("raw source leaked into public validation: %#v", got)
	}
}

func TestValidatePublicTemplatePayloadFindsRuntimeFallback(t *testing.T) {
	got := ValidatePublicTemplatePayload(map[string]any{
		"tooltip": map[string]any{
			"plainText": "Deals a game-defined value damage.",
		},
		"localizations": map[string]any{
			"ru_RU": map[string]any{"description": "Урон: значение, определяемое игрой."},
		},
	})
	if got.RawTokens != 0 || got.FallbackPhrases != 2 {
		t.Fatalf("validation = %#v, want two fallback phrases", got)
	}
}

func TestValidatePublicTemplatePayloadFindsLeakedToken(t *testing.T) {
	got := ValidatePublicTemplatePayload(map[string]any{"tooltip": map[string]any{"plainText": "Deals $s1 damage."}})
	if got.RawTokens != 1 || got.FallbackPhrases != 0 {
		t.Fatalf("validation = %#v, want one leaked token", got)
	}
}
