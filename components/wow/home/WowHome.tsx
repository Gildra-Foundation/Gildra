import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Crosshair,
  Gem,
  MapPinned,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import type { CSSProperties } from "react";
import { t as tr, type Lang } from "@/lib/i18n";
import { CharacterBookBackdrop } from "@/components/wow/audit/CharacterBookBackdrop";
import { PhysicalBookFrame, physicalBookMaterials } from "@/components/wow/audit/PhysicalBookFrame";
import typography from "@/components/wow/audit/grimoireTypography.module.css";
import styles from "./wowHome.module.css";

type Copy = {
  eyebrow: string;
  title: string;
  description: string;
  character: string;
  talents: string;
  allTools: string;
  navigation: string;
  workspace: string;
  workspaceText: string;
  openCharacter: string;
  itemLevel: string;
  rating: string;
  favoriteBuilds: string;
  tools: string;
  ready: string;
  seeAll: string;
  weekly: string;
  weeklyText: string;
  learnMore: string;
  heroPath: string;
  heroPathText: string;
  start: string;
  prepare: string;
  conquer: string;
};

const copy: Record<Lang, Copy> = {
  ru: {
    eyebrow: "World of Warcraft · Midnight",
    title: "Ваш командный центр в Азероте",
    description: "Соберите персонажа, продумайте таланты и подготовьте маршрут — всё необходимое для следующего ключа в одном месте.",
    character: "Открыть персонажа",
    talents: "Калькулятор талантов",
    allTools: "Все инструменты",
    navigation: "Быстрый доступ",
    workspace: "Ваш персонаж",
    workspaceText: "Ваши персонажи Battle.net",
    openCharacter: "В личный кабинет",
    itemLevel: "Уровень предметов",
    rating: "Рейтинг эпох+",
    favoriteBuilds: "Избранные билды",
    tools: "Инструменты для следующего захода",
    ready: "Открыть",
    seeAll: "Смотреть все специализации",
    weekly: "На этой неделе",
    weeklyText: "Спланируйте маршрут и подготовьте группу до начала ключа.",
    learnMore: "Открыть маршруты",
    heroPath: "Путь героя",
    heroPathText: "Три шага от листа персонажа до готового подземелья.",
    start: "Персонаж",
    prepare: "Билд",
    conquer: "Маршрут",
  },
  en: {
    eyebrow: "World of Warcraft · Midnight",
    title: "Your command center in Azeroth",
    description: "Shape your character, plan talents, and prepare a route — everything for the next key in one focused workspace.",
    character: "Open character",
    talents: "Talent calculator",
    allTools: "All tools",
    navigation: "Quick access",
    workspace: "Your character",
    workspaceText: "Your Battle.net characters",
    openCharacter: "Open profile",
    itemLevel: "Item level",
    rating: "Mythic+ rating",
    favoriteBuilds: "Featured builds",
    tools: "Tools for your next run",
    ready: "Open",
    seeAll: "See all specializations",
    weekly: "This week",
    weeklyText: "Plan the route and prepare your party before the key begins.",
    learnMore: "Open routes",
    heroPath: "Hero path",
    heroPathText: "Three steps from your character sheet to a ready dungeon run.",
    start: "Character",
    prepare: "Build",
    conquer: "Route",
  },
};

const buildCards = [
  { name: "Неистовство", className: "Воин", image: "/assets/specs/fury-warrior.jpg", href: "/talents/fury-warrior", accent: "#e54827" },
  { name: "Воздаяние", className: "Паладин", image: "/assets/specs/ret-paladin.jpg", href: "/talents/retribution-paladin", accent: "#ffe06b" },
  { name: "Тайная магия", className: "Маг", image: "/assets/specs/arcane-mage.jpg", href: "/talents/arcane-mage", accent: "#b279ff" },
];

export function WowHome({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const href = (path: string) => `${lang === "ru" ? "/ru" : ""}${path}`;
  const tools = [
    { icon: Users, title: lang === "ru" ? "Персонажи" : "Characters", text: lang === "ru" ? "Ростер, экипировка и показатели" : "Roster, gear, and performance", href: "/wow/characters", accent: "#e5b768" },
    { icon: MapPinned, title: "Mythic+", text: lang === "ru" ? "Маршруты, таймер и тактика" : "Routes, timer, and tactics", href: "/wow/mythic-plus", accent: "#55b9ff" },
    { icon: Gem, title: lang === "ru" ? "Экипировка" : "Gear", text: lang === "ru" ? "План улучшений персонажа" : "Character upgrade plan", href: "/wow/gear", accent: "#c89b55" },
  ];

  return (
    <div className={`${styles.page} ${typography.typography}`} data-gildra-grimoire style={physicalBookMaterials as CSSProperties}>
      <div className={styles.backdrop} aria-hidden="true"><CharacterBookBackdrop /></div>
      <main className={styles.main}>
        <PhysicalBookFrame />
        <nav className={styles.sectionNav} aria-label={t.navigation}>
          <Link href={href("/wow")}><Swords />World of Warcraft</Link>
          <Link href={href("/wow/characters")}>{lang === "ru" ? "Персонажи" : "Characters"}</Link>
          <Link href={href("/wow/mythic-plus")}>Mythic+</Link>
          <span className={styles.localeSwitch} role="group" aria-label={lang === "ru" ? "Язык страницы" : "Page language"}>
            <Link href="/wow" lang="en" aria-current={lang === "en" ? "page" : undefined}>EN</Link>
            <Link href="/ru/wow" lang="ru" aria-current={lang === "ru" ? "page" : undefined}>RU</Link>
          </span>
        </nav>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span /><span>{t.eyebrow}</span></p>
            <h1>{t.title}</h1>
            <p className={styles.description}>{t.description}</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryAction} href={href("/wow/characters")}>{t.character}<ArrowRight /></Link>
              <Link className={styles.secondaryAction} href={href("/talents/fury-warrior")}><Sparkles />{t.talents}</Link>
            </div>
          </div>
          <div className={styles.heroScene} aria-hidden="true">
            <div className={styles.runes}><i /><i /><i /></div>
            <Image src="/assets/characters/furybar-horde-hero-v1-optimized.webp" alt="" width={2171} height={724} sizes="(max-width: 720px) 430px, (max-width: 1050px) 50vw, 570px" priority />
            <div className={styles.heroBadge}><Shield /><span><small>{lang === "ru" ? "Активный герой" : "Active hero"}</small><b>FURYBAR</b></span></div>
          </div>
        </section>

        <section className={styles.quickSection} aria-labelledby="quick-title">
          <div className={styles.sectionHeading}><div><p>{t.navigation}</p><h2 id="quick-title">{t.tools}</h2></div></div>
          <div className={styles.toolGrid}>
            {tools.map(({ icon: Icon, title, text, href: toolHref, accent }) => <Link href={href(toolHref)} className={styles.toolCard} style={{ "--tool-accent": accent } as React.CSSProperties} key={toolHref}>
              <span className={styles.toolIcon}><Icon /></span><span><strong>{title}</strong><small>{text}</small></span><ChevronRight />
            </Link>)}
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section className={`${styles.panel} ${styles.characterPanel}`} aria-labelledby="character-title">
            <header className={styles.panelHeading}><div><p>{t.workspace}</p><h2 id="character-title">{t.workspaceText}</h2></div><Link href={href("/wow/characters")}>{t.openCharacter}<ArrowRight /></Link></header>
            <div className={styles.characterContent}>
              <img
                src="/assets/characters/furybar-dual-axes-v4-768.webp"
                srcSet="/assets/characters/furybar-dual-axes-v4-384.webp 384w, /assets/characters/furybar-dual-axes-v4-768.webp 768w, /assets/characters/furybar-dual-axes-v4-1122.webp 1122w"
                sizes="(max-width: 720px) 40vw, (max-width: 1050px) 47vw, 520px"
                alt=""
                width={1122}
                height={1402}
                loading="lazy"
                decoding="async"
              />
              <div className={styles.characterStats}>
                <div><small>{lang === "ru" ? "Источник данных" : "Data source"}</small><strong>Battle.net</strong><span>LIVE <em>{lang === "ru" ? "после входа" : "after sign-in"}</em></span></div>
                <div><small>{lang === "ru" ? "Рабочая область" : "Workspace"}</small><strong>{lang === "ru" ? "Все инструменты" : "All tools"}</strong><span className={styles.positive}>{lang === "ru" ? "На реальном персонаже" : "On your live character"}</span></div>
                <Link href={href("/wow/characters")}><Gem />{lang === "ru" ? "Проверить экипировку" : "Inspect gear"}<ArrowRight /></Link>
              </div>
            </div>
          </section>

        </div>

        <section className={styles.buildSection} aria-labelledby="build-title">
          <div className={styles.sectionHeading}><div><p>{t.favoriteBuilds}</p><h2 id="build-title">{lang === "ru" ? "Начните с проверенной специализации" : "Start with a tested specialization"}</h2></div></div>
          <div className={styles.buildGrid}>
            {buildCards.map((build) => <Link className={styles.buildCard} href={href(build.href)} key={build.href} style={{ "--build-accent": build.accent } as React.CSSProperties}>
              <img src={build.image} alt="" /><span><small>{build.className}</small><strong>{build.name}</strong><em>{t.ready}<ArrowRight /></em></span>
            </Link>)}
          </div>
        </section>

        <section className={styles.pathSection} aria-labelledby="path-title">
          <div><p>{t.heroPath}</p><h2 id="path-title">{t.heroPathText}</h2></div>
          <ol>
            <li><span>01</span><Link href={href("/wow/characters")}><Users /><b>{t.start}</b><small>{lang === "ru" ? "Проверьте персонажа" : "Inspect your character"}</small></Link></li>
            <li><span>02</span><Link href={href("/talents/fury-warrior")}><Crosshair /><b>{t.prepare}</b><small>{lang === "ru" ? "Соберите таланты" : "Shape your talents"}</small></Link></li>
            <li><span>03</span><Link href={href("/wow/mythic-plus")}><Trophy /><b>{t.conquer}</b><small>{lang === "ru" ? "Пройдите ключ вовремя" : "Time the key"}</small></Link></li>
          </ol>
        </section>

        <nav className={styles.utilityNav} aria-label={t.allTools}>
          {/* /patches and /compare run on fixtures and are hidden for the WoW-only MVP (lib/mvp.ts): link real pages instead. */}
          <Link href={href("/tier-lists")}><BookOpen />{tr(lang)("Tier Lists")}</Link><Link href={href("/database")}><Search />{tr(lang)("Database")}</Link>
        </nav>
      </main>
    </div>
  );
}
