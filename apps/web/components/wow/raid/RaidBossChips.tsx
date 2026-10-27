import Image from "next/image";
import { RaidLinkButton } from "./raidMaterial";
import type { RaidHubSlug } from "./raidHubData";
import styles from "./raidPage.module.css";

export type RaidBossChip = { href: string; name: string; artwork?: string; current?: boolean };

/** The raid's encounters as painted boss chips (design.md §4.6): portrait or order number, then the name. */
export function RaidBossChips({ raid, bosses, label }: { raid: RaidHubSlug; bosses: RaidBossChip[]; label: string }) {
  return <ol className={styles.bossChips} aria-label={label} data-raid-boss-chips={raid}>
    {bosses.map((boss, index) => <li key={boss.href}>
      <RaidLinkButton raid={raid} shape="row" fit="block" href={boss.href} className={styles.bossChip}
        icon={boss.artwork
          ? <Image src={boss.artwork} alt="" width={32} height={32} className={styles.bossPortrait} />
          : <span className={styles.bossOrder} aria-hidden="true">{index + 1}</span>}>
        {boss.name}
      </RaidLinkButton>
    </li>)}
  </ol>;
}
