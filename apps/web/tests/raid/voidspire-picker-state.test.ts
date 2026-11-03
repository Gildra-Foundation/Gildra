import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { guideClassForSpec, guideSpecForClass, voidspireClasses } from '../../components/wow/raid/voidspirePickerState';
import { guideRole, guideSpecs } from '../../components/wow/raid/voidspireGuideCounters';

test('class choices cover forty specs with thirteen existing game class icons', () => {
  assert.equal(voidspireClasses.length, 13);
  assert.equal(guideSpecs.length, 40);
  for (const entry of voidspireClasses) {
    assert.ok(entry.icon.startsWith('/assets/classes/'));
    assert.ok(existsSync(new URL(`../../public${entry.icon}`, import.meta.url)));
    assert.ok(guideSpecs.some(spec => spec.classId === entry.id));
  }
  for (const spec of guideSpecs) {
    assert.equal(guideClassForSpec(spec.id), spec.classId);
    assert.equal(guideSpecForClass(spec.classId, spec.id), spec.id);
  }
});
test('changing class chooses a real spec and preserves the exact role whenever available', () => {
  for (const before of guideSpecs) for (const entry of voidspireClasses) {
    const next = guideSpecForClass(entry.id, before.id);
    assert.equal(guideClassForSpec(next), entry.id);
    const sameRoleAvailable = guideSpecs.some(spec => spec.classId === entry.id && guideRole(spec.id) === guideRole(before.id));
    if (sameRoleAvailable) assert.equal(guideRole(next), guideRole(before.id));
  }
});
test('whole raid, invalid state and first class selection remain deterministic', () => {
  assert.equal(guideClassForSpec(0), 0);
  assert.equal(guideClassForSpec(99999), 0);
  assert.equal(guideSpecForClass(0, 62), 0);
  assert.equal(guideSpecForClass(99999, 62), 0);
  for (const entry of voidspireClasses) assert.equal(guideSpecForClass(entry.id, 0), guideSpecs.find(spec => spec.classId === entry.id)!.id);
});
