import { permanentRedirect } from "next/navigation";

// No gear section yet: the hero's equipment lives on the character profile.
export default function Page() {
  permanentRedirect("/ru/wow/characters");
}
