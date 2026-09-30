"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyWaypointButton({ waypoint, locale = "ru" }: { waypoint: string; locale?: "ru" | "en" }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const labels = locale === "ru"
    ? { label: "Скопировать координаты", copied: "Скопировано", idle: "Копировать", error: "Не удалось скопировать" }
    : { label: "Copy coordinates", copied: "Copied", idle: "Copy", error: "Copy failed" };
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(waypoint);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = waypoint;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy command was rejected");
      }
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    window.setTimeout(() => setStatus("idle"), 1800);
  }
  const message = status === "copied" ? labels.copied : status === "error" ? labels.error : labels.idle;
  return <button type="button" className="wow-waypoint" onClick={copy} aria-label={labels.label}><code>{waypoint}</code><span aria-live="polite">{status === "copied" ? <Check /> : <Copy />}{message}</span></button>;
}
