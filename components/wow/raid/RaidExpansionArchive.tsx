import { Archive, ChevronDown, FolderOpen } from "lucide-react";
import { WowTooltip } from "../shared/WowTooltip";
import styles from "./raidExpansionArchive.module.css";

type Locale = "ru" | "en";

type ArchiveRaid = { name: string; bosses: number };

type ExpansionArchive = {
  name: string;
  years: string;
  icon: string;
  tone: string;
  raids: readonly ArchiveRaid[];
};

const archiveExpansions: readonly ExpansionArchive[] = [
  {
    name: "The War Within", years: "2024–2025", tone: "#c48a55", icon: "/assets/wow/mythic/spells/void-cascade-1227247.webp",
    raids: [{ name: "Nerub-ar Palace", bosses: 8 }, { name: "Liberation of Undermine", bosses: 8 }, { name: "Manaforge Omega", bosses: 8 }],
  },
  {
    name: "Dragonflight", years: "2022–2024", tone: "#d67b4c", icon: "/assets/wow/mythic/spells/call-of-the-elements-383011.webp",
    raids: [{ name: "Vault of the Incarnates", bosses: 8 }, { name: "Aberrus, the Shadowed Crucible", bosses: 9 }, { name: "Amirdrassil, the Dream’s Hope", bosses: 9 }],
  },
  {
    name: "Shadowlands", years: "2020–2022", tone: "#8f73cf", icon: "/assets/wow/mythic/spells/dark-revelation-1298317.webp",
    raids: [{ name: "Castle Nathria", bosses: 10 }, { name: "Sanctum of Domination", bosses: 10 }, { name: "Sepulcher of the First Ones", bosses: 11 }],
  },
  {
    name: "Battle for Azeroth", years: "2018–2020", tone: "#d8a955", icon: "/assets/wow/mythic/spells/corrupted-lifeforce-1301029.webp",
    raids: [{ name: "Uldir", bosses: 8 }, { name: "Battle of Dazar’alor", bosses: 9 }, { name: "Crucible of Storms", bosses: 2 }, { name: "The Eternal Palace", bosses: 8 }, { name: "Ny’alotha, the Waking City", bosses: 12 }],
  },
  {
    name: "Legion", years: "2016–2018", tone: "#6fcf62", icon: "/assets/wow/mythic/spells/felstorm-1264110.webp",
    raids: [{ name: "The Emerald Nightmare", bosses: 7 }, { name: "Trial of Valor", bosses: 3 }, { name: "The Nighthold", bosses: 10 }, { name: "Tomb of Sargeras", bosses: 9 }, { name: "Antorus, the Burning Throne", bosses: 11 }],
  },
  {
    name: "Warlords of Draenor", years: "2014–2016", tone: "#c66c45", icon: "/assets/wow/mythic/spells/fury-of-the-war-god-1243488.webp",
    raids: [{ name: "Highmaul", bosses: 7 }, { name: "Blackrock Foundry", bosses: 10 }, { name: "Hellfire Citadel", bosses: 13 }],
  },
  {
    name: "Mists of Pandaria", years: "2012–2014", tone: "#55b694", icon: "/assets/wow/mythic/spells/healing-breeze-1297696.webp",
    raids: [{ name: "Mogu’shan Vaults", bosses: 6 }, { name: "Heart of Fear", bosses: 6 }, { name: "Terrace of Endless Spring", bosses: 4 }, { name: "Throne of Thunder", bosses: 13 }, { name: "Siege of Orgrimmar", bosses: 14 }],
  },
  {
    name: "Cataclysm", years: "2010–2012", tone: "#db6848", icon: "/assets/wow/mythic/spells/flame-shock-1307165.webp",
    raids: [{ name: "Blackwing Descent", bosses: 6 }, { name: "The Bastion of Twilight", bosses: 4 }, { name: "Throne of the Four Winds", bosses: 2 }, { name: "Baradin Hold", bosses: 3 }, { name: "Firelands", bosses: 7 }, { name: "Dragon Soul", bosses: 8 }],
  },
  {
    name: "Wrath of the Lich King", years: "2008–2010", tone: "#79b9dc", icon: "/assets/wow/mythic/spells/cryo-surge-1239871.webp",
    raids: [{ name: "Naxxramas", bosses: 15 }, { name: "The Obsidian Sanctum", bosses: 1 }, { name: "The Eye of Eternity", bosses: 1 }, { name: "Vault of Archavon", bosses: 4 }, { name: "Ulduar", bosses: 14 }, { name: "Trial of the Crusader", bosses: 5 }, { name: "Onyxia’s Lair", bosses: 1 }, { name: "Icecrown Citadel", bosses: 12 }, { name: "The Ruby Sanctum", bosses: 1 }],
  },
  {
    name: "The Burning Crusade", years: "2007–2008", tone: "#65c86f", icon: "/assets/wow/mythic/spells/fel-infused-freight-1219631.webp",
    raids: [{ name: "Karazhan", bosses: 11 }, { name: "Gruul’s Lair", bosses: 2 }, { name: "Magtheridon’s Lair", bosses: 1 }, { name: "Serpentshrine Cavern", bosses: 6 }, { name: "Tempest Keep", bosses: 4 }, { name: "The Battle for Mount Hyjal", bosses: 5 }, { name: "Black Temple", bosses: 9 }, { name: "Zul’Aman", bosses: 6 }, { name: "Sunwell Plateau", bosses: 6 }],
  },
  {
    name: "Classic", years: "2004–2007", tone: "#caa05b", icon: "/assets/wow/mythic/spells/boneslicer-1301509.webp",
    raids: [{ name: "Molten Core", bosses: 10 }, { name: "Onyxia’s Lair", bosses: 1 }, { name: "Blackwing Lair", bosses: 8 }, { name: "Zul’Gurub", bosses: 10 }, { name: "Ruins of Ahn’Qiraj", bosses: 6 }, { name: "Temple of Ahn’Qiraj", bosses: 9 }, { name: "Naxxramas", bosses: 15 }],
  },
];

export const archiveRaidCount = archiveExpansions.reduce((total, expansion) => total + expansion.raids.length, 0);

export function RaidExpansionArchive({ locale }: { locale: Locale }) {
  const t = <T,>(ru: T, en: T) => locale === "ru" ? ru : en;

  return (
    <section className={styles.archive} aria-labelledby="raid-archive-title">
      <header className={styles.header}>
        <span><Archive aria-hidden="true" /></span>
        <div><p>{t("Старые дополнения", "Previous expansions")}</p><h2 id="raid-archive-title">{t("Архив рейдов", "Raid archive")}</h2></div>
        <small>{archiveRaidCount} {t("рейдов · 11 дополнений", "raids · 11 expansions")}</small>
      </header>
      <div className={styles.folders}>
        {archiveExpansions.map((expansion, index) => {
          const bossCount = expansion.raids.reduce((total, raid) => total + raid.bosses, 0);
          return (
            <details key={expansion.name} className={styles.folder} style={{ "--folder-tone": expansion.tone } as React.CSSProperties} open={index === 0}>
              <summary>
                <span className={styles.folderIcon}><FolderOpen aria-hidden="true" /></span>
                <span><small>{expansion.years}</small><b>{expansion.name}</b></span>
                <i>{expansion.raids.length} {t("рейда", "raids")} · {bossCount} {t("боссов", "bosses")}</i>
                <ChevronDown aria-hidden="true" />
              </summary>
              <ul>
                {expansion.raids.map((raid) => (
                  <li key={raid.name}>
                    <WowTooltip icon={expansion.icon} title={raid.name} eyebrow={t("Архивный рейд", "Legacy raid")} description={t(`Рейд дополнения ${expansion.name}. Доступен как старый контент; актуальная экипировка Season 2 здесь не выпадает.`, `${expansion.name} raid. Available as legacy content; it does not drop current Season 2 gear.`)} meta={[`${raid.bosses} ${t("боссов", "bosses")}`, expansion.years]} tone={expansion.tone} size="sm" />
                    <span><b>{raid.name}</b><small>{raid.bosses} {t("боссов", "bosses")}</small></span>
                    <em>{t("Архив", "Legacy")}</em>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}
