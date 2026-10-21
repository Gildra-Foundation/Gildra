import json,hashlib,re
from pathlib import Path
root=Path(__file__).resolve().parents[3];folder=Path(__file__).parent
m=json.loads((root/'apps/web/data/wow/mythic-reviews/mdt.json').read_text())
urls={'ruby-life-pools':'IEtQSuWgA','altar-of-fangs':'qak6G3Uvs','murder-row':'mWO70E5hA','den-of-nalorakk':'b69_rKkRL','the-blinding-vale':'HLI3Wq7sA','voidscar-arena':'1s56kmJ_N','kings-rest':'U22_Bys16','temple-of-sethraliss':'1pqM1h0ez'}
summary=[]
for slug,d in m.items():
 r=json.loads((folder/'imports'/f'{slug}.json').read_text());nodes={n['id']:n for n in d['nodes']};seen=set();errors=[];pulls=[]
 name=next(Path('/tmp/gildra-mdt-source/Midnight').glob(d['source'].split('/')[-1]));index=int(re.search(r'local dungeonIndex = (\d+)',name.read_text())[1]);assert index==r['value']['currentDungeonIdx']
 for p in r['value']['pulls']:
  ids=[]
  for e,clones in p.items():
   if not e.isdigit():continue
   for c in clones:
    id=f'{e}:{c}'
    if id not in nodes:errors.append('missing clone '+id)
    elif id in seen:errors.append('duplicate clone '+id)
    else:ids.append(id)
    seen.add(id)
  pulls.append(ids)
 forces=sum(nodes[i]['forces'] for i in seen if i in nodes)
 d['route']={'url':'https://wago.io/'+urls[slug],'author':'Tactyks','name':r['text'],'checkedAt':'2026-10-21','importSha256':hashlib.sha256((folder/'imports'/f'{slug}.txt').read_bytes()).hexdigest(),'status':'dataset-matched' if not errors else 'incompatible','errors':errors,'notes':json.loads((root/'apps/web/data/wow/mythic-reviews/author-notes.json').read_text())[slug],'forces':forces,'pulls':pulls if not errors else []}
 summary.append({'slug':slug,'status':d['route']['status'],'pulls':len(pulls),'clones':len(seen),'forces':forces,'total':d['total'],'percent':round(forces/d['total']*100,4),'errors':errors})
(root/'apps/web/data/wow/mythic-reviews/mdt.json').write_text(json.dumps(m,separators=(',',':'))+'\n')
(folder/'import-validation.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
