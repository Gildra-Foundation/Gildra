import Image from "next/image";
import { notFound } from "next/navigation";
import { AtlasSection } from "@/components/atlas";
import { MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import { ForeverFrame } from "@/components/wow/forever/ForeverFrame";
import { FOREVER_KIT, ForeverChips, ForeverCrest, ForeverCrests, ForeverHero, ForeverPanel, ForeverStack } from "@/components/wow/forever/shared";
import { classColors } from "@/lib/atlas/dataPalette";
import { foreverClasses } from "@/lib/data/wow/foreverRoster";
import { foreverTalents, talentClass } from "@/lib/forever/talents/data";
import { decodeBuild } from "@/lib/forever/talents/engine";
import { foreverCalculatorPath } from "@/lib/forever/talents/links";
import { classIcon } from "@/lib/games/wow/assets";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverCalculator } from "./ForeverCalculator";
import { talentCopy } from "./talentCopy";

/** The classes that have trees, in the order of the section's roster (the hub, the class pages). */
const classes = foreverClasses.filter(entry => talentClass(entry.slug));

/** /wow/forever/talent-calc: choose a class. */
export function ForeverTalentsIndex({ lang }: { lang: Lang }) {
  const t = talentCopy[lang];
  return <ForeverFrame lang={lang} page="talents">
    <ForeverHero lang={lang} trail={[{ label: t.title }]} title={t.title} lede={t.lede} />
    <AtlasSection title={t.classes}>
      <ForeverCrests label={t.classes} count={classes.length}>
        {classes.map(entry => <ForeverCrest key={entry.slug} href={foreverCalculatorPath(lang, entry.slug)} icon={classIcon(entry.icon)!} label={entry.name[lang]} color={classColors[entry.slug]} />)}
      </ForeverCrests>
    </AtlasSection>
  </ForeverFrame>;
}

/** /wow/forever/talent-calc/<class>: the three trees, the build in the address. */
export function ForeverTalentsClass({ lang, slug, token }: { lang: Lang; slug: string; token?: string | string[] }) {
  const cls = talentClass(slug), entry = classes.find(item => item.slug === slug);
  if (!cls || !entry) notFound();
  const t = talentCopy[lang], parsed = decodeBuild(cls, foreverTalents.snapshot, Array.isArray(token) ? "invalid" : token);
  return <ForeverFrame lang={lang} page="talents">
    <ForeverHero lang={lang} trail={[{ label: t.title, href: foreverCalculatorPath(lang) }, { label: cls.name[lang] }]}
      eyebrow={cls.trees.map(tree => tree.name[lang]).join(" · ")}
      crest={<Image src={classIcon(entry.icon)!} alt="" width={64} height={64} />}
      title={t.classTitle(cls.name[lang])}
      actions={<MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={p(lang, `/wow/forever/classes/${cls.slug}`)}>{t.aboutClass}</MaterialLinkButton>} />
    <AtlasSection>
      <ForeverStack>
        <ForeverChips label={t.classes} chips={classes.map(item => ({
          href: foreverCalculatorPath(lang, item.slug), label: item.name[lang], icon: classIcon(item.icon)!, active: item.slug === cls.slug,
        }))} />
        <ForeverPanel data-forever-calculator={cls.slug}>
          <ForeverCalculator key={cls.slug} cls={cls} snapshot={foreverTalents.snapshot} lang={lang} initial={parsed.build} initialError={parsed.error} />
        </ForeverPanel>
      </ForeverStack>
    </AtlasSection>
  </ForeverFrame>;
}
