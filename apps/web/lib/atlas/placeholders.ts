import { artPlaceholder, configureArtPlaceholders, configureArtPortraits, type ArtPortrait } from "@gildra/atlas-ui/placeholders";
import placeholders from "./artPlaceholders.json";
import portraits from "./artPortraits.json";

/**
 * The site's blurred placeholders (`npm run art:placeholders` writes the map) and
 * the phone crops of the scene paintings (`npm run art:portraits`), handed to the
 * kit once; importing this module configures it.
 */
configureArtPlaceholders(placeholders as Record<string, string>);
configureArtPortraits(portraits as Record<string, ArtPortrait>);

export { artPlaceholder };
