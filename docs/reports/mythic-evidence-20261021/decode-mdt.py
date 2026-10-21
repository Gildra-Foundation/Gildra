"""Decode MDT2 (base64/raw DEFLATE/CBOR), without executing any import."""
import base64,zlib,struct,json,sys
class CBOR:
 def __init__(self,b):self.b=b;self.i=0
 def read(self,n):v=self.b[self.i:self.i+n];self.i+=n;assert len(v)==n;return v
 def val(self):
  h=self.read(1)[0];m=h>>5;a=h&31
  if m==7:
   if a in (20,21):return a==21
   if a in (22,23):return None
   if a in (25,26,27):return struct.unpack({25:'>e',26:'>f',27:'>d'}[a],self.read({25:2,26:4,27:8}[a]))[0]
   raise ValueError(('simple',a))
  n=a if a<24 else int.from_bytes(self.read({24:1,25:2,26:4,27:8}[a]),'big')
  if m==0:return n
  if m==1:return -1-n
  if m==2:return self.read(n).hex()
  if m==3:return self.read(n).decode()
  if m==4:return [self.val() for _ in range(n)]
  if m==5:
   d={}
   for _ in range(n):k=self.val();d[k]=self.val()
   return d
  if m==6:return self.val()
  raise ValueError(m)
s=open(sys.argv[1]).read().strip();assert s.startswith('!~MDT2~');s=s[7:];b=base64.b64decode(s+'='*((-len(s))%4));d=zlib.decompress(b,-15);p=CBOR(d);v=p.val();assert p.i==len(d);json.dump(v,open(sys.argv[2],'w'),indent=2);print(v.get('text'),v.get('value',{}).keys())
