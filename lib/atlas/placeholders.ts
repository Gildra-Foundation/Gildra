import { artPlaceholder, configureArtPlaceholders } from "@gildra/atlas-ui/placeholders";
import placeholders from "./artPlaceholders.json";

/**
 * The site's blurred placeholders (`npm run art:placeholders` writes the map),
 * handed to the kit once; importing this module configures it.
 */
configureArtPlaceholders(placeholders as Record<string, string>);

export { artPlaceholder };
