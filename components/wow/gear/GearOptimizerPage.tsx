"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  CircleHelp,
  Crown,
  Gem,
  RefreshCw,
  Search,
  Shield,
  ShoppingBag,
  Swords,
  WalletCards,
} from "lucide-react";
import styles from "./gearOptimizerPage.module.css";

type Upgrade = {
  slot: string;
  item: string;
  source: string;
  cost: number;
  gain: number;
  level: number;
  tier: "Доступно" | "Скоро" | "Долгая цель";
  color: "violet" | "gold" | "blue" | "red";
};

const upgrades: Upgrade[] = [
  { slot: "Оружие", item: "Пожиратель Пустоты", source: "Эпохальный: Королева Ансурек", cost: 3, gain: 2.4, level: 519, tier: "Доступно", color: "violet" },
  { slot: "Кольцо", item: "Перстень космической ярости", source: "Эпохальный+: Пивоварня Ксоль", cost: 2, gain: 0.7, level: 513, tier: "Доступно", color: "gold" },
  { slot: "Аксессуар", item: "Сердце ярости тирана", source: "Эпохальный: Королева Ансурек", cost: 3, gain: 0.5, level: 519, tier: "Скоро", color: "red" },
  { slot: "Нагрудник", item: "Кираса летучей силы", source: "Эпохальный: Король Галливикс", cost: 2, gain: 0.4, level: 516, tier: "Доступно", color: "gold" },
  { slot: "Поножи", item: "Наголенники бесконечной Бездны", source: "Эпохальный+: Рассвет", cost: 2, gain: 0.3, level: 513, tier: "Скоро", color: "violet" },
  { slot: "Плащ", item: "Плащ титанов-близнецов", source: "Великая вылазка", cost: 1, gain: 0.2, level: 509, tier: "Долгая цель", color: "blue" },
];

const equipment = [
  ["Голова", "Шлем бушующей бури", "506", "violet"],
  ["Шея", "Амулет земного мастерства", "506", "blue"],
  ["Плечи", "Наплечники титанического града", "506", "violet"],
  ["Спина", "Плащ титанов-близнецов", "506", "silver"],
  ["Нагрудник", "Кираса пепельных вершин", "506", "red"],
  ["Наручи", "Крепления звезды горнила", "506", "gold"],
  ["Руки", "Рукавицы неослабевающей ярости", "506", "silver"],
  ["Пояс", "Ремень железного авангарда", "506", "violet"],
  ["Ноги", "Латы расплавленного бастиона", "506", "violet"],
  ["Ступни", "Сабатоны безжалостной кары", "506", "violet"],
  ["Палец 1", "Печать бушующей бури", "506", "gold"],
  ["Палец 2", "Кольцо земной мощи", "506", "gold"],
  ["Аксессуар 1", "Фиал ожившей крови", "506", "red"],
  ["Аксессуар 2", "Ртутное яйцо Овинaкса", "506", "lime"],
] as const;

function ItemIcon({ tone = "violet", className = "" }: { tone?: string; className?: string }) {
  return <span className={`${styles.itemIcon} ${styles[`icon${tone[0].toUpperCase()}${tone.slice(1)}` as keyof typeof styles]} ${className}`} aria-hidden="true"><i /><b /></span>;
}

export function GearOptimizerPage() {
  const [budget, setBudget] = useState(3);
  const [scope, setScope] = useState<"Все" | Upgrade["tier"]>("Все");
  const [equipped, setEquipped] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [synced, setSynced] = useState(false);
  const visibleUpgrades = useMemo(
    () => upgrades.filter((item) => (scope === "Все" || item.tier === scope) && item.cost <= budget),
    [budget, scope],
  );
  const totalGain = visibleUpgrades.slice(0, 3).reduce((sum, item) => sum + item.gain, 0);

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <a className={styles.wordmark} href="/ru/wow">GILDRA</a>
      <a className={styles.gameSwitch} href="/ru/wow"><span>W</span>World of Warcraft<ChevronDown /></a>
      <nav aria-label="Основная навигация"><a href="/ru/talents/fury-warrior">Спеки</a><a href="/ru/wow/mythic">Эпох+</a><a href="/ru/wow/raids">Рейд</a><a href="/ru/wow">Гайды</a></nav>
      <label className={styles.search}><Search /><input aria-label="Поиск" placeholder="Поиск боссов, гайдов, игроков…" /></label>
      <a className={styles.profileButton} aria-label="Профиль" href="/ru/profile/arcanist"><span>АV</span></a>
    </header>

    <section className={styles.characterBar}>
      <div className={styles.avatar}><img src="/assets/classes/warrior.jpg" alt="" /><Crown /></div>
      <div className={styles.characterName}><small>Воин неистовства</small><h1>Фьюрибар <Crown /></h1><p>80 уровень <b>·</b> Орк <b>·</b> тестовый персонаж</p></div>
      <div className={styles.keyStat}><Shield /><span><b>509</b><small>Уровень предметов</small></span></div>
      <div className={styles.keyStat}><span className={styles.mythic}>M+</span><span><b>Эпох+</b><small>Сезон 1</small></span></div>
      <div className={styles.sync}><small>Тестовые данные инвентаря</small><b>{synced ? "Обновлено только что" : "17 мая 2025, 14:23"}</b><em><BadgeCheck /> {synced ? "Данные обновлены" : "Фиксированный тестовый сет"}</em></div>
      <div className={styles.characterActions}><a href="/ru/wow/rotation/fury-warrior"><Swords /> Открыть Rotation Lab</a><button type="button" onClick={() => setSynced(true)}><RefreshCw /> {synced ? "Синхронизировано" : "Обновить тестовые данные"}</button></div>
    </section>

    <div className={styles.tabs}><a href="/ru/profile/arcanist">Личный кабинет</a><a className={styles.active} href="/ru/wow/characters">Экипировка</a><a href="/ru/wow/rotation/fury-warrior">Rotation Lab</a><a href="/ru/wow">Таланты</a><a href="/ru/wow">Билды</a><a href="/ru/wow">Логи</a></div>

    <div className={styles.page} id="gear">
      <section className={styles.statStrip} aria-label="Характеристики персонажа">
        <Stat name="Критический удар" value="34,2%" bonus="+8 725" icon="✦" />
        <Stat name="Скорость" value="18,7%" bonus="+4 776" icon="◉" />
        <Stat name="Искусность" value="32,6%" bonus="+8 329" icon="♛" />
        <Stat name="Универсальность" value="8,9%" bonus="+2 279" icon="⬡" />
      </section>

      <div className={styles.contentGrid}>
        <div className={styles.leftColumn}>
          <section className={styles.equipmentPanel}>
            <div className={styles.gearColumns}>
              <div>{equipment.slice(0, 7).map(([slot, name, level, tone]) => <GearRow key={slot} slot={slot} name={name} level={level} tone={tone} />)}</div>
              <div className={styles.characterIllustration}><img src="/assets/specs/fury-warrior.jpg" alt="Воин неистовства" /><span>FURY</span></div>
              <div>{equipment.slice(7).map(([slot, name, level, tone]) => <GearRow key={slot} slot={slot} name={name} level={level} tone={tone} />)}</div>
            </div>
            <div className={styles.weapons}><Weapon name="Ашкандур, большой меч Братства" label="Основная рука" tone="gold" /><Weapon name="Гхолак, Последняя Конфлаграция" label="Левая рука" tone="violet" /></div>
          </section>

          <section className={styles.bisPanel}>
            <header className={styles.sectionHeader}><h2>Путь к лучшему снаряжению <CircleHelp /></h2><div className={styles.pathTabs}><button className={scope === "Все" ? styles.selected : ""} onClick={() => setScope("Все")} type="button">Рейд</button><button className={scope === "Скоро" ? styles.selected : ""} onClick={() => setScope("Скоро")} type="button">Эпох+</button><button className={scope === "Долгая цель" ? styles.selected : ""} onClick={() => setScope("Долгая цель")} type="button">Создание</button></div></header>
            <div className={styles.bisTable}>
              <div className={styles.tableHead}><span>Ячейка</span><span>Целевой предмет</span><span>Источник</span><span>iLvl</span><span>Улучшение</span><span>Гербы</span></div>
              {upgrades.slice(0, 5).map((item) => <div className={styles.bisRow} key={item.item}><span>{item.slot}</span><span><ItemIcon tone={item.color} /> <b>{item.item}</b></span><span>{item.source}</span><strong>{item.level}</strong><em>+{Math.round(item.gain * 5)} ↑</em><span><Crown /> {item.cost}</span></div>)}
            </div>
          </section>
        </div>

        <aside className={styles.rightColumn}>
          <section className={styles.resultPanel}>
            <header className={styles.sectionHeader}><h2>Результат оптимизации</h2></header>
            <div className={styles.scores}><Score label="Текущий рейтинг" value="92,4" /><Score label="После плана" value={(92.4 + totalGain).toFixed(1).replace(".", ",")} highlighted /><Score label="Прирост DPS" value={`+${totalGain.toFixed(1).replace(".", ",")}%`} highlighted /></div>
            <div className={styles.affordability}><WalletCards /><div><b>Бюджет гербов: {budget}</b><small>Показываем улучшения, которые можно закрыть в этом сезоне.</small></div><input type="range" min="1" max="3" value={budget} onChange={(event) => setBudget(Number(event.target.value))} aria-label="Бюджет гербов" /></div>
            <div className={styles.upgradeHeader}><h3>Лучшие улучшения</h3><span>{visibleUpgrades.length} по бюджету</span></div>
            <div className={styles.upgrades}>
              <div className={styles.tableHead}><span>#</span><span>Ячейка</span><span>Предмет</span><span>Источник</span><span>Гербы</span><span>DPS</span></div>
              {visibleUpgrades.map((item, index) => <button type="button" className={styles.upgradeRow} key={item.item} onClick={() => setEquipped(item.item === upgrades[0].item)}><span>{index + 1}</span><span>{item.slot}</span><span><ItemIcon tone={item.color} /><b>{item.item}</b><small>{item.level} ур. предмета</small></span><span>{item.source}</span><span><Crown /> {item.cost}</span><em>+{item.gain.toFixed(1)}%</em></button>)}
            </div>
          </section>

          <section className={styles.comparePanel}>
            <div className={styles.compareItem}><small>Сейчас надето</small><span><ItemIcon tone="gold" /><b>Ашкандур, большой меч Братства</b></span><p>2 948–5 479 ед. урона <em>506 ур.</em></p><p>+1 115 сила <br />+643 крит. удар</p></div>
            <strong className={styles.versus}>VS</strong>
            <div className={styles.compareItem}><small>Кандидат на улучшение</small><span><ItemIcon tone="violet" /><b>Пожиратель Пустоты</b></span><p>3 226–5 796 ед. урона <em>519 ур.</em></p><p>+1 206 сила <br /><i>+676 крит. удар</i></p></div>
            <div className={styles.compareAction}><small>Прирост DPS</small><b>+2,4%</b><span>Стоимость <Crown /> 3</span><button onClick={() => setEquipped((value) => !value)} type="button">{equipped ? "Предмет выбран" : "Выбрать и симулировать"}</button></div>
          </section>

          <div className={styles.bottomPanels}>
            <section className={styles.enhancements}><header className={styles.sectionHeader}><h2>Незакрытые усиления <CircleHelp /></h2></header><Fix icon="✧" title="Чары на нагрудник" text="Не обнаружены" action="Рекомендуется: кристаллическое сияние" /><Fix icon="◆" title="Камень в кольцо 2" text="Нет самоцвета" action="Рекомендуется: смертоносный кластер" /></section>
            <section className={styles.distribution}><header className={styles.sectionHeader}><h2>Распределение DPS <CircleHelp /></h2></header><div className={styles.bellCurve}><i /><b /><span>240k</span><span>260k</span><span>280k</span><span>300k</span><span>320k</span></div><dl><div><dt>Среднее</dt><dd>278 450</dd></div><div><dt>95% доверия</dt><dd>268 730–288 370</dd></div><div><dt>Итерации</dt><dd>25 000</dd></div></dl></section>
          </div>
          <div className={styles.footerActions}><button onClick={() => setCopied(true)} type="button"><ShoppingBag /> {copied ? "Список скопирован" : "Скопировать список покупок"}</button><button onClick={() => setSaved((value) => !value)} type="button">{saved ? "Сетап сохранён" : "Сохранить комплект"}</button></div>
        </aside>
      </div>
    </div>
  </main>;
}

function Stat({ name, value, bonus, icon }: { name: string; value: string; bonus: string; icon: string }) { return <div className={styles.stat}><span>{icon}</span><small>{name}</small><b>{value}</b><em>{bonus}</em></div>; }
function GearRow({ slot, name, level, tone }: { slot: string; name: string; level: string; tone: string }) { return <div className={styles.gearRow}><small>{slot}</small><ItemIcon tone={tone} /><span><b>{name}</b><em>{level}</em></span><i><Gem /><Gem /></i></div>; }
function Weapon({ name, label, tone }: { name: string; label: string; tone: string }) { return <div className={styles.weapon}><ItemIcon tone={tone} /><span><small>{label}</small><b>{name}</b><em>506</em></span></div>; }
function Score({ label, value, highlighted = false }: { label: string; value: string; highlighted?: boolean }) { return <div><small>{label}</small><b className={highlighted ? styles.green : ""}>{value}</b></div>; }
function Fix({ icon, title, text, action }: { icon: string; title: string; text: string; action: string }) { return <div className={styles.fix}><span>{icon}</span><div><b>⚠ {title}</b><small>{text}</small><em>{action}</em></div></div>; }
