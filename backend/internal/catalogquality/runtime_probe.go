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
	RawTokens       int64
	FallbackPhrases int64
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
	return result
}
