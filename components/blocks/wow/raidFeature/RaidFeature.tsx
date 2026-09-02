import Image from "next/image";
import Link from "next/link";
import { SpecSlot } from "@/components/SpecSlot";
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
        src="/bg.jpg"
        alt="Manaforge Omega artwork"
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
            <span className="dead-link" title={tt("Coming soon")}>{tt("Boss Rankings")}</span>
            <span className="dia">◆</span>
            <Link href={p(lang, "/tier-lists")}>{tt("Tier List")}</Link>
            <span className="dia">◆</span>
            <a href={p(lang, anchorHref(ANCHORS.guides))}>{tt("Guides")}</a>
            <span className="dia">◆</span>
            <Link href={p(lang, "/tier-lists")}>{tt("Best Specs")}</Link>
          </div>
        </div>
        <div className="rf-specs">
          <span className="cap">{tt("Top raid specs")}</span>
          {raid.topSpecs.map((sp) => (
            <div className="rf-row" key={sp.name}>
              <SpecSlot name={sp.name} cls={sp.cls} size="sm" /> {sp.name}{" "}
              <span className="tpill s sm">S</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
