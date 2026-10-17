import assert from "node:assert/strict";
import { iceFracture, ICE_CRACK_MS } from "../components/motion/iceFracture.ts";

function area(points) {
  return Math.abs(points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2);
}
function contains(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
for (const [width, height] of [[320, 900], [390, 844], [768, 1024], [1440, 900], [2560, 1080]]) {
  const sheet = iceFracture(width, height);
  assert.deepEqual(sheet, iceFracture(width, height));
  assert.ok(sheet.cells.length >= 18 && sheet.cells.length <= 20);
  const total = sheet.cells.reduce((sum, cell) => sum + area(cell.points), 0);
  assert.ok(Math.abs(total - width * height) < 1, `sheet must tile ${width}×${height}`);
  for (const cell of sheet.cells) {
    assert.ok(cell.points.length >= 4);
    for (const [x, y] of cell.points) assert.ok(x >= 0 && x <= width && y >= 0 && y <= height);
  }
  // Every sample belongs to exactly one shard: no holes or overlapping pieces.
  for (let x = .371; x < width; x += width / 71) {
    for (let y = .713; y < height; y += height / 53) {
      assert.equal(sheet.cells.filter(cell => contains(cell.points, x, y)).length, 1);
    }
  }
  for (const crack of sheet.cracks) {
    assert.ok(crack.delay + 200 <= ICE_CRACK_MS, "crack must finish before release");
    for (const point of crack.points) {
      assert.equal(sheet.cells.filter(cell => cell.points.some(p => p[0] === point[0] && p[1] === point[1])).length >= 2, true, "fracture and shard edges must coincide");
    }
  }
}
console.log("Ice fracture: desktop/mobile coverage, shared jagged edges, bounds and crack timing passed.");
