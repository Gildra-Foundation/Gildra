const {WebContentsView,screen,session,net}=require('electron');

const webTabs={browser:null,telegram:'https://web.telegram.org/',whatsapp:'https://web.whatsapp.com/'};
function httpsUrl(value){
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
class Companion {
  constructor(buildWindow,secureWeb,settings,save,announce){
    Object.assign(this,{buildWindow,secureWeb,settings,save,announce});
    this.tabs=new Map();this.active='browser';this.revision=0;
  }
  home(){return 'https://wowarcana.com/'+(this.settings.lang==='ru'?'ru':'');}
  state(){
    const tab=this.tabs.get(this.active),history=tab?.view.webContents.navigationHistory;
    return {active:this.active,url:tab?.url||'',failed:!!tab?.failed,back:!!history?.canGoBack(),forward:!!history?.canGoForward(),opacity:this.settings.panelOpacity||100,bookmarks:this.settings.bookmarks||[]};
  }
  layout(){
    const [width,height]=this.window.getContentSize();
    this.tabs.get(this.active)?.view.setBounds({x:0,y:110,width,height:Math.max(0,height-110)});
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
    const view=new WebContentsView({webPreferences:{...this.secureWeb,session:store}});
    tab={view,url:'',failed:false};this.tabs.set(key,tab);
    const wc=view.webContents;
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
    if(name==='panel-tab')this.show(value);
    if(name==='panel-home')this.show('browser',this.home());
    if(name==='panel-library')this.show('browser',this.home().replace(/\/$/,'')+'/library/items');
    if(name==='panel-url'&&typeof value==='string'){
      const url=httpsUrl(value.includes(':')?value:'https://'+value);
      if(!url)return false;
      this.show('browser',url);
    }
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
    this.tabs.clear();this.window?.destroy();this.window=null;
  }
}
module.exports={Companion};
