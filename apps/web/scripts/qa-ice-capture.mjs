import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base=process.env.BASE_URL||'http://127.0.0.1:58189';
const output=path.resolve(import.meta.dirname,'../.artifacts/ice-capture',process.env.CAPTURE_LABEL||'baseline');
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const results=[];
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'});
  await context.addInitScript(()=>{
   if(window!==window.top)return;
   localStorage.setItem('gildra-home-music',JSON.stringify({enabled:false,confirmed:true,volume:0}));localStorage.setItem('gildra-consent','declined');
   // Change only the ink colour of style metadata in the actual serialized
   // viewport. Hidden metadata stays hidden; leaked CSS becomes measurable.
   const serialize=XMLSerializer.prototype.serializeToString;
   XMLSerializer.prototype.serializeToString=function(node){
    for(const style of node.querySelectorAll?.('style,noscript,template')||[])style.setAttribute('style',(style.getAttribute('style')||'')+';color:#ff00ff!important');
    window.__qaStyleMetadata=[...(node.querySelectorAll?.('style,noscript,template')||[])].map(s=>({tag:s.tagName,inline:s.getAttribute('style'),sample:s.textContent.slice(0,80)}));
    return serialize.call(this,node);
   };
   const send=Worker.prototype.postMessage;
   Worker.prototype.postMessage=function(message,...args){
    if(message?.type==='content') {
     const b=message.bitmap,c=document.createElement('canvas');c.width=b.width;c.height=b.height;
     const ctx=c.getContext('2d');ctx.drawImage(b,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
     let metadataPixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+2]>180&&pixels[i+1]<70)metadataPixels++;
     window.__qaCapturedPage={metadataPixels,width:c.width,height:c.height,png:c.toDataURL(),styles:window.__qaStyleMetadata};
    }
    return send.call(this,message,...args);
   };
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});await page.locator('[data-book-route-frame][data-view-transitions]').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.querySelector('[data-page-raster-helper][data-parallel="true"]'),null,{timeout:15000});
  await page.evaluate(()=>{const a=document.createElement('a');a.href='/privacy';document.body.append(a);a.click()});
  await page.waitForFunction(()=>window.__qaCapturedPage,null,{timeout:12000}).catch(async e=>{console.error(await page.evaluate(()=>({phase:document.querySelector('[data-themed-transition]')?.dataset.phase,snapshot:document.querySelector('[data-transition-snapshot]')?.dataset,styles:window.__qaStyleMetadata,helper:document.querySelector('[data-page-raster-helper]')?.outerHTML.slice(0,400)})));throw e});
  const {png,...capture}=await page.evaluate(()=>window.__qaCapturedPage);
  fs.writeFileSync(path.join(output,`${width}-page.png`),Buffer.from(png.split(',')[1],'base64'));
  const row={viewportWidth:width,...capture,errors,passed:capture.metadataPixels<5&&errors.length===0};results.push(row);console.log(JSON.stringify(row));await context.close();
 }
}finally{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({base,passed:results.length===2&&results.every(r=>r.passed),results},null,2));await browser.close()}
assert.ok(results.length===2&&results.every(r=>r.passed),'stylesheet metadata must never paint into page-content shards');
