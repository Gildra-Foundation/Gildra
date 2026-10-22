import { LOCALE_SWITCH_ID, LOCALE_SWITCH_KEY, LOCALE_SWITCH_TTL_MS } from "./localeSwitch";

/**
 * Inline <head> script of every document (app/root-document.tsx). It must run
 * before the first paint, so it is plain ES2017 without imports; the URL rules
 * mirror localeSwitch.ts (tests/atlas/localeSwitch.test.ts runs both).
 *
 * - pageswap / pagereveal keep the cross-document view transition
 *   (localeTransition.css) for language switches only and skip it for every
 *   other full load and for "less motion";
 * - a switch holds the first paint until the toolbar is parsed (rel=expect)
 *   and reveals its Suspense segment at once: the toolbar streams after the
 *   page content and must be in the new snapshot; one arriving from
 *   LocaleSwitch then restores the reading position under the
 *   toolbar (and holds it while fonts and images settle, until the reader
 *   acts), then puts the old #hash back without letting it jump;
 * - browsers without cross-document view transitions get a short fade of the
 *   content instead (data-locale-fallback).
 */
export const localeArrivalScript = `(function(){
var d=document,h=d.documentElement,w=window,K=${JSON.stringify(LOCALE_SWITCH_KEY)};
function bare(p){return p.replace(/^\\/ru(?=\\/|$)/,"").replace(/\\/+$/,"")||"/"}
function lang(p){return /^\\/ru(?:\\/|$)/.test(p)?"ru":"en"}
function target(a,b){try{a=new URL(a,location.href);b=new URL(b,location.href)}catch(e){return null}
return a.origin===b.origin&&bare(a.pathname)===bare(b.pathname)&&lang(a.pathname)!==lang(b.pathname)?lang(b.pathname):null}
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
w.addEventListener("pageswap",function(e){var t=e.viewTransition,a=e.activation;if(!t)return;
var l=a&&a.entry&&a.entry.url?target(location.href,a.entry.url):null;
if(!l||still()){t.skipTransition();return}h.dataset.localeSwitch=l});
if("onpagereveal" in w&&w.CSSViewTransitionRule){
var n=w.navigation,a=n&&n.activation,l=target(a&&a.from?a.from.url:d.referrer,location.href)||(r?lang(location.pathname):null);
// The toolbar streams after the page as a Suspense segment; once it is parsed before the first frame, React reveals it in that frame.
if(l){var x=d.createElement("link");x.rel="expect";x.href="#${LOCALE_SWITCH_ID}";x.setAttribute("blocking","render");d.head.appendChild(x)}
w.addEventListener("pagereveal",function(e){var t=e.viewTransition;a=n&&n.activation;
l=target(a&&a.from?a.from.url:d.referrer,location.href)||(r?lang(location.pathname):null);
delete h.dataset.localeSwitch;restore();if(!t)return;
if(!l||still()){t.skipTransition();return}
// React reveals the parsed toolbar segment on the next animation frame ($RC → $RV); reveal it now so it is in the new snapshot.
if(w.$RB&&w.$RB.length&&typeof w.$RV==="function")w.$RV(w.$RB);
h.dataset.localeSwitch=l;t.finished.finally(function(){delete h.dataset.localeSwitch})})}
else if(r){if(!still()){h.dataset.localeFallback="";setTimeout(function(){delete h.dataset.localeFallback},700)}
d.addEventListener("DOMContentLoaded",restore)}
})()`;
