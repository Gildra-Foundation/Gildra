"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, Grid3X3, Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  blueprintGames,
  blueprints,
  getBlueprintsForGame,
  type Blueprint,
} from "./catalog";
import styles from "./blueprints.module.css";

const zoomLevels = [75, 100, 125, 150] as const;
type ZoomLevel = (typeof zoomLevels)[number];

type BlueprintViewerProps = {
  blueprint: Blueprint;
  previousSlug: string;
  nextSlug: string;
};

export function BlueprintViewer({ blueprint, previousSlug, nextSlug }: BlueprintViewerProps) {
  const router = useRouter();
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameScreens = getBlueprintsForGame(blueprint.game);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button, a, summary")) return;
      if (event.key === "ArrowLeft") router.push(`/blueprints/${previousSlug}`);
      if (event.key === "ArrowRight") router.push(`/blueprints/${nextSlug}`);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextSlug, previousSlug, router]);

  function changeZoom(direction: -1 | 1) {
    const currentIndex = zoomLevels.indexOf(zoom);
    const nextIndex = Math.min(zoomLevels.length - 1, Math.max(0, currentIndex + direction));
    setZoom(zoomLevels[nextIndex]);
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await canvasRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  }

  return (
    <main className={styles.viewer} data-game={blueprint.game}>
      <header className={styles.viewerHeader}>
        <Link className={styles.wordmark} href="/blueprints">GILDRA</Link>
        <nav className={styles.worldNav} aria-label="Gildra worlds">
          {blueprintGames.map((game) => {
            const firstScreen = blueprints.find((item) => item.game === game.id);
            if (!firstScreen) return null;
            return (
              <Link
                key={game.id}
                href={`/blueprints/${firstScreen.slug}`}
                aria-current={blueprint.game === game.id ? "page" : undefined}
                data-game={game.id}
              >
                <span aria-hidden="true">{game.mark}</span>
                <b>{game.label}</b>
              </Link>
            );
          })}
        </nav>
        <Link className={styles.allScreensLink} href="/blueprints">
          <Grid3X3 aria-hidden="true" size={15} /> All screens
        </Link>
      </header>

      <section className={styles.viewerToolbar} aria-label="Screen navigation">
        <div className={styles.screenIdentity}>
          <span>{blueprint.section}</span>
          <h1>{blueprint.title}</h1>
          <p>{blueprint.description}</p>
        </div>
        <div className={styles.viewerActions}>
          <details className={styles.screenMenu}>
            <summary>{gameScreens.length} {blueprint.game === "platform" ? "platform" : "game"} screens</summary>
            <nav aria-label={`${blueprint.game} screens`}>
              {gameScreens.map((screen) => (
                <Link
                  href={`/blueprints/${screen.slug}`}
                  key={screen.slug}
                  aria-current={screen.slug === blueprint.slug ? "page" : undefined}
                >
                  <span>{screen.section}</span>{screen.title}
                </Link>
              ))}
            </nav>
          </details>
          <div className={styles.zoomControls} role="group" aria-label="Preview zoom">
            <button type="button" onClick={() => changeZoom(-1)} disabled={zoom === zoomLevels[0]} aria-label="Zoom out">
              <Minus aria-hidden="true" size={15} />
            </button>
            <button type="button" onClick={() => setZoom(100)} aria-label="Reset zoom">{zoom}%</button>
            <button type="button" onClick={() => changeZoom(1)} disabled={zoom === zoomLevels.at(-1)} aria-label="Zoom in">
              <Plus aria-hidden="true" size={15} />
            </button>
          </div>
          <button className={styles.iconButton} type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            <Maximize2 aria-hidden="true" size={16} />
          </button>
          <a className={styles.iconButton} href={blueprint.asset} target="_blank" rel="noreferrer" aria-label="Open original image">
            <ExternalLink aria-hidden="true" size={16} />
          </a>
        </div>
      </section>

      <div className={styles.canvas} ref={canvasRef}>
        <Link className={`${styles.edgeNav} ${styles.edgePrevious}`} href={`/blueprints/${previousSlug}`} aria-label="Previous screen">
          <ChevronLeft aria-hidden="true" />
        </Link>
        <div className={`${styles.imageStage} ${styles[`zoom${zoom}`]}`}>
          <img src={blueprint.asset} alt={`${blueprint.title} full desktop blueprint`} />
        </div>
        <Link className={`${styles.edgeNav} ${styles.edgeNext}`} href={`/blueprints/${nextSlug}`} aria-label="Next screen">
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>

      <footer className={styles.viewerFooter}>
        <Link href={`/blueprints/${previousSlug}`}><ChevronLeft aria-hidden="true" size={15} /> Previous</Link>
        <span>Use ← and → to move between screens</span>
        <Link href={`/blueprints/${nextSlug}`}>Next <ChevronRight aria-hidden="true" size={15} /></Link>
      </footer>
    </main>
  );
}
