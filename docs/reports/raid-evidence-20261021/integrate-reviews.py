"""Build the small server-only editorial projection; never modifies journal publication."""
import hashlib,json,pathlib,re,shutil,urllib.parse
root=pathlib.Path.cwd();data=root/'apps/web/data/wow/raid-reviews'
slugs=['the-voidspire','the-dreamrift','march-on-queldanas','venomous-abyss','sporefall']
def sources(rows):
 return [({'title':urllib.parse.urlparse(x).netloc,'url':x} if isinstance(x,str) else {'title':x['title'],'url':x['url']}) for x in rows]
reviews=[]
for slug in slugs:
 p=data/f'{slug}.json'
 if not p.exists():continue
 d=json.loads(p.read_text());r={k:d[k] for k in ['raidSlug','reviewedAt','summaryRu','summaryEn']};r['sources']=sources(d['sources']);r['bosses']=[]
 for b in d['bosses']:
  n={k:b[k] for k in ['slug','summaryRu','summaryEn','tipsRu','tipsEn']};n['sources']=sources(b.get('sources',d['sources']));r['bosses'].append(n)
 reviews.append(r)
(data/'published-reviews.json').write_text(json.dumps(reviews,ensure_ascii=False,indent=2)+'\n')
identities=json.loads((data/'spell-identities.json').read_text());rows={x['spellId']:x for x in identities['abilities']}
# Additional Dreamrift mechanics have exact official icon hashes and bilingual names.
p=data/'the-dreamrift.json'
if p.exists():
 d=json.loads(p.read_text())
 for x in d['iconBindings']:
  content=pathlib.Path(x['localTmpPath']).read_bytes();assert hashlib.sha256(content).hexdigest()==x['sha256']
  target=f"/assets/wow/raids/reviewed-spells/{x['spellId']}.jpg";(root/'apps/web/public'/target.lstrip('/')).write_bytes(content)
  rows[x['spellId']]={'encounterId':2795,'spellId':x['spellId'],'nameEn':x['nameEn'],'nameRu':x['nameRu'],'iconName':x['iconName'],'iconUrl':target,'iconSourceUrl':x['iconSourceUrl'],'sourceUrlEn':x['sourceUrl'],'sourceUrlRu':x['sourceUrl'].replace('wowhead.com/','wowhead.com/ru/'),'reviewedAt':d['reviewedAt'],'iconSha256':x['sha256'],'existingIconMatched':x['spellId'] not in d['iconAudit']['missingLocalIcons'],'verified':True}

for x in rows.values():x.setdefault('raidSlug','');x.setdefault('bossSlug','')
identities['abilities']=sorted(rows.values(),key=lambda x:(x['encounterId'] or 0,x['spellId']));(data/'spell-identities.json').write_text(json.dumps(identities,ensure_ascii=False,indent=2)+'\n')
# All 41 Voidspire cards get their real, verified spell artwork; no generic glyphs.
p=data/'the-voidspire.json'
if p.exists():
 d=json.loads(p.read_text());p=root/'apps/web/components/wow/raid/voidspireMechanicGuide.ts';s=p.read_text();bindings={x['mechanicId']:x for x in d['iconBindings']};manifest={x['spellId']:x for x in json.loads(pathlib.Path('/tmp/voidspire-icon-manifest.json').read_text())}
 destination=root/'apps/web/public/assets/wow/raids/reviewed-mechanics';destination.mkdir(exist_ok=True)
 for x in bindings.values():
  m=manifest[x['spellId']];src=pathlib.Path(m['assetPath']);assert hashlib.sha256(src.read_bytes()).hexdigest()==m['sha256'];shutil.copyfile(src,destination/f"{x['spellId']}.jpg")
 def bind(m):
  block=m.group(0);x=bindings.get(m.group(1))
  if not x:return block
  block=re.sub(r'\n        spell: spell\(\d+\),','',block)
  return block[:-len('      },')]+f"        spell: spell({x['spellId']}),\n      }},"
 s=re.sub(r'      \{\n        id: "([^"]+)",[\s\S]*?      \},',bind,s)
 s=s.replace('/assets/wow/raids/midnight/spells/${id}.jpg','/assets/wow/raids/reviewed-mechanics/${id}.jpg');s=s.replace('checkedAt: "2026-09-14"','checkedAt: "2026-10-21"');p.write_text(s)
print(f'Projected {len(reviews)} raids, {sum(len(x["bosses"]) for x in reviews)} bosses; {len(rows)} verified spell identities')
