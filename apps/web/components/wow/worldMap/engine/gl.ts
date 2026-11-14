/**
 * The world map's WebGL programs. The main one draws a textured quad with the
 * living-world effects folded into the fragment shader: the map's own-area
 * mask (or a feathered edge) blending it into the maps around it, a round
 * portal mask for worlds opening from the Cosmic map, drifting cloud shadows,
 * a shimmer on water-coloured pixels, light/dim and desaturation. The blur
 * program softens a low-resolution layer (depth of field for maps shown far
 * above their native size): layers are drawn into an offscreen target, blurred
 * in two passes and laid back over the screen.
 */
const VERTEX = `
attribute vec2 a_corner;
uniform vec2 u_view;
uniform vec4 u_rect;
uniform vec4 u_uv;
varying vec2 v_uv;
varying vec2 v_p;
void main() {
  vec2 p = mix(u_rect.xy, u_rect.zw, a_corner);
  v_uv = mix(u_uv.xy, u_uv.zw, a_corner);
  v_p = p;
  vec2 clip = p / u_view * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform float u_maskOn;
uniform vec4 u_maskRect;
uniform float u_alpha;
uniform vec4 u_frame;
uniform vec2 u_feather;
uniform vec3 u_portal;
uniform float u_time;
uniform float u_cloud;
uniform vec3 u_cloudMap;
uniform float u_water;
uniform vec3 u_waterMap;
uniform float u_light;
uniform float u_desat;
uniform vec4 u_paper;
uniform vec4 u_art;
uniform float u_corner;
uniform vec4 u_holes[HOLES];
uniform float u_holeCount;
uniform vec2 u_screen;
uniform float u_vignette;
uniform float u_land;
uniform vec3 u_ink;
uniform float u_fx;
uniform vec4 u_fxColor;
uniform vec4 u_excl;
uniform vec3 u_exclEdge;
uniform float u_sharp;
uniform vec2 u_texel;
uniform vec3 u_gradeMul;
uniform vec3 u_gradeAdd;
uniform float u_holeFill;
varying vec2 v_uv;
varying vec2 v_p;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Light effects drawn on a quad of their own (no texture): a capital's slow warm pulse, a portal's swirl.
vec4 effect() {
  vec2 q = v_uv * 2.0 - 1.0;
  float r = length(q);
  if (u_fx < 1.5) {
    float pulse = 0.72 + 0.28 * sin(u_time * 1.6 + u_fxColor.a * 6.283);
    float glow = exp(-r * r * 4.5) * pulse;
    return vec4(u_fxColor.rgb * glow, glow) * u_alpha * 0.55;
  }
  float ang = atan(q.y, q.x);
  float arms = 0.5 + 0.5 * sin(ang * 3.0 - r * 9.0 + u_time * 2.4);
  float ring = smoothstep(1.0, 0.55, r) * smoothstep(0.08, 0.3, r);
  float core = exp(-r * r * 14.0) * 0.6;
  float k = clamp(arms * ring * 0.8 + core, 0.0, 1.0);
  return vec4(u_fxColor.rgb * k, k) * u_alpha * 0.7;
}

void main() {
  if (u_fx > 0.0) { gl_FragColor = effect(); return; }
  vec4 texel = texture2D(u_tex, v_uv);
  if (u_sharp > 0.0) {
    // Unsharp mask for a picture magnified past its finest level: bilinear softness taken back (premultiplied).
    vec4 n = texture2D(u_tex, v_uv + vec2(u_texel.x, 0.0)) + texture2D(u_tex, v_uv - vec2(u_texel.x, 0.0))
      + texture2D(u_tex, v_uv + vec2(0.0, u_texel.y)) + texture2D(u_tex, v_uv - vec2(0.0, u_texel.y));
    texel = clamp(texel + u_sharp * (texel - n * 0.25), 0.0, 1.0);
    texel.rgb = min(texel.rgb, vec3(texel.a));
  } else if (u_sharp < 0.0) {
    // Softened (the terrain magnified): four bilinear taps a little off the diagonals, each a 2×2 mean — a 3×3 tent
    // that evens out a 1–2 texel dithering checker and the edges of 4×4 compression blocks.
    vec2 d = u_texel * 0.75;
    vec4 n = texture2D(u_tex, v_uv + vec2(d.x, d.y)) + texture2D(u_tex, v_uv + vec2(-d.x, d.y))
      + texture2D(u_tex, v_uv + vec2(d.x, -d.y)) + texture2D(u_tex, v_uv - d);
    texel = mix(texel, n * 0.25, -u_sharp);
  }
  float a = u_alpha;
  if (u_feather.y > 0.0) {
    // Fully transparent for the first u_feather.x px (the art's own painted border), then a smooth ramp.
    float d = min(min(v_p.x - u_frame.x, u_frame.z - v_p.x), min(v_p.y - u_frame.y, u_frame.w - v_p.y));
    float t = clamp((d - u_feather.x) / max(1.0, u_feather.y - u_feather.x), 0.0, 1.0);
    a *= t * t * (3.0 - 2.0 * t);
  }
  if (u_maskOn > 0.0) {
    vec2 m = (v_p - u_maskRect.xy) / (u_maskRect.zw - u_maskRect.xy);
    vec4 k = texture2D(u_mask, clamp(m, 0.0, 1.0));
    // Opaque grey mask: luminance; a mask drawn in alpha: its alpha.
    a *= mix(1.0, k.a < 0.99 ? k.a : k.r, u_maskOn);
  }
  if (u_corner > 0.0) {
    // The gold corner pieces baked into a zone picture: gone on maps around the one in view.
    vec2 q = min(v_p - u_art.xy, u_art.zw - v_p);
    float side = min(u_art.z - u_art.x, u_art.w - u_art.y);
    a *= smoothstep(u_corner * side * 0.6, u_corner * side * 1.25, length(max(q, vec2(0.0))));
  }
  if (u_holeCount > 0.0) {
    // Painted words and decor of a parent where the place in view lies: the parent gives way there.
    // (With u_holeFill the other way round: the ground comes in there first, over the painted words it replaces.)
    float keep = 1.0;
    for (int i = 0; i < HOLES; i++) {
      if (float(i) >= u_holeCount) break;
      vec4 h = u_holes[i];
      vec2 c = (h.xy + h.zw) * 0.5, r = max((h.zw - h.xy) * 0.5, vec2(1.0));
      // A soft oval-ish fade wider than the box: the map below shows through gradually, never as a rectangle.
      float soft = max(6.0, max(r.x, r.y) * 0.5);
      vec2 d = abs(v_p - c) - r;
      float outside = length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
      keep *= smoothstep(-min(r.x, r.y) * 0.6, soft, outside);
    }
    if (u_holeFill > 0.0) a = max(a, (1.0 - keep) * u_holeFill);
    else a *= keep;
  }
  if (u_exclEdge.z > 0.0) {
    // The map in view covers its own rectangle: a map around it gives way there, along the same soft edge.
    float d = min(min(v_p.x - u_excl.x, u_excl.z - v_p.x), min(v_p.y - u_excl.y, u_excl.w - v_p.y));
    float t = clamp((d - u_exclEdge.x) / max(1.0, u_exclEdge.y - u_exclEdge.x), 0.0, 1.0);
    a *= 1.0 - u_exclEdge.z * t * t * (3.0 - 2.0 * t);
  }
  if (u_portal.z > 0.0) {
    float d = length(v_p - u_portal.xy);
    a *= 1.0 - smoothstep(u_portal.z * 0.82, u_portal.z, d);
  }
  vec3 col = texel.a > 0.0 ? texel.rgb / texel.a : vec3(0.0);
  // Colour grade (the terrain toward the painted map's palette): identity unless set.
  col = clamp(col * u_gradeMul + u_gradeAdd, 0.0, 1.0);
  if (u_paper.a > 0.0) {
    // A city drawn on a plain sheet whose mask is only a soft rectangle: the bare sheet gives way to the
    // map under it, the drawing stays (at the edges; the middle keeps its sheet so the zone's own words under
    // it stay hidden). The sheet's border is torn (noise), never a straight line, and the bare sheet left is a
    // little darker, nearer the tone of the map around.
    vec2 m = (v_p - u_maskRect.xy) / (u_maskRect.zw - u_maskRect.xy);
    float edge = min(min(m.x, 1.0 - m.x), min(m.y, 1.0 - m.y));
    float torn = vnoise(m * vec2(11.0, 7.0) + 3.7) * 0.65 + vnoise(m * vec2(29.0, 19.0) - 1.3) * 0.35 - 0.5;
    float e = edge + torn * 0.08;
    float strength = u_paper.a * mix(1.0, 0.0, smoothstep(0.08, 0.26, e));
    float key = smoothstep(0.05, 0.3, length(col - u_paper.rgb));
    a *= mix(1.0, key, strength) * smoothstep(0.0, 0.07, e);
    col *= mix(0.86, 1.0, key);
  }
  if (u_water > 0.0) {
    float wet = smoothstep(0.035, 0.13, col.b - max(col.r, col.g * 0.94)) * smoothstep(0.12, 0.3, col.b);
    // Where the map's own land mask says land, no shimmer (blue roofs, lakes painted as land stay still).
    if (u_land > 0.0) {
      vec2 lm = (v_p - u_maskRect.xy) / (u_maskRect.zw - u_maskRect.xy);
      wet *= 1.0 - texture2D(u_mask, clamp(lm, 0.0, 1.0)).r * u_land;
    }
    if (wet > 0.0) {
      vec2 q = v_p * u_waterMap.x + u_waterMap.yz;
      float s = vnoise(q + vec2(u_time * 0.42, u_time * 0.21)) * vnoise(q * 1.73 - vec2(u_time * 0.27, -u_time * 0.33));
      float swell = 0.5 + 0.5 * sin(u_time * 0.9 + q.x * 0.11 + q.y * 0.07);
      col += wet * u_water * (vec3(0.75, 0.88, 1.0) * pow(s, 5.0) * 0.9 + vec3(0.02, 0.035, 0.05) * swell);
    }
  }
  if (u_cloud > 0.0) {
    vec2 c = v_p * u_cloudMap.x + u_cloudMap.yz + vec2(u_time * 0.018, u_time * 0.006);
    float n = vnoise(c) * 0.55 + vnoise(c * 2.1 + 7.3) * 0.3 + vnoise(c * 4.3 - 3.1) * 0.15;
    float shade = smoothstep(0.48, 0.76, n) * u_cloud;
    col *= 1.0 - shade * 0.3;
  }
  if (u_desat > 0.0) col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), u_desat);
  if (u_vignette > 0.0) {
    vec2 e = (v_p / u_screen - 0.5) * vec2(1.0, 1.25);
    col *= 1.0 - u_vignette * smoothstep(0.25, 0.75, length(e));
  }
  if (u_light > 0.0) col += u_light * (vec3(0.1, 0.085, 0.05) + col * 0.18);
  else col *= 1.0 + u_light;
  if (u_ink.z > 0.0) {
    // Era switch: the new picture spreads like ink from the middle of the view, a darker rim at its edge.
    vec2 e = (v_p / u_screen - 0.5) * vec2(u_screen.x / u_screen.y, 1.0);
    float n = vnoise(v_p / (u_screen.y * 0.09)) * 0.22 + vnoise(v_p / (u_screen.y * 0.025)) * 0.08;
    float d = length(e) * 0.85 + n;
    float t = u_ink.x * 1.35;
    float inside = 1.0 - smoothstep(t - 0.06, t, d);
    float rim = smoothstep(t - 0.14, t - 0.04, d) * inside;
    a *= inside;
    col *= 1.0 - 0.28 * rim * (1.0 - u_ink.x);
  }
  gl_FragColor = vec4(col * texel.a, texel.a) * a;
}`;

const BLUR_VERTEX = `
attribute vec2 a_corner;
varying vec2 v_uv;
void main() {
  v_uv = a_corner;
  gl_Position = vec4(a_corner * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Nine-tap Gaussian folded into five linear fetches; u_dir is the step in texture space. */
const BLUR_FRAGMENT = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
uniform vec4 u_bounds;
varying vec2 v_uv;
vec4 at(vec2 uv) { return texture2D(u_tex, clamp(uv, u_bounds.xy, u_bounds.zw)); }
void main() {
  vec4 c = at(v_uv) * 0.2270270270;
  c += (at(v_uv + u_dir * 1.3846153846) + at(v_uv - u_dir * 1.3846153846)) * 0.3162162162;
  c += (at(v_uv + u_dir * 3.2307692308) + at(v_uv - u_dir * 3.2307692308)) * 0.0702702703;
  gl_FragColor = c;
}`;

export type DrawParams = {
  rect: [number, number, number, number];
  uv: [number, number, number, number];
  alpha: number;
  frame: [number, number, number, number];
  /** Soft edge (device px): [transparent inset, end of the ramp]; 0 = none. */
  feather: number | [number, number];
  portal: [number, number, number];
  light: number;
  cloud: number;
  water: number;
  desat?: number;
  /** The art's own rect on screen (device px), for its corners. */
  art?: [number, number, number, number];
  /** Fade the art's corners over this share of its smaller side (0 = keep). */
  corner?: number;
  /** Boxes (device px) where the picture gives way (painted words, decor). Up to `MapRenderer.holes` (24, or 8 on small GPUs). */
  holes?: Array<[number, number, number, number]>;
  /** Darken toward the screen's edges (the layer composite). */
  vignette?: number;
  /** Colour of the bare sheet to key out and how strongly (0 = off). */
  paper?: [number, number, number, number] | null;
  /** The own-area mask and the art's rect it spans (device px). */
  mask?: { texture: WebGLTexture; rect: [number, number, number, number]; strength?: number; /** Only to keep the water shimmer off land. */ land?: boolean } | null;
  /** A light effect instead of a picture: 1 = a capital's pulse, 2 = a portal's swirl; rgb + phase. */
  fx?: { kind: 1 | 2; color: [number, number, number, number] } | null;
  /** The rect of the map in view (device px) this picture gives way to, with that map's soft edge [inset, ramp end] and a strength. */
  exclude?: { rect: [number, number, number, number]; edge: [number, number]; strength: number } | null;
  /** Unsharp strength (0 = off; negative: a softening toward the 4-neighbour mean) and the texture's texel size in uv. */
  sharp?: number;
  texel?: [number, number];
  /** Colour grade: rgb × mul + add (straight colour, 0..1). */
  grade?: { mul: [number, number, number]; add: [number, number, number] } | null;
  /** The holes are where this picture comes in first (at this opacity), instead of where it gives way. */
  holeFill?: number;
};

type Target = { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };
type Layer = { scale: number; a: Target; b: Target };

const MAIN_UNIFORMS = ["u_view", "u_rect", "u_uv", "u_tex", "u_mask", "u_maskOn", "u_maskRect", "u_alpha", "u_frame", "u_feather", "u_portal", "u_time", "u_cloud", "u_cloudMap", "u_water", "u_waterMap", "u_light", "u_desat", "u_paper", "u_art", "u_corner", "u_holes", "u_holeCount", "u_screen", "u_vignette", "u_land", "u_ink", "u_fx", "u_fxColor", "u_excl", "u_exclEdge", "u_sharp", "u_texel", "u_gradeMul", "u_gradeAdd", "u_holeFill"];

export class MapRenderer {
  readonly gl: WebGLRenderingContext;
  private program!: WebGLProgram;
  blank!: WebGLTexture;
  /** How many holes (painted words to give way at) one draw takes. */
  holes = 8;
  /** One texel of the calm parchment the maps lie on: what shows where a backdrop has not loaded yet. */
  paper!: WebGLTexture;
  private blur!: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private ub: Record<string, WebGLUniformLocation | null> = {};
  private layers = new Map<number, Layer>();
  private width = 1;
  private height = 1;
  private scissor: [number, number, number, number] | null = null;
  private maskBound = false;
  /** The layer being drawn into (null: the screen). */
  private into: Layer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("webgl");
    this.gl = gl;
    this.init();
  }

  /** Programs, buffers and state; again after a lost context comes back. */
  init() {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type) as WebGLShader;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
      return shader;
    };
    const link = (vs: string, fs: string) => {
      const program = gl.createProgram() as WebGLProgram;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(program, 0, "a_corner");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(program) ?? "link");
      return program;
    };
    // Painted words a picture can give way at: 24 where the GPU has the uniforms for it (all but the smallest), else 8.
    this.holes = (gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number) >= 96 ? 24 : 8;
    this.program = link(VERTEX, `#define HOLES ${this.holes}\n${FRAGMENT}`);
    // A 1×1 texture for draws that sample nothing (light effects).
    this.blank = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, this.blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    this.paper = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, this.paper);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([74, 66, 52, 255]));
    this.blur = link(BLUR_VERTEX, BLUR_FRAGMENT);
    this.u = {};
    this.ub = {};
    for (const name of MAIN_UNIFORMS) this.u[name] = gl.getUniformLocation(this.program, name);
    for (const name of ["u_tex", "u_dir", "u_bounds"]) this.ub[name] = gl.getUniformLocation(this.blur, name);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(this.blur);
    gl.uniform1i(this.ub.u_tex, 0);
    gl.useProgram(this.program);
    gl.uniform1i(this.u.u_tex, 0);
    gl.uniform1i(this.u.u_mask, 1);
    gl.uniform1f(this.u.u_desat, 0);
    gl.uniform1f(this.u.u_maskOn, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    this.layers = new Map();
    this.snap = null;
    this.into = null;
    this.maskBound = false;
    this.inkSet = -1;
    this.fxOn = false;
    this.exclOn = false;
    this.under = false;
    gl.uniform3f(this.u.u_exclEdge, 0, 0, 0);
    gl.uniform1f(this.u.u_fx, 0);
    gl.uniform1f(this.u.u_land, 0);
    gl.uniform1f(this.u.u_sharp, 0);
    gl.uniform1f(this.u.u_holeFill, 0);
    gl.uniform3f(this.u.u_gradeMul, 1, 1, 1);
    gl.uniform3f(this.u.u_gradeAdd, 0, 0, 0);
    this.sharpOn = false;
    this.gradeOn = false;
    this.holeFill = 0;
    this.solids = new Map();
  }

  begin(width: number, height: number, time: number, cloudMap: [number, number, number], waterMap: [number, number, number]) {
    const gl = this.gl;
    if (width !== this.width || height !== this.height) this.dropLayers();
    this.width = width;
    this.height = height;
    this.into = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST);
    this.scissor = null;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.u.u_view, width, height);
    gl.uniform2f(this.u.u_screen, width, height);
    gl.uniform1f(this.u.u_time, time);
    gl.uniform3f(this.u.u_cloudMap, ...cloudMap);
    gl.uniform3f(this.u.u_waterMap, ...waterMap);
    this.setUnder(false);
  }

  /** Limit drawing on the screen to a box (device px, top-left origin); null: everywhere. */
  clip(box: [number, number, number, number] | null, height: number) {
    this.scissor = box;
    if (!this.into) this.applyScissor(height);
  }

  private applyScissor(height: number) {
    const gl = this.gl;
    const box = this.scissor;
    if (!box) { gl.disable(gl.SCISSOR_TEST); return; }
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.round(box[0]), Math.round(height - box[3]), Math.max(0, Math.round(box[2] - box[0])), Math.max(0, Math.round(box[3] - box[1])));
  }

  draw(texture: WebGLTexture, p: DrawParams) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform4f(this.u.u_rect, ...p.rect);
    gl.uniform4f(this.u.u_uv, ...p.uv);
    gl.uniform1f(this.u.u_alpha, p.alpha);
    gl.uniform4f(this.u.u_frame, ...p.frame);
    const f = typeof p.feather === "number" ? [0, p.feather] : p.feather;
    gl.uniform2f(this.u.u_feather, f[0], f[1]);
    gl.uniform3f(this.u.u_portal, ...p.portal);
    gl.uniform1f(this.u.u_light, p.light);
    gl.uniform1f(this.u.u_cloud, p.cloud);
    gl.uniform1f(this.u.u_water, p.water);
    gl.uniform1f(this.u.u_desat, p.desat ?? 0);
    if (p.paper) gl.uniform4f(this.u.u_paper, ...p.paper);
    else gl.uniform4f(this.u.u_paper, 0, 0, 0, 0);
    gl.uniform4f(this.u.u_art, ...(p.art ?? p.rect));
    gl.uniform1f(this.u.u_corner, p.corner ?? 0);
    gl.uniform1f(this.u.u_vignette, p.vignette ?? 0);
    const holes = p.holes ?? [];
    gl.uniform1f(this.u.u_holeCount, Math.min(this.holes, holes.length));
    if (holes.length) {
      const flat = new Float32Array(this.holes * 4);
      holes.slice(0, this.holes).forEach((h, i) => flat.set(h, i * 4));
      gl.uniform4fv(this.u.u_holes, flat);
    }
    if (p.mask) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, p.mask.texture);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(this.u.u_maskOn, p.mask.land ? 0 : p.mask.strength ?? 1);
      gl.uniform1f(this.u.u_land, p.mask.land ? 1 : 0);
      gl.uniform4f(this.u.u_maskRect, ...p.mask.rect);
      this.maskBound = true;
    } else if (this.maskBound) {
      gl.uniform1f(this.u.u_maskOn, 0);
      gl.uniform1f(this.u.u_land, 0);
      this.maskBound = false;
    }
    if (p.exclude && p.exclude.strength > 0) {
      gl.uniform4f(this.u.u_excl, ...p.exclude.rect);
      gl.uniform3f(this.u.u_exclEdge, p.exclude.edge[0], p.exclude.edge[1], p.exclude.strength);
      this.exclOn = true;
    } else if (this.exclOn) { gl.uniform3f(this.u.u_exclEdge, 0, 0, 0); this.exclOn = false; }
    if (p.sharp && Math.abs(p.sharp) > 0.01 && p.texel) { gl.uniform1f(this.u.u_sharp, p.sharp); gl.uniform2f(this.u.u_texel, ...p.texel); this.sharpOn = true; }
    else if (this.sharpOn) { gl.uniform1f(this.u.u_sharp, 0); this.sharpOn = false; }
    if (p.grade) { gl.uniform3f(this.u.u_gradeMul, ...p.grade.mul); gl.uniform3f(this.u.u_gradeAdd, ...p.grade.add); this.gradeOn = true; }
    else if (this.gradeOn) { gl.uniform3f(this.u.u_gradeMul, 1, 1, 1); gl.uniform3f(this.u.u_gradeAdd, 0, 0, 0); this.gradeOn = false; }
    const fill = holes.length ? p.holeFill ?? 0 : 0;
    if (fill !== this.holeFill) { gl.uniform1f(this.u.u_holeFill, fill); this.holeFill = fill; }
    if (p.fx) { gl.uniform1f(this.u.u_fx, p.fx.kind); gl.uniform4f(this.u.u_fxColor, ...p.fx.color); this.fxOn = true; }
    else if (this.fxOn) { gl.uniform1f(this.u.u_fx, 0); this.fxOn = false; }
    // The era's ink acts on the screen: inside an offscreen layer it waits for the layer's own draw.
    const ink = this.into ? 0 : this.ink;
    if (ink !== this.inkSet) { gl.uniform3f(this.u.u_ink, Math.max(0, ink), 0, ink > 0 ? 1 : 0); this.inkSet = ink; }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** The era switch's spread (0..1) for the draws that follow; 0 = off. */
  setInk(progress: number) { this.ink = progress > 0 && progress < 1 ? progress : 0; }
  private ink = 0;
  private inkSet = -1;
  private fxOn = false;
  private exclOn = false;
  private sharpOn = false;
  private gradeOn = false;
  private holeFill = 0;
  private solids = new Map<string, WebGLTexture>();

  /** A 1×1 texture of a colour ("#rrggbb"): flat fills such as a terrain's sea. */
  solid(hex: string): WebGLTexture | null {
    const known = this.solids.get(hex);
    if (known) return known;
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return null;
    const gl = this.gl;
    const tex = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 255]));
    this.solids.set(hex, tex);
    return tex;
  }

  /**
   * Start an out-of-focus layer: what is drawn next goes into an offscreen
   * target `scale` times smaller than the screen (a power of two, 2…16).
   */
  beginLayer(scale: number) {
    const gl = this.gl;
    const layer = this.layer(scale);
    this.into = layer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.a.fb);
    gl.viewport(0, 0, layer.a.w, layer.a.h);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Device pixels map onto the target `scale` times smaller (the screen's top at the target's top rows).
    gl.uniform2f(this.u.u_view, layer.a.w * scale, layer.a.h * scale);
  }

  /**
   * Draws that follow go under what the target already holds (only where it is still empty): maps beside each
   * other in one layer never lie over each other, whatever their masks say.
   */
  setUnder(on: boolean) {
    if (on === this.under) return;
    this.under = on;
    const gl = this.gl;
    if (on) gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  under = false;

  /** Blur the layer (`radius` in its own pixels; 0 = none) and lay it over the screen, dimmed, greyed and vignetted a little. */
  endLayer(radius: number, dim: number, desat: number, vignette = 0) {
    const gl = this.gl;
    const layer = this.into;
    if (!layer) return;
    this.into = null;
    this.setUnder(false);
    // The targets are a little larger than the drawn part (whole pixels): never read past it.
    const W = this.width, H = this.height;
    const u1 = W / layer.scale / layer.a.w, v1 = H / layer.scale / layer.a.h;
    if (radius > 0) {
      gl.useProgram(this.blur);
      gl.disable(gl.BLEND);
      gl.uniform4f(this.ub.u_bounds, 0.5 / layer.a.w, 1 - v1 + 0.5 / layer.a.h, u1 - 0.5 / layer.a.w, 1 - 0.5 / layer.a.h);
      const step = Math.max(0.5, radius / 2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.b.fb);
      gl.bindTexture(gl.TEXTURE_2D, layer.a.tex);
      gl.uniform2f(this.ub.u_dir, step / layer.a.w, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.a.fb);
      gl.bindTexture(gl.TEXTURE_2D, layer.b.tex);
      gl.uniform2f(this.ub.u_dir, 0, step / layer.a.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.BLEND);
    }
    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.uniform2f(this.u.u_view, W, H);
    this.applyScissor(H);
    // The screen's top sits at the target's top rows (GL rows count from the bottom).
    this.draw(layer.a.tex, {
      rect: [0, 0, W, H], uv: [0, 1, u1, 1 - v1], alpha: 1, frame: [0, 0, W, H], feather: 0, portal: [0, 0, 0],
      light: -dim, cloud: 0, water: 0, desat, vignette,
    });
  }

  get inLayer() { return this.into !== null; }

  /**
   * Keeps what the screen shows now (the frame just drawn) as a picture: when the map in view changes, the
   * old frame fades out over the new one instead of the new composition popping in.
   */
  snapshot() {
    const gl = this.gl;
    const W = this.width, H = this.height;
    if (!this.snap || this.snap.w !== W || this.snap.h !== H) {
      if (this.snap) gl.deleteTexture(this.snap.tex);
      const tex = gl.createTexture() as WebGLTexture;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.snap = { tex, w: W, h: H };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.snap.tex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, W, H, 0);
  }

  /** Lays the kept frame over the screen at `rect` (device px, where the old view lies now), fading to `alpha`. */
  drawSnapshot(rect: [number, number, number, number], alpha: number, edge: number) {
    if (!this.snap || alpha <= 0.003) return;
    this.setUnder(false);
    // GL rows count from the bottom: the frame's top is the texture's last row.
    this.draw(this.snap.tex, { rect, uv: [0, 1, 1, 0], alpha, frame: rect, feather: edge, portal: [0, 0, 0], light: 0, cloud: 0, water: 0 });
  }

  dropSnapshot() {
    if (this.snap) this.gl.deleteTexture(this.snap.tex);
    this.snap = null;
  }
  private snap: { tex: WebGLTexture; w: number; h: number } | null = null;

  private layer(scale: number): Layer {
    const found = this.layers.get(scale);
    if (found) return found;
    const w = Math.max(1, Math.ceil(this.width / scale) + 1), h = Math.max(1, Math.ceil(this.height / scale) + 1);
    const layer = { scale, a: this.target(w, h), b: this.target(w, h) };
    this.layers.set(scale, layer);
    return layer;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer() as WebGLFramebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }

  private dropLayers() {
    const gl = this.gl;
    for (const layer of this.layers.values()) for (const t of [layer.a, layer.b]) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    this.layers.clear();
  }

  /** Offscreen targets in bytes (for the memory probe). */
  get layerBytes() {
    let total = 0;
    for (const layer of this.layers.values()) total += layer.a.w * layer.a.h * 8;
    return total + (this.snap ? this.snap.w * this.snap.h * 4 : 0);
  }

  dispose() {
    this.dropLayers();
    this.dropSnapshot();
    for (const tex of this.solids.values()) this.gl.deleteTexture(tex);
    this.solids.clear();
  }
}
