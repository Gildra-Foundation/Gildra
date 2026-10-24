import { AtlasFrame, AtlasHero, AtlasSection, AtlasMetaList, AtlasPanel, AtlasNotice, AtlasAnchorNav } from "@/components/atlas";
import type { BattleNetCharacterDetails } from "@/lib/wow/battleNetCharacterDetails";
import { characterSlug } from "@/lib/wow/characterSlug";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { getMidnightTalentData } from "@/lib/talentCalculatorData";
import { CharacterRefresh } from "./CharacterRefresh";
import { CharacterTalentBuilds } from "./CharacterTalentBuilds";
import { trail } from "@/lib/routes/registry";
import styles from "./characterProfileMvp.module.css";

export async function CharacterProfileMvp({ details, owner, lang }: { details: BattleNetCharacterDetails; owner: string; lang: "ru" | "en" }) {
  const ru = lang === "ru", c = details.character;
  const spec = talentSpecThemes.find(s => s.classId === c.playableClass.id && [s.specName.toLowerCase(), s.specNameRu.toLowerCase()].includes(details.activeSpec?.toLowerCase() ?? ""));
  const data = spec ? await getMidnightTalentData(spec.slug, details.activeHeroTalentTreeId, lang).catch(() => null) : null;
  return <AtlasFrame lang={lang} scene="wow" still>
    <AtlasHero title={c.name} eyebrow={`${c.realm.name} · ${c.region.toUpperCase()}`} lede={`${c.playableRace.name} · ${c.playableClass.name}${details.activeSpec ? ` · ${details.activeSpec}` : ""}`}
      breadcrumbs={[...trail(lang, "characters"), { label: c.name }]} stats={[{ label: ru ? "уровень" : "level", value: c.level }, { label: ru ? "уровень предметов" : "item level", value: details.availableProfileFields?.includes("equipped_item_level") ? details.equippedItemLevel : "—" }]}
      actions={<CharacterRefresh lang={lang} />} />
    <p className={styles.updated}>Battle.net · {ru ? "Получено" : "Retrieved"} <time dateTime={details.updatedAt}>{new Date(details.updatedAt).toLocaleString(ru ? "ru-RU" : "en-GB", { timeZone: "UTC" })} UTC</time></p>
    <AtlasAnchorNav label={ru ? "Профиль персонажа" : "Character profile"} items={[{ href: "#equipment", label: ru ? "Экипировка" : "Equipment" }, { href: "#statistics", label: ru ? "Характеристики" : "Stats" }, { href: "#progress", label: ru ? "Прогресс" : "Progress" }, { href: "#builds", label: ru ? "Билды" : "Builds" }]} />
    {details.unavailableSections?.length ? <AtlasNotice title={ru ? "Часть данных недоступна" : "Some data is unavailable"}>{ru ? "Blizzard вернул неполный профиль. Доступные данные показаны ниже; повторите обновление для остальных разделов." : "Blizzard returned a partial profile. Available data is shown below; refresh to retry the remaining sections."}</AtlasNotice> : null}
    <AtlasSection id="equipment" title={ru ? "Экипировка" : "Equipment"}>
      {!details.equipment.length && <p>{ru ? "Blizzard не вернул экипировку." : "Blizzard did not return equipment."}</p>}
      <div className={styles.equipment}>{details.equipment.map(item => <details key={item.slotType} className={styles.item}>
        <summary>{item.iconUrl && <img src={item.iconUrl} alt="" width={40} height={40} loading="lazy" />}<span><small>{item.slot}</small><strong>{item.name}</strong></span><b>{item.itemLevel > 0 ? item.itemLevel : "—"}</b></summary>
        <div className={styles.itemDetails}><ul>{item.stats.map((stat, i) => <li key={i}>{stat}</li>)}{item.enchantments.map((enchant, i) => <li key={`enchant${i}`}>{enchant}</li>)}{item.sockets.map((socket, i) => <li key={`socket${i}`}>{socket.label}{socket.filled ? "" : ru ? " — пустое гнездо" : " — empty socket"}</li>)}</ul>{item.setName && <p>{item.setName}</p>}{item.id > 0 && <a href={`https://www.wowhead.com/item=${item.id}`} >{ru ? "Предмет на Wowhead" : "View item"}</a>}</div>
      </details>)}</div>
    </AtlasSection>
    <AtlasSection id="statistics" title={ru ? "Характеристики" : "Stats"}><AtlasPanel>{!details.stats.length && <p>{ru ? "Blizzard не вернул характеристики." : "Blizzard did not return stats."}</p>}<AtlasMetaList items={details.stats.map(stat => ({ label: stat.label, value: stat.value }))} /></AtlasPanel></AtlasSection>
    <AtlasSection id="progress" title={ru ? "Прогресс" : "Progress"}><AtlasPanel><AtlasMetaList items={[
      { label: ru ? "Рейтинг Mythic+" : "Mythic+ rating", value: details.mythicRating === undefined ? "—" : Math.round(details.mythicRating) },
      { label: ru ? "Очки достижений" : "Achievement points", value: details.availableProfileFields?.includes("achievement_points") ? details.achievementPoints : "—" },
      { label: ru ? "Последний вход" : "Last login", value: details.lastLogin ? new Date(details.lastLogin).toLocaleDateString(ru ? "ru-RU" : "en-GB", { timeZone: "UTC" }) : "—" },
    ]} /><a href={c.armoryUrl} target="_blank" rel="noreferrer">{ru ? "Профиль в оружейной Blizzard" : "Blizzard armory profile"}</a></AtlasPanel>
    {details.raidProgress?.length ? <ul className={styles.raidProgress}>{details.raidProgress.map(raid => <li key={`${raid.id}:${raid.difficulty}`}><strong>{raid.name}</strong><span>{raid.difficulty} · {raid.completed}/{raid.total}</span></li>)}</ul> : <p>{ru ? "Рейдовый прогресс недоступен в ответе Blizzard." : "Raid progress is unavailable in the Blizzard response."}</p>}
    </AtlasSection>
    <AtlasSection id="builds" title={ru ? "Таланты и билды" : "Talents and builds"}>{data && spec ? <AtlasPanel><CharacterTalentBuilds owner={owner} characterSlug={characterSlug(c)} specSlug={spec.slug} currentLoadout={details.activeTalentLoadout} data={data} lang={lang} /></AtlasPanel> : <AtlasNotice title={ru ? "Таланты временно недоступны" : "Talents are temporarily unavailable"}>{ru ? "Обновите профиль позднее. Сохранённые билды остаются в аккаунте." : "Refresh the profile later. Your saved builds remain in your account."}</AtlasNotice>}</AtlasSection>
  </AtlasFrame>;
}
