"""Read-only verification of curated S1 spell identities and real Blizzard icon bytes.
Run from repository root. Never imports unresolved spell descriptions.
"""
import concurrent.futures,datetime,hashlib,json,pathlib,urllib.request
ROOT=pathlib.Path.cwd()
rows=json.loads((ROOT/'apps/web/components/wow/raid/midnightRaidSpells.json').read_text())
output=ROOT/'apps/web/data/wow/raid-reviews/spell-identities.json'
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'GildraRaidReview/1.0'})
 with urllib.request.urlopen(req,timeout=35) as r:return r.read()
def review(row):
 sid=row['spellId'];enurl=f'https://nether.wowhead.com/tooltip/spell/{sid}?dataEnv=1&locale=0';ruurl=f'https://nether.wowhead.com/tooltip/spell/{sid}?dataEnv=1&locale=7'
 try:
  en=json.loads(get(enurl));ru=json.loads(get(ruurl))
  if en['name']!=row['nameEn'] or en['icon'].lower()!=row['iconName'].lower():raise ValueError('identity mismatch')
  iconurl=f"https://render.worldofwarcraft.com/us/icons/56/{en['icon'].lower()}.jpg";data=get(iconurl)
  if not data.startswith(b'\xff\xd8'):raise ValueError('not JPEG')
  dest=ROOT/'apps/web/public'/row['localIcon'].lstrip('/');old=dest.read_bytes() if dest.exists() else None
  # Store separately: preserve previously published assets, use exact newly checked bytes.
  local=f'/assets/wow/raids/reviewed-spells/{sid}.jpg';target=ROOT/'apps/web/public'/local.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  return {'encounterId':row['enc'],'spellId':sid,'nameEn':en['name'],'nameRu':ru['name'],'iconName':en['icon'].lower(),'iconUrl':local,'iconSourceUrl':iconurl,'sourceUrlEn':enurl,'sourceUrlRu':ruurl,'reviewedAt':now,'iconSha256':hashlib.sha256(data).hexdigest(),'existingIconMatched':old==data,'verified':True}
 except Exception as e:return {'spellId':sid,'encounterId':row['enc'],'verified':False,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(review,rows))
output.write_text(json.dumps({'reviewedAt':now,'scope':'Curated Season 1 spell identities and icons only; no journal descriptions or current difficulty values.','abilities':[x for x in results if x['verified']]},ensure_ascii=False,indent=2)+'\n')
report={'reviewedAt':now,'passed':sum(x['verified'] for x in results),'total':len(results),'results':results}
(ROOT/'docs/reports/raid-evidence-20261021/spell-icon-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'total':report['total'],'failures':[x for x in results if not x['verified']]},ensure_ascii=False))
