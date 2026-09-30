import Image from "next/image";
import Link from "next/link";
import { p, t } from "@/lib/i18n";
import { ANCHORS, anchorHref } from "@/lib/anchors";
import type { BlockComponentProps, EmptyProps } from "@/lib/blocks/types";
import type { Raid } from "@/data/site";

export type RaidFeatureProps = EmptyProps;
export type RaidFeatureData = { raid: Raid };

export function RaidFeature({ data, lang }: BlockComponentProps<RaidFeatureProps, RaidFeatureData>) {
  const { raid } = data;
  const tt = t(lang);
  return (
    <section className="raidfeat" id={ANCHORS.raid}>
      <Image
        className="rf-art"
        src="/assets/wow/raids/midnight/backgrounds/the-voidspire.png"
        alt={raid.name}
        fill
        sizes="100vw"
        style={{ objectFit: "cover", objectPosition: "center 62%" }}
      />
      <div className="rf-in">
        <div className="rf-main">
          <span className="cap gold">{tt(raid.label)}</span>
          <h2>{raid.name}</h2>
          <p>{tt(raid.blurb)}</p>
          <div className="rf-links">
            <Link href={p(lang, "/wow/raids")}>{tt("Boss Rankings")}</Link>
            <span className="dia">◆</span>
            <a href={p(lang, anchorHref(ANCHORS.guides))}>{tt("Guides")}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
