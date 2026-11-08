"use client";
import { useState } from "react";
import { AtlasTabs } from "@/components/atlas";
import type { Lang } from "@/lib/i18n-paths";
import { instanceDetailCopy } from "./instanceDetailCopy";
import styles from "./instanceDetails.module.css";
export type InstanceMap = { src: string; width: number; height: number };
export function InstanceMaps({ maps, name, lang }: { maps: InstanceMap[]; name: string; lang: Lang }) {
  const [floor, setFloor] = useState("0");
  const t = instanceDetailCopy[lang];
  if (maps.length === 1) return <a href={maps[0].src} target="_blank" rel="noreferrer">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.map} src={maps[0].src} width={maps[0].width} height={maps[0].height} alt={`${t.map}: ${name}`} />
  </a>;
  return <AtlasTabs label={t.map} value={floor} onChange={setFloor} tabs={maps.map((map, index) => ({ id: String(index), label: `${t.floor} ${index + 1}`, content: <a href={map.src} target="_blank" rel="noreferrer">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.map} src={map.src} width={map.width} height={map.height} alt={`${name}: ${t.floor} ${index + 1}`} />
  </a> }))} />;
}
