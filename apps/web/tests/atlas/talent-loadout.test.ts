import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWoWTalentLoadout, encodeWoWTalentLoadout, talentLoadoutHeroId, talentPointBudgets } from '../../lib/wowTalentLoadout.ts';
import type { TalentCalculatorData } from '../../lib/talentCalculatorData.ts';

function tree(heroIndex = 0) {
  return {
    specId: 72, heroSubtreeId: heroIndex ? 61 : 60, heroSelectionNodeId: 100,
    heroSelectionEntryIndex: heroIndex, heroSelections: [{ subtreeId: 60, entryIndex: 0 }, { subtreeId: 61, entryIndex: 1 }],
    fullNodeOrder: [1, 100, 2, 3],
    loadoutNodes: [1, 2, 3].map(nodeId => ({ nodeId, maxRanks: 1, nodeType: 'single', freeNode: false, choiceEntryIds: [nodeId + 1000] })),
    trees: {
      class: { nodes: [{ nodeId: 1, id: 'class-1', maxRanks: 1, choices: [] }] },
      hero: { nodes: [{ nodeId: heroIndex ? 3 : 2, id: `hero-${heroIndex ? 3 : 2}`, maxRanks: 1, choices: [] }] },
      spec: { nodes: [] },
    },
  } as unknown as TalentCalculatorData;
}
test('hero path is detected before decoding and never silently discarded', () => {
  const code = encodeWoWTalentLoadout(tree(1), new Map([['class-1', 1], ['hero-3', 1]]), new Map());
  assert.equal(talentLoadoutHeroId(tree(), code), 61);
  assert.equal(decodeWoWTalentLoadout(tree(), code), null);
  assert.deepEqual([...decodeWoWTalentLoadout(tree(1), code)!.ranks], [['class-1', 1], ['hero-3', 1]]);
});
test('invalid ranks are rejected instead of clamped into an apparently valid build', () => {
  const invalid = encodeWoWTalentLoadout(tree(), new Map([['class-1', 2]]), new Map());
  assert.equal(talentLoadoutHeroId(tree(), invalid), null);
});
test('missing metadata for a purchased node rejects incompatible trees', () => {
  const code = encodeWoWTalentLoadout(tree(), new Map([['class-1', 1]]), new Map());
  const newerTree = tree(); newerTree.loadoutNodes = newerTree.loadoutNodes.filter(node => node.nodeId !== 1);
  assert.equal(decodeWoWTalentLoadout(newerTree, code), null);
});
test('in-game tree hashes reject a changed or unavailable tree version', () => {
  const current = { ...tree(), treeHash: '92c50ed2d1c8cf709d5bec22e17167dd' };
  const code = encodeWoWTalentLoadout(current, new Map([['class-1', 1]]), new Map());
  assert.ok(decodeWoWTalentLoadout(current, code));
  assert.equal(decodeWoWTalentLoadout({ ...current, treeHash: '00'.repeat(16) }, code), null);
  assert.equal(decodeWoWTalentLoadout(tree(), code), null);
  // The official format permits third-party codes with no tree hash.
  assert.ok(decodeWoWTalentLoadout(current, encodeWoWTalentLoadout(tree(), new Map(), new Map())));
});
test('extra encoded content cannot be ignored as a valid import', () => {
  const code = encodeWoWTalentLoadout(tree(), new Map(), new Map());
  assert.equal(decodeWoWTalentLoadout(tree(), code + 'AA'), null);
});
test('point budgets come from the source level progression, not a sample build', () => {
  assert.deepEqual(talentPointBudgets({ ...tree(), pointBudgets: { class: 31, spec: 30, hero: 10 } }), { class: 31, spec: 30, hero: 10 });
});
