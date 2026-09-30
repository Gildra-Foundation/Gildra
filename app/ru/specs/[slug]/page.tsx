import { notFound, permanentRedirect } from "next/navigation";

const redirects: Record<string, string> = {
  "frost-death-knight": "/ru/wow/classes/death-knight/frost-death-knight",
  "arcane-mage": "/ru/wow/classes/mage/arcane-mage",
  "augmentation-evoker": "/ru/wow/classes/evoker/augmentation-evoker",
  "retribution-paladin": "/ru/wow/classes/paladin/retribution-paladin",
  "outlaw-rogue": "/ru/wow/classes/rogue/outlaw-rogue",
  "balance-druid": "/ru/wow/classes/druid/balance-druid",
  "shadow-priest": "/ru/wow/classes/priest/shadow-priest",
  "marksmanship-hunter": "/ru/wow/classes/hunter/marksmanship-hunter",
  "elemental-shaman": "/ru/wow/classes/shaman/elemental-shaman",
  "affliction-warlock": "/ru/wow/classes/warlock/affliction-warlock",
};

export const generateStaticParams = () => Object.keys(redirects).map((slug) => ({ slug }));

export default async function LegacySpecRedirectRu({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destination = redirects[slug];
  if (!destination) notFound();
  permanentRedirect(destination);
}
