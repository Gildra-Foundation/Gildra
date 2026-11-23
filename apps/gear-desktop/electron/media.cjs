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
module.exports={services,serviceFor,playerUrl,togglePlayback};
