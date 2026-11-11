import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { changeRank, decodeBuild, emptyBuild, encodeBuild, pointBudget, requirementsMet, spentPoints, validateBuild } from "../../lib/forever/talents/engine.ts";
import type { TalentDataset, TalentClass, TalentNode } from "../../lib/forever/talents/types.ts";

const data = JSON.parse(readFileSync(new URL("../../data/wow/forever/talents/trees.json", import.meta.url), "utf8")) as TalentDataset;
const allNodes = (cls: TalentClass) => cls.trees.flatMap(tree => tree.nodes);

test("all native icon references have pinned local copies with matching checksums", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../data/wow/forever/talents/icons.json",import.meta.url),"utf8")) as Array<{ id:number; sha256:string; bytes:number }>;
  const needed = new Set(data.classes.flatMap(cls=>[cls.iconFileId,...cls.trees.flatMap(tree=>[tree.iconFileId,...tree.nodes.map(node=>node.iconFileId)])]));
  assert.equal(needed.size,384); assert.equal(manifest.length,needed.size);
  for(const row of manifest) {
    assert.ok(needed.delete(row.id));
    const bytes=readFileSync(new URL(`../../public/assets/wow/forever/talents/icons/${row.id}.webp`,import.meta.url));
    assert.equal(bytes.length,row.bytes);assert.equal(bytes.subarray(8,12).toString(),"WEBP");
    assert.equal(createHash("sha256").update(bytes).digest("hex"),row.sha256);
  }
  assert.equal(needed.size,0);
});

test("full native Forever dataset: roster, geometry, localization, rank and relationship integrity", () => {
  assert.equal(data.edition, "forever");
  assert.equal(data.build, "1.60.1.70862");
  assert.deepEqual(data.classes.map(c => c.id).sort((a,b) => a-b), [1,2,3,4,5,7,8,9,11]);
  assert.equal(data.classes.flatMap(allNodes).length, 467);
  assert.equal(data.classes.flatMap(allNodes).reduce((sum,n) => sum+n.maxRanks,0),1297);
  const ids = new Set<number>();
  for (const cls of data.classes) {
    assert.equal(cls.trees.length,3);
    assert.equal(cls.maxPoints,51);
    for (const tree of cls.trees) {
      const spots = new Set<string>();
      for (const node of tree.nodes) {
        assert.ok(!ids.has(node.id)); ids.add(node.id);
        const spot = `${node.row}:${node.column}`;
        assert.ok(!spots.has(spot)); spots.add(spot);
        assert.ok(Number.isInteger(node.row) && node.row >= 0 && node.row <= 6);
        assert.ok(Number.isInteger(node.column) && node.column >= 0 && node.column <= 3);
        assert.ok(node.maxRanks >= 1 && node.maxRanks <= 5);
        assert.equal(node.rankSpellIds.length,node.maxRanks);
        assert.ok(node.rankSpellIds.every(id => Number.isInteger(id) && id>0));
        assert.equal(node.rankSpellIds[0],node.spellId);
        for (const lang of ["en","ru"] as const) {
          assert.ok(node.name[lang].trim());
          assert.equal(node.descriptions[lang].length,node.maxRanks, `${cls.slug}/${node.name.en}/${lang}`);
          assert.ok(node.descriptions[lang].every(text => text.trim() && !text.includes("?")));
        }
        for (const pre of node.prerequisites) {
          const parent=tree.nodes.find(n => n.id===pre.nodeId);
          assert.ok(parent,`${node.name.en} prerequisite`);
          assert.equal(pre.ranks,parent.maxRanks);
          assert.notEqual(pre.nodeId,node.id);
        }
        for (const id of node.gate.nodeIds ?? []) assert.ok(tree.nodes.some(n => n.id===id));
      }
    }
  }
});

test("every one of 467 talents has a legal full-rank witness within the level60 budget", () => {
  for (const cls of data.classes) for (const tree of cls.trees) for (const target of tree.nodes) {
    let build=emptyBuild();
    const needed=new Set<number>();
    function require(node: TalentNode) {
      if (needed.has(node.id)) return;
      needed.add(node.id);
      const alternatives=node.prerequisites.filter(p=>!p.required);
      for (const pre of [...node.prerequisites.filter(p=>p.required),...alternatives.slice(0,1)]) require(tree.nodes.find(n=>n.id===pre.nodeId)!);
    }
    require(target);
    for (let step=0;step<51 && (build.ranks[target.id]??0)<target.maxRanks;step++) {
      const candidates=[...tree.nodes].sort((a,b)=> Number(needed.has(b.id))-Number(needed.has(a.id)) || a.row-b.row || a.id-b.id);
      const next=candidates.map(n=>changeRank(cls,build,n.id,1)).find(Boolean);
      assert.ok(next,`${cls.slug}/${target.name.en} cannot progress`);
      build=next;
    }
    assert.equal(build.ranks[target.id],target.maxRanks,`${cls.slug}/${target.name.en}`);
    assert.equal(validateBuild(cls,build),null);
  }
});

test("native alternative dependencies and Priest eligible-node gates are preserved", () => {
  const hunter=data.classes.find(c=>c.slug==='hunter')!;
  const beast=hunter.trees[0], intimidation=beast.nodes.find(n=>n.name.en==='Intimidation')!;
  assert.equal(intimidation.prerequisites.length,2);
  assert.ok(intimidation.prerequisites.every(p=>!p.required));
  for (const accepted of intimidation.prerequisites) {
    const ranks=Object.fromEntries(beast.nodes.map(n=>[n.id,n.maxRanks]));
    for (const pre of intimidation.prerequisites) ranks[pre.nodeId]=pre===accepted?pre.ranks:0;
    assert.equal(requirementsMet(beast,intimidation,ranks),true,"either native prerequisite is sufficient");
  }
  const priest=data.classes.find(c=>c.slug==='priest')!;
  const discipline=priest.trees[0], agility=discipline.nodes.find(n=>n.name.en==='Mental Agility')!;
  assert.equal(agility.gate.nodeIds?.length,8);
  const excluded=discipline.nodes.filter(n=>!agility.gate.nodeIds!.includes(n.id));
  assert.equal(requirementsMet(discipline,agility,Object.fromEntries(excluded.map(n=>[n.id,n.maxRanks]))),false);
  const included=discipline.nodes.filter(n=>agility.gate.nodeIds!.includes(n.id));
  assert.equal(requirementsMet(discipline,agility,Object.fromEntries(included.map(n=>[n.id,n.maxRanks]))),true);
});

test("removing prerequisite or tier support is rejected without deleting dependent talents", () => {
  const cls=data.classes[0],tree=cls.trees[0];
  let build=emptyBuild();
  const charge=tree.nodes.find(n=>n.name.en==='Improved Charge')!;
  for(const node of tree.nodes.filter(n=>n.row===0)) {
    while(spentPoints(build.ranks)<5 && (build.ranks[node.id]??0)<node.maxRanks)build=changeRank(cls,build,node.id,1)!;
  }
  build=changeRank(cls,build,charge.id,1)!;
  const support=tree.nodes.find(n=>(build.ranks[n.id]??0)>0 && n.row===0)!;
  assert.equal(changeRank(cls,build,support.id,-1),null);
  assert.equal(build.ranks[charge.id],1);
});

test("levels, Talented legacy, forged and self-supporting builds fail closed", () => {
  for (let legacy=0;legacy<=5;legacy++) for(let level=1;level<=60;level++) assert.equal(pointBudget(level,legacy),Math.max(0,Math.min(51,level-9+legacy)));
  const cls=data.classes[0],node=cls.trees[0].nodes[0];
  assert.equal(validateBuild(cls,{...emptyBuild(),ranks:{99999999:1}}),'unknown-node');
  for(const rank of [-1,0.5,NaN,Infinity,6]) assert.equal(validateBuild(cls,{...emptyBuild(),ranks:{[node.id]:rank}}),'rank');
  assert.equal(validateBuild(cls,{...emptyBuild(),level:9,ranks:{[node.id]:1}}),'budget');
  assert.equal(validateBuild(cls,{...emptyBuild(),level:5,talented:5,ranks:{[node.id]:1}}),null);
  const capstone=cls.trees[0].nodes.find(n=>n.row===6)!;
  assert.equal(validateBuild(cls,{...emptyBuild(),ranks:{[capstone.id]:1}}),'requirements');
  const synthetic:TalentClass={...cls,trees:[{...cls.trees[0],nodes:[{...node,gate:{points:1,throughRow:0}}]}]};
  assert.equal(validateBuild(synthetic,{...emptyBuild(),ranks:{[node.id]:1}}),'requirements');
});

test("deterministic random edits preserve invariants, budget, share roundtrip and input immutability", () => {
  let seed=2377; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for (const cls of data.classes) {
    const nodes=allNodes(cls); let build=emptyBuild();
    for(let i=0;i<800;i++) {
      const before=JSON.stringify(build),node=nodes[Math.floor(random()*nodes.length)];
      const next=changeRank(cls,build,node.id,random()>.27?1:-1);
      assert.equal(JSON.stringify(build),before);
      if(next)build=next;
      assert.equal(validateBuild(cls,build),null);
      assert.ok(spentPoints(build.ranks)<=51);
      const decoded=decodeBuild(cls,data.snapshot,encodeBuild(cls,data.snapshot,build));
      assert.equal(decoded.error,null);assert.deepEqual(decoded.build,build);
    }
    const token=encodeBuild(cls,data.snapshot,build);
    assert.equal(decodeBuild(cls,'changed',token).error,'snapshot');
    assert.equal(decodeBuild({...cls,slug:'other'},data.snapshot,token).error,'class');
    for(const bad of ['x',token+'1',token+'.extra','1.'.repeat(150)])assert.ok(decodeBuild(cls,data.snapshot,bad).error);
  }
});
