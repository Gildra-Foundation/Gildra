import { LOCALE_ARRIVAL_MS, LOCALE_HOLD_MAX_MS, LOCALE_SETTLE_MS, LOCALE_SWITCH_KEY, LOCALE_SWITCH_TTL_MS } from "./localeSwitch";

/**
 * Inline <head> script of every document (app/root-document.tsx). It must run
 * before the first paint, so it is plain ES2017 without imports
 * (tests/atlas/localeSwitch.test.ts runs it).
 *
 * One arriving from LocaleSwitch is marked data-locale-arrival="hold" at once:
 * its content is not painted (localeTransition.css), so the reader never sees
 * the top of the page or anything shifting while it loads. On the first frame
 * (pagereveal; DOMContentLoaded elsewhere) — or once the content is parsed, a
 * streamed document reveals before it — the reading position is restored on
 * the element that was under the toolbar, the old #hash is put back without a
 * jump, and when the fonts and the pictures in view have settled (at most
 * LOCALE_SETTLE_MS) the page is re-anchored and shown: "4" resolves it from the
 * dissolved state, "still" (less motion) fades it shortly. Later changes above
 * the anchor are absorbed by the browser's scroll anchoring and, until the
 * reader acts, by re-anchoring on every frame for 3 s.
 * No cross-document view transition: capturing both pages held the new
 * page's first paint back by 0.3-0.7 s on a slow CPU.
 */
export const localeArrivalScript = `(function(){
var d=document,h=d.documentElement,w=window,K=${JSON.stringify(LOCALE_SWITCH_KEY)};
function still(){return h.dataset.motion==="reduced"||w.matchMedia("(prefers-reduced-motion: reduce)").matches}
var r=null;try{r=JSON.parse(sessionStorage.getItem(K)||"null");sessionStorage.removeItem(K)}catch(e){}
if(r&&(r.to!==location.pathname+location.search||!(Date.now()-r.at<${LOCALE_SWITCH_TTL_MS})))r=null;
if(!r)return;
h.dataset.localeArrival="hold";
var shown=0;function reveal(){if(shown)return;shown=1;h.dataset.localeArrival=still()?"still":"4";setTimeout(function(){delete h.dataset.localeArrival},${LOCALE_ARRIVAL_MS + 200})}
setTimeout(reveal,${LOCALE_HOLD_MAX_MS});
function to(y){y=Math.max(0,y);try{w.scrollTo({top:y,left:0,behavior:"instant"})}catch(e){w.scrollTo(0,y)}}
// Fonts and the pictures within a screen of the view, at most ${LOCALE_SETTLE_MS} ms.
function settle(done){var left=2,timer=setTimeout(fin,${LOCALE_SETTLE_MS});function fin(){if(timer){clearTimeout(timer);timer=0;done()}}function one(){if(--left<=0)fin()}
try{d.fonts&&d.fonts.ready?d.fonts.ready.then(one,one):one()}catch(e){one()}
var imgs=d.images||[],wait=[],i,b,n;for(i=0;i<imgs.length;i++){if(!imgs[i].complete){b=imgs[i].getBoundingClientRect();if(b.bottom>-w.innerHeight&&b.top<2*w.innerHeight)wait.push(imgs[i])}}
n=wait.length;if(!n)one();else wait.forEach(function(m){function f(){if(--n===0)one()}m.addEventListener("load",f,{once:true});m.addEventListener("error",f,{once:true})})}
function restore(){if(!r)return;if(d.readyState==="loading"&&!d.getElementById("atlas-content")){d.addEventListener("DOMContentLoaded",restore);return}
var s=r;r=null;var e=d.getElementById("atlas-content"),i,stop;
if(e&&s.path&&s.path.length){for(i=0;i<s.path.length&&e;i++){e=e.children[s.path[i][0]];if(e&&e.tagName!==s.path[i][1])e=null}}else e=null;
function align(){if(!stop&&e&&e.isConnected){var o=e.getBoundingClientRect().top-s.top;if(Math.abs(o)>1)to(w.scrollY+o)}}
if(e)align();else to(s.y);
if(s.hash)history.replaceState(history.state,"",location.pathname+location.search+s.hash);
settle(function(){if(e)align();else if(s.y)to(s.y);reveal()});
if(!e)return;
function off(){stop=1};["wheel","touchstart","keydown","pointerdown"].forEach(function(n){w.addEventListener(n,off,{once:true,passive:true})});
var end=Date.now()+3000;(function hold(){align();if(!stop&&Date.now()<end)requestAnimationFrame(hold)})()}
if("onpagereveal" in w)w.addEventListener("pagereveal",restore);else d.addEventListener("DOMContentLoaded",restore);
})()`;
