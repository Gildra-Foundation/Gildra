import { permanentRedirect } from "next/navigation";

// One sign-in screen on the site: the Frost panel of the characters page.
export default function Page() {
  permanentRedirect("/wow/characters");
}
