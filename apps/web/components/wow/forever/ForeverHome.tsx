import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { AtlasSection, AtlasStats } from "@/components/atlas";
import { pageGlyphs, realmGlyphs } from "@/components/platform/navigation/SiteGlyphs";
import { foreverRealms, type NavigationLink } from "@/components/platform/navigation/navigationMap";
import { foreverClasses } from "@/lib/data/wow/foreverRoster";
import { classColors } from "@/lib/atlas/dataPalette";
import { FOREVER_TYPES } from "@/lib/forever/database/contract";
import { professions } from "@/lib/forever/guides/professions";
import { FOREVER_UI_TEXTURES, classIcon } from "@/lib/games/wow/assets";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "./ForeverFrame";
import { ForeverDungeonCards, ForeverRaidCards } from "./ForeverInstances";
import { foreverCopy } from "./foreverCopy";
import { foreverRaids, newDungeons, returningDungeonDetails } from "./instanceData";
import { libraryCopy } from "./library/libraryCopy";
import { copy as professionsCopy } from "./professions/copy";
import { professionIcon } from "./professions/kit";
import { ForeverArtCard, ForeverArtGrid, ForeverCrest, ForeverCrests, ForeverFeature, ForeverHero, ForeverRow, ForeverRows, ForeverStack } from "./shared";
import styles from "./foreverHome.module.css";

const L = "/assets/wow/loading";
/** The chapters of the hub in page order: the banner's painting and where «more» leads. */
const chapters = [
  { id: "dungeons", art: `${L}/dungeon.webp`, href: "/wow/forever/dungeons" },
  { id: "classes", art: `${L}/talents-wow.webp`, href: "/wow/forever/classes" },
  { id: "raids", art: `${L}/tier.webp`, href: "/wow/forever/raids" },
  { id: "crafts", art: `${L}/forever-crafthall-20261111-768.webp`, href: "/wow/forever/professions" },
  { id: "library", art: `${L}/archive.webp`, href: "/wow/forever/library" },
] as const;

const page = (href: string): NavigationLink => {
  const link = foreverRealms.flatMap(realm => realm.groups.flatMap(group => group.links)).find(entry => entry.href === href);
  if (!link) throw new Error(`Missing Forever page: ${href}`);
  return link;
};
/** Tools of the class chapter: their names and one-line notes are the menu's. */
const classTools = [
  { link: page("/wow/forever/talent-calc"), Sign: realmGlyphs["forever-talent-calc"] },
  { link: page("/wow/forever/changes"), Sign: pageGlyphs.guide },
  { link: page("/wow/forever/tier-lists"), Sign: pageGlyphs.meta },
];

export function ForeverHome({ lang }: { lang: Lang }) {
  const copy = foreverCopy[lang];
  const more = (id: (typeof chapters)[number]["id"], href: string) => <Link href={p(lang, href)} prefetch={false} className={styles.more}>{copy.chapters[id].more}<ArrowRight aria-hidden="true" /></Link>;
  const title = (id: (typeof chapters)[number]["id"]) => <><Image src={FOREVER_UI_TEXTURES.marks[id]} alt="" width={32} height={32} unoptimized className={styles.mark} />{copy.chapters[id].title}</>;
  return <ForeverFrame lang={lang} page="hub" className={styles.page}>
    <ForeverHero lang={lang} className={styles.hero} title={<span className={styles.promise}>{copy.title}</span>} lede={copy.lede}
      actions={<AtlasStats items={[
        { value: newDungeons.length + returningDungeonDetails.length, label: copy.stats.dungeons },
        { value: foreverRaids.length, label: copy.stats.raids },
        { value: foreverClasses.length, label: copy.stats.classes },
      ]} />} />
    <div className={styles.flourish} aria-hidden="true"><Image src={FOREVER_UI_TEXTURES.flourish} alt="" width={209} height={18} unoptimized /></div>
    <nav className={styles.banners} aria-label={copy.sections} data-forever-glide="">
      <ForeverArtGrid min={200} fit strip>
        {chapters.map((chapter, index) => <ForeverArtCard key={chapter.id} href={`#${chapter.id}`} art={chapter.art} accent={`var(--forever-chapter-${chapter.id})`}
          title={copy.chapters[chapter.id].call} note={<>{copy.chapters[chapter.id].short}<ArrowDown aria-hidden="true" /></>}
          sizes="(max-width: 700px) 62vw, (max-width: 1000px) 240px, 250px" priority={index < 2} />)}
      </ForeverArtGrid>
    </nav>

    {chapters.map(chapter => <AtlasSection key={chapter.id} id={chapter.id} className={styles.chapter} title={title(chapter.id)} aside={more(chapter.id, chapter.href)}>
      <ForeverStack>
        {chapter.id === "dungeons" && <ForeverDungeonCards lang={lang} />}
        {chapter.id === "classes" && <>
          <ForeverCrests label={copy.chapters.classes.short} count={foreverClasses.length}>
            {foreverClasses.map(entry => <ForeverCrest key={entry.slug} href={p(lang, `/wow/forever/classes/${entry.slug}`)} icon={classIcon(entry.icon)!} label={entry.name[lang]} color={classColors[entry.slug]} />)}
          </ForeverCrests>
          <ForeverRows label={copy.chapters.classes.title}>
            {classTools.map(({ link, Sign }) => <ForeverRow key={link.href} href={p(lang, link.href)} sign={<Sign />} title={link.label[lang]} note={link.note?.[lang]} />)}
          </ForeverRows>
        </>}
        {chapter.id === "raids" && <ForeverRaidCards lang={lang} />}
        {chapter.id === "crafts" && <>
          <ForeverFeature href={p(lang, chapter.href)} art={`${L}/forever-crafthall-20261111-768.webp`} title={copy.chapters.crafts.title} text={copy.craftsText} />
          <ForeverRows label={copy.chapters.crafts.short} columns={4}>
            {professions.map(entry => <ForeverRow key={entry.slug} href={p(lang, `/wow/forever/professions/${entry.slug}`)} icon={professionIcon(entry.icon)} title={entry.name[lang]} note={professionsCopy[lang].kinds[entry.kind]} />)}
          </ForeverRows>
        </>}
        {chapter.id === "library" && <ForeverFeature href={p(lang, chapter.href)} art={`${L}/archive.webp`} title={libraryCopy[lang].title} text={copy.libraryText} linksLabel={copy.types}
          links={FOREVER_TYPES.map(type => ({ href: `${p(lang, chapter.href)}?type=${type}`, label: libraryCopy[lang].types[type] }))} />}
      </ForeverStack>
    </AtlasSection>)}
  </ForeverFrame>;
}
