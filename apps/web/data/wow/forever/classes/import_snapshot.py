"""Rebuild the scoped class comparison snapshot from captured public game-data exports.
Usage: python3 import_snapshot.py /path/to/CLASSES/research
No network, no mutations outside this directory. Source hashes accompany the output.
"""
import collections
import hashlib
import json
import pathlib
import re
import sys

source = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).parent
read = lambda name: json.loads((source / name).read_text())
classes = read('foreverdb-classes.json')
ru = read('foreverdb-ru-classes.json')
ru_names = read('foreverdb-ru-spells.json')
meta = read('foreverdb-datamine.json')
legacy_export = read('data.json')
classic = legacy_export['talents']
spells, ru_spells = {}, {}
for i in range(64):
    spells.update(read(f'spells/{i}.json'))
    ru_spells.update(read(f'spells-ru/{i}.json'))

def text(value):
    return re.sub(r'<[^>]+>', '', value or '').strip()

def comparison_text(value):
    value = text(value).casefold()
    value = re.sub(r'\brage points?\b', 'rage', value)
    value = re.sub(r'(?<!\d)[.,;:]|[.,;:](?!\d)', '', value)
    return re.sub(r'\s+', ' ', value).strip()

def localized(en, localized=None):
    return {'en': text(en), 'ru': text(localized) or text(en)}

def russian_name(id, fallback):
    v = ru_names.get(str(id), {})
    return v.get('n', fallback) if isinstance(v, dict) else v or fallback

def spell_rank(id, rank, current=None, current_ru=None):
    s = spells[str(id)]
    r = ru_spells.get(str(id), {})
    result = {'spellId': id, 'rank': rank, 'after': localized(current if current is not None else s.get('d'), current_ru if current_ru is not None else r.get('d'))}
    if s.get('old') and comparison_text(s['old']) != comparison_text(s.get('d')):
        result['before'] = localized(s['old'])
        result['baseline'] = 'classic-69722'
    if 'osp' in s and 'sp' in s and s['osp'] != s['sp']:
        result['coefficient'] = {'before': s['osp'], 'after': s['sp']}
    return result

name_locales = collections.defaultdict(set)
for sid, spell in spells.items():
    value = russian_name(int(sid), spell['n'])
    if value != spell['n']: name_locales[spell['n']].add(value)
def name_ru(name):
    values = name_locales.get(name, set())
    return next(iter(values)) if len(values) == 1 else None
records = []
inventory = {}
for c in classes:
    slug = c['n'].lower()
    cr = ru[str(c['id'])]
    old = {n['name']: n for t in classic[c['n']]['trees'] for n in t['talents']}
    current_names = {n['n'] for t in c['trees'] for n in t['talents']}
    count = {'sourceTalents': len(current_names), 'sourceAbilities': len(c['abilities']), 'excludedSodAbilities': 0, 'unchangedAbilities': 0, 'unchangedTalents': 0, 'missingSpells': []}
    for tree in c['trees']:
        tn = localized(tree['n'], cr['trees'].get(str(tree['id']), {}).get('n'))
        for n in tree['talents']:
            before = old.get(n['n'], {}).get('classic', {})
            status = before.get('status')
            if status == 'same':
                # The old snapshot classification is not sufficient if current text changed.
                if n['d'][0] == old[n['n']]['desc'][0]:
                    count['unchangedTalents'] += 1
                    continue
                status = 'changed'
            if status == 'moved' and n['d'][0] != old[n['n']]['desc'][0]:
                status = 'changed'
            if status not in ['new', 'changed', 'moved']:
                # New client IDs alone do not establish new talent-tree membership.
                count.setdefault('unclassifiedTalents', []).append(n['n'])
                continue
            structural_change = any([before.get('row') != n['row'] + 1, before.get('col') != n['col'] + 1, before.get('tree') != tree['n'], before.get('max') != n['max']])
            if status != 'new' and comparison_text(before.get('text')) == comparison_text(n['d'][0]):
                if not structural_change:
                    count.setdefault('excludedUnresolvedTalentChanges', []).append(n['n'])
                    continue
                status = 'moved'
            nr = cr['talents'].get(str(n['id']), {})
            ranks = []
            for i, description in enumerate(n['d']):
                sid = n['ranks'][i]
                if str(sid) not in spells:
                    count['missingSpells'].append(sid)
                    continue
                rank = spell_rank(sid, i + 1, description, nr.get('d', [])[i] if i < len(nr.get('d', [])) else None)
                # Talent spell IDs may repeat across ranks; old in the spell table is not a per-rank baseline.
                rank.pop('before', None)
                rank.pop('baseline', None)
                rank.pop('coefficient', None)
                if i == 0 and before.get('text') and status != 'new' and comparison_text(before['text']) != comparison_text(description):
                    rank['before'] = localized(before['text'])
                    rank['baseline'] = 'classic-era-rank1'
                ranks.append(rank)
            records.append({'key': f'{slug}-talent-{n["id"]}', 'classSlug': slug, 'kind': 'talent', 'status': 'added' if status == 'new' else status, 'name': localized(n['n'], nr.get('n')), 'tree': tn, 'ranks': ranks, 'talentId': n['id'], 'icon': n['ic'], 'row': n['row'] + 1, 'column': n['col'] + 1, 'previousColumn': before.get('col'), 'previousTree': before.get('tree'), 'previousRow': before.get('row'), 'previousMaxRank': before.get('max')})
    for tree in classic[c['n']]['trees']:
        for n in tree.get('removed', []):
            if n['name'] in current_names:
                continue
            records.append({'key': f'{slug}-removed-{re.sub(r"[^a-z0-9]+", "-", n["name"].lower())}', 'classSlug': slug, 'kind': 'talent', 'status': 'removed', 'name': localized(n['name'], name_ru(n['name'])), 'tree': localized(tree['name'], next((cr['trees'][str(t['id'])]['n'] for t in c['trees'] if t['n'] == tree['name']), None)), 'ranks': [{'rank': 1, 'before': localized(n['text']), 'baseline': 'classic-era-rank1'}], 'previousMaxRank': n['max']})
    for a in c['abilities']:
        if a.get('src') == 'sod' or a.get('rune'):
            count['excludedSodAbilities'] += 1
            continue
        ranks = []
        known_classic = any(k.startswith(c['n'] + '|' + a['n'] + '|') and v.get('cs') in ['same', 'changed'] for k, v in legacy_export['spell_desc'].items())
        for n in a['ranks']:
            sid = n['id']
            if str(sid) not in spells:
                count['missingSpells'].append(sid)
                continue
            s = spells[str(sid)]
            if s.get('old') or ('osp' in s and 'sp' in s and s['osp'] != s['sp']) or a.get('new'):
                rank = spell_rank(sid, int(re.search(r'\d+', n['r']).group()) if re.search(r'\d+', n['r']) else 1)
                rank['level'] = n['lv']
                if rank.get('before') or rank.get('coefficient') or (a.get('new') and not known_classic):
                    ranks.append(rank)
        if not ranks:
            count['unchangedAbilities'] += 1
            continue
        known_classic = any(k.startswith(c['n'] + '|' + a['n'] + '|') and v.get('cs') in ['same', 'changed'] for k, v in legacy_export['spell_desc'].items())
        addition = bool(a.get('new')) and not known_classic and not any(r.get('before') or r.get('coefficient') for r in ranks)
        records.append({'key': f'{slug}-spellbook-{a["ranks"][0]["id"]}', 'classSlug': slug, 'kind': 'spellbook', 'status': 'added' if addition else 'changed', 'name': localized(a['n'], russian_name(a['ranks'][0]['id'], a['n'])), 'icon': spells[str(a['ranks'][0]['id'])].get('ic'), 'tree': localized(a['sl'], next((cr['trees'][str(t['id'])]['n'] for t in c['trees'] if t['n'] == a['sl']), {'Beast Training': 'Дрессировка', 'Feral Combat': 'Сила зверя', 'Elemental Combat': 'Стихии', 'Shadow Magic': 'Тьма'}.get(a['sl']))), 'ranks': ranks})
    count['imported'] = dict(collections.Counter(f'{r["kind"]}:{r["status"]}' for r in records if r['classSlug'] == slug))
    count['importedRankRows'] = sum(len(r['ranks']) for r in records if r['classSlug'] == slug)
    inventory[slug] = count

# Restrict links to records with native current IDs; deleted Classic nodes have no Forever fallback.
payload = {'edition': 'forever', 'build': meta['version'], 'spellBaselineBuild': meta['compare'], 'records': records}
trees = {c['n'].lower(): [{'id': t['id'], 'slug': re.sub(r'[^a-z0-9]+', '-', t['n'].lower()), 'name': localized(t['n'], ru[str(c['id'])]['trees'][str(t['id'])]['n'])} for t in c['trees']] for c in classes}
(out/'trees.json').write_text(json.dumps(trees, ensure_ascii=False, indent=2) + '\n')
(out / 'changes.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
sources = ['foreverdb-classes.json', 'foreverdb-datamine.json', 'foreverdb-ru-classes.json', 'foreverdb-ru-spells.json', 'data.json'] + [f'{folder}/{i}.json' for folder in ['spells', 'spells-ru'] for i in range(64)]
evidence = {'edition': 'forever', 'build': meta['version'], 'spellBaseline': meta['compare'], 'talentBaseline': {'edition': 'Classic Era', 'build': None, 'rank': 1, 'source': 'https://talentsforever.com/data.json', 'snapshot': '2026-11-04'}, 'sources': {f: hashlib.sha256((source/f).read_bytes()).hexdigest() for f in sources}, 'sourceUrls': ['https://foreverdb.net/data/classes.json', 'https://foreverdb.net/data/datamine.json', 'https://foreverdb.net/data/spells/{id%64}.json', 'https://foreverdb.net/data/l10n/ru/classes.json', 'https://foreverdb.net/data/l10n/ru/spells.json', 'https://foreverdb.net/data/l10n/ru/spells/{id%64}.json', 'https://talentsforever.com/data.json'], 'inventory': inventory, 'totalGroups': len(records), 'totalRankRows': sum(len(r['ranks']) for r in records), 'limitations': ['Community client extracts, not independently extracted Blizzard archives.', 'Classic talent membership and rank1 comparison are curated evidence from Nov4; exact Classic build unspecified. Never compare those to max rank.', 'Spell comparisons use client70862 vs69722; only exported old description and old coefficient are compared.', 'SoD/rune abilities excluded. Removed talent means absent from the current tree, never removed from the game.', 'Current talent numbers are exclusively70862; older Forever numbers and announced overlays never imported.', 'Removed spellbook inventory is not proven by current source and is excluded.', 'Identical talent rank1 descriptions without a changed tree/row/column/rank cap are excluded as unresolved differences; higher Classic ranks are not extrapolated.', 'RU Classic before tooltips unavailable and remain English. Some current RU strings fall back to English.', 'No throughput rankings or new class roles inferred.'], 'licenses': [{'source': 'Talents Forever', 'url': 'https://talentsforever.com', 'license': 'CC-BY-4.0', 'use': 'Classic talent comparison/membership only; current data replaced with native70862'}, {'source': 'ForeverDB', 'url': 'https://foreverdb.net/about', 'use': 'Client gameplay facts and localized game tooltips; no guides or application code'}]}
(out/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'groups':evidence['totalGroups'],'rankRows':evidence['totalRankRows'],'inventory':inventory},indent=2))
