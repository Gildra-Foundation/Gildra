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
    const noise = rand(), cloud = Math.sin(x * .022 + Math.sin(y * .016) * 2) * Math.cos(y * .031 + x * .009);
    grain.data[i] = 184 + noise * 42; grain.data[i + 1] = 220 + noise * 28; grain.data[i + 2] = 241 + noise * 14;
    grain.data[i + 3] = 54 + edge * edge * 112 + cloud * 22 + noise * 24;
  }
  paint.putImageData(grain, 0, 0);
  function fern(x, y, angle, length, depth) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    paint.moveTo(x, y); paint.lineTo(x + dx * length, y + dy * length);
    if (!depth) return;
    for (let step = 1; step < 7; step++) for (const side of [-1, 1]) {
      const t = step / 7;
      fern(x + dx * length * t, y + dy * length * t, angle + side * (.55 + rand() * .2), length * (1 - t) * .48, depth - 1);
    }
  }
  paint.lineWidth = .7 * scale; paint.strokeStyle = "rgba(244,253,255,.55)"; paint.beginPath();
  for (let i = 0; i < w * h / 2500; i++) {
    const x = rand() * w, y = rand() * h, edge = Math.min(x / w, 1 - x / w, y / h, 1 - y / h);
    fern(x, y, rand() * Math.PI * 2, (16 + rand() * 66) * scale * (1.2 - edge), 2);
  }
  paint.stroke();
  const mask = new OffscreenCanvas(Math.max(32, Math.ceil(w / 8)), Math.max(32, Math.ceil(h / 8)));
  const maskContext = mask.getContext("2d"), growth = maskContext.createImageData(mask.width, mask.height), arrival = new Float32Array(mask.width * mask.height);
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const u = x / (mask.width - 1), v = y / (mask.height - 1);
    arrival[y * mask.width + x] = Math.max(0, Math.min(u, 1 - u, v, 1 - v) * 2 + Math.sin(u * 29 + Math.sin(v * 17) * 2) * .065 + Math.sin(v * 41 + u * 19) * .035 + rand() * .045);
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
    ctx.strokeStyle = "rgba(9,42,62,.8)"; ctx.lineWidth = crack.fine ? 1.5 : 3.5; line(ctx, crack.points, eased);
    ctx.strokeStyle = "#e7faff"; ctx.lineWidth = crack.fine ? .6 : 1.25; line(ctx, crack.points, eased);
  }
}
function init(message) {
  const { canvas, width, height, geometry, id } = message, sheet = material(width, height);
  canvas.width = sheet.w; canvas.height = sheet.h;
  const ctx = canvas.getContext("2d"), cracks = [...geometry.cracks, ...geometry.hairlines];
  const body = new OffscreenCanvas(sheet.w, sheet.h), ice = body.getContext("2d");
  const depth = ice.createLinearGradient(0, 0, sheet.w, sheet.h);
  depth.addColorStop(0, "#648aa3"); depth.addColorStop(.48, "#294c62"); depth.addColorStop(1, "#53788e");
  ice.fillStyle = depth; ice.fillRect(0, 0, sheet.w, sheet.h); ice.drawImage(sheet.texture, 0, 0);
  const broken = new OffscreenCanvas(sheet.w, sheet.h), surface = broken.getContext("2d");
  surface.drawImage(body, 0, 0); surface.scale(sheet.scale, sheet.scale); fractures(surface, cracks, 1);
  const cells = geometry.cells.map(({ centre, points }, index) => {
    const path = new Path2D(); points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath();
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return { centre, path, left:Math.min(...xs), top:Math.min(...ys), right:Math.max(...xs), bottom:Math.max(...ys),
      dx:(centre[0] / width - .5) * (100 + index % 3 * 35) * width / 100,
      dy:(35 + centre[1] / height * 55 + index % 3 * 9) * height / 100,
      turn:((centre[0] / width - .5) * 60 + (index % 2 ? 12 : -12)) * Math.PI / 180,
      delay:(1 - centre[1] / height) * 90 + index % 3 * 14 };
  });
  active = { id, width, height, ctx, sheet, body, broken, cells, cracks, chips:geometry.cracks.filter((_, i) => i % 2 === 0) };
  postMessage({ type:"ready", id });
}
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
    ctx.drawImage(sheet.texture, 0, 0);
    // Ice thickens before release, avoiding an abrupt change from the readable
    // outgoing page to the solid, refracting faces of the flying fragments.
    ctx.globalAlpha = Math.max(0, Math.min(1, (progress - .25) / .75)); ctx.drawImage(body, 0, 0); ctx.globalAlpha = 1;
    ctx.scale(sheet.scale, sheet.scale); fractures(ctx, cracks, progress);
  } else {
    ctx.scale(sheet.scale, sheet.scale);
    for (const cell of cells) {
      const p = Math.max(0, Math.min(1, (progress * 920 - cell.delay) / 740)), travel = p * p;
      const [x, y] = cell.centre, w = cell.right - cell.left, h = cell.bottom - cell.top;
      ctx.save(); ctx.globalAlpha = p < .55 ? 1 : (1 - p) / .45;
      ctx.translate(x + cell.dx * travel, y + cell.dy * travel); ctx.rotate(cell.turn * travel); ctx.scale(1, 1 - .22 * travel); ctx.translate(-x, -y);
      ctx.clip(cell.path);
      ctx.drawImage(broken, cell.left * sheet.scale, cell.top * sheet.scale, w * sheet.scale, h * sheet.scale, cell.left, cell.top, w, h);
      ctx.strokeStyle = "rgba(237,251,255,.7)"; ctx.lineWidth = 1; ctx.stroke(cell.path); ctx.restore();
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
    else if (data.type === "frame") draw(data);
    else if (data.type === "dispose" && active?.id === data.id) active = undefined;
  } catch { postMessage({ type:"failed", id:data.id }); active = undefined; }
};
