import Link from "next/link";
import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT as KIT } from "@/lib/wow/charactersKit";
import { p, type Lang } from "@/lib/i18n-paths";
import { mistsClasses } from "@/lib/wow/mists/data";
import { MistsRole } from "./MistsParts";
import { mistsCopy } from "./mistsCopy";
import styles from "./mists.module.css";

/** The Mists of Pandaria Classic hub: every class with its specializations and a way into its talents. */
export function MistsHome({ lang }: { lang: Lang }) {
  const t = mistsCopy[lang];
  return <AtlasFrame lang={lang} scene="classes">
    <AtlasHero title={t.title} />
    <AtlasSection>
      <ul className={styles.roster}>
        {mistsClasses.map(cls => <MaterialPlaque as="li" kit={KIT} key={cls.slug} id={cls.slug} className={styles.classCard}
          style={{ "--class-color": cls.color } as CSSProperties} aria-labelledby={`${cls.slug}-name`}>
          <div className={styles.classHead}>
            <span className={`${materialStyles.iconFrame} ${styles.classIcon}`} style={materialIconFrameStyle(KIT, 48)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Blizzard's icon server */}
              <img src={cls.icon} alt="" width={48} height={48} loading="lazy" decoding="async" />
            </span>
            <h2 id={`${cls.slug}-name`} className={styles.className}>{cls.name[lang]}</h2>
            <Link className={styles.talentsLink} href={p(lang, `/wow/mists/talents/${cls.slug}`)} prefetch={false}>
              <Sparkles aria-hidden="true" />{t.talents}
            </Link>
          </div>
          <ul className={styles.specRows} aria-label={t.specsOf(cls.name[lang])}>
            {cls.specs.map(spec => <li key={spec.slug} className={styles.specRow}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Blizzard's icon server */}
              <img className={styles.specIcon} src={spec.icon} alt="" width={36} height={36} loading="lazy" decoding="async" />
              <span className={styles.specMain}>
                <span className={styles.specLine}>
                  <Link className={styles.specName} href={p(lang, `/wow/mists/talents/${cls.slug}?spec=${spec.slug}`)} prefetch={false}>{spec.name[lang]}</Link>
                  <MistsRole role={spec.role} label={t.roles[spec.role]} />
                </span>
                <span className={styles.specText}>{spec.description[lang]}</span>
              </span>
            </li>)}
          </ul>
        </MaterialPlaque>)}
      </ul>
    </AtlasSection>
  </AtlasFrame>;
}
