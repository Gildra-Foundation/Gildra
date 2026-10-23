"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { Card } from "../valyro-ui/data-display/Card";

export type MediaTile = {
  id: string;
  href: string;
  filename: string;
  alt: string;
  meta: string;
  /** Path under /api/media/file/ for Next's optimizer; null for non-images. */
  file: string | null;
  mimeType: string;
};

/** The media library as Valyro cards with fixed 16:10 previews (no layout shift while images load). */
export function MediaGrid({ tiles, label, noAlt }: { tiles: MediaTile[]; label: string; noAlt: string }) {
  return (
    <ul className="gd-media" aria-label={label}>
      {tiles.map((tile) => (
        <li key={tile.id}>
          <Card asChild variant="interactive" padding="none" className="gd-media__card">
            <Link href={tile.href} prefetch={false}>
              <span className="gd-media__thumb">
                {tile.file ? (
                  <Image src={tile.file} alt="" fill sizes="(max-width: 480px) 50vw, 240px" unoptimized={tile.mimeType === "image/gif"} />
                ) : (
                  <span className="gd-media__type">{tile.mimeType || "file"}</span>
                )}
              </span>
              <span className="gd-media__meta">
                <strong>{tile.filename}</strong>
                <span className={tile.alt ? undefined : "gd-media__missing"}>{tile.alt || noAlt}</span>
                {tile.meta ? <small>{tile.meta}</small> : null}
              </span>
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  );
}
