import Image from "next/image";
import Link from "next/link";
import { SpecSlot } from "./SpecSlot";
import { raid } from "@/data/site";

export function RaidFeature() {
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
          <span className="cap gold">{raid.label}</span>
          <h2>{raid.name}</h2>
          <p>{raid.blurb}</p>
          <div className="rf-links">
            <span className="dead-link" title="Coming soon">Boss Rankings</span>
            <span className="dia">◆</span>
            <Link href="/tier-lists">Tier List</Link>
            <span className="dia">◆</span>
            <a href="/#guides">Guides</a>
            <span className="dia">◆</span>
            <Link href="/tier-lists">Best Specs</Link>
          </div>
        </div>
        <div className="rf-specs">
          <span className="cap">Top raid specs</span>
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
