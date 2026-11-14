#!/usr/bin/env python3
"""Read-only, bounded DB2 snapshot. Uses existing container credentials without printing them.
Run from repository root. No imports, migrations or service changes.
"""
import hashlib, json, pathlib, subprocess, re, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / 'apps/web/data/wow/auction-enhancements'
BUILD = '12.1.0.69587'
REVISION = '18428cd3902412abc8ee274d19567d603e674e66'
MAPPING_BUILD = '12.1.5.70783'

def query(sql):
    command = ['docker', 'exec', '-i', 'gildra-postgres-1', 'sh', '-c',
               'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"']
    result = subprocess.run(command, input="BEGIN READ ONLY; SET LOCAL statement_timeout='30s';\n" + sql + ';\nCOMMIT;', text=True, capture_output=True, check=True)
    return [json.loads(line) for line in result.stdout.splitlines() if line]

def rows(table, condition='true', build=BUILD):
    return query("SELECT json_build_object('table',r.table_name,'id',r.row_id,'artifactId',r.source_artifact_id,'payload',r.payload) FROM catalog_db2_rows r JOIN game_builds b ON b.id=r.build_id WHERE b.version='" + build + "' AND b.product_id=1 AND r.locale='en_US' AND r.table_name='" + table + "' AND (" + condition + ') ORDER BY r.row_id')

def compatible_payload(table, engine, source):
    # The later schema adds a squish-era field. Accept only its explicit neutral zero;
    # every existing field, including names, conditions, levels and stats must be identical.
    source = dict(source)
    if table == 'SpellItemEnchantment' and 'ItemSquishEraID' not in engine and source.get('ItemSquishEraID') == '0':
        source.pop('ItemSquishEraID')
    return engine == source

def semantic_chain_rows(data, item_id):
    """Full item-link/effect/spell closure, including non-applying extra effects."""
    keyed = {(r['table'], r['id']): r for r in data}
    if len(keyed) != len(data):
        return None
    links = [r for r in data if r['table'] == 'ItemXItemEffect' and int(r['payload']['ItemID']) == item_id]
    effects = [keyed.get(('ItemEffect', int(r['payload']['ItemEffectID']))) for r in links]
    if any(r is None for r in effects):
        return None
    spell_ids = {r['payload']['SpellID'] for r in effects}
    spell_rows = [r for r in data if r['table'] in ('SpellEffect', 'SpellEquippedItems') and r['payload']['SpellID'] in spell_ids]
    # Different links may share an ItemEffect; sets must compare semantic rows once.
    closure = {(r['table'], r['id']): r for r in [*links, *effects, *spell_rows]}
    return [closure[k] for k in sorted(closure)]

def compatible_rowsets(engine_rows, source_rows):
    if engine_rows is None or source_rows is None:
        return False
    old = {(r['table'], r['id']): r for r in engine_rows}
    new = {(r['table'], r['id']): r for r in source_rows}
    return (len(old) == len(engine_rows) and len(new) == len(source_rows)
            and old.keys() == new.keys()
            and all(compatible_payload(k[0], old[k]['payload'], new[k]['payload']) for k in old))

def compatible_item_chain(engine_rows, source_rows, item_id):
    return compatible_rowsets(semantic_chain_rows(engine_rows, item_id), semantic_chain_rows(source_rows, item_id))

def ids(values):
    return ','.join(str(v) for v in sorted(set(int(v) for v in values))) or '0'

def main():
    native_url = f'https://raw.githubusercontent.com/simulationcraft/simc/{REVISION}/engine/dbc/generated/permanent_enchant.inc'
    native_bytes = urllib.request.urlopen(native_url, timeout=30).read()
    native_text = native_bytes.decode()
    if 'wow build ' + BUILD not in native_text: raise ValueError('native build mismatch')
    native_rules = [dict(zip(['enchantId','rank','itemClassId','inventoryMask','subclassMask'], [int(v,0) for v in match])) for match in re.findall(r'\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(0x[0-9a-f]+),\s*(0x[0-9a-f]+),',native_text)]
    candidates = set()
    # Bounded reverse ID traversal for uncapped wrist rules absent from current profession recipes.
    wrist_ids=[r['enchantId'] for r in native_rules if r['itemClassId']==4 and r['inventoryMask'] & (1 << 9)]
    wrist_enchants=rows('SpellItemEnchantment','r.row_id IN ('+ids(wrist_ids)+") AND r.payload->>'ItemLevelMax'='0'")
    wrist_spells=rows('SpellEffect',"r.payload->>'Effect'='53' AND (r.payload->>'EffectMiscValue_0')::bigint IN ("+ids(r['id'] for r in wrist_enchants)+')')
    wrist_effects=rows('ItemEffect',"(r.payload->>'SpellID')::bigint IN ("+ids(r['payload']['SpellID'] for r in wrist_spells)+')')
    wrist_links=rows('ItemXItemEffect',"(r.payload->>'ItemEffectID')::bigint IN ("+ids(r['id'] for r in wrist_effects)+')')
    candidates.update(int(r['payload']['ItemID']) for r in wrist_links)
    for profession in ['jewelcrafting', 'enchanting', 'leatherworking', 'tailoring', 'blacksmithing', 'engineering']:
        doc = json.loads((ROOT / f'apps/web/data/wow/professions/{profession}.json').read_text())
        for recipe in doc['recipes']:
            out = recipe.get('output', {})
            candidates.update(out.get('ranks', []))
            if out.get('item'): candidates.add(out['item'])
    seed_links = rows('ItemXItemEffect', "(r.payload->>'ItemID')::bigint IN (" + ids(candidates) + ')')
    seed_effects = rows('ItemEffect', 'r.row_id IN (' + ids(r['payload']['ItemEffectID'] for r in seed_links) + ')')
    seed_spells = rows('SpellEffect', "(r.payload->>'SpellID')::bigint IN (" + ids(r['payload']['SpellID'] for r in seed_effects) + ')')
    crafting_ids = [r['payload']['EffectMiscValue_0'] for r in seed_spells if r['payload'].get('Effect') == '301']
    ranked = rows('CraftingDataEnchantQuality', "(r.payload->>'CraftingDataID')::bigint IN (" + ids(crafting_ids) + ')', MAPPING_BUILD)
    candidates.update(int(r['payload']['ItemID']) for r in ranked)
    data = []
    def take(table, condition='true'):
        found = rows(table, condition); data.extend(found); return [r['payload'] for r in found]
    sparse = take('ItemSparse', 'r.row_id IN (' + ids(candidates) + ')')
    take('Item', 'r.row_id IN (' + ids(candidates) + ')')
    links = take('ItemXItemEffect', "(r.payload->>'ItemID')::bigint IN (" + ids(candidates) + ')')
    effects = take('ItemEffect', 'r.row_id IN (' + ids(r['ItemEffectID'] for r in links) + ')')
    spells = [r['SpellID'] for r in effects]
    se = take('SpellEffect', "(r.payload->>'SpellID')::bigint IN (" + ids(spells) + ')')
    take('SpellEquippedItems', "(r.payload->>'SpellID')::bigint IN (" + ids(spells) + ')')
    gems = take('GemProperties', 'r.row_id IN (' + ids(r.get('Gem_properties', 0) for r in sparse) + ')')
    enchantids = [r['Enchant_ID'] for r in gems] + [r['EffectMiscValue_0'] for r in se if r.get('Effect') == '53']
    take('SpellItemEnchantment', 'r.row_id IN (' + ids(enchantids + [r['enchantId'] for r in native_rules] + [r['payload']['SpellItemEnchantmentID'] for r in ranked]) + ')')
    take('ItemLimitCategory', 'r.row_id IN (' + ids(r.get('LimitCategory', 0) for r in sparse) + ')')
    # Capture quality links if they exist; empty tables remain an explicit coverage gap.
    crafting = [r['EffectMiscValue_0'] for r in se if r.get('Effect') in ('301', '288')]
    take('CraftingData', 'r.row_id IN (' + ids(crafting) + ')')
    for table in ['CraftingDataEnchantQuality', 'CraftingDataItemQuality']:
        take(table, "(r.payload->>'CraftingDataID')::bigint IN (" + ids(crafting) + ')')
    # Later authoritative mappings are NOT relabelled as historical rows. Prove that their
    # complete application chain has identical payloads in the pinned engine build.
    by_key = {(r['table'],r['id']):r for r in data}
    proof_tables = ['Item','ItemSparse','ItemXItemEffect','ItemEffect','SpellEffect','SpellEquippedItems','CraftingData','SpellItemEnchantment']
    # Query relationships by their semantic parent, NOT the old row IDs. This discovers
    # newly added links, spells, restrictions and secondary effects in the later build.
    current_links = rows('ItemXItemEffect', "(r.payload->>'ItemID')::bigint IN (" + ids(candidates) + ')', MAPPING_BUILD)
    current_effects = rows('ItemEffect', 'r.row_id IN (' + ids(r['payload']['ItemEffectID'] for r in current_links) + ')', MAPPING_BUILD)
    current_spells = [r['payload']['SpellID'] for r in current_effects]
    current_relations = {
        'ItemXItemEffect': current_links,
        'ItemEffect': current_effects,
        'SpellEffect': rows('SpellEffect', "(r.payload->>'SpellID')::bigint IN (" + ids(current_spells) + ')', MAPPING_BUILD),
        'SpellEquippedItems': rows('SpellEquippedItems', "(r.payload->>'SpellID')::bigint IN (" + ids(current_spells) + ')', MAPPING_BUILD),
    }
    current_data = []
    parity = {}
    for name in proof_tables:
        original = [r for r in data if r['table']==name]
        current = current_relations[name] if name in current_relations else rows(name, 'r.row_id IN (' + ids(r['id'] for r in original) + ')', MAPPING_BUILD)
        current_data.extend(current)
        for r in current:
            old = by_key.get((name,r['id']))
            if old and compatible_payload(name,old['payload'],r['payload']):
                parity[(name,r['id'])] = {'table':name,'id':r['id'],'sourceArtifactId':r['artifactId'],
                    'sourcePayloadSha256':hashlib.sha256(json.dumps(r['payload'],sort_keys=True,separators=(',',':')).encode()).hexdigest()}
    proofs, rejected = [], []
    for q in ranked:
        p=q['payload']; item_id=int(p['ItemID']); enchant_id=int(p['SpellItemEnchantmentID']); crafting_id=int(p['CraftingDataID'])
        keys=[('Item',item_id),('ItemSparse',item_id),('CraftingData',crafting_id),('SpellItemEnchantment',enchant_id)]
        links_for_item=[r for r in data if r['table']=='ItemXItemEffect' and int(r['payload']['ItemID'])==item_id]
        matching=[]
        for link in links_for_item:
            effect=by_key.get(('ItemEffect',int(link['payload']['ItemEffectID'])))
            if not effect: continue
            spell=effect['payload']['SpellID']
            spell_rows=[r for r in data if r['table']=='SpellEffect' and r['payload']['SpellID']==spell]
            equipped=[r for r in data if r['table']=='SpellEquippedItems' and r['payload']['SpellID']==spell]
            applying=[r for r in spell_rows if r['payload']['Effect']=='301' and int(r['payload']['EffectMiscValue_0'])==crafting_id]
            if len(applying)==1 and len(equipped)==1:
                matching.append([link,effect,*spell_rows,*equipped])
        if len(matching)==1: keys += [(r['table'],r['id']) for r in matching[0]]
        engine_chain = semantic_chain_rows(data, item_id)
        source_chain = semantic_chain_rows(current_data, item_id)
        chain_equal = compatible_rowsets(engine_chain, source_chain)
        if chain_equal:
            keys = sorted(set(keys) | {(r['table'], r['id']) for r in engine_chain})
        quality_matches = by_key.get(('Item',item_id),{}).get('payload',{}).get('CraftingQualityID') == p['Rank']
        if not chain_equal or len(matching)!=1 or not quality_matches or any(k not in parity for k in keys):
            rejected.append({'itemId':item_id,'reason':'cross_build_chain_not_identical'}); continue
        proofs.append({'itemId':item_id,'qualityRowId':q['id'],'sourceBuild':MAPPING_BUILD,'engineBuild':BUILD,
            'semanticRowsetVersion': 1,
            'semanticRowsets': [{'table': name, 'rowIds': sorted(r['id'] for r in engine_chain if r['table'] == name)} for name in current_relations],
            'rows':[parity[k] for k in keys]})
    # Raw rows retain artifact IDs; no connection strings or auth material enter this file.
    payload = {'schemaVersion': 2, 'build': BUILD, 'simcRevision': REVISION, 'nativeRulesSource': {'url':native_url,'sha256':hashlib.sha256(native_bytes).hexdigest()}, 'nativeRules':native_rules, 'candidateItemIds': sorted(candidates), 'rows': data,
        'rankedMappingSourceBuild':MAPPING_BUILD,'rankedMappings':ranked,'rankedCompatibilityProofs':proofs,'rankedRejected':rejected}
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    payload['revision'] = hashlib.sha256(canonical.encode()).hexdigest()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'catalog.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(data)} DB2 rows; {len(candidates)} candidate items; revision {payload["revision"]}')

if __name__ == '__main__': main()
