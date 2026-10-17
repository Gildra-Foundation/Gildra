import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import ts from 'typescript';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { iceFracture } from '../components/motion/iceFracture.ts';

const root=path.resolve(import.meta.dirname,'..'), control=process.env.SHARD_CONTROL==='1';
const output=path.join(root,'.artifacts/page-shards',control?'control-v4':'renderer-v5');fs.mkdirSync(output,{recursive:true});
const moduleCode=name=>ts.transpileModule(fs.readFileSync(path.join(root,'components/motion',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/^export /gm,'').replace(/^import .+$/gm,'');
const worker=fs.readFileSync(path.join(root,`public/assets/motion/ice-renderer-v${control?4:5}.js`));
const markup=`<!doctype html><html><head><style>
body{margin:0;background:#001a4a;color:white;font-family:Arial,sans-serif}.scene{position:relative;height:1200px;background:#08121a}.title{position:absolute;left:30px;top:60px;margin:0;font:700 66px/1 Arial;color:#ff00db}.photo{position:absolute;top:210px;left:30px;width:70vw;height:280px;object-fit:cover;border:4px solid #fff}.label{position:absolute;top:520px;left:30px;font-size:30px;color:#ff00db}.background{position:absolute;top:600px;left:30px;width:70vw;height:170px;background: url(/picture.svg) center/cover}.below{position:absolute;top:2000px}.outgoing{position:fixed;inset:0;z-index:2;overflow:hidden;background:#08121a}.canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:3}
</style></head><body><main class="scene" data-book-route-frame><h1 class="title">OLD PAGE</h1><img class="photo" src="/picture.svg"><p class="label">Текст на осколках</p><div class="background"></div><div class="below">${'<p>Offscreen content must never become a shard DOM copy</p>'.repeat(1000)}</div></main></body></html>`;
const server=http.createServer((req,res)=>{
 if(['/assets/motion/page-raster-v1.html','/assets/motion/page-raster-v1.js'].includes(req.url)){res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Type',req.url.endsWith('.js')?'application/javascript':'text/html');return res.end(fs.readFileSync(path.join(root,'public',req.url)))}
 if(req.url.includes('ice-renderer')){res.setHeader('Content-Type','application/javascript');return res.end(worker)}
 if(req.url==='/picture.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280"><rect width="400" height="280" fill="#ff8a00"/><circle cx="200" cy="140" r="90" fill="#ffcf00"/><path d="M100 140h200M200 40v200" stroke="#502000" stroke-width="16"/></svg>')}
 res.setHeader('Content-Type','text/html');res.end(markup);
});
await new Promise(resolve=>server.listen(5188,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--site-per-process']});const results=[];let sharedThreadFallback=false;
const inspect=buffer=>{
 const {width,height,data}=PNG.sync.read(buffer);let text=0,picture=0,backgroundImage=0,sumX=0,sumY=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(r>110&&b>90&&g<r*.65){text++;sumX+=x;sumY+=y}if(r>140&&g>65&&b<g*.65){picture++;if(y>600)backgroundImage++}}
 return {text,picture,backgroundImage,centre:[sumX/Math.max(1,text),sumY/Math.max(1,text)]};
};
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5188');await page.locator('.photo').evaluate(img=>img.decode());
  await page.addScriptTag({content:`(()=>{${moduleCode('transitionSnapshot')};window.__snapshot=transitionSnapshot})();(()=>{${moduleCode('pageRasterHost')}\n${moduleCode('pageRaster')};window.__capture=pageRaster})();(()=>{${moduleCode('iceMaterial')};window.__ice=iceMaterial})();`});
  const capture=await page.evaluate(async geometry=>{
   const source=document.querySelector('main'),outgoing=document.createElement('div');outgoing.className='outgoing';outgoing.append(window.__snapshot(source,''));document.body.append(outgoing);
   const t=performance.now(),bitmap=await window.__capture(outgoing,new AbortController().signal);
   const material=window.__ice(innerWidth,innerHeight,geometry);material.canvas.className='canvas';document.body.append(material.canvas);material.content(bitmap);window.__material=material;
   source.remove();outgoing.style.visibility='hidden';return{ms:performance.now()-t,nodes:outgoing.querySelectorAll('*').length,metrics:{...outgoing.dataset},width:material.canvas.width,height:material.canvas.height};
  },iceFracture(width,900));
  const frame=async progress=>{await page.evaluate(p=>window.__material.draw('shattering',p),progress);await page.waitForFunction(p=>document.querySelector('canvas')?.dataset.renderProgress===String(p),progress);await page.waitForTimeout(50);return inspect(await page.screenshot({path:path.join(output,`${width}-${progress}.png`)}))};
  const initial=await frame(0),moving=await frame(.35);
  assert.ok(initial.text>100,`old-page glyph pixels must be on shards: ${JSON.stringify(initial)}`);
  assert.ok(initial.picture>1000,'old-page image must be on shards');
  assert.ok(initial.backgroundImage>500,'CSS background images must also be embedded');
  assert.ok(moving.text>50&&moving.picture>500,'text AND image must remain on moving fragments');
  assert.ok(Math.hypot(moving.centre[0]-initial.centre[0],moving.centre[1]-initial.centre[1])>5,'glyph positions must travel with shards');
  assert.ok(capture.nodes<100,'1000 offscreen paragraphs must be excluded before rasterisation');
  assert.ok(Math.max(capture.width,capture.height)<=1024,'raster size is bounded independently of DPI');
  assert.deepEqual(errors,[]);
  assert.equal(await page.locator('[data-page-raster-helper]').getAttribute('data-parallel'),'true');
  const aborted=await page.evaluate(async()=>{const c=new AbortController();c.abort();try{await window.__capture(document.body,c.signal);return false}catch(e){return e.name==='AbortError'}});assert.equal(aborted,true);
  await page.evaluate(()=>{window.__material.dispose();document.querySelector('canvas').remove()});assert.equal(await page.locator('canvas').count(),0);
  if(width===1440){await page.waitForTimeout(15100);assert.equal(await page.locator('[data-page-raster-helper]').count(),0,'idle raster context must be removed');}
  results.push({width,capture,initial,moving,aborted,errors});console.log(`Content shards passed ${width}px: ${initial.text} glyph pixels, ${initial.picture} image pixels, both travel; ${capture.nodes} nodes.`);await page.close();
 }
 const shared=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-features=IsolateSandboxedIframes']});
 try{
  const page=await shared.newPage();await page.goto('http://127.0.0.1:5188');
  await page.addScriptTag({content:`(()=>{${moduleCode('pageRasterHost')};window.__ready=rasterHostReady})();`});
  const refusal=await page.evaluate(async()=>{try{await window.__ready();return{refused:false}}catch(e){return{refused:e.message.startsWith('parallel raster unavailable'),frames:document.querySelectorAll('[data-page-raster-helper]').length}}});
  assert.equal(refusal.refused,true,'shared-thread capture must fall back before rasterising real page data');assert.equal(refusal.frames,0);sharedThreadFallback=true;
 }finally{await shared.close()}

}finally{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:results.length===2&&sharedThreadFallback,control,sharedThreadFallback,idleHelperRemoved:true,results},null,2));await browser.close();server.close()}
