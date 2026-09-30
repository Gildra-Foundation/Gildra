import { notFound, permanentRedirect } from "next/navigation";

const redirects: Record<string, string> = {
  "frost-death-knight": "/wow/classes/death-knight/frost-death-knight",
  "arcane-mage": "/wow/classes/mage/arcane-mage",
  "augmentation-evoker": "/wow/classes/evoker/augmentation-evoker",
  "retribution-paladin": "/wow/classes/paladin/retribution-paladin",
  "outlaw-rogue": "/wow/classes/rogue/outlaw-rogue",
  "balance-druid": "/wow/classes/druid/balance-druid",
  "shadow-priest": "/wow/classes/priest/shadow-priest",
  "marksmanship-hunter": "/wow/classes/hunter/marksmanship-hunter",
  "elemental-shaman": "/wow/classes/shaman/elemental-shaman",
  "affliction-warlock": "/wow/classes/warlock/affliction-warlock",
};

export const generateStaticParams = () => Object.keys(redirects).map((slug) => ({ slug }));

export default async function LegacySpecRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destination = redirects[slug];
  if (!destination) notFound();
  permanentRedirect(destination);
}
