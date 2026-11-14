import Image from "next/image";
import { AtlasSection } from "@/components/atlas";
import { MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import { pageGlyphs } from "@/components/platform/navigation/SiteGlyphs";
import { ForeverFrame } from "@/components/wow/forever/ForeverFrame";
import { newDungeons } from "@/components/wow/forever/instanceData";
import {
  FOREVER_KIT, ForeverArtCard, ForeverArtGrid, ForeverChips, ForeverCrest, ForeverCrests, ForeverEmpty, ForeverFeature, ForeverFilters, ForeverHero,
  ForeverIcon, ForeverLevel, ForeverList, ForeverListRow, ForeverPager, ForeverPanel, ForeverRow, ForeverRows, ForeverSearch, ForeverSelect,
  ForeverSkeleton, ForeverStack, ForeverTabs, foreverPanelStyles,
} from "@/components/wow/forever/shared";
import { foreverClasses } from "@/lib/data/wow/foreverRoster";
import { classColors } from "@/lib/atlas/dataPalette";
import { assertGalleryEnabled } from "@/lib/blocks/gallery";
import { classIcon } from "@/lib/games/wow/assets";

export const metadata = { title: "Forever kit — WowArcana dev", robots: { index: false, follow: false } };
// The dev flag is read per request (GILDRA_DEV_GALLERY), not baked in at build time.
export const dynamic = "force-dynamic";

const L = "/assets/wow/loading";
const self = "/dev/forever";

/**
 * Dev-only gallery of the shared Forever parts (components/wow/forever/shared, contract in
 * docs/forever/DESIGN.md): every part in its main states on the section's own data.
 */
export default function ForeverGallery() {
  assertGalleryEnabled();
  const warrior = foreverClasses.find(entry => entry.slug === "warrior")!;
  const Guide = pageGlyphs.guide, Meta = pageGlyphs.meta, Library = pageGlyphs.library;
  return <ForeverFrame lang="en" page="classes">
    <ForeverHero lang="en" trail={[{ label: "Classes", href: "/wow/forever/classes" }, { label: warrior.name.en }]}
      eyebrow="Tank · Damage" crest={<Image src={classIcon(warrior.icon)!} alt="" width={64} height={64} />}
      title={warrior.name.en} lede={warrior.description.en}
      stats={[{ value: 3, label: "Talent trees" }, { value: 60, label: "Max level" }]}
      actions={<MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={self}>Talent calculator</MaterialLinkButton>} />

    <AtlasSection id="filters" title="Filters, tabs, chips, paging">
      <ForeverTabs label="Record types" tabs={[{ href: `${self}?type=item`, label: "Items", current: true, count: 21214 }, { href: `${self}?type=spell`, label: "Spells" }, { href: `${self}?type=npc`, label: "NPCs" }, { href: `${self}?type=quest`, label: "Quests" }, { href: `${self}?type=recipe`, label: "Recipes" }]} />
      <ForeverStack>
      <ForeverPanel>
        <ForeverFilters lang="en" action={self} reset={self} hidden={{ type: "item" }}
          search={<ForeverSearch name="q" label="Search items" placeholder="Sword, potion, ore…" />}>
          <ForeverSelect name="quality" label="Quality" options={[{ value: "", label: "Any" }, { value: 2, label: "Uncommon" }, { value: 3, label: "Rare" }, { value: 4, label: "Epic" }]} />
          <ForeverLevel name="minLevel" label="Min. level" />
          <ForeverLevel name="maxLevel" label="Max. level" />
        </ForeverFilters>
        <ForeverChips label="Class" chips={foreverClasses.slice(0, 6).map((entry, index) => ({ href: `${self}?class=${entry.slug}`, label: entry.name.en, icon: classIcon(entry.icon)!, active: index === 0 }))} />
        <ForeverList label="Classes">
          {foreverClasses.slice(0, 4).map(entry => <ForeverListRow key={entry.slug} href={self} icon={<ForeverIcon src={classIcon(entry.icon)!} size={44} />} title={entry.name.en} note={entry.description.en} values={<><span>Level 10</span><span>3 trees</span></>} />)}
        </ForeverList>
        <ForeverPager lang="en" label="Items" page={2} pages={443} prev={`${self}?page=1`} next={`${self}?page=3`} />
      </ForeverPanel>
      <ForeverPanel>
        <ForeverFilters lang="en" action={self}>
          <ForeverSelect name="class" label="Class" options={[{ value: "", label: "All classes" }, ...foreverClasses.map(entry => ({ value: entry.slug, label: entry.name.en }))]} />
        </ForeverFilters>
      </ForeverPanel>
      </ForeverStack>
    </AtlasSection>

    <AtlasSection id="cards" title="Art cards, rows, crests, feature">
      <ForeverStack>
      <ForeverArtGrid label="Dungeons" min={220}>
        {newDungeons.slice(0, 4).map((dungeon, index) => <ForeverArtCard key={dungeon.slug} href={self} art={[`${L}/dungeon.webp`, `${L}/tier.webp`, `${L}/archive.webp`, `${L}/talents-wow.webp`][index]} title={dungeon.name} note={dungeon.location} badge={`${dungeon.min}–${dungeon.max}`} />)}
      </ForeverArtGrid>
      <ForeverCrests label="Classes" count={foreverClasses.length}>
        {foreverClasses.map(entry => <ForeverCrest key={entry.slug} href={self} icon={classIcon(entry.icon)!} label={entry.name.en} color={classColors[entry.slug]} />)}
      </ForeverCrests>
      <ForeverRows label="Tools">
        <ForeverRow href={self} sign={<Guide />} title="Class changes" note="Abilities and talents compared" />
        <ForeverRow href={self} sign={<Meta />} title="Tier lists" note="Classes for leveling and dungeons" />
        <ForeverRow href={self} sign={<Library />} title="Library" note="Items, spells, NPCs and quests" aside="21 214" />
      </ForeverRows>
      <ForeverFeature href={self} art={`${L}/forever-crafthall-20261111-768.webp`} title="Professions" text="Recipes, reagents and trainers of every craft."
        linksLabel="Professions" links={[{ href: `${self}?p=alchemy`, label: "Alchemy" }, { href: `${self}?p=mining`, label: "Mining" }, { href: `${self}?p=cooking`, label: "Cooking" }]} />
      </ForeverStack>
    </AtlasSection>

    <AtlasSection id="states" title="Panel and states">
      <ForeverStack>
      <ForeverPanel title="Onyxia attunement"><p className={foreverPanelStyles.text}>Complete your faction’s quest chain to obtain the Drakefire Amulet.</p></ForeverPanel>
      <ForeverPanel><ForeverEmpty lang="en" reset={self} /></ForeverPanel>
      <ForeverPanel><ForeverSkeleton lang="en" count={3} /></ForeverPanel>
      </ForeverStack>
    </AtlasSection>
  </ForeverFrame>;
}
