"""Normalize a frozen ForeverDB snapshot; never merge Classic-only acquisition facts.
Usage: python3 import.py DATA/sources GUIDES/sources GUIDES/profession-facts.json
"""
import collections, hashlib, json, pathlib, sys, re
base, sources, facts = map(pathlib.Path, sys.argv[1:])
out = pathlib.Path(__file__).parent
load = lambda p: json.loads(p.read_text())
meta = load(base/'datamine.json')
assert meta['version'] == '1.60.1.70862'
index = load(base/'professions.json')
roster = {p['slug']:p for p in load(facts)['roster']}
ru = load(base/'search__ru.json')
ru_items = {x[0]:x[1] for x in ru['i']}
ru_spells = {x[0]:x[1] for x in ru['s']}
spells = {x[0] for x in load(base/'spells.json')}
items = {x['id']:x for x in load(base/'items.json')}
def obsolete(item):
 name=item.get('n','')
 return bool(re.search(r'\b(?:DNT|DND|UNUSED|OBSOLETE|NYI)\b|\((?:TEST|OLD)\)|\[(?:TEST|OLD)\]',name,re.I)
             or re.search(r'^OLD[A-Z]',name))

evidence = {'edition':'forever','build':meta['version'],'baseline':meta['compare'],'extracted':meta['extracted'],'professions':{},'sources':[]}
result = []
for prof in index['professions']:
 slug=prof['slug']; raw=load(sources/(slug+'.json')); excluded=[]; recipes=[]
 counts=collections.Counter()
 for r in raw['recipes']:
  reasons=[]
  if r.get('spec'): reasons += r['spec']
  if r.get('missing') or r['s'] not in spells: reasons.append('missing-client-spell')
  if r.get('req',0)>300 or r.get('rl',0)>60: reasons.append('above-cap')
  ids=[x[0] for x in r['r']]+([r['make'][0]] if r.get('make') else [])
  if any(i not in items for i in ids): reasons.append('missing-client-item')
  if any(items.get(i,{}).get('spec') or obsolete(items.get(i,{})) for i in ids): reasons.append('speculative-reagent-or-output')
  if reasons:
   excluded.append({'id':r['s'],'reasons':reasons});continue
  src=r['src']; trainers=src.get('fv',[])
  source_items=[i for i in src.get('items',[]) if i in items and not items[i].get('spec') and not obsolete(items[i])]
  counts['speculativeSourceItemsSuppressed'] += len(src.get('items',[]))-len(source_items)
  known_skill = r.get('req') if not r.get('reqC') else None
  counts['classicSkillSuppressed'] += bool(r.get('reqC'))
  counts['unconfirmedTrainerSuppressed'] += bool(src.get('trainer') and not trainers)
  counts['withoutKnownAcquisition'] += not (src.get('auto') or trainers or source_items)
  rec={'icon':r['ic'],'id':r['s'],'name':{'en':r['n'],'ru':ru_spells.get(r['s'],r['n'])},'requiredSkill':known_skill,'yellow':r.get('y'),'grey':r.get('g'),'reagents':[{'id':i,'quantity':q} for i,q in r['r']], 'output':{'id':r['make'][0],'quantity':r['make'][1],'quantityRange':r.get('mkR')} if r.get('make') else None,'auto':bool(src.get('auto')),'trainers':trainers,'sourceItems':source_items,'tools':r.get('tools',[]),'station':r.get('focus'),'campTier':r.get('tier'),'new':bool(r.get('new'))}
  recipes.append(rec)
 # Only observed Forever trainers; suppress inherited Classic location unless at=forever.
 trainers=[{'id':t['npc'],'name':t['n'],'faction':t.get('side',''),'zone':t.get('zone') if t.get('at')=='forever' else None,'x':t.get('x') if t.get('at')=='forever' else None,'y':t.get('y') if t.get('at')=='forever' else None} for t in raw['trainers'] if t.get('fv')]
 used={v['id'] for r in recipes for v in r['reagents']}|{r['output']['id'] for r in recipes if r['output']}|{i for r in recipes for i in r['sourceItems']}
 catalog={str(i):{'name':{'en':items[i]['n'],'ru':ru_items.get(i,items[i]['n'])},'quality':items[i]['q'],'icon':items[i]['ic']} for i in sorted(used)}
 result.append({'icon':prof['ic'],**roster[slug],'ranks':[{'name':r['rank'],'maxSkill':r['max']} for r in prof['ranks']],'recipes':recipes,'items':catalog,'trainers':trainers})
 evidence['professions'][slug]={'sourceTotal':len(raw['recipes']),'imported':len(recipes),'excluded':excluded,'trainerTotal':len(raw['trainers']),'trainersImported':len(trainers),'recipesLocalizedRu':sum(r['name']['ru']!=r['name']['en'] for r in recipes),'itemRelations':sum(len(r['reagents'])+len(r['sourceItems'])+bool(r['output']) for r in recipes),'knownSkill':sum(r['requiredSkill'] is not None for r in recipes),'sourceUnavailable':len(raw.get('unavailable',[])),**counts}
 for p in [sources/(slug+'.json')]: evidence['sources'].append({'url':'https://foreverdb.net/data/professions/'+slug+'.json','sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
for name in ['datamine.json','professions.json','items.json','spells.json','search__ru.json']:
 p=base/name;evidence['sources'].append({'url':'https://foreverdb.net/data/'+name.replace('__','/'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(out/'catalog.json').write_text(json.dumps({'edition':'forever','build':meta['version'],'professions':result},ensure_ascii=False,separators=(',',':'))+'\n')
(out/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
print('recipes',sum(x['sourceTotal'] for x in evidence['professions'].values()),'imported',sum(len(p['recipes']) for p in result))
