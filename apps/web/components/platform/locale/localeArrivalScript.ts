import { LOCALE_SWITCH_KEY, LOCALE_SWITCH_TTL_MS } from "./localeSwitch";

/**
 * Inline <head> script of every document (app/root-document.tsx). It must run
 * before the first paint, so it is plain ES2017 without imports
 * (tests/atlas/localeSwitch.test.ts runs it).
 *
 * One arriving from LocaleSwitch restores the reading position under the
 * toolbar before the first frame where pagereveal exists (DOMContentLoaded
 * elsewhere), holds it while fonts and images settle (until the reader acts),
 * puts the old #hash back without letting it jump, and marks the document for
 * a short fade of the content (data-locale-arrival, localeTransition.css).
 * No cross-document view transition: capturing both pages held the new
 * page's first paint back by 0.3-0.7 s on a slow CPU, and the switch's pill
 * already moves on the click.
 */
export const localeArrivalScript = `(function(){
var d=document,h=d.documentElement,w=window,K=${JSON.stringify(LOCALE_SWITCH_KEY)};
function still(){return h.dataset.motion==="reduced"||w.matchMedia("(prefers-reduced-motion: reduce)").matches}
var r=null;try{r=JSON.parse(sessionStorage.getItem(K)||"null");sessionStorage.removeItem(K)}catch(e){}
if(r&&(r.to!==location.pathname+location.search||!(Date.now()-r.at<${LOCALE_SWITCH_TTL_MS})))r=null;
function to(y){y=Math.max(0,y);try{w.scrollTo({top:y,left:0,behavior:"instant"})}catch(e){w.scrollTo(0,y)}}
function restore(){if(!r)return;var s=r;r=null;var e=d.getElementById("atlas-content"),i,stop;
if(e&&s.path&&s.path.length){for(i=0;i<s.path.length&&e;i++){e=e.children[s.path[i][0]];if(e&&e.tagName!==s.path[i][1])e=null}}else e=null;
function align(){if(!stop&&e&&e.isConnected){var o=e.getBoundingClientRect().top-s.top;if(Math.abs(o)>1)to(w.scrollY+o)}}
if(e)align();else to(s.y);
if(s.hash)history.replaceState(history.state,"",location.pathname+location.search+s.hash);
if(!e)return;
// Fonts, images and hydration re-wrap the translated page after the first paint: keep the anchor in place until the reader acts.
function off(){stop=1};["wheel","touchstart","keydown","pointerdown"].forEach(function(n){w.addEventListener(n,off,{once:true,passive:true})});
var end=Date.now()+3000;(function hold(){align();if(!stop&&Date.now()<end)requestAnimationFrame(hold)})()}
// The page arrives in its final layout and only its content brightens (the toolbar stays still).
if(r&&!still()){h.dataset.localeArrival="";setTimeout(function(){delete h.dataset.localeArrival},700)}
if("onpagereveal" in w)w.addEventListener("pagereveal",restore);else d.addEventListener("DOMContentLoaded",restore);
})()`;
