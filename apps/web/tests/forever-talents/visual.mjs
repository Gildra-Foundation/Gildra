import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const base=process.env.TALENTS_BASE_URL??'http://127.0.0.1:3159';
const out=process.env.TALENTS_QA_OUT??'/tmp/forever-platform-20261111/TALENTS/qa';
const data=JSON.parse(readFileSync(new URL('../../data/wow/forever/talents/trees.json',import.meta.url),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME??'/home/debian/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try {
 for(const width of [1440,320]) for(const cls of data.classes) {
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
  await page.goto(`${base}/ru/wow/forever/talent-calc/${cls.slug}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  const result=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth+1,
   tallLabels:[...document.querySelectorAll('[data-node]')].filter(n=>n.offsetWidth&&n.parentElement.getBoundingClientRect().height<n.parentElement.scrollHeight).length,
  }));
  results.push({width,class:cls.slug,...result});
  if(result.overflow||result.tallLabels)throw new Error(JSON.stringify(results.at(-1)));
  await page.screenshot({path:`${out}/final-${cls.slug}-ru-${width}.png`,fullPage:true});await page.close();
 }
} finally {await browser.close();writeFileSync(`${out}/visual-final.json`,JSON.stringify(results,null,2));}
console.log(`${results.length} final geometry cases passed`);
