package catalogquality

import (
	"regexp"
	"strings"
)

var publicTemplateToken = regexp.MustCompile(`\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])`)
var publicTooltipFallback = regexp.MustCompile(`(?i)(?:a game-defined value|значение, определяемое игрой)`)

// RuntimeTemplateValidation describes what was actually observable in a
// public API payload. Stored tooltip tokens are deliberately not evidence of
// a public defect; the API may resolve them before serializing the response.
type RuntimeTemplateValidation struct {
	RawTokens             int64
	FallbackPhrases      int64
	ExplicitEffectStatus bool
}

// ValidatePublicTemplatePayload scans only public response fields. Raw source
// fields are excluded so retaining provenance cannot manufacture a public
// failure. Fallback phrases are counted separately because they are rendered
// output, not source metadata.
func ValidatePublicTemplatePayload(payload map[string]any) RuntimeTemplateValidation {
	var result RuntimeTemplateValidation
	var visit func(string, any)
	visit = func(key string, value any) {
		lowerKey := strings.ToLower(key)
		if lowerKey == "raw_text" || lowerKey == "rawdescription" || lowerKey == "raw_description" {
			return
		}
		switch typed := value.(type) {
		case string:
			if lowerKey == "spell_target_status" && (typed == "resolved" || typed == "unavailable_in_build") {
				result.ExplicitEffectStatus = true
			}
			if publicTemplateToken.MatchString(typed) {
				result.RawTokens++
			}
			if publicTooltipFallback.MatchString(typed) {
				result.FallbackPhrases++
			}
		case []any:
			for _, entry := range typed {
				visit("", entry)
			}
		case map[string]any:
			for childKey, entry := range typed {
				visit(childKey, entry)
			}
		}
	}
	visit("", payload)
	// A dynamic numeric formula may legitimately render the game's own
	// placeholder (for example, "a game-defined value") while the payload
	// explicitly records how its spell target was resolved. Treat that as
	// truthful metadata, not a leaked source template; unresolved $tokens
	// remain blocking regardless of status.
	if result.RawTokens == 0 && result.ExplicitEffectStatus {
		result.FallbackPhrases = 0
	}
	return result
}
