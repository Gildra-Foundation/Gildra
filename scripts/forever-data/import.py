#!/usr/bin/env python3
"""Normalize a pinned, locally downloaded ForeverDB snapshot. No production access.

Output is immutable gzip shards, a server-only search index and developer evidence.
Repeated imports from identical inputs are byte-identical (including gzip headers).
"""
import argparse
import collections
import gzip
import hashlib
import json
import pathlib
import re

def read(root, name):
    return json.loads((root / name.replace('/', '__')).read_text())

def obsolete_name(name):
    # "Old Habits" and "Test of Faith" are real quests, not debug markers.
    return bool(re.search(r'\b(?:DNT|DND|UNUSED|OBSOLETE|NYI)\b|\((?:TEST|OLD)\)|\[(?:TEST|OLD)\]',name,re.I)
                or re.match(r'^OLD(?=[A-Z])',name))

def normalize(root):
    meta = read(root, 'datamine.json')
    if not re.fullmatch(r'1\.60\.\d+\.\d+', meta['version']):
        raise ValueError('Not a verified Forever build family')
    build = meta['version']
    ru = read(root, 'search/ru.json')
    stat_labels=read(root,'stats.json');ru_ui=read(root,'l10n/ru/ui.json')['site']
    map_names={x['id']:x['n'] for x in read(root,'world.json')}
    ru_spells={}
    for shard in range(64):ru_spells.update(read(root,f'l10n/ru/spells/{shard}.json'))
    names = {kind: {int(x[0]): x[1] for x in ru.get(key, []) if x[1]} for kind, key in [('item','i'),('spell','s'),('quest','q')]}
    rows = {}; totals = collections.Counter(); excluded = collections.Counter()
    def add(kind, ident, name, icon=None, **kw):
        totals[kind] += 1
        if not name or obsolete_name(name):
            excluded[kind] += 1; return None
        key = (kind, int(ident))
        if key in rows: raise ValueError(f'Duplicate identity {key}')
        translated = names.get('spell' if kind == 'recipe' else kind, {}).get(int(ident))
        record = dict(edition='forever', build=build, type=kind, id=int(ident), name={'en':name}, facts={}, relations=[], **{k:v for k,v in kw.items() if v is not None})
        if translated and translated != name and not re.search(r'\b(?:Quest|Spell|Item|NPC)\s*#\d+',translated,re.I): record['name']['ru'] = translated
        if icon: record['icon'] = int(icon)
        rows[key] = record
        return record
    def rel(r, kind, ident, edge, quantity=None, quantity_range=None):
        if r and isinstance(ident, int) and ident > 0:
            x = dict(type=kind, id=ident, kind=edge)
            if quantity is not None: x['quantity'] = quantity
            if quantity_range: x['quantityRange'] = quantity_range
            if x not in r['relations']: r['relations'].append(x)
    items = read(root, 'items.json')
    if len(items) != meta['counts']['items']: raise ValueError('Incomplete item snapshot')
    for x in items:
        if x.get('spec'):
            totals['item']+=1;excluded['item']+=1;continue
        r = add('item', x['id'], x['n'], x.get('ic'), level=x.get('il'), requiredLevel=x.get('rl'), quality=x.get('q'), category=str(x.get('c','')))
        if not r: continue
        r['facts'] = {k:x[v] for k,v in [('armor','ar'),('sell','sell'),('speed','spd')] if isinstance(x.get(v), (int,float))}
        if x.get('dmg'):r['facts']['damage']=f"{x['dmg'][0]}–{x['dmg'][1]}"
        r['slotId']=x.get('inv',0);r['attributes']=[]
        for stat,value in x.get('st',[]):
            label=stat_labels.get(str(stat))
            if not label:continue
            name={'en':label};ru_label=ru_ui.get('stats',{}).get(str(stat),{}).get('short')
            if ru_label:name['ru']=ru_label
            r['attributes'].append({'name':name,'value':value})
        for entry in x.get('sp',[]):
            if len(entry)>1: rel(r,'spell',entry[1],'effect')
            if len(entry)>2 and isinstance(entry[2],str) and entry[2]:r.setdefault('effects',[]).append(entry[2])
    spells = {}
    for shard in range(64):
        for key, x in read(root, f'spells/{shard}.json').items():
            if int(key) % 64 != shard or str(x['id']) != key or key in spells: raise ValueError('Corrupt spell shard')
            spells[key] = x
    if len(spells) != meta['counts']['spells']: raise ValueError('Incomplete spell snapshot')
    for x in spells.values():
        r = add('spell',x['id'],x['n'],x.get('ic'), requiredLevel=x.get('lv'),category=str(x.get('cl','')))
        if not r: continue
        if x.get('d'):
            r['description'] = {'en':x['d']}
            localized=ru_spells.get(str(x['id']),{}).get('d')
            if localized:r['description']['ru']=localized
        r['facts'] = {k:x[v] for k,v in [('rank','r'),('school','sc'),('castTime','ct'),('duration','du')] if isinstance(x.get(v),(str,int,float)) and x[v] != ''}
        if x.get('rg'):r['facts']['range']=f"{x['rg'][0]}–{x['rg'][1]}"
        if isinstance(x.get('cd'),(int,float)):r['facts']['cooldown']=x['cd']
        costs=[f'{entry[0]} {entry[1]}' for entry in x.get('co',[]) if len(entry)>2 and entry[2]==0]
        if costs:r['facts']['cost']=' · '.join(costs)
    recipe_ids=set()
    for p in read(root,'professions.json')['professions']:
        recipes = read(root,f"professions/{p['slug']}.json")['recipes']
        if len(recipes) != p['count']: raise ValueError('Incomplete profession '+p['slug'])
        for x in recipes:
            recipe_ids.add(x['s'])
            if x.get('spec') or x.get('missing') or ('spell',x['s']) not in rows or (x.get('make') and ('item',x['make'][0]) not in rows) or any(('item',ident) not in rows for ident,_ in x.get('r',[])) or x.get('req',0)>300 or x.get('rl',0)>60:
                continue
            r = rows.get(('recipe',x['s']))
            if r:
                if p['slug'] not in r['categories']: r['categories'].append(p['slug'])
                continue
            r = add('recipe',x['s'],x['n'],x.get('ic'),category=p['slug'],categories=[p['slug']])
            if not r: continue
            r['facts'] = {k:x[v] for k,v in [('skill','req'),('yellow','y'),('grey','g')] if isinstance(x.get(v),int)}
            if x.get('reqC'):r['facts'].pop('skill',None)
            rel(r,'spell',x['s'],'ability')
            if x.get('make'): rel(r,'item',x['make'][0],'creates',x['make'][1],x.get('mkR'))
            for ident,qty in x.get('r',[]): rel(r,'item',ident,'reagent',qty)
            for ident in x.get('src',{}).get('items',[]): rel(r,'item',ident,'learnedFrom')
    quests={}
    for shard in range(64):
        for key, quest in read(root,f'questguides/{shard}.json').items():
            if int(key) % 64 != shard or str(quest['id']) != key or key in quests: raise ValueError('Corrupt quest shard')
            quests[key] = quest
    if len(quests) != len(read(root,'questguides/index.json')): raise ValueError('Incomplete quest snapshot')
    npcs={}; npc_candidates=set()
    def npc(n, ident):
        npc_candidates.add(ident)
        if ident not in npcs: npcs[ident]=add('npc',ident,n['n'])
        r=npcs[ident]
        if not r:return r
        positions=[]
        if isinstance(n.get('at'),list):positions=[a for a in n['at'] if a.get('src')=='forever']
        elif n.get('at')=='forever':positions=[n]
        if isinstance(n.get('seen'),dict):positions+=n['seen'].get('at',[])
        for point in positions:
            if point.get('m') in map_names and isinstance(point.get('x'),(int,float)) and isinstance(point.get('y'),(int,float)):
                position=f"{map_names[point['m']]} · {point['x']:g}, {point['y']:g}"
                r.setdefault('locations',[])
                if position not in r['locations']:r['locations'].append(position)
        if n.get('src')=='forever' and isinstance(n.get('lv'),list) and n['lv']:r['level']=n['lv'][0]
        return r
    for x in quests.values():
        if not x.get('known') or x.get('src') != 'forever':
            totals['quest'] += 1; excluded['quest'] += 1; continue
        r=add('quest',x['id'],x['t'])
        if not r: continue
        provenance=x.get('sources',{})
        if provenance.get('lv') == 'forever': r['level']=x.get('lv')
        if provenance.get('min') == 'forever': r['requiredLevel']=x.get('min')
        if provenance.get('obj') == 'forever' and x.get('obj'): r['description']={'en':x['obj']}
        if provenance.get('money') == 'forever' and isinstance(x.get('money'),int): r['facts']['rewardMoney']=x['money']
        for role in ['from','to']:
            for n in x.get(role,[]):
                if n.get('kind')!='npc' or not (n.get('src')=='forever' or any(a.get('src')=='forever' for a in n.get('at',[]))): continue
                npc(n,n['id'])
                if n.get('src')=='forever':rel(r,'npc',n['id'],'startsAt' if role=='from' else 'endsAt')
        for objective in x.get('objectives',[]):
            for n in objective.get('entities',[]):
                if n.get('kind')=='npc' and (n.get('src')=='forever' or any(a.get('src')=='forever' for a in n.get('at',[]))):npc(n,n['id'])
        if provenance.get('reward') == 'forever':
            for key in ['reward','choice']:
                for it in x.get(key,[]): rel(r,'item',it['id'],'reward' if key=='reward' else 'choice',it.get('count',1))
        for edge in ['previous','next']:
            for q in x.get(edge,[]):
                if q.get('src')=='forever':rel(r,'quest',q['id'],edge)
    for ident,n in read(root,'vendors.json')['vendors'].items():
        if not (n.get('fv') or n.get('met')): continue
        r=npc(n,int(ident))
        if n.get('fv'):
            for item,stock in n.get('sells',{}).items():
                if not stock.get('cl'):rel(r,'item',int(item),'sells')
    trainers=read(root,'trainers.json')
    for n in trainers['masters']+[x for group in trainers['classTrainers'].values() for x in group]:
        if n.get('fv'):npc(n,n['npc'])
    for n in read(root,'rares.json')['rares']:
        if not (n.get('seen') or n.get('rankSrc')=='forever' or n.get('lvSrc')=='forever'):continue
        r=npc(n,n['id'])
        if r and n.get('lvSrc')=='forever' and n.get('lv'):r['level']=n['lv'][0]
        for item in n.get('loot',[]):
            if item.get('src')=='forever':rel(r,'item',item['id'],'drops')
    # Missing targets are evidence, never links to an unrelated edition.
    unresolved = collections.Counter()
    for r in list(rows.values()):
        valid=[]
        for e in r['relations']:
            target=rows.get((e['type'],e['id']))
            if target:
                valid.append(e)
            else: unresolved[e['type']] += 1
        r['relations']=valid
    for r in list(rows.values()):
        for e in list(r['relations']):
            if e['kind'].startswith('reverse:'): continue
            rel(rows[(e['type'],e['id'])],r['type'],r['id'],'reverse:'+e['kind'],e.get('quantity'),e.get('quantityRange'))
    totals['recipe']=len(recipe_ids)
    inventory={k:dict(sourceTotal=totals[k],imported=sum(r['type']==k for r in rows.values()),excluded=totals[k]-sum(r['type']==k for r in rows.values()),ruNames=sum(r['type']==k and 'ru' in r['name'] for r in rows.values()),ruDescriptions=sum(r['type']==k and 'ru' in r.get('description',{}) for r in rows.values()),withRelations=sum(r['type']==k and bool(r['relations']) for r in rows.values()),relations=sum(len(r['relations']) for r in rows.values() if r['type']==k)) for k in ['item','spell','npc','quest','recipe']}
    return rows, dict(edition='forever',build=build,baseline=meta['compare'],inventory=inventory,unresolvedRelations=dict(unresolved))

def write_snapshot(root, output):
    rows, evidence=normalize(root)
    output.mkdir(parents=True,exist_ok=True)
    hashes={}
    def put(name,data):
        raw=json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
        packed=gzip.compress(raw,mtime=0)
        dest=output/name;dest.parent.mkdir(parents=True,exist_ok=True)
        temp=dest.with_suffix('.tmp');temp.write_bytes(packed);temp.replace(dest)
        hashes[name]=hashlib.sha256(packed).hexdigest()
    for kind in ['item','spell','npc','quest','recipe']:
        selected=sorted((r for r in rows.values() if r['type']==kind),key=lambda r:r['id'])
        put(f'{kind}/index.json.gz',[{k:v for k,v in r.items() if k not in ['facts','relations','description','attributes','locations','effects']} for r in selected])
        for shard in range(64):put(f'{kind}/{shard}.json.gz',{str(r['id']):r for r in selected if r['id']%64==shard})
    evidence['files']=hashes
    evidence['sourceHashes']={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(root.glob('*.json'))}
    (output/'manifest.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
    return evidence

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=pathlib.Path,required=True);parser.add_argument('--output',type=pathlib.Path,required=True)
    args=parser.parse_args();print(json.dumps(write_snapshot(args.source,args.output)['inventory'],indent=2))
