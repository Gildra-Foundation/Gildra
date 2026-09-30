"use client";

import { useEffect, useRef } from "react";
import type { SignatureParticles } from "./signatures";

type Particle = { x: number; y: number; size: number; phase: number };

const hash = (value: string) => [...value].reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 2166136261);
const seeded = (seed: number) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 1 | seed)), ((seed + Math.imul(seed ^ (seed >>> 7), 61 | seed)) ^ seed) >>> 0) / 4294967296;

function drawParticle(context: CanvasRenderingContext2D, particle: Particle, type: SignatureParticles, color: string, hot: string, time: number) {
  const wave = Math.sin(time * .001 + particle.phase) * 8;
  const x = particle.x + wave;
  const y = particle.y;
  const alpha = .16 + (Math.sin(time * .0016 + particle.phase) + 1) * .11;
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.fillStyle = type === "light" || type === "stars" ? hot : color;
  context.lineWidth = Math.max(1, particle.size * .22);
  context.translate(x, y);
  if (type === "blood") {
    context.beginPath(); context.moveTo(0, -particle.size); context.bezierCurveTo(particle.size, 0, particle.size * .7, particle.size, 0, particle.size); context.bezierCurveTo(-particle.size * .7, particle.size, -particle.size, 0, 0, -particle.size); context.fill();
  } else if (type === "snow") {
    for (let angle = 0; angle < 3; angle += 1) { context.rotate(Math.PI / 3); context.beginPath(); context.moveTo(-particle.size, 0); context.lineTo(particle.size, 0); context.stroke(); }
  } else if (["plague", "poison", "brew"].includes(type)) {
    context.beginPath(); context.arc(0, 0, particle.size, 0, Math.PI * 2); context.stroke();
  } else if (["light", "stars"].includes(type)) {
    context.beginPath(); context.moveTo(-particle.size * 1.6, 0); context.lineTo(particle.size * 1.6, 0); context.moveTo(0, -particle.size * 1.6); context.lineTo(0, particle.size * 1.6); context.stroke();
  } else if (["leaves", "feathers"].includes(type)) {
    context.rotate(time * .0003 + particle.phase); context.beginPath(); context.ellipse(0, 0, particle.size * 1.5, particle.size * .55, 0, 0, Math.PI * 2); context.fill();
  } else if (["embers", "fel", "storm", "steel"].includes(type)) {
    context.rotate(-.7); context.fillRect(-particle.size * 1.6, -.6, particle.size * 3.2, 1.2);
  } else if (["mist", "water", "shadow"].includes(type)) {
    context.beginPath(); context.moveTo(-particle.size * 2, 0); context.bezierCurveTo(-particle.size, -3, particle.size, 3, particle.size * 2, 0); context.stroke();
  } else if (["runes", "void"].includes(type)) {
    context.rotate(time * .0004 + particle.phase); context.strokeRect(-particle.size, -particle.size, particle.size * 2, particle.size * 2);
  } else if (type === "coins") {
    context.beginPath(); context.ellipse(0, 0, particle.size, particle.size * .35, time * .002 + particle.phase, 0, Math.PI * 2); context.stroke();
  } else {
    context.beginPath(); context.arc(0, 0, particle.size * .55, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

export function SpecParticleCanvas({ specSlug, type }: { specSlug: string; type: SignatureParticles }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.renderer = "static-canvas";
    let paintedWidth = -1;
    let paintedHeight = -1;
    let context: CanvasRenderingContext2D | null = null;
    let color = "";
    let hot = "";
    let cancelScheduledPaint: (() => void) | null = null;
    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) return;
      const dpr = 1;
      const pixelWidth = Math.max(1, Math.floor(width * dpr));
      const pixelHeight = Math.max(1, Math.floor(height * dpr));
      if (pixelWidth === paintedWidth && pixelHeight === paintedHeight) return;
      if (!context) {
        const rootStyle = getComputedStyle(canvas.closest<HTMLElement>(".talent-calculator") ?? canvas);
        color = `rgb(${rootStyle.getPropertyValue("--tc-accent-rgb").trim() || "220,90,45"})`;
        hot = `rgb(${rootStyle.getPropertyValue("--tc-hot-rgb").trim() || "255,190,110"})`;
        context = canvas.getContext("2d", { alpha: true });
        if (!context) return;
      }
      paintedWidth = pixelWidth;
      paintedHeight = pixelHeight;
      canvas.width = pixelWidth; canvas.height = pixelHeight;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const random = seeded(hash(specSlug));
      const particles: Particle[] = Array.from({ length: window.innerWidth < 640 ? 4 : 7 }, () => ({
        x: random() * width,
        y: random() * height,
        size: 1.7 + random() * 3.6,
        phase: random() * Math.PI * 2,
      }));
      for (const particle of particles) {
        drawParticle(context, particle, type, color, hot, 800);
      }
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const schedulePaint = () => {
      cancelScheduledPaint?.();
      if (idleWindow.requestIdleCallback) {
        const handle = idleWindow.requestIdleCallback(() => {
          cancelScheduledPaint = null;
          paint();
        }, { timeout: 1200 });
        cancelScheduledPaint = () => idleWindow.cancelIdleCallback?.(handle);
      } else {
        const handle = window.setTimeout(() => {
          cancelScheduledPaint = null;
          paint();
        }, 250);
        cancelScheduledPaint = () => window.clearTimeout(handle);
      }
    };
    const observer = new ResizeObserver(schedulePaint);
    observer.observe(canvas);
    schedulePaint();
    return () => {
      observer.disconnect();
      cancelScheduledPaint?.();
    };
  }, [specSlug, type]);
  return <canvas key={specSlug} ref={canvasRef} data-spec-particle-canvas={type} aria-hidden="true" />;
}
