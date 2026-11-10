import Image from "next/image";
import { loadMythicPlusMeta } from "@/lib/games/wow/mythicPlusMeta";
import { mythicPlusMetaView, metaRoles } from "@/lib/games/wow/mythicPlusMetaView";
import { midnightSpecializations } from "@/lib/data/wow/specializations";
import { wowHomeCopy } from "./wowHomeCopy";
import styles from "./wowHome.module.css";

/** Existing cached read; unavailable data contributes no markup or placeholder. */
export async function HomeWeeklyMeta({ locale }: { locale: "en" | "ru" }) {
  const result = await loadMythicPlusMeta();
  const view = result.state === "ready" ? mythicPlusMetaView(result.meta.data) : null;
  if (!view || view.season.number !== 2) return null;
  const leaders = metaRoles.flatMap(role => {
    const spec = view.roles[role][0];
    const theme = spec && midnightSpecializations.find(theme => theme.slug === spec.key.split(":").reverse().join("-"));
    return theme ? [{ role, theme }] : [];
  });
  if (!leaders.length) return null;
  const roles = wowHomeCopy[locale].roles;
  const prefix = locale === "ru" ? "/ru" : "";
  return <nav className={styles.seasonNow} aria-labelledby="weekly-meta-title">
    <h2 id="weekly-meta-title">{wowHomeCopy[locale].weeklyMeta}</h2>
    <ul className={styles.liveLinks}>{leaders.map(({role, theme}) => <li key={role}><a href={`${prefix}/wow/mythic-plus/meta#${role}`}><Image src={theme.classIconUrl} alt="" width={28} height={28} quality={50} /><span><small>{roles[role]}</small><span>{locale === "ru" ? theme.specNameRu : theme.specName} · {locale === "ru" ? theme.classNameRu : theme.className}</span></span></a></li>)}</ul>
  </nav>;
}
