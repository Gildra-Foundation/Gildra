/**
 * The world map's one WebGL program: a textured quad with the living-world
 * effects folded into the fragment shader — feathered edges for maps laid
 * over their parent, a round portal mask for worlds opening from the Cosmic
 * map, drifting cloud shadows and a shimmer on water-coloured pixels.
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
uniform float u_alpha;
uniform vec4 u_frame;
uniform float u_feather;
uniform vec3 u_portal;
uniform float u_time;
uniform float u_cloud;
uniform vec3 u_cloudMap;
uniform float u_water;
uniform vec3 u_waterMap;
uniform float u_light;
varying vec2 v_uv;
varying vec2 v_p;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec4 texel = texture2D(u_tex, v_uv);
  float a = u_alpha;
  if (u_feather > 0.0) {
    float d = min(min(v_p.x - u_frame.x, u_frame.z - v_p.x), min(v_p.y - u_frame.y, u_frame.w - v_p.y));
    a *= smoothstep(u_feather * 0.12, u_feather, d);
  }
  if (u_portal.z > 0.0) {
    float d = length(v_p - u_portal.xy);
    a *= 1.0 - smoothstep(u_portal.z * 0.82, u_portal.z, d);
  }
  vec3 col = texel.a > 0.0 ? texel.rgb / texel.a : vec3(0.0);
  if (u_water > 0.0) {
    float wet = smoothstep(0.035, 0.13, col.b - max(col.r, col.g * 0.94)) * smoothstep(0.12, 0.3, col.b);
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
  if (u_light > 0.0) col += u_light * (vec3(0.1, 0.085, 0.05) + col * 0.18);
  else col *= 1.0 + u_light;
  gl_FragColor = vec4(col * texel.a, texel.a) * a;
}`;

export type DrawParams = {
  rect: [number, number, number, number];
  uv: [number, number, number, number];
  alpha: number;
  frame: [number, number, number, number];
  feather: number;
  portal: [number, number, number];
  light: number;
  cloud: number;
  water: number;
};

export class MapRenderer {
  readonly gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("webgl");
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type) as WebGLShader;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
      return shader;
    };
    const program = gl.createProgram() as WebGLProgram;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
    this.program = program;
    gl.useProgram(program);
    for (const name of ["u_view", "u_rect", "u_uv", "u_tex", "u_alpha", "u_frame", "u_feather", "u_portal", "u_time", "u_cloud", "u_cloudMap", "u_water", "u_waterMap", "u_light"]) {
      this.u[name] = gl.getUniformLocation(program, name);
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "a_corner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.u.u_tex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
  }

  begin(width: number, height: number, time: number, cloudMap: [number, number, number], waterMap: [number, number, number]) {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.u.u_view, width, height);
    gl.uniform1f(this.u.u_time, time);
    gl.uniform3f(this.u.u_cloudMap, ...cloudMap);
    gl.uniform3f(this.u.u_waterMap, ...waterMap);
  }

  clip(box: [number, number, number, number] | null, height: number) {
    const gl = this.gl;
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
    gl.uniform1f(this.u.u_feather, p.feather);
    gl.uniform3f(this.u.u_portal, ...p.portal);
    gl.uniform1f(this.u.u_light, p.light);
    gl.uniform1f(this.u.u_cloud, p.cloud);
    gl.uniform1f(this.u.u_water, p.water);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
