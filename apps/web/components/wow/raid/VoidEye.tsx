"use client";

import { useEffect, useRef } from "react";
import styles from "./voidEye.module.css";
import { lessMotion } from "@/lib/client/motionPreference";

/**
 * The living void over The Voidspire's eye: a slow vortex of violet energy,
 * crackling tendrils leaving the rim and a breathing ring of light. Gildra's own
 * WebGL2 fragment shader (no library); it sits in AtlasFrame's art layer, so it
 * drifts with the painting. It only runs where it is cheap and wanted: fine
 * pointers, WebGL2, no reduced motion or data saving, eye on screen; the loop stops off
 * screen and in background tabs, 30 fps.
 */
type Props = {
  /** Natural size of the scene image. */
  imageSize: [number, number];
  /** Focus of the scene crop (AtlasFrame artPosition), 0–1. */
  focus: [number, number];
  /** Centre of the eye in the image, 0–1. */
  eye: [number, number];
  /** Radius of the eye's dark core in image pixels. */
  eyeRadius: number;
};

const VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uR;
out vec4 fragColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.07 + 13.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uR;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = uTime;

  // Vortex: the angle winds tighter towards the eye and turns slowly.
  float wind = a + 2.4 / (r + 0.6) - t * 0.35;
  vec2 q = vec2(cos(wind), sin(wind)) * (1.4 + r * 0.55);
  float swirl = fbm(q * 1.7 + vec2(0.0, -t * 0.25));
  float body = smoothstep(1.05, 1.7, r) * (1.0 - smoothstep(3.0, 8.5, r));
  float vortex = pow(swirl, 2.6) * body * 2.6;

  // Tendrils: a few thin crackling arcs leaving the rim; a slow gate lets only some burn at once.
  float n = fbm(vec2(a * 1.6 + t * 0.5, r * 0.7 - t * 1.2));
  float gate = smoothstep(0.5, 0.78, noise(vec2(a * 1.3 - t * 0.35, t * 0.15)));
  float arc = smoothstep(0.022, 0.0, abs(n - 0.52)) * gate * smoothstep(1.0, 1.35, r) * (1.0 - smoothstep(2.0, 4.8, r));
  float flicker = 0.6 + 0.4 * noise(vec2(t * 7.0, a * 3.0));

  // Rim: a breathing ring of light around the dark core.
  float rim = exp(-pow((r - 1.18) * 6.0, 2.0)) * (0.75 + 0.25 * sin(t * 1.4));

  vec3 color = vec3(0.50, 0.30, 1.00) * vortex + vec3(0.95, 0.45, 1.00) * arc * flicker * 1.2 + vec3(0.35, 0.70, 1.00) * rim * 0.9;
  // The core stays the painting's own darkness.
  color *= smoothstep(0.92, 1.05, r);
  float alpha = clamp(max(color.r, max(color.g, color.b)), 0.0, 1.0);
  fragColor = vec4(min(color, vec3(alpha)), alpha);
}`;

const FRAME_MS = 1000 / 30;
/** Canvas side in eye radii (the vortex fades out by 8.5). */
const SPAN = 19;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function VoidEye({ imageSize, focus, eye, eyeRadius }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = canvas?.parentElement;
    if (!canvas || !layer) return;
    const wanted = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !lessMotion()
      && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!wanted) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) return;
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uR = gl.getUniformLocation(program, "uR");

    let visible = true;
    let onScreen = false;
    let frame = 0;
    let radius = 0;
    const started = performance.now();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);

    // Where the eye lands in the cover-cropped scene (same maths as object-fit: cover).
    const place = () => {
      const width = layer.clientWidth;
      const height = layer.clientHeight;
      const scale = Math.max(width / imageSize[0], height / imageSize[1]);
      const left = (width - imageSize[0] * scale) * focus[0] + eye[0] * imageSize[0] * scale;
      const top = (height - imageSize[1] * scale) * focus[1] + eye[1] * imageSize[1] * scale;
      radius = eyeRadius * scale;
      const side = radius * SPAN;
      onScreen = left > 0 && left < width && top > 0 && top < height;
      canvas.style.width = `${side}px`;
      canvas.style.height = `${side}px`;
      canvas.style.left = `${left - side / 2}px`;
      canvas.style.top = `${top - side / 2}px`;
      canvas.width = Math.round(side * ratio);
      canvas.height = Math.round(side * ratio);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    // The loop runs only while the eye can be seen: off screen or in a background
    // tab it stops completely (no idle animation frames), and resumes on return.
    // Between frames it sleeps on a timer, so the page is woken 30 times a second
    // for 30 fps instead of on every display refresh.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const running = () => visible && onScreen && !document.hidden;
    const draw = (now: number) => {
      frame = 0;
      if (!running()) return;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - started) / 1000);
      gl.uniform1f(uR, radius * ratio);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Mark the canvas live once (fades it in); an attribute write per frame
      // would invalidate styles 30 times a second.
      if (!("live" in canvas.dataset)) canvas.dataset.live = "";
      timer = setTimeout(() => { timer = undefined; frame = requestAnimationFrame(draw); }, FRAME_MS - 8);
    };
    const wake = () => { if (!frame && timer === undefined && running()) frame = requestAnimationFrame(draw); };

    place();
    const resize = new ResizeObserver(() => { place(); wake(); });
    resize.observe(layer);
    const sight = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); });
    sight.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    wake();

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize.disconnect();
      sight.disconnect();
      document.removeEventListener("visibilitychange", wake);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [imageSize, focus, eye, eyeRadius]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" data-motion-layer />;
}
