/* Finite, off-main-thread ice renderer. One material cache; no idle frame loop. */
let cached, active;
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
    const noise = rand(), cloud = Math.sin(x * .019 + Math.sin(y * .013) * 3) * Math.cos(y * .027 + x * .007);
    const vein = Math.sin(x * .071 + y * .037 + cloud * 4);
    grain.data[i] = 190 + noise * 35; grain.data[i + 1] = 218 + noise * 27; grain.data[i + 2] = 232 + noise * 20;
    grain.data[i + 3] = 25 + edge * edge * 112 + Math.max(0, cloud) * 46 + noise * 17 + Math.max(0, vein - .82) * 60;
  }
  paint.putImageData(grain, 0, 0);
  function fern(x, y, angle, length, depth) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    paint.moveTo(x, y); paint.lineTo(x + dx * length, y + dy * length);
    if (!depth) return;
    for (let step = 1; step < 6; step++) for (const side of [-1, 1]) {
      const t = (step + rand() * .35) / 6;
      fern(x + dx * length * t, y + dy * length * t, angle + side * (.42 + rand() * .4), length * (1 - t) * (.35 + rand() * .2), depth - 1);
    }
  }
  paint.lineWidth = .55; paint.strokeStyle = "rgba(241,251,255,.4)"; paint.beginPath();
  for (let i = 0; i < w * h / 3200; i++) {
    const x = rand() * w, y = rand() * h, edge = Math.min(x / w, 1 - x / w, y / h, 1 - y / h);
    const inward = Math.atan2(h / 2 - y, w / 2 - x);
    fern(x, y, inward + (rand() - .5) * 2.8, (12 + rand() * 80) * scale * (1.2 - edge), 2);
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
    ctx.strokeStyle = "rgba(5,25,37,.85)"; ctx.lineWidth = crack.fine ? 1.3 : 3.8; line(ctx, crack.points, eased);
    ctx.save(); ctx.translate(.8, -.65);
    ctx.strokeStyle = "rgba(227,247,255,.9)"; ctx.lineWidth = crack.fine ? .45 : 1.05; line(ctx, crack.points, eased);
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
  depth.addColorStop(0, "rgba(95,150,175,.14)"); depth.addColorStop(.48, "rgba(24,75,99,.08)"); depth.addColorStop(1, "rgba(105,170,200,.18)");
  ice.fillStyle = depth; ice.fillRect(0, 0, sheet.w, sheet.h); ice.drawImage(sheet.texture, 0, 0);
  // Broad reflections belong to the sheet, not to each polygon. They split
  // along the shared fracture edges when the material breaks apart.
  ice.save(); ice.translate(sheet.w * .4, sheet.h * .5); ice.rotate(-.43);
  const reflection = ice.createLinearGradient(-sheet.w * .22, 0, sheet.w * .22, 0);
  reflection.addColorStop(0, "rgba(222,243,250,0)"); reflection.addColorStop(.43, "rgba(222,243,250,.015)");
  reflection.addColorStop(.5, "rgba(231,248,255,.17)"); reflection.addColorStop(.55, "rgba(222,243,250,.035)"); reflection.addColorStop(1, "rgba(222,243,250,0)");
  ice.fillStyle = reflection; ice.fillRect(-sheet.w * .22, -sheet.h, sheet.w * .44, sheet.h * 2); ice.restore();
  const broken = new OffscreenCanvas(sheet.w, sheet.h), surface = broken.getContext("2d");
  surface.drawImage(body, 0, 0); surface.scale(sheet.scale, sheet.scale); fractures(surface, cracks, 1);
  const cells = geometry.cells.map(({ centre, points }, index) => {
    const path = new Path2D(); points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath();
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return { centre, path, left:Math.min(...xs), top:Math.min(...ys), right:Math.max(...xs), bottom:Math.max(...ys),
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
  ctx.drawImage(bitmap, 0, 0, active.sheet.w, active.sheet.h); ctx.drawImage(active.body, 0, 0);
  ctx.scale(active.sheet.scale, active.sheet.scale); fractures(ctx, active.cracks, 1);
  postMessage({ type:"content", id });
}
function dispose() { active?.page?.close(); active = undefined; }
function draw({ id, phase, progress }) {
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
    ctx.scale(sheet.scale, sheet.scale);
    for (const cell of cells) {
      const p = Math.max(0, Math.min(1, (progress * 920 - cell.delay) / 740)), travel = p * p;
      const [x, y] = cell.centre, w = cell.right - cell.left, h = cell.bottom - cell.top;
      ctx.save(); ctx.globalAlpha = p < .68 ? 1 : (1 - p) / .32;
      ctx.translate(x + cell.dx * (p * .25 + travel * .75), y + cell.dy * travel);
      ctx.rotate(cell.turn * p); ctx.transform(Math.cos(cell.tilt * p), Math.sin(cell.tilt * p) * .12, -.1 * p, 1 - .4 * travel, 0, 0); ctx.translate(-x, -y);
      // Dark underside and bright bevel give a few pixels of thickness without
      // filters, per-fragment DOM, or a separate full-size raster per shard.
      ctx.save(); ctx.translate(1.8, 2.8); ctx.strokeStyle = "rgba(7,25,35,.8)"; ctx.lineWidth = 4; ctx.stroke(cell.path); ctx.restore();
      ctx.save(); ctx.clip(cell.path);
      ctx.drawImage(broken, cell.left * sheet.scale, cell.top * sheet.scale, w * sheet.scale, h * sheet.scale, cell.left, cell.top, w, h);
      ctx.restore();
      ctx.strokeStyle = "rgba(226,247,255,.65)"; ctx.lineWidth = .9 + Math.abs(Math.sin(cell.turn * p)) * .8; ctx.stroke(cell.path); ctx.restore();
    }
    chips.forEach(({ points }, index) => {
      const p = Math.min(1, progress * 920 / 700), travel = p * p, size = 5 + index % 4 * 3;
      ctx.save(); ctx.globalAlpha = 1 - p; ctx.translate(points[1][0] + (index % 2 ? 1 : -1) * (10 + index % 5 * 7) * width / 100 * travel, points[1][1] + (35 + index % 5 * 13) * height / 100 * travel);
      ctx.rotate((index % 2 ? 140 : -170) * Math.PI / 180 * p); ctx.fillStyle = "#d9f4ff"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, size * .4); ctx.lineTo(size * .6, size * 1.8); ctx.lineTo(-size * .2, size); ctx.closePath(); ctx.fill(); ctx.restore();
    });
  }
  postMessage({ type:"painted", id, phase, progress });
}
onmessage = ({ data }) => {
  try {
    if (data.type === "warm" && !active) material(data.width, data.height);
    else if (data.type === "init") init(data);
    else if (data.type === "content") content(data);
    else if (data.type === "frame") draw(data);
    else if (data.type === "dispose" && active?.id === data.id) dispose();
  } catch { postMessage({ type:"failed", id:data.id }); dispose(); }
};
