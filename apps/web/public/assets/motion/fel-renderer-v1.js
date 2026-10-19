/* Immutable fel material. The main page sends programs, never frame requests.
   One bounded bitmap, a 256px arrival field and two reusable pixel buffers. */
let state, clock, cachedField;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
function random(seed) {
  return () => { seed = Math.imul(1664525, seed) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}
function field(width, height) {
  const scale = Math.min(1, 256 / Math.max(width, height));
  const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
  if (cachedField?.w === w && cachedField.h === h) return cachedField;
  const rand = random(w * 9137 + h * 2179), seeds = [];
  for (let i = 0; i < 13; i++) seeds.push({ x: rand(), y: rand(), radius: .18 + rand() * .2, delay: rand() * .23, stretch: .7 + rand() * .6 });
  const raw = new Float32Array(w * h), histogram = new Uint32Array(1024);
  let min = Infinity, max = -Infinity;
  const aspect = w / h;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const nx = x / w, ny = y / h;
    // Warped distance fronts make the pits merge into irregular islands.
    // The field is baked once; no trigonometry or spatial search per pixel
    // runs during navigation frames.
    const dx = nx + Math.sin(ny * 23 + Math.cos(nx * 17)) * .023;
    const dy = ny + Math.cos(nx * 27 + Math.sin(ny * 13)) * .019;
    let distance = Infinity;
    for (const seed of seeds) distance = Math.min(distance, Math.hypot((dx - seed.x) * aspect * seed.stretch, (dy - seed.y) / seed.stretch) / seed.radius + seed.delay);
    distance += Math.sin(nx * 63 + Math.cos(ny * 47) * 2) * .026 + Math.cos(ny * 97 + nx * 31) * .012 + (rand() - .5) * .004;
    raw[i] = distance; min = Math.min(min, distance); max = Math.max(max, distance);
  }
  const bins = new Uint16Array(raw.length), arrival = new Uint16Array(raw.length);
  for (let i = 0; i < raw.length; i++) { const bin = Math.floor((raw[i] - min) / (max - min || 1) * 1023); bins[i] = bin; histogram[bin]++; }
  // Equalise area so most of the page does not disappear in one late burst.
  let count = 0;
  const rank = new Uint16Array(1024);
  for (let i = 0; i < 1024; i++) { count += histogram[i]; rank[i] = Math.round(count / raw.length * 65535); }
  for (let i = 0; i < raw.length; i++) arrival[i] = rank[bins[i]];
  const slope = new Float32Array(arrival.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const dx = arrival[y * w + Math.min(w - 1, x + 1)] - arrival[y * w + Math.max(0, x - 1)];
    const dy = arrival[Math.min(h - 1, y + 1) * w + x] - arrival[Math.max(0, y - 1) * w + x];
    // Convert arrival difference into local pixel distance. This keeps the
    // wet rim continuous instead of quantising it into bright square dots.
    slope[i] = 65535 / Math.max(90, Math.hypot(dx, dy) * .5);
  }
  const bubbles = Array.from({ length: 48 }, () => {
    const x = rand(), y = rand();
    return { x, y, at: arrival[Math.min(h - 1, Math.floor(y * h)) * w + Math.min(w - 1, Math.floor(x * w))] / 65535, radius: 1 + rand() * 2.4, seed: rand() * 6 };
  });
  return cachedField = { w, h, arrival, slope, bubbles };
}
const palette = new Uint8ClampedArray(256 * 4);
for (let i = 0; i < 256; i++) {
  const d = i / 255 * 5.5 - 2.5, j = i * 4;
  let color, alpha;
  if (d < -.45) { color = [83, 180, 44]; alpha = clamp((d + 2.5) / 2.05) * .23; }
  else if (d < .25) { color = [82, 144, 35]; alpha = .3; }
  else if (d < 1) { color = [19, 30, 14]; alpha = .88; }
  else { color = [86, 143, 35]; alpha = clamp(1 - (d - 1) / 2) * .34; }
  palette[j] = color[0]; palette[j + 1] = color[1]; palette[j + 2] = color[2]; palette[j + 3] = alpha * 255;
}
function stop() { if (clock) clearTimeout(clock.timer); clock = undefined; }
function dispose() {
  stop(); state?.bitmap?.close();
  if (state) { state.canvas.width = state.canvas.height = 1; }
  state = undefined;
}
function contour(prepared, threshold, points) {
  const path = new Path2D(), { w, h, arrival } = prepared, cut = threshold * 65535;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x, a = arrival[i], b = arrival[i + 1], c = arrival[i + w + 1], d = arrival[i + w];
    const aa = a < cut, bb = b < cut, cc = c < cut, dd = d < cut;
    if (aa === bb && bb === cc && cc === dd) continue;
    let n = 0;
    if (aa !== bb) { points[n++] = x + (cut - a) / (b - a); points[n++] = y; }
    if (bb !== cc) { points[n++] = x + 1; points[n++] = y + (cut - b) / (c - b); }
    if (cc !== dd) { points[n++] = x + 1 - (cut - c) / (d - c); points[n++] = y + 1; }
    if (dd !== aa) { points[n++] = x; points[n++] = y + 1 - (cut - d) / (a - d); }
    path.moveTo(points[0], points[1]); path.lineTo(points[2], points[3]);
    if (n === 8) { path.moveTo(points[4], points[5]); path.lineTo(points[6], points[7]); }
  }
  return path;
}
function draw({ phase, progress }) {
  const s = state; if (!s) return;
  const dissolving = phase === "shattering", p = clamp(progress);
  const threshold = dissolving ? .063 + 1.05 * p : .008 + .055 * (phase === "freezing" ? p : 1);
  const mask = s.maskPixels.data, edge = s.edgePixels.data, arrival = s.field.arrival, slope = s.field.slope;
  const strength = dissolving ? 1 : .7 * (phase === "freezing" ? clamp(p * 3) : 1);
  for (let i = 0, j = 0; i < arrival.length; i++, j += 4) {
    const d = (arrival[i] / 65535 - threshold) * slope[i];
    mask[j + 3] = dissolving ? clamp(d + .5) * 255 : 255;
    if (d > -2.5 && d < 3) {
      const at = clamp(Math.floor((d + 2.5) / 5.5 * 255), 0, 255) * 4;
      edge[j] = palette[at]; edge[j + 1] = palette[at + 1]; edge[j + 2] = palette[at + 2]; edge[j + 3] = palette[at + 3] * strength;
    } else {
      edge[j] = 32; edge[j + 1] = 70; edge[j + 2] = 17;
      edge[j + 3] = !dissolving && d < 0 ? 62 * strength : 0;
    }
  }
  s.maskContext.putImageData(s.maskPixels, 0, 0);
  s.edgeContext.putImageData(s.edgePixels, 0, 0);
  const ctx = s.context, w = s.canvas.width, h = s.canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (s.bitmap) {
    ctx.drawImage(s.bitmap, 0, 0, w, h);
    if (dissolving) { ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(s.mask, 0, 0, w, h); ctx.globalCompositeOperation = "source-over"; }
  }
  ctx.drawImage(s.edge, 0, 0, w, h);
  // Interpolated contour lines stay smooth at viewport resolution. The coarse
  // mask supplies only the soft stain and erosion alpha, never pixelated sparks.
  const rim = contour(s.field, threshold, s.contourPoints), expansion = Math.max(w / s.field.w, h / s.field.h);
  ctx.save(); ctx.scale(w / s.field.w, h / s.field.h);
  ctx.lineJoin = ctx.lineCap = "round"; ctx.globalAlpha = strength;
  ctx.strokeStyle = "rgba(48,89,20,.55)"; ctx.lineWidth = 4 / expansion; ctx.stroke(rim);
  ctx.strokeStyle = "rgba(185,237,112,.85)"; ctx.lineWidth = 1.1 / expansion; ctx.stroke(rim);
  ctx.restore();
  // Small wet bubbles on the active edge, no blur/filter or particle DOM.
  for (const bubble of s.field.bubbles) {
    const age = (threshold - bubble.at + .02) / .085;
    if (age <= 0 || age >= 1 || dissolving && p > .96) continue;
    const radius = bubble.radius * (.6 + Math.sin(age * Math.PI));
    ctx.globalAlpha = Math.sin(age * Math.PI) * strength * .7;
    ctx.strokeStyle = "#c8f68d"; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.arc(bubble.x * w, bubble.y * h - age * 5, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function play(message) {
  stop();
  const phases = message.phases;
  if (!Array.isArray(phases) || !phases.length || phases.length > 3 || phases.some(p => !["freezing", "cracking", "shattering"].includes(p.phase) || !Number.isFinite(p.duration) || p.duration < 16 || p.duration > 10000)) return;
  const program = clock = { timer: 0, origin: performance.now(), token: message.token, phase: undefined, reported: -Infinity };
  const tick = () => {
    if (clock !== program || !state) return;
    const frameStarted = performance.now(), elapsed = frameStarted - program.origin;
    let offset = 0, current = phases.at(-1), progress = 1;
    for (const item of phases) {
      if (elapsed < offset + item.duration) { current = item; progress = clamp((elapsed - offset) / item.duration); break; }
      offset += item.duration;
    }
    draw({ id: state.id, phase: current.phase, progress });
    const now = performance.now();
    if (program.phase !== current.phase || now - program.reported >= 120 || progress === 1) {
      postMessage({ type: "painted", id: state.id, phase: current.phase, progress }); program.reported = now; program.phase = current.phase;
    }
    if (progress === 1) { clock = undefined; postMessage({ type: "complete", id: state.id, token: program.token }); }
    // Include draw time in the cadence instead of adding it to every frame.
    // One pending timer, with no catch-up queue when a device falls behind.
    else program.timer = setTimeout(tick, Math.max(1, 16 - (performance.now() - frameStarted)));
  };
  tick();
}
onmessage = ({ data }) => {
  try {
    if (data.type === "warm") { field(data.width, data.height); return; }
    if (data.type === "init") {
      dispose();
      const prepared = field(data.width, data.height), context = data.canvas.getContext("2d");
      const mask = new OffscreenCanvas(prepared.w, prepared.h), edge = new OffscreenCanvas(prepared.w, prepared.h);
      const maskContext = mask.getContext("2d"), edgeContext = edge.getContext("2d");
      const maskPixels = maskContext.createImageData(prepared.w, prepared.h), edgePixels = edgeContext.createImageData(prepared.w, prepared.h);
      for (let i = 0; i < maskPixels.data.length; i++) maskPixels.data[i] = 255;
      // Pay the first backing-store allocation before the program starts.
      maskContext.putImageData(maskPixels, 0, 0); edgeContext.putImageData(edgePixels, 0, 0);
      context.clearRect(0, 0, data.canvas.width, data.canvas.height);
      state = { id: data.id, canvas: data.canvas, context, field: prepared, mask, edge, maskContext, edgeContext, maskPixels, edgePixels, contourPoints: new Float32Array(8) };
      postMessage({ type: "ready", id: data.id }); return;
    }
    if (!state || data.id !== state.id) { data.bitmap?.close(); return; }
    if (data.type === "content") { state.bitmap?.close(); state.bitmap = data.bitmap; postMessage({ type: "content", id: data.id }); }
    if (data.type === "play") play(data);
    if (data.type === "dispose") dispose();
  } catch {
    data.bitmap?.close(); dispose(); postMessage({ type: "failed", id: data.id });
  }
};
