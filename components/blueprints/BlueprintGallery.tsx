"use client";

import Link from "next/link";
import { ArrowUpRight, Search, Sparkles } from "lucide-react";
import { memo, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  blueprintGames,
  blueprints,
  type BlueprintGame,
} from "./catalog";
import styles from "./blueprints.module.css";

const searchableBlueprints = blueprints.map((blueprint) => ({
  blueprint,
  searchText: `${blueprint.title} ${blueprint.section} ${blueprint.description}`.toLocaleLowerCase(),
}));

const SearchField = memo(function SearchField({ value, onQueryChange }: {
  value: string;
  onQueryChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timeout = window.setTimeout(() => onQueryChange(draft), 140);
    return () => window.clearTimeout(timeout);
  }, [draft, onQueryChange, value]);

  return (
    <input
      type="search"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="Search screens…"
    />
  );
});

type GameFilter = BlueprintGame | "all";
type BlueprintGalleryProps = {
  imagePropsBySlug: Record<string, ComponentProps<"img">>;
};

export function BlueprintGallery({ imagePropsBySlug }: BlueprintGalleryProps) {
  const [game, setGame] = useState<GameFilter>("wow");
  const [query, setQuery] = useState("");
  const firstWarcraftScreen = blueprints.find((item) => item.game === "wow") ?? blueprints[0];
  const warcraftScreens = blueprints.filter((item) => item.game === "wow").length;

  const visibleBlueprints = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return searchableBlueprints.filter(({ blueprint, searchText }) => {
      const matchesGame = game === "all" || blueprint.game === game;
      return matchesGame && (!normalizedQuery || searchText.includes(normalizedQuery));
    }).map(({ blueprint }) => blueprint);
  }, [game, query]);

  return (
    <main className={styles.gallery}>
      <header className={styles.galleryHeader}>
        <Link className={styles.wordmark} href="/blueprints" aria-label="Gildra blueprint gallery">
          GILDRA
        </Link>
        <div className={styles.galleryHeaderCopy}>
          <span className={styles.eyebrow}>Tactical interface archive</span>
          <span>Warcraft blueprints</span>
        </div>
        <Link className={styles.headerAction} href={"/blueprints/" + firstWarcraftScreen.slug}>
          Open Warcraft screen <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </header>

      <section className={styles.galleryHero} aria-labelledby="blueprint-title">
        <div>
          <p className={styles.kicker}><Sparkles aria-hidden="true" size={15} /> Azeroth interface codex</p>
          <h1 id="blueprint-title">Every battle, one living system.</h1>
          <p>
            Explore Gildra&apos;s Warcraft product direction: specializations, builds,
            encounters and party tactics connected by one interface language.
          </p>
        </div>
        <dl className={styles.galleryStats}>
          <div><dt>Warcraft screens</dt><dd>{warcraftScreens}</dd></div>
          <div><dt>Specializations</dt><dd>{blueprints.filter((item) => item.section === "Specializations" || item.section === "Talents").length}</dd></div>
          <div><dt>Full archive</dt><dd>{blueprints.length}</dd></div>
        </dl>
      </section>

      <section className={styles.galleryControls} aria-label="Filter blueprints">
        <div className={styles.gameFilters} role="group" aria-label="Game filter">
          <button
            type="button"
            className={game === "all" ? styles.activeFilter : undefined}
            onClick={() => setGame("all")}
            aria-pressed={game === "all"}
          >
            All screens
          </button>
          {blueprintGames.map((item) => (
            <button
              key={item.id}
              type="button"
              className={game === item.id ? styles.activeFilter : undefined}
              data-game={item.id}
              onClick={() => setGame(item.id)}
              aria-pressed={game === item.id}
            >
              <span aria-hidden="true">{item.mark}</span>{item.label}
            </button>
          ))}
        </div>
        <label className={styles.searchField}>
          <Search aria-hidden="true" size={16} />
          <span className={styles.srOnly}>Search screens</span>
          <SearchField value={query} onQueryChange={setQuery} />
        </label>
      </section>

      <section aria-live="polite" aria-label="Blueprint results">
        <div className={styles.resultMeta}>
          <span>{visibleBlueprints.length} screens</span>
          <span>{game === "all" ? "All Gildra worlds" : blueprintGames.find((item) => item.id === game)?.label}</span>
        </div>
        {visibleBlueprints.length ? (
          <div className={styles.cardGrid}>
            {visibleBlueprints.map((blueprint, index) => (
              <Link
                className={styles.blueprintCard}
                href={`/blueprints/${blueprint.slug}`}
                key={blueprint.slug}
                data-game={blueprint.game}
              >
                <div className={styles.cardMedia}>
                  <img
                    {...imagePropsBySlug[blueprint.slug]}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index === 0 ? "high" : "low"}
                  />
                  <span className={styles.openBadge}>Open screen <ArrowUpRight aria-hidden="true" size={14} /></span>
                </div>
                <div className={styles.cardBody}>
                  <span className={styles.cardSection}>{blueprint.section}</span>
                  <h2>{blueprint.title}</h2>
                  <p>{blueprint.description}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <h2>No screens found</h2>
            <p>Try another game or a shorter search.</p>
            <button type="button" onClick={() => { setGame("all"); setQuery(""); }}>
              Reset filters
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
