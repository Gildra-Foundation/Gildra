import { LOCALE_ARRIVAL_MS, LOCALE_LEAVE_MS, LOCALE_SWITCH_KEY, LOCALE_SWITCH_TTL_MS } from "./localeSwitch";

/**
 * Inline <head> script of every document (app/root-document.tsx). It must run
 * before the first paint, so it is plain ES2017 without imports
 * (tests/atlas/localeSwitch.test.ts runs it).
 *
 * One arriving from LocaleSwitch restores the reading position under the
 * toolbar before the first frame where pagereveal exists (DOMContentLoaded
 * elsewhere, a frame or so later), holds it while fonts and images settle (until the reader acts),
 * puts the old #hash back without letting it jump, and marks the document for
 * the second half of the switch (data-locale-arrival, localeTransition.css):
 * the old page dissolved while this one loaded (data-locale-leaving), so the
 * content resolves from where that dissolve had got to (0-4, quarters of
 * LOCALE_LEAVE_MS), under a still toolbar. "still": less motion, a short fade.
 * No cross-document view transition: capturing both pages held the new
 * page's first paint back by 0.3-0.7 s on a slow CPU.
 */
export const localeArrivalScript = `(function(){
var d=document,h=d.documentElement,w=window,K=${JSON.stringify(LOCALE_SWITCH_KEY)};
function still(){return h.dataset.motion==="reduced"||w.matchMedia("(prefers-reduced-motion: reduce)").matches}
var r=null;try{r=JSON.parse(sessionStorage.getItem(K)||"null");sessionStorage.removeItem(K)}catch(e){}
if(r&&(r.to!==location.pathname+location.search||!(Date.now()-r.at<${LOCALE_SWITCH_TTL_MS})))r=null;
function to(y){y=Math.max(0,y);try{w.scrollTo({top:y,left:0,behavior:"instant"})}catch(e){w.scrollTo(0,y)}}
// The page arrives in its final layout and only its content resolves (the toolbar stays still).
// Marked on the first frame where pagereveal says when that is (styles and fonts can hold the first
// paint long enough for the whole resolve to play unseen); elsewhere at once, before any paint.
// "hold": the first frame came before the content; it stays dissolved until its position is restored.
var m=0;function arrive(wait){if(!r||m)return;if(wait){if(!still())h.dataset.localeArrival="hold";return}m=1;h.dataset.localeArrival=still()?"still":String(Math.round(4*Math.min(1,Math.max(0,(Date.now()-r.at)/${LOCALE_LEAVE_MS}))));setTimeout(function(){delete h.dataset.localeArrival},${LOCALE_ARRIVAL_MS + 200})}
// A streamed document can reveal its first frame before the content is parsed: then the anchor is found once it is
// (the content waits dissolved meanwhile, so the reader never sees the top of the page jump to the anchor).
function restore(){var wait=d.readyState==="loading"&&!d.getElementById("atlas-content");arrive(wait);if(!r)return;if(wait){d.addEventListener("DOMContentLoaded",restore);return}var s=r;r=null;var e=d.getElementById("atlas-content"),i,stop;
if(e&&s.path&&s.path.length){for(i=0;i<s.path.length&&e;i++){e=e.children[s.path[i][0]];if(e&&e.tagName!==s.path[i][1])e=null}}else e=null;
function align(){if(!stop&&e&&e.isConnected){var o=e.getBoundingClientRect().top-s.top;if(Math.abs(o)>1)to(w.scrollY+o)}}
if(e)align();else to(s.y);
if(s.hash)history.replaceState(history.state,"",location.pathname+location.search+s.hash);
if(!e)return;
// Fonts, images and hydration re-wrap the translated page after the first paint: keep the anchor in place until the reader acts.
function off(){stop=1};["wheel","touchstart","keydown","pointerdown"].forEach(function(n){w.addEventListener(n,off,{once:true,passive:true})});
var end=Date.now()+3000;(function hold(){align();if(!stop&&Date.now()<end)requestAnimationFrame(hold)})()}
if("onpagereveal" in w)w.addEventListener("pagereveal",restore);else{arrive();d.addEventListener("DOMContentLoaded",restore)}
})()`;
