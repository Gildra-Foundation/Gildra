"use client";

import type { CSSProperties } from "react";
import { Download } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasInput, AtlasRange, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { backgrounds, frameFormats, poses, type BackgroundDef, type FrameFormatId, type Pose } from "@/lib/wow/transmog/model";
import { transmogTextLimit } from "@/lib/wow/transmog/state";
import { transmogCopy } from "./transmogCopy";
import styles from "./transmog.module.css";

export type FrameSettings = {
  format: FrameFormatId;
  background: string;
  pose: Pose;
  brightness: number;
  contrast: number;
  shadow: number;
  title: string;
  subtitle: string;
  mark: boolean;
  scale: 1 | 2;
  type: "image/png" | "image/webp";
};

function swatchStyle(entry: BackgroundDef): CSSProperties {
  if (entry.kind === "color") return { background: entry.color };
  if (entry.kind === "gradient") return { background: `linear-gradient(${entry.angle}deg, ${entry.stops[0]}, ${entry.stops[1]})` };
  if (entry.kind === "scene") return { backgroundImage: `url(${entry.src})`, backgroundPosition: entry.position };
  return {};
}

export function TransmogFramePanel({ lang, settings, onChange, onExport, exportState, exportMessage, canExport, maxScale }: {
  lang: "ru" | "en";
  settings: FrameSettings;
  onChange: (patch: Partial<FrameSettings>) => void;
  onExport: () => void;
  exportState: "idle" | "busy";
  exportMessage: string;
  canExport: boolean;
  maxScale: 1 | 2;
}) {
  const c = transmogCopy[lang];
  const format = frameFormats.find((entry) => entry.id === settings.format) ?? frameFormats[1];
  const scale = Math.min(settings.scale, maxScale);
  const size = `${format.width * scale}×${format.height * scale}`;
  return (
    <div className={styles.pickerBody} data-transmog-frame>
      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>{c.format}</legend>
        <div className={styles.formats}>
          {frameFormats.map((entry) => (
            <button key={entry.id} type="button" className={styles.formatButton} aria-pressed={settings.format === entry.id} onClick={() => onChange({ format: entry.id })} data-format={entry.id}
              style={{ "--format-w": `${Math.round(22 * Math.min(1, entry.width / entry.height))}px`, "--format-h": `${Math.round(22 * Math.min(1, entry.height / entry.width))}px` } as CSSProperties}>
              <span className={styles.formatShape} aria-hidden="true" />
              <span>{c.formats[entry.id].label}</span>
              <span className={styles.formatNote}>{c.formats[entry.id].note}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>{c.background}</legend>
        <div className={styles.swatches}>
          {backgrounds.map((entry) => (
            <button key={entry.id} type="button" className={styles.swatch} data-kind={entry.kind} style={swatchStyle(entry)} aria-pressed={settings.background === entry.id}
              aria-label={c.backgrounds[entry.id]} title={c.backgrounds[entry.id]} onClick={() => onChange({ background: entry.id })} data-background-id={entry.id} />
          ))}
        </div>
      </fieldset>
      <label className={styles.field}>
        <span className={styles.groupLabel}>{c.pose}</span>
        <AtlasSelect value={settings.pose} onChange={(event) => onChange({ pose: event.target.value as Pose })}>
          {poses.map((pose) => <option key={pose} value={pose}>{c.poses[pose]}</option>)}
        </AtlasSelect>
      </label>
      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>{c.light}</legend>
        <label className={styles.rangeRow}><span>{c.brightness}</span>
          <AtlasRange min={0.6} max={1.5} step={0.05} value={settings.brightness} onChange={(event) => onChange({ brightness: Number(event.target.value) })} /></label>
        <label className={styles.rangeRow}><span>{c.contrast}</span>
          <AtlasRange min={0.7} max={1.4} step={0.05} value={settings.contrast} onChange={(event) => onChange({ contrast: Number(event.target.value) })} /></label>
        <label className={styles.rangeRow}><span>{c.shadow}</span>
          <AtlasRange min={0} max={1} step={0.05} value={settings.shadow} onChange={(event) => onChange({ shadow: Number(event.target.value) })} /></label>
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>{c.caption}</legend>
        <div className={styles.twoColumns}>
          <label><span className={styles.visuallyHidden}>{c.captionTitle}</span>
            <AtlasInput value={settings.title} maxLength={transmogTextLimit} placeholder={c.captionTitle} onChange={(event) => onChange({ title: event.target.value })} data-caption-title /></label>
          <label><span className={styles.visuallyHidden}>{c.captionSubtitle}</span>
            <AtlasInput value={settings.subtitle} maxLength={transmogTextLimit} placeholder={c.captionSubtitle} onChange={(event) => onChange({ subtitle: event.target.value })} /></label>
        </div>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={settings.mark} onChange={(event) => onChange({ mark: event.target.checked })} />
          <span>{c.mark}</span>
        </label>
      </fieldset>
      <div className={styles.exportRow}>
        <label><span className={styles.visuallyHidden}>{c.scale}</span>
          <AtlasSelect value={scale} onChange={(event) => onChange({ scale: Number(event.target.value) as 1 | 2 })} aria-label={c.scale}>
            <option value={1}>1×</option>
            {maxScale > 1 ? <option value={2}>2×</option> : null}
          </AtlasSelect></label>
        <label><span className={styles.visuallyHidden}>{c.fileType}</span>
          <AtlasSelect value={settings.type} onChange={(event) => onChange({ type: event.target.value as FrameSettings["type"] })} aria-label={c.fileType}>
            <option value="image/png">PNG</option>
            <option value="image/webp">WebP</option>
          </AtlasSelect></label>
        <AtlasButton variant="primary" icon={<Download aria-hidden />} onClick={onExport} disabled={!canExport || exportState === "busy"} data-transmog-export>
          {exportState === "busy" ? c.exporting : <span className={styles.exportLabel}><span>{c.download(settings.type === "image/webp" ? "WebP" : "PNG")}</span><small>{size}</small></span>}
        </AtlasButton>
      </div>
      <p className={styles.hint} aria-live="polite" data-export-message>{exportMessage || c.exportNote}</p>
    </div>
  );
}
