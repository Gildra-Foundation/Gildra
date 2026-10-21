"""Read literal Lua data only (never execute third-party Lua). Run with MDT source dir."""
import sys, re, json, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[3]
src=Path(sys.argv[1])
commit=sys.argv[2]
files={'ruby-life-pools':'RubyLifePools','altar-of-fangs':'AltarOfFangs','murder-row':'MurderRow','den-of-nalorakk':'DenOfNalorakk','the-blinding-vale':'TheBlindingVale','voidscar-arena':'VoidscarArena','kings-rest':'KingsRest','temple-of-sethraliss':'TempleOfSethraliss'}
class Parser:
 def __init__(self,s): self.s=s; self.i=0
 def ws(self):
  while True:
   m=re.match(r'(?:\s+|--[^\n]*(?:\n|$))',self.s[self.i:])
   if not m: break
   self.i+=m.end()
 def take(self,v):
  self.ws(); assert self.s.startswith(v,self.i),(self.i,self.s[self.i:self.i+80]); self.i+=len(v)
 def val(self):
  self.ws(); c=self.s[self.i]
  if c=='{':
   self.i+=1; out={}; n=1
   while True:
    self.ws()
    if self.s[self.i]=='}': self.i+=1; return out
    if self.s[self.i]=='[':
     self.i+=1; k=self.val(); self.take(']'); self.take('='); out[str(k)]=self.val()
    else:
     m=re.match(r'(\w+)\s*=',self.s[self.i:])
     if m: self.i+=m.end(); out[m[1]]=self.val()
     else: out[str(n)]=self.val(); n+=1
    self.ws()
    if self.s[self.i] in ',;': self.i+=1
  if c in '\"\'':
   m=re.match(r'''("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')''',self.s[self.i:]); assert m
   self.i+=m.end(); return m[0][1:-1].replace('\\"','"').replace("\\'", "'")
  m=re.match(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|nil',self.s[self.i:]); assert m,self.s[self.i:self.i+80]
  self.i+=m.end(); v=m[0]
  return {'true':True,'false':False,'nil':None}.get(v) if v in ('true','false','nil') else float(v) if any(x in v for x in '.eE') else int(v)
result={}
for slug,fn in files.items():
 raw=(src/'Midnight'/f'{fn}.lua').read_text(); literal=raw.split('MDT.dungeonEnemies[dungeonIndex] =',1)[1]; enemies=Parser(literal).val()
 total=int(re.search(r'dungeonTotalCount\[dungeonIndex\]\s*=\s*\{\s*normal\s*=\s*(\d+)',raw)[1])
 nodes=[]
 for idx,e in enemies.items():
  for clone,c in e.get('clones',{}).items():
   if 'x' not in c or 'y' not in c: continue
   assert 0<=c['x']<=840 and -560<=c['y']<=0,(slug,idx,c)
   nodes.append({'id':f'{idx}:{clone}','npcId':e['id'],'name':e['name'],'x':round(c['x']/840*100,4),'y':round(-c['y']/560*100,4),'floor':c.get('sublevel',1),'group':str(c.get('g',f'{idx}:{clone}')),'forces':e.get('count',0),'boss':e.get('isBoss',False)})
 result[slug]={'source':f'https://github.com/Nnoggie/MythicDungeonTools/blob/{commit}/Midnight/{fn}.lua','sha256':hashlib.sha256(raw.encode()).hexdigest(),'checkedAt':'2026-10-21','total':total,'image':f'/assets/wow/maps/mdt/{slug}.webp','nodes':nodes}
 print(slug,len(nodes),total)
(root/'apps/web/data/wow/mythic-reviews/mdt.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
(root/'apps/web/public/assets/wow/maps/mdt/LICENSE').write_bytes((src/'LICENSE').read_bytes())
(root/'apps/web/public/assets/wow/maps/mdt/SOURCE.md').write_text(f'MDT data and textures from https://github.com/Nnoggie/MythicDungeonTools/tree/{commit}/Midnight (GPL-2.0, LICENSE included). Blizzard game artwork remains Blizzard copyright. Fetched 2026-10-21. Textures composed in the original 15×10 tile order from Modules/MapView.lua. NPC coordinates use x/840 and -y/560; source canvas tile width 840/15=56. No preset route or gameplay validation implied.\n')
