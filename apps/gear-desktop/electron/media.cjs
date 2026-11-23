const services={
  soundcloud:{name:'SoundCloud',home:'https://soundcloud.com/discover',domains:['soundcloud.com','on.soundcloud.com','w.soundcloud.com','www.soundcloud.com']},
  spotify:{name:'Spotify',home:'https://open.spotify.com/',domains:['open.spotify.com','spotify.link']},
  youtube:{name:'YouTube',home:'https://www.youtube.com/',domains:['www.youtube.com','youtube.com','m.youtube.com','music.youtube.com','youtu.be']},
};
function serviceFor(address){
  try {
    const u=new URL(address);
    if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port)
      return Object.keys(services).find(k=>services[k].domains.includes(u.hostname));
  }catch{}
}
function playerUrl(address){
  const u=new URL(address);
  if(['soundcloud.com','www.soundcloud.com'].includes(u.hostname) && /^\/[^/]+\/(?:sets\/)?[^/]+\/?$/.test(u.pathname) && !/^\/(?:discover|search|you|charts|settings)\//.test(u.pathname)){
    return 'https://w.soundcloud.com/player/?'+new URLSearchParams({url:u.href,visual:'true'});
  }
  if(u.hostname==='open.spotify.com'){
    const match=u.pathname.match(/^\/(?:intl-[\w-]+\/)?(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)\/?$/);
    if(match)return u.origin+'/embed/'+match[1]+'/'+match[2];
  }
  return u.href;
}
// Only touch the active provider's player; chat and login pages have no controls here.
async function togglePlayback(wc,key){
  if(serviceFor(wc.getURL())!==key)return false;
  const selectors={soundcloud:'.playControls .playControl, .playControls__play, .playButton, .soundTitle__playButton .sc-button-play',
    spotify:'[data-testid="control-button-playpause"], [data-testid="play-pause-button"]',
    youtube:'.html5-video-player .ytp-play-button'};
  return wc.executeJavaScriptInIsolatedWorld(1001,[{code:`(async()=>{
    const button=[...document.querySelectorAll(${JSON.stringify(selectors[key])})].find(b=>b.getClientRects().length && !b.disabled && b.getAttribute('aria-disabled')!=='true');
    if(button){button.click();return true;}
    const players=[...document.querySelectorAll('video,audio')].filter(el=>el.currentSrc||el.srcObject);
    const el=players.find(v=>!v.paused)||players[0];
    if(!el)return false;
    if(el.paused)await el.play();else el.pause();
    return true;
  })()`}],true).catch(()=>false);
}
// Spotify and SoundCloud may play through an Audio element outside the document.
function observePlayback(){
  const slot=Symbol.for('gildra.playback');
  if(window[slot])return;
  const state=window[slot]={element:null};
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){
    state.element=this;
    return play.apply(this,args);
  };
}
function inspectPlayback(action,value){
  const observed=window[Symbol.for('gildra.playback')]?.element;
  const candidates=[...document.querySelectorAll('audio,video'),observed].filter(el=>el?.currentSrc);
  const el=candidates.find(el=>!el.paused)||observed||candidates[0];
  if(action==='pause') {el?.pause();return null;}
  if(action==='volume'&&el)el.volume=value;
  if(action==='seek'&&el&&Number.isFinite(el.duration)&&el.seekable.length){
    el.currentTime=Math.max(el.seekable.start(0),Math.min(value,el.seekable.end(el.seekable.length-1)));
  }
  const meta=navigator.mediaSession?.metadata;
  const art=meta?.artwork?.at(-1)?.src || document.querySelector('meta[property="og:image"]')?.content
    || document.querySelector('img[class*="CoverArt"], img[data-testid="cover-art-image"]')?.src;
  return {title:meta?.title||document.title,artist:meta?.artist||'',art:art?.startsWith('https://')?art:'',
    position:el?.currentTime||0,duration:Number.isFinite(el?.duration)?el.duration:0,
    seekable:!!el?.seekable?.length,volume:el?el.volume:null};
}
async function mediaDetails(wc,key,action='read',value=null){
  if(serviceFor(wc.getURL())!==key)return null;
  return wc.executeJavaScript('('+inspectPlayback.toString()+')('+JSON.stringify(action)+','+JSON.stringify(value)+')').catch(()=>null);
}
module.exports={services,serviceFor,playerUrl,togglePlayback,observePlayback,mediaDetails};
