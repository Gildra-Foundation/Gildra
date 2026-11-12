import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { loadMythicPlusMeta } from "@/lib/games/wow/mythicPlusMeta";
import { mythicPlusMetaView, metaRoles } from "@/lib/games/wow/mythicPlusMetaView";
import { midnightSpecializations } from "@/lib/data/wow/specializations";
import { wowHomeCopy } from "./wowHomeCopy";
import { WOW_UI_TEXTURES } from "@/lib/games/wow/assets";
import styles from "./wowHome.module.css";

/** Existing cached read; unavailable data contributes no markup or placeholder. */
export async function HomeWeeklyMeta({ locale }: { locale: "en" | "ru" }) {
  const result = await loadMythicPlusMeta();
  const view = result.state === "ready" ? mythicPlusMetaView(result.meta.data) : null;
  if (!view || view.season.number !== 2) return null;
  const leaders = metaRoles.flatMap(role => {
    const spec = view.roles[role][0];
    const theme = spec && midnightSpecializations.find(theme => theme.slug === spec.key.split(":").reverse().join("-"));
    return theme ? [{ role, theme, presence: Math.round(spec.presence) }] : [];
  });
  if (!leaders.length) return null;
  const roles = wowHomeCopy[locale].roles;
  const prefix = locale === "ru" ? "/ru" : "";
  const t = wowHomeCopy[locale];
  return <nav className={styles.seasonNow} aria-labelledby="weekly-meta-title">
    <div className={styles.metaHead}><h2 id="weekly-meta-title">{t.weeklyMeta}</h2><a href={`${prefix}/wow/mythic-plus/meta`}>{t.allMeta}<ArrowRight aria-hidden="true" /></a></div>
    <ul className={styles.liveLinks}>{leaders.map(({role, theme, presence}) => <li key={role}><a href={`${prefix}/wow/mythic-plus/meta#${role}`}><span data-medallion="" aria-hidden="true"><Image src={theme.iconUrl} alt="" width={36} height={36} quality={50} /></span><span className={styles.metaSpec}><small><Image src={WOW_UI_TEXTURES.roles[role]} alt="" width={20} height={20} unoptimized />{roles[role]}</small><strong>{locale === "ru" ? theme.specNameRu : theme.specName}</strong><span>{locale === "ru" ? theme.classNameRu : theme.className}</span></span><b className={styles.presence}>{presence}%</b></a></li>)}</ul>
  </nav>;
}
