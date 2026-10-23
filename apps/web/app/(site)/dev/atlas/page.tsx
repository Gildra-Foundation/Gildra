import { Clock3, MapPin, Search, Swords } from "lucide-react";
import {
  AtlasAnchorNav, AtlasBadge, AtlasButton, AtlasCard, AtlasCheckbox, AtlasDisclosure, AtlasEmblem, AtlasEmpty, AtlasError,
  AtlasField, AtlasFrame, AtlasGrid, AtlasHero, AtlasInput, AtlasLinkButton, AtlasMetaList, AtlasNotice, AtlasPanel, AtlasPath,
  AtlasRange, AtlasSection, AtlasSelect, AtlasSkeleton, AtlasTable, AtlasTabs, AtlasTile, AtlasTooltip,
} from "@/components/atlas";
import { DialogDemo } from "@/components/atlas/gallery/DialogDemo";
import styles from "@/components/atlas/gallery/gallery.module.css";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { atlasScenes } from "@/lib/atlas/scenes";
import { assertGalleryEnabled } from "@/lib/blocks/gallery";

export const metadata = { title: "Atlas kit — Gildra dev", robots: { index: false, follow: false } };
// The dev flag is read per request (GILDRA_DEV_GALLERY), not baked in at build time.
export const dynamic = "force-dynamic";

const dungeons = dungeonSlugs.map((slug) => dungeonRoutes[slug]);
const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const swatches = ["--atlas-bg", "--atlas-surface", "--atlas-surface-raised", "--atlas-surface-selected", "--atlas-text-strong", "--atlas-text", "--atlas-text-muted", "--atlas-text-subtle", "--atlas-accent", "--atlas-accent-strong", "--atlas-line", "--atlas-positive", "--atlas-negative", "--atlas-caution", "--atlas-info"];

/**
 * Dev-only gallery of the atlas kit (components/atlas): every component in its
 * main states on real site data (the Mythic+ dungeons), for review and the
 * screenshot test (`npm run visual:diff -- --routes /dev/atlas`).
 */
export default function AtlasGallery() {
  assertGalleryEnabled();
  const anchors = [
    { href: "#tokens", label: "Tokens" }, { href: "#actions", label: "Actions" }, { href: "#cards", label: "Cards" },
    { href: "#data", label: "Data" }, { href: "#forms", label: "Forms" }, { href: "#states", label: "States" }, { href: "#overlays", label: "Overlays" },
  ];
  return (
    <AtlasFrame scene="archive" lang="en">
      <AtlasHero
        title="Atlas kit"
        eyebrow="Gildra dev · components/atlas"
        lede="Every kit component in its main states. Data: the Mythic+ dungeons of the season."
        stats={[{ value: Object.keys(atlasScenes).length, label: "scenes" }, { value: dungeons.length, label: "dungeons" }]}
        breadcrumbs={[{ label: "Dev", href: "/dev/blocks" }, { label: "Atlas kit", href: "/dev/atlas" }]}
      />
      <AtlasAnchorNav items={anchors} label="Gallery sections" />

      <AtlasSection id="tokens" title="Tokens" description="Colours and type roles from app/styles/atlas-theme.css.">
        <div className={styles.stack}>
          <div className={styles.swatches}>
            {swatches.map((token) => <div className={styles.swatch} key={token}><span style={{ background: `var(${token})` }} />{token}</div>)}
          </div>
          <div className={styles.type}>
            <p className={styles.label}>Label · --atlas-text-label</p>
            <p className={styles.h2}>Display h2 — The Voidspire</p>
            <p className={styles.h3}>Display h3 — Den of Nalorakk</p>
            <p className={styles.body}>Body — Defeat the bosses, reach 100% enemy forces and finish the route before the timer runs out. One line of reading width is --atlas-measure.</p>
          </div>
        </div>
      </AtlasSection>

      <AtlasSection id="actions" title="Actions and labels">
        <div className={styles.stack}>
          <div className={styles.row}>
            <AtlasButton variant="primary" icon={<Swords />}>Primary</AtlasButton>
            <AtlasButton variant="secondary">Secondary</AtlasButton>
            <AtlasButton variant="ghost">Ghost</AtlasButton>
            <AtlasButton variant="secondary" disabled>Disabled</AtlasButton>
            <AtlasLinkButton href="/wow/mythic-plus" variant="secondary">Link button</AtlasLinkButton>
          </div>
          <div className={styles.row}>
            {(["accent", "neutral", "positive", "negative", "info", "caution"] as const).map((tone) => <AtlasBadge key={tone} tone={tone}>{tone}</AtlasBadge>)}
            <AtlasEmblem shape="diamond"><Swords /></AtlasEmblem>
            <AtlasTooltip content="Timer of the key at +2" focusable><span>Hover or focus me</span></AtlasTooltip>
          </div>
        </div>
      </AtlasSection>

      <AtlasSection id="cards" title="Cards, tiles and paths">
        <div className={styles.stack}>
          <AtlasGrid min={280}>
            {dungeons.slice(0, 3).map((dungeon) => (
              <AtlasCard
                key={dungeon.slug}
                href={`/wow/mythic-plus/midnight-season-2/${dungeon.slug}`}
                title={dungeon.name}
                image={{ src: dungeon.backdropImage, alt: "" }}
                eyebrow="Mythic+"
                meta={[{ icon: <Clock3 />, label: minutes(dungeon.timerSeconds) }]}
                cta={`Open ${dungeon.name}`}
              />
            ))}
          </AtlasGrid>
          <AtlasGrid min={240}>
            {dungeons.slice(3, 6).map((dungeon, index) => <AtlasTile key={dungeon.slug} href={`/wow/mythic-plus/midnight-season-2/${dungeon.slug}`} title={dungeon.name} text={minutes(dungeon.timerSeconds)} index={index + 1} />)}
          </AtlasGrid>
          <AtlasPath
            label="Route through three dungeons"
            steps={dungeons.slice(5, 8).map((dungeon) => ({ href: `/wow/mythic-plus/midnight-season-2/${dungeon.slug}`, title: dungeon.name, image: { src: dungeon.backdropImage }, meta: [{ icon: <Clock3 />, label: minutes(dungeon.timerSeconds) }] }))}
          />
        </div>
      </AtlasSection>

      <AtlasSection id="data" title="Data">
        <div className={styles.stack}>
          <AtlasTabs
            label="Table layouts"
            variant="segmented"
            tabs={[
              { id: "scroll", label: "Scroll", content: <AtlasTable label="Dungeons" rowKey={(row) => row.slug} rows={dungeons} columns={[
                { key: "name", header: "Dungeon", rowHeader: true, cell: (row) => row.name },
                { key: "timer", header: "Timer", numeric: true, cell: (row) => minutes(row.timerSeconds) },
                { key: "stops", header: "Steps", numeric: true, cell: (row) => row.stops.length },
              ]} /> },
              { id: "cards", label: "Cards on phones", content: <AtlasTable layout="cards" label="Dungeons" rowKey={(row) => row.slug} rows={dungeons.slice(0, 4)} columns={[
                { key: "name", header: "Dungeon", rowHeader: true, cell: (row) => row.name },
                { key: "timer", header: "Timer", label: "Timer", numeric: true, cell: (row) => minutes(row.timerSeconds) },
              ]} /> },
            ]}
          />
          <AtlasTabs label="Underline tabs" tabs={[
            { id: "meta", label: "Meta list", content: <AtlasMetaList items={[{ label: "Timer", value: minutes(dungeons[0].timerSeconds), icon: <Clock3 /> }, { label: "Steps", value: dungeons[0].stops.length }, { label: "Map", value: dungeons[0].name, icon: <MapPin /> }]} /> },
            { id: "panel", label: "Panel", content: <AtlasPanel tone="raised">AtlasPanel tone=&quot;raised&quot;. Never nest panels.</AtlasPanel> },
            { id: "disclosure", label: "Disclosure", content: <AtlasDisclosure summary="Long secondary note">Folded detail stays in the page.</AtlasDisclosure> },
          ]} />
        </div>
      </AtlasSection>

      <AtlasSection id="forms" title="Forms">
        <AtlasGrid min={240}>
          <AtlasField label="Search" hint="Name or ID" htmlFor="g-search"><AtlasInput id="g-search" type="search" placeholder="Den of Nalorakk" icon={<Search size={16} />} /></AtlasField>
          <AtlasField label="Dungeon" htmlFor="g-dungeon"><AtlasSelect id="g-dungeon" defaultValue={dungeons[0].slug}>{dungeons.map((dungeon) => <option key={dungeon.slug} value={dungeon.slug}>{dungeon.name}</option>)}</AtlasSelect></AtlasField>
          <AtlasField label="Key level" error="Choose 2 or higher" htmlFor="g-level"><AtlasRange id="g-level" min={2} max={20} defaultValue={12} /></AtlasField>
          <AtlasCheckbox label="Show completed steps" defaultChecked />
        </AtlasGrid>
      </AtlasSection>

      <AtlasSection id="states" title="States">
        <div className={styles.stack}>
          <AtlasNotice title="Draft route" tone="caution">AtlasNotice for drafts and fixtures.</AtlasNotice>
          <AtlasEmpty title="Nothing here yet">AtlasEmpty explains what will appear.</AtlasEmpty>
          <AtlasError title="The catalog did not answer" code="digest-123">AtlasError keeps a code for support.</AtlasError>
          <AtlasGrid min={260}>
            <AtlasSkeleton label="Loading lines" />
            <AtlasSkeleton variant="rows" count={3} label="Loading rows" />
            <AtlasSkeleton variant="cards" count={2} label="Loading cards" />
          </AtlasGrid>
        </div>
      </AtlasSection>

      <AtlasSection id="overlays" title="Overlays">
        <DialogDemo />
      </AtlasSection>
    </AtlasFrame>
  );
}
