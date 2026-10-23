/**
 * The atlas kit as the app uses it: everything from @gildra/atlas-ui
 * (packages/atlas-ui, catalogue in its README), plus the app's AtlasFrame —
 * the kit's frame with the site's scenes and legal line. The import below hands
 * the kit the blurred placeholders of the site's paintings.
 *
 * For server components. A client component imports a kit piece from its own
 * path (`@gildra/atlas-ui/AtlasDisclosure`): through this file it would also
 * bundle AtlasFrame, the i18n dictionary and the placeholder map.
 */
import "@/lib/atlas/placeholders";

export * from "@gildra/atlas-ui";
export { AtlasFrame, type AtlasFrameProps } from "./AtlasFrame";
