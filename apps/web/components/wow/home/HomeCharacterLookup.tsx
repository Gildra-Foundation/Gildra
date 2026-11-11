import type { ReactNode } from "react";
import { HomeLookupEnhancement } from "./HomeLookupEnhancement";
import { redirect } from "next/navigation";
import { AtlasField, AtlasInput, AtlasSelect } from "@/components/atlas";
import { materialStyles } from "@/components/wow/shared/materialAtlas";
import { HomeButton as MaterialButton, HomePlaque as MaterialPlaque } from "./HomeMaterials";
import { parsePlayerKey, playerProfilePath } from "@/lib/wow/playerProfileView";
import { wowHomeCopy } from "./wowHomeCopy";
import styles from "./wowHome.module.css";

async function lookup(formData: FormData) {
  "use server";
  const prefix = formData.get("locale") === "ru" ? "/ru" : "";
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  const key = parsePlayerKey({ region: value("region"), realm: value("realm").replace(/\s+/g, "-"), name: value("name") });
  if (!key) redirect(`${prefix || "/"}#character-lookup`);
  redirect(playerProfilePath(key.region, key.realm, key.name, prefix));
}

/** AtlasInput size preserves native server-rendered inputs, without TextInput hydration.
 * Native progressively enhanced form: Enter and no-JS submissions use the public player route. */
export function HomeCharacterLookup({ locale, recent }: { locale: "en" | "ru"; recent?: ReactNode }) {
  const t = wowHomeCopy[locale];
  return <form action={lookup} id="character-lookup" aria-labelledby="character-lookup-title">
    <HomeLookupEnhancement locale={locale} />
    <input type="hidden" name="locale" value={locale} />
    <MaterialPlaque kit="arcana" className={styles.lookup}>
      <div className={styles.lookupHead}><h2 className={materialStyles.title} id="character-lookup-title">{t.lookup.title}</h2>{recent}</div>
      <div className={styles.lookupFields}>
        <AtlasField label={t.lookup.region} htmlFor="hub-region"><AtlasSelect name="region" id="hub-region" defaultValue="eu"><option value="eu">EU</option><option value="us">US</option><option value="kr">KR</option><option value="tw">TW</option></AtlasSelect></AtlasField>
        <AtlasField label={t.lookup.realm} htmlFor="hub-realm"><AtlasInput size={20} className={styles.realmControl} name="realm" id="hub-realm" required minLength={2} maxLength={64} autoComplete="off" spellCheck={false} autoCapitalize="none" autoCorrect="off" placeholder={t.lookup.realm} /></AtlasField>
        <AtlasField label={t.lookup.name} htmlFor="hub-name"><AtlasInput size={20} name="name" id="hub-name" required minLength={2} maxLength={12} pattern="[\p{L}]{2,12}" autoComplete="off" spellCheck={false} autoCapitalize="none" autoCorrect="off" placeholder={t.lookup.name} /></AtlasField>
        <MaterialButton kit="arcana" fit="block" type="submit"><span data-lookup-label="">{t.lookup.submit}</span></MaterialButton>
      </div>
    </MaterialPlaque>
  </form>;
}
