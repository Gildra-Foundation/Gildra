/* Finite, off-main-thread ice renderer. One material cache; no idle frame loop. */
let cached, active, playback, animationTimer;
function random(seed = 491) {
  return () => { seed = Math.imul(1664525, seed) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}
function material(width, height) {
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
  if (cached?.w === w && cached?.h === h) return cached;
  const texture = new OffscreenCanvas(w, h), paint = texture.getContext("2d");
  const rand = random(), grain = paint.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, edge = 1 - Math.min(x / w, 1 - x / w, y / h, 1 - y / h) * 2;
    const noise = rand(), cloud = Math.sin(x * .012 + Math.sin(y * .009) * 2) * Math.cos(y * .018 + x * .004);
    const vein = Math.sin(x * .043 + y * .021 + cloud * 3);
    // Clear blue ice between irregular frost pockets. High-frequency white
    // noise across every pixel made the previous material look like paper.
    const frost = Math.max(0, cloud - .18), ridge = Math.max(0, vein - .88);
    grain.data[i] = 172 + noise * 24; grain.data[i + 1] = 213 + noise * 22; grain.data[i + 2] = 234 + noise * 18;
    grain.data[i + 3] = 7 + edge ** 3 * 94 + frost * 65 + noise * 5 + ridge * 95;
  }
  paint.putImageData(grain, 0, 0);
  function fern(x, y, angle, length, depth) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    paint.moveTo(x, y); paint.lineTo(x + dx * length, y + dy * length);
    if (!depth) return;
    for (let step = 1; step < 6; step++) for (const side of [-1, 1]) {
      const t = (step + rand() * .35) / 6;
      fern(x + dx * length * t, y + dy * length * t, angle + side * (Math.PI / 3 + (rand() - .5) * .12), length * (1 - t) * (.38 + rand() * .12), depth - 1);
    }
  }
  paint.lineWidth = .45; paint.strokeStyle = "rgba(235,250,255,.46)"; paint.beginPath();
  for (let i = 0; i < w * h / 4300; i++) {
    let x = rand() * w, y = rand() * h;
    const border = i % 5 < 3;
    if (border) {
      const side = i % 4, inset = rand() ** 2 * .065;
      if (side < 2) x = (side ? 1 - inset : inset) * w;
      else y = (side === 2 ? inset : 1 - inset) * h;
    }
    const edge = Math.min(x / w, 1 - x / w, y / h, 1 - y / h);
    const inward = Math.atan2(h / 2 - y, w / 2 - x);
    fern(x, y, inward + (rand() - .5) * (border ? .9 : 2), (border ? 55 + rand() * 110 : 12 + rand() * 42) * scale * (1.2 - edge), 2);
  }
  paint.stroke();
  const mask = new OffscreenCanvas(Math.max(32, Math.ceil(w / 8)), Math.max(32, Math.ceil(h / 8)));
  const maskContext = mask.getContext("2d"), growth = maskContext.createImageData(mask.width, mask.height), arrival = new Float32Array(mask.width * mask.height);
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const u = x / (mask.width - 1), v = y / (mask.height - 1);
    arrival[y * mask.width + x] = Math.max(0, Math.min(u, 1 - u, v, 1 - v) * 2 + Math.sin(u * 29 + Math.sin(v * 17) * 3) * .095 + Math.sin(v * 41 + u * 19) * .045 + rand() * .025);
  }
  cached = { w, h, scale, texture, mask, maskContext, growth, arrival };
  return cached;
}
function line(ctx, points, portion = 1) {
  const lengths = points.slice(1).map((b, i) => Math.hypot(b[0] - points[i][0], b[1] - points[i][1]));
  let remaining = lengths.reduce((a, b) => a + b, 0) * portion;
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let i = 0; i < lengths.length && remaining > 0; i++) {
    const a = points[i], b = points[i + 1], t = Math.min(1, remaining / lengths[i]);
    ctx.lineTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); remaining -= lengths[i];
  }
  ctx.stroke();
}
function fractures(ctx, cracks, progress) {
  for (const crack of cracks) {
    const p = Math.max(0, Math.min(1, (progress * 420 - crack.delay) / 200));
    if (!p) continue;
    const eased = 1 - (1 - p) ** 3;
    ctx.strokeStyle = "rgba(4,24,36,.72)"; ctx.lineWidth = crack.fine ? .9 : 2.5; line(ctx, crack.points, eased);
    ctx.save(); ctx.translate(.8, -.65);
    ctx.strokeStyle = "rgba(220,246,255,.88)"; ctx.lineWidth = crack.fine ? .35 : .8; line(ctx, crack.points, eased);
    ctx.restore();
  }
}
function init(message) {
  dispose();
  const { canvas, width, height, geometry, id } = message, sheet = material(width, height);
  canvas.width = sheet.w; canvas.height = sheet.h;
  const ctx = canvas.getContext("2d"), cracks = [...geometry.cracks, ...geometry.hairlines];
  const body = new OffscreenCanvas(sheet.w, sheet.h), ice = body.getContext("2d");
  const depth = ice.createLinearGradient(0, 0, sheet.w, sheet.h);
  depth.addColorStop(0, "rgba(112,189,216,.12)"); depth.addColorStop(.48, "rgba(16,72,96,.05)"); depth.addColorStop(1, "rgba(58,132,164,.2)");
  ice.fillStyle = depth; ice.fillRect(0, 0, sheet.w, sheet.h); ice.drawImage(sheet.texture, 0, 0);
  // Broad reflections belong to the sheet, not to each polygon. They split
  // along the shared fracture edges when the material breaks apart.
  ice.save(); ice.translate(sheet.w * .4, sheet.h * .5); ice.rotate(-.43);
  const reflection = ice.createLinearGradient(-sheet.w * .22, 0, sheet.w * .22, 0);
  reflection.addColorStop(0, "rgba(222,243,250,0)"); reflection.addColorStop(.43, "rgba(222,243,250,.015)");
  reflection.addColorStop(.5, "rgba(231,248,255,.12)"); reflection.addColorStop(.55, "rgba(222,243,250,.025)"); reflection.addColorStop(1, "rgba(222,243,250,0)");
  ice.fillStyle = reflection; ice.fillRect(-sheet.w * .22, -sheet.h, sheet.w * .44, sheet.h * 2); ice.restore();
  const broken = new OffscreenCanvas(sheet.w, sheet.h), surface = broken.getContext("2d");
  surface.drawImage(body, 0, 0); surface.scale(sheet.scale, sheet.scale); fractures(surface, cracks, 1);
  const cells = geometry.cells.map(({ centre, points }, index) => {
    const path = new Path2D(); points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath();
    const glint = new Path2D();
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1];
      // Only edges facing the light catch the bright rim. Avoid the uniform
      // white polygon outlines that made the sheet look cut from cardboard.
      if ((dy - dx * .65) / Math.max(1, Math.hypot(dx, dy)) > .12) { glint.moveTo(...a); glint.lineTo(...b); }
    });
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return { centre, points, path, glint, left:Math.min(...xs), top:Math.min(...ys), right:Math.max(...xs), bottom:Math.max(...ys),
      dx:(centre[0] / width - .63) * width * .46 + Math.sin(index * 7.3) * width * .075,
      dy:(.85 + centre[1] / height * .36) * height,
      turn:((index % 2 ? 1 : -1) * (18 + index % 5 * 13)) * Math.PI / 180,
      tilt:(index % 2 ? 1 : -1) * (.45 + index % 4 * .2),
      delay:Math.hypot(centre[0] - width * .63, centre[1] - height * .31) / Math.hypot(width, height) * 110 };
  });
  active = { id, width, height, ctx, sheet, body, broken, cells, cracks, chips:geometry.cracks.filter((_, i) => i % 2 === 0) };
  postMessage({ type:"ready", id });
}
function content({ id, bitmap }) {
  if (active?.id !== id || active.released) { bitmap.close(); return; }
  active.page?.close(); active.page = bitmap;
  const ctx = active.broken.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, active.sheet.w, active.sheet.h);
  ctx.drawImage(bitmap, 0, 0, active.sheet.w, active.sheet.h);
  ctx.save(); ctx.scale(active.sheet.scale, active.sheet.scale);
  for (const cell of active.cells) {
    // A narrow, inward bevel refracts a few source pixels. This is baked once
    // into the same shared sheet, never recalculated during moving frames.
    const bevel = new Path2D(), [cx, cy] = cell.centre;
    for (let i = 0; i < cell.points.length; i++) {
      const a = cell.points[i], b = cell.points[(i + 1) % cell.points.length];
      const inset = p => { const t = Math.min(.1, 3.5 / Math.max(1, Math.hypot(p[0] - cx, p[1] - cy))); return [p[0] + (cx - p[0]) * t, p[1] + (cy - p[1]) * t]; };
      const ai = inset(a), bi = inset(b);bevel.moveTo(...a);bevel.lineTo(...b);bevel.lineTo(...bi);bevel.lineTo(...ai);bevel.closePath();
    }
    const w = cell.right - cell.left, h = cell.bottom - cell.top, s = active.sheet.scale;
    ctx.save();ctx.clip(bevel);
    ctx.drawImage(bitmap, (cell.left + 2.2) * s, (cell.top - 1.5) * s, w * s, h * s, cell.left, cell.top, w, h);
    ctx.restore();
    ctx.strokeStyle = "rgba(176,229,248,.24)";ctx.lineWidth = 1.8;ctx.stroke(cell.glint);
  }
  ctx.restore(); ctx.drawImage(active.body, 0, 0);
  ctx.scale(active.sheet.scale, active.sheet.scale); fractures(ctx, active.cracks, 1);
  postMessage({ type:"content", id });
}
function stopPlayback() {
  playback = undefined;
  clearTimeout(animationTimer); animationTimer = undefined;
}
function dispose() { stopPlayback(); active?.page?.close(); active?.brokenBitmap?.close(); active = undefined; }
// The renderer owns its finite clock. Route rendering/serialization must never
// be required to request the next ice frame. Only phase boundaries reach the UI.
function play({ id, phases, token }) {
  if (active?.id !== id || !Array.isArray(phases) || !phases.length) return;
  stopPlayback();
  playback = { id, phases, token, index:0, origin:performance.now(), reported:-Infinity };
  const tick = () => {
    const program = playback;
    if (!program || active?.id !== program.id) return;
    const phase = program.phases[program.index];
    const duration = Math.max(1, Math.min(5000, phase.duration));
    const progress = Math.min(1, Math.max(0, (performance.now() - program.origin) / duration));
    draw({ id, phase:phase.phase, progress, autonomous:true });
    if (progress >= 1) {
      if (++program.index >= program.phases.length) {
        stopPlayback(); postMessage({ type:"complete", id, token }); return;
      }
      program.origin = performance.now(); program.reported = -Infinity;
    }
    // Worker RAF can itself wait for the owner's busy rendering pipeline.
    // A finite ~60Hz worker timer keeps advancing without that dependency.
    // There is one pending tick, no catch-up queue, and no loop after release.
    animationTimer = setTimeout(tick, 16);
  };
  tick();
}
function draw({ id, phase, progress, autonomous = false }) {
  if (active?.id !== id) return;
  const { ctx, sheet, width, height, cells, body, broken, cracks, chips } = active;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, sheet.w, sheet.h);
  if (phase === "freezing") {
    ctx.drawImage(sheet.texture, 0, 0);
    if (progress < 1) {
      const { growth, arrival, mask, maskContext } = sheet;
      for (let i = 0; i < arrival.length; i++) growth.data[i * 4 + 3] = Math.max(0, Math.min(1, (progress * 1.26 - arrival[i]) * 9)) * 255;
      maskContext.putImageData(growth, 0, 0); ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, sheet.w, sheet.h); ctx.globalCompositeOperation = "source-over";
    }
  } else if (phase === "cracking") {
    if (active.page) ctx.drawImage(active.page, 0, 0, sheet.w, sheet.h);
    ctx.globalAlpha = 1 - Math.max(0, Math.min(1, (progress - .25) / .75)); ctx.drawImage(sheet.texture, 0, 0); ctx.globalAlpha = 1;
    // Ice thickens before release, avoiding an abrupt change from the readable
    // outgoing page to the solid, refracting faces of the flying fragments.
    ctx.globalAlpha = Math.max(0, Math.min(1, (progress - .25) / .75)); ctx.drawImage(body, 0, 0); ctx.globalAlpha = 1;
    ctx.scale(sheet.scale, sheet.scale); fractures(ctx, cracks, progress);
  } else {
    active.released = true;
    active.brokenBitmap ||= broken.transferToImageBitmap();
    ctx.scale(sheet.scale, sheet.scale);
    for (const cell of cells) {
      const p = Math.max(0, Math.min(1, (progress * 920 - cell.delay) / 740)), travel = p * p;
      if (p >= 1) continue;
      const [x, y] = cell.centre, w = cell.right - cell.left, h = cell.bottom - cell.top;
      const fade = Math.max(0, (p - .58) / .42);
      ctx.save(); ctx.globalAlpha = 1 - fade * fade * (3 - 2 * fade);
      ctx.translate(x + cell.dx * (p * .25 + travel * .75), y + cell.dy * travel);
      ctx.rotate(cell.turn * p); ctx.transform(Math.cos(cell.tilt * p), Math.sin(cell.tilt * p) * .12, -.1 * p, 1 - .4 * travel, 0, 0); ctx.translate(-x, -y);
      // Dark underside and bright bevel give a few pixels of thickness without
      // filters, per-fragment DOM, or a separate full-size raster per shard.
      ctx.save(); ctx.translate(1.4 + Math.sin(cell.turn * p), 3.4); ctx.strokeStyle = "rgba(8,48,65,.78)"; ctx.lineWidth = 4.6; ctx.stroke(cell.path); ctx.restore();
      ctx.save(); ctx.clip(cell.path);
      ctx.drawImage(active.brokenBitmap, cell.left * sheet.scale, cell.top * sheet.scale, w * sheet.scale, h * sheet.scale, cell.left, cell.top, w, h);
      ctx.restore();
      ctx.strokeStyle = `rgba(226,250,255,${.38 + Math.abs(Math.sin(cell.turn * p)) * .48})`; ctx.lineWidth = .8 + Math.abs(Math.sin(cell.turn * p)) * .7; ctx.stroke(cell.glint); ctx.restore();
    }
    chips.forEach(({ points }, index) => {
      const p = Math.min(1, progress * 920 / 700), travel = p * p, size = 5 + index % 4 * 3;
      ctx.save(); ctx.globalAlpha = 1 - p; ctx.translate(points[1][0] + (index % 2 ? 1 : -1) * (10 + index % 5 * 7) * width / 100 * travel, points[1][1] + (35 + index % 5 * 13) * height / 100 * travel);
      ctx.rotate((index % 2 ? 140 : -170) * Math.PI / 180 * p); ctx.fillStyle = "#d9f4ff"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, size * .4); ctx.lineTo(size * .6, size * 1.8); ctx.lineTo(-size * .2, size); ctx.closePath(); ctx.fill(); ctx.restore();
    });
  }
  if (!autonomous || progress === 1 || performance.now() - playback.reported >= 120) {
    if (playback) playback.reported = performance.now();
    postMessage({ type:"painted", id, phase, progress });
  }
}
onmessage = ({ data }) => {
  try {
    if (data.type === "warm" && !active) material(data.width, data.height);
    else if (data.type === "init") init(data);
    else if (data.type === "content") content(data);
    else if (data.type === "frame") { stopPlayback(); draw(data); }
    else if (data.type === "play") play(data);
    else if (data.type === "dispose" && active?.id === data.id) dispose();
  } catch { postMessage({ type:"failed", id:data.id }); dispose(); }
};
