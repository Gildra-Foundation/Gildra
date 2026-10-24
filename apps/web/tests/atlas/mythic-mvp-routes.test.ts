import test from 'node:test';
import assert from 'node:assert/strict';
import routes from '../../components/wow/mythic/mvpRoutes.json' with { type: 'json' };
import { dungeonRoutes } from '../../components/wow/mythic/dungeonRoutes.ts';

for (const [slug, route] of Object.entries(routes)) {
  test(`${slug}: route has complete forces, unique spawns and every encounter`, () => {
    const seen = new Set<string>();
    let total = 0;
    for (const pull of route.pulls) {
      assert.ok(pull.x >= 0 && pull.x <= 100 && pull.y >= 0 && pull.y <= 100);
      assert.equal(pull.forces, pull.enemies.reduce((sum, enemy) => sum + enemy.count * enemy.forcePerEnemy, 0));
      total += pull.forces;
      for (const enemy of pull.enemies) {
        assert.equal(enemy.count, enemy.clones.length);
        for (const clone of enemy.clones) {
          const key = `${enemy.id}:${clone}`;
          assert.ok(!seen.has(key), `Duplicate spawn ${key}`); seen.add(key);
        }
      }
    }
    assert.equal(total, route.totalForces);
    assert.ok(total >= route.requiredForces, `${total} < ${route.requiredForces}`);
    const bosses = dungeonRoutes[slug as keyof typeof dungeonRoutes].stops.filter(stop => stop.kind === 'boss');
    for (const boss of bosses) {
      assert.ok(route.pulls.some(pull => pull.enemies.some(enemy => enemy.boss && boss.enemies.some(member => member.name === enemy.name))), `Missing ${boss.title}`);
    }
  });
}
