const {WebContentsView,screen,session,net,app,shell}=require('electron');

const {services,serviceFor,playerUrl,togglePlayback}=require('./media.cjs');
const {spotifySession,spotifyUri,watchSpotify}=require('./spotify-desktop.cjs');
const webTabs={browser:null,telegram:'https://web.telegram.org/',whatsapp:'https://web.whatsapp.com/',...Object.fromEntries(Object.entries(services).map(([k,v])=>[k,v.home]))};
function httpsUrl(value){
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
class Companion {
  constructor(buildWindow,secureWeb,settings,save,announce){
    Object.assign(this,{buildWindow,secureWeb,settings,save,announce});
    this.tabs=new Map();this.active='browser';this.revision=0;
  }
  home(){return 'https://wowarcana.com/'+(this.settings.lang==='ru'?'ru':'');}
  player(key=this.lastMusic){
    if(key==='spotify'&&this.nativeSpotify){
      const {title,artist,playing}=this.nativeSpotify;
      return {key,native:true,service:'Spotify',title:[artist,title].filter(Boolean).join(' · ')||'Spotify',playing};
    }
    const tab=this.tabs.get(key);
    if(!tab)return null;
    const wc=tab.view.webContents;
    return {key,service:services[key].name,title:wc.getTitle()||services[key].name,playing:!!tab.playing,muted:wc.isAudioMuted()};
  }
  panelPlayerKey(){return services[this.active]?this.active:this.lastMusic;}
  mediaAction(name,key=this.lastMusic){
    const tab=this.tabs.get(key);
    if(!tab)return false;
    const wc=tab.view.webContents;
    if(name==='media-open')this.show(key);
    if(name==='media-toggle' && key==='spotify' && this.nativeSpotify)return this.refreshSpotify(true);
    if(name==='media-toggle')return togglePlayback(wc,key);
    if(name==='media-mute')wc.setAudioMuted(!wc.isAudioMuted());
    this.announce();return true;
  }
  async attachSpotify(){
    if(process.platform!=='win32')return false;
    const tab=this.tabs.get('spotify');
    if(!tab)return false;
    const uri=spotifyUri(tab.url);
    try{
      let state=await spotifySession();
      if(uri!=='spotify:' || !state){
        if(!app.getApplicationNameForProtocol('spotify:'))return false;
        await shell.openExternal(uri);
        for(let i=0;i<5;i++){
          await new Promise(r=>setTimeout(r,800));
          state=await spotifySession();
          if(state)break;
        }
      }
      if(!state||!this.window||this.active!=='spotify')return false;
      if(tab.playing)await togglePlayback(tab.view.webContents,'spotify');
      this.nativeSpotify=state;this.lastMusic='spotify';this.announce();
      this.watcher?.kill();
      const watcher=this.watcher=watchSpotify(state=>{
        if(this.watcher!==watcher)return;
        this.nativeSpotify=state;
        if(!state){this.watcher=null;watcher.kill();}
        this.announce();
      });
      return true;
    }catch{return false;}
  }
  async refreshSpotify(toggle){
    if(!this.nativeSpotify || this.nativeBusy)return false;
    this.nativeBusy=true;
    try{
      const state=await spotifySession(toggle);
      if(this.nativeSpotify)this.nativeSpotify=state;
      if(!this.nativeSpotify){this.watcher?.kill();this.watcher=null;}
      this.announce();return !!state;
    }catch{return false;}finally{this.nativeBusy=false;}
  }
  state(){
    const tab=this.tabs.get(this.active),history=tab?.view.webContents.navigationHistory;
    return {windows:process.platform==='win32',canEmbed:!!(tab?.url && ['spotify','soundcloud'].includes(this.active) && serviceFor(tab.url)===this.active && playerUrl(tab.url)!==tab.url),active:this.active,url:tab?.url||'',failed:!!tab?.failed,back:!!history?.canGoBack(),forward:!!history?.canGoForward(),opacity:this.settings.panelOpacity||100,bookmarks:this.settings.bookmarks||[]};
  }
  layout(){
    const [width,height]=this.window.getContentSize();
    this.tabs.get(this.active)?.view.setBounds({x:0,y:this.lastMusic?146:110,width,height:Math.max(0,height-(this.lastMusic?146:110))});
  }
  ensure(){
    if(this.window)return;
    const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width=Math.min(area.width,780),height=Math.min(area.height,780);
    const w=this.window=this.buildWindow({title:'Gildra Gear · Web',width,height,minWidth:400,minHeight:280,x:area.x+12,y:area.y+8,show:false,skipTaskbar:true,alwaysOnTop:true});
    w.setAlwaysOnTop(true,'screen-saver');w.setOpacity((this.settings.panelOpacity||100)/100);
    w.on('resize',()=>this.layout());
    w.on('close',e=>{e.preventDefault();this.hide();});
    void w.loadURL('gear://panel/');
  }
  tab(key){
    let tab=this.tabs.get(key);
    if(tab)return tab;
    const store=session.fromPartition('persist:gildra-companion-'+key);
    store.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
    store.setPermissionCheckHandler(()=>false);
    store.on('will-download',e=>e.preventDefault());
    if(services[key])store.setUserAgent(store.getUserAgent(),this.settings.lang==='ru'?'ru-RU,ru,en-US,en':'en-US,en');
    if(key==='whatsapp'){
      // Present only the engine's actual Chromium version and native platform.
      const ua=store.getUserAgent().replace(/(like Gecko\)).*? (Chrome\/[\d.]+).*?(Safari\/[\d.]+)/,'$1 $2 $3');
      store.setUserAgent(ua);
    }
    const view=new WebContentsView({webPreferences:{...this.secureWeb,session:store,backgroundThrottling:!services[key]}});
    tab={view,url:'',failed:false};this.tabs.set(key,tab);
    const wc=view.webContents;
    if(services[key]){
      wc.on('media-started-playing',()=>{
        const previous=this.tabs.get(this.lastMusic);
        if(previous?.playing && previous!==tab)void togglePlayback(previous.view.webContents,this.lastMusic);
        if(key==='spotify'){this.nativeSpotify=null;this.watcher?.kill();this.watcher=null;}tab.playing=true;this.lastMusic=key;this.announce();});
      wc.on('media-paused',()=>{tab.playing=false;this.announce();});
      wc.on('page-title-updated',()=>this.announce());
    }
    const update=()=>{tab.url=wc.getURL()||tab.url;this.announce();};
    wc.on('will-navigate',(e,address)=>{if(!httpsUrl(address))e.preventDefault();});
    wc.on('will-redirect',(e,address)=>{if(!httpsUrl(address))e.preventDefault();});
    wc.setWindowOpenHandler(({url})=>{if(httpsUrl(url))this.show('browser',url);return {action:'deny'};});
    wc.on('did-start-navigation',(_e,_url,_same,main)=>{if(main){tab.failed=false;this.announce();}});
    wc.on('did-navigate',update);wc.on('did-navigate-in-page',update);
    wc.on('did-fail-load',(_e,code,_reason,address,main)=>{if(main&&code!==-3){tab.failed=true;tab.url=httpsUrl(address)||tab.url;this.announce();}});
    return tab;
  }
  show(key=this.active,address){
    if(!Object.hasOwn(webTabs,key))return;
    this.ensure();this.revision++;
    const prior=this.tabs.get(this.active);
    if(prior&&key!==this.active)this.window.contentView.removeChildView(prior.view);
    this.active=key;
    if(services[key]&&!this.player()?.playing)this.lastMusic=key;
    const tab=this.tab(key);
    if(!this.window.contentView.children.includes(tab.view))this.window.contentView.addChildView(tab.view);
    this.layout();this.window.show();this.window.focus();tab.view.webContents.focus();
    if(address||!tab.url){
      const url=httpsUrl(address||webTabs[key]||this.home());
      if(url){tab.url=url;void tab.view.webContents.loadURL(url).catch(()=>{});}
    }
    this.announce();
  }
  hide(){this.revision++;this.window?.hide();}
  toggle(){if(this.window?.isVisible())this.hide();else this.show();}
  async item(provider,id,name){
    if(!Number.isSafeInteger(id)||id<=0)return;
    if(provider==='wowhead'){this.show('browser','https://www.wowhead.com/'+(this.settings.lang==='ru'?'ru/':'')+'item='+id);return;}
    if(provider!=='gildra')return;
    const token=++this.revision;
    const ru=this.settings.lang==='ru';
    const library='https://wowarcana.com'+(ru?'/ru':'')+'/library/items';
    let url=library+'?'+new URLSearchParams({q:String(name||id).slice(0,200)});
    try {
      const query=new URLSearchParams({product:'wow',type:'item',externalIds:String(id),limit:'100',locale:ru?'ru_RU':'en_US'});
      const res=await net.fetch('https://api.wowarcana.com/v1/game/entity-summaries?'+query,{credentials:'omit',signal:AbortSignal.timeout(6500)});
      if(res.ok){
        const row=(await res.json()).data?.find(x=>x.product==='wow'&&x.type==='item'&&Number(x.externalId)===id&&/^[0-9a-f-]{36}$/i.test(x.id));
        if(row)url=library+'/'+encodeURIComponent(row.id)+'/'+encodeURIComponent(row.slug||id);
      }
    }catch{}
    if(token===this.revision)this.show('browser',url);
  }
  command(name,value){
    const wc=this.tabs.get(this.active)?.view.webContents;
    if(name==='panel-spotify-desktop' && this.active==='spotify')return this.attachSpotify();
    if(name==='panel-tab')this.show(value);
    if(name==='panel-home')this.show('browser',this.home());
    if(name==='panel-library')this.show('browser',this.home().replace(/\/$/,'')+'/library/items');
    if(name==='panel-url'&&typeof value==='string'){
      const url=httpsUrl(value.includes(':')?value:'https://'+value);
      if(!url)return false;
      const service=serviceFor(url);
      this.show(service||'browser',service?playerUrl(url):url);
    }
    if(name==='panel-service-home' && services[this.active])this.show(this.active,services[this.active].home);
    if(name==='panel-embed' && services[this.active] && serviceFor(wc?.getURL())===this.active)this.show(this.active,playerUrl(wc.getURL()));
    if(name==='panel-back'&&wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();
    if(name==='panel-forward'&&wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();
    if(name==='panel-refresh'&&wc){const tab=this.tabs.get(this.active);if(tab.failed)this.show(this.active,tab.url);else wc.reload();}
    if(name==='panel-opacity'&&Number.isInteger(value)&&value>=40&&value<=100){
      this.settings.panelOpacity=value;this.window.setOpacity(value/100);this.save();
    }
    if(name==='panel-bookmark'&&this.active==='browser'&&httpsUrl(wc?.getURL())){
      const url=wc.getURL(),saved=this.settings.bookmarks||[];
      this.settings.bookmarks=saved.some(b=>b.url===url)?saved.filter(b=>b.url!==url):[...saved,{url,title:wc.getTitle()||url}].slice(-50);
      this.save();
    }
    this.announce();return true;
  }
  destroy(){
    this.revision++;
    for(const tab of this.tabs.values())tab.view.webContents.close();
    this.watcher?.kill();this.watcher=null;this.nativeSpotify=null;
    this.tabs.clear();this.window?.destroy();this.window=null;
  }
}
module.exports={Companion};
