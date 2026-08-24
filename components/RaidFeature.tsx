import Image from "next/image";
import Link from "next/link";
import { SpecSlot } from "./SpecSlot";
import { raid } from "@/data/site";
import { p, t, type Lang } from "@/lib/i18n";

export function RaidFeature({ lang = "en" }: { lang?: Lang }) {
  const tt = t(lang);
  return (
    <section className="raidfeat" id="raid">
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
            <a href={p(lang, "/#guides")}>{tt("Guides")}</a>
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
