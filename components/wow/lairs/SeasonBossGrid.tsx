import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

export type SeasonBossCard = {
  href: string;
  name: string;
  overline: string;
  summary: string;
  meta: string;
  image: string;
  badgeIcon: string;
  accent: string;
  action: string;
};

export function SeasonBossGrid({ items }: { items: SeasonBossCard[] }) {
  return (
    <div className="season-boss-grid">
      {items.map((boss, index) => (
        <Link
          key={boss.href}
          href={boss.href}
          className="season-boss-card"
          data-reactive
          style={{ "--boss-accent": boss.accent, "--card-order": index } as React.CSSProperties}
        >
          <div className="season-boss-art">
            <Image src={boss.image} alt="" fill sizes="(max-width: 760px) 100vw, 33vw" />
            <span />
          </div>
          <div className="season-boss-icon"><Image src={boss.badgeIcon} alt="" fill sizes="56px" /></div>
          <div className="season-boss-copy">
            <small>{boss.overline}</small>
            <h3>{boss.name}</h3>
            <p>{boss.summary}</p>
            <div><span><MapPin /> {boss.meta}</span><b>{boss.action} <ArrowRight /></b></div>
          </div>
        </Link>
      ))}
    </div>
  );
}
