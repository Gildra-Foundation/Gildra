const {app, BrowserWindow, WebContentsView, globalShortcut, ipcMain, Menu, net, protocol, screen, session} = require('electron');
const fs = require('node:fs');
const {join, resolve, sep} = require('node:path');
const {pathToFileURL} = require('node:url');
const {Planner} = require('./planner.cjs');

const site = 'https://wowarcana.com';
const handshake = site + '/api/wow/gear-desktop-data?read=session';
const callbackPath = '/api/auth/callback/battlenet';
const accountReturn = 'https://account.battle.net/overview';
const calc = new Set(['/api/wow/auction-gear-plans','/api/wow/gear-farm-plans','/api/wow/auction-shopping-list']);
const reads = new Set(['session','character','snapshot','market','equipment','icon','item','prices']);
const extractHud = fs.readFileSync(join(__dirname,'overlay.js'),'utf8');
const secureWeb = {sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true};
const dataDir=app.getPath('userData'), settingsFile=join(dataDir,'settings.json');
let settings = {mode:'server',lang:'ru',slug:''};
try { Object.assign(settings,JSON.parse(fs.readFileSync(settingsFile,'utf8'))); } catch {}
if (!['local','server'].includes(settings.mode)) settings.mode='server';
if (!['ru','en'].includes(settings.lang)) settings.lang='ru';
if(!Number.isInteger(settings.opacity)||settings.opacity<20||settings.opacity>100)settings.opacity=85;
const json = (value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const error=(name,status)=>json({error:name},status);
let main, hud, login, signingIn, identity, planner, authHost='', overlayShown=false, hudData=null, reading=false, exiting=false, loggingOut=false;
let hudGame=false, editKey='', pendingProfile=null;
const shortcuts=['Ctrl+Alt+E','Ctrl+Shift+E','Alt+Shift+G','Ctrl+Alt+H'];
function bindKey(key){
  if(key===editKey)return true;
  if(!shortcuts.includes(key)||!globalShortcut.register(key,()=>{if(overlayShown)setHudGame(!hudGame);}))return false;
  if(editKey)globalShortcut.unregister(editKey);
  editKey=key;return true;
}
function setHudGame(game){
  if(!hud)return;
  const bounds=settings.bounds && {...settings.bounds};
  hudGame=game;
  hud.setIgnoreMouseEvents(game);
  hud.setFocusable(!game);
  const pin=settings.pin?.slug===settings.slug && settings.pin.row;
  if(game && pin) {
    settings.bounds=hud.getBounds();save();
    hud.setMinimumSize(260,54);hud.setResizable(false);
    hud.setBounds({...settings.bounds,height:58});
  } else if(!game){
    hud.setResizable(true);hud.setMinimumSize(260,170);
    if(bounds)hud.setBounds(bounds);
  }
  announce();
}
function save(){
  const tmp=settingsFile+'.tmp';
  fs.mkdirSync(dataDir,{recursive:true});
  fs.writeFileSync(tmp,JSON.stringify(settings),{mode:0o600});fs.renameSync(tmp,settingsFile);
}
function windowState(w){
  return {mode:settings.mode,lang:settings.lang,slug:settings.slug,overlay:overlayShown,opacity:settings.opacity,
    hudGame,editKey,shortcuts, pin:settings.pin?.slug===settings.slug?settings.pin.row:null, profiles:(settings.profiles||[]).filter(p=>p.slug===settings.slug),pendingProfile, hud:w===hud?hudData:null,authOpen:!!login,authHost:w===login?authHost:'',maximized:w.isMaximized()};
}
function announce(){for(const w of [main,hud,login]) if(w&&!w.isDestroyed())w.webContents.send('gear:state',windowState(w));}
function localWindow(e){
  if(e.senderFrame!==e.sender.mainFrame || !e.senderFrame.url.startsWith('gear://'))return null;
  return [main,hud,login].find(w=>w&&!w.isDestroyed()&&w.webContents===e.sender);
}
function safeProvider(u) {
  return u.protocol==='https:' && !u.username && !u.password && !u.port &&
    ['battle.net','blizzard.com','battlenet.com.cn'].some(h=>u.hostname===h || u.hostname.endsWith('.'+h));
}
async function api(path,method='GET',body,signal){
  const headers={Accept:'application/json'};
  if(method==='POST'){headers['Content-Type']='application/json';headers.Origin=site;}
  return identity.fetch(site+path,{method,headers,body:body??undefined,credentials:'include',cache:'no-store',redirect:'error',signal});
}
async function readInput(query){
  const params=new URLSearchParams(query);
  if(!reads.has(params.get('read')))return {status:400,body:'{}'};
  const response=await api('/api/wow/gear-desktop-data?'+params,'GET',null,AbortSignal.timeout(49000));
  return {status:response.status,body:await response.text()};
}
function localPlanner(){
  if (!planner || planner.closed) planner=new Planner(join(__dirname,'..','..','runtime'),join(dataDir,'checkpoints'),readInput);
  return planner;
}
async function gearProtocol(request){
  const url=new URL(request.url), {hostname,pathname}=url;
  if(!['server','local','overlay','auth'].includes(hostname)) return error('not_found',404);
  if(pathname.startsWith('/api/')){
    if(hostname==='overlay' || hostname!==settings.mode || loggingOut) return error('inactive_mode',409);
    const method=request.method;
    const roster=pathname==='/api/wow/characters/roster' && method==='GET';
    const profile=/^\/api\/wow\/characters\/[^/]+$/.test(pathname) && method==='POST';
    const sessionCheck=pathname==='/api/wow/gear-desktop-data' && url.search==='?read=session' && method==='GET';
    if(!roster && !profile && !sessionCheck && !(calc.has(pathname)&&['GET','POST','DELETE'].includes(method))) return error('not_found',404);
    try {
      const body=method==='POST'?await request.text():null;
      if(body && Buffer.byteLength(body)>4*1024*1024) return error('request_too_large',413);
      if(hostname==='local'&&calc.has(pathname)){
        const result=await localPlanner().request(pathname+url.search,method,body,request.signal);
        return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
      }
      const response=await api(pathname+url.search,method,body,request.signal);
      if(!response.headers.get('content-type')?.includes('json')) return error('service_unavailable',503);
      return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    } catch {return error('network_unavailable',503);}
  }
  if (request.method!=='GET') return error('method_not_allowed',405);
  const root=resolve(__dirname,'public');
  let file;try {file=resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));} catch{return error('invalid_path',400);}
  if(!file.startsWith(root+sep))return error('not_found',404);
  if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile()){
    if(!/^\/assets\/[^?#]+\.(?:webp|png|jpg|jpeg|avif)$/i.test(pathname))return error('not_found',404);
    try {
      const image=await net.fetch(site+pathname,{credentials:'omit',redirect:'error',signal:request.signal});
      if(image.ok && /^image\/(?:png|jpeg|webp|avif)(?:;|$)/i.test(image.headers.get('content-type')||''))return image;
    }catch{}
    return error('not_found',404);
  }
  return net.fetch(pathToFileURL(file).href);
}
function buildWindow(options){
  const w=new BrowserWindow({frame:false,backgroundColor:'#101721',autoHideMenuBar:true,icon:join(__dirname,'public','brand.ico'),...options,
    webPreferences:{...secureWeb,preload:join(__dirname,'preload.cjs'),backgroundThrottling:false}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',e=>e.preventDefault());
  w.on('maximize',announce);w.on('unmaximize',announce);
  return w;
}
async function updateHud(){
  if(reading||!hud?.isVisible()||!main||main.isDestroyed())return;
  reading=true;const page=main.webContents.getURL();
  try{const data=await main.webContents.executeJavaScript(extractHud);if(page===main.webContents.getURL()&&JSON.stringify(hudData)!==JSON.stringify(data)){hudData=data;announce();}}
  catch{}finally{reading=false;}
}
function raiseHud(){
  if(!overlayShown || !hud || hud.isDestroyed() || exiting)return;
  if(!hud.isVisible())hud.showInactive();
  hud.moveTop();
}
function hideHud(){
  overlayShown=false;
  if(hudGame)setHudGame(false);
  hud?.hide();
  announce();
}
function toggleHud(){
  if(overlayShown){hideHud();return;}
  if(!hud){
    const area=screen.getPrimaryDisplay().workArea;
    const bounds=settings.bounds;
    const onScreen=bounds&&[bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)&&bounds.width>=260 && bounds.height>=170 &&
      screen.getAllDisplays().some(({workArea:r})=>bounds.x+40>=r.x && bounds.x+40<r.x+r.width && bounds.y+20>=r.y && bounds.y+20<r.y+r.height);
    hud=buildWindow({title:'Gildra Gear · Overlay',...(onScreen?bounds:{x:area.x+area.width-380,y:area.y+20,width:360,height:440}),minWidth:260,minHeight:170,show:false,skipTaskbar:true,minimizable:false,maximizable:false,fullscreenable:false,alwaysOnTop:true,backgroundMaterial:'acrylic',backgroundColor:'#00000000'});
    hud.setOpacity(settings.opacity/100);
    hud.setAlwaysOnTop(true,'screen-saver');
    hud.on('blur',()=>setImmediate(raiseHud));
    hud.on('close',e=>{if(!exiting){e.preventDefault();hideHud();}});
    const storeBounds=()=>{if(!exiting&&!hudGame){settings.bounds=hud.getBounds();save();}};
    hud.on('moved',storeBounds);hud.on('resized',storeBounds);
    void hud.loadURL('gear://overlay/');
  }
  overlayShown=true;hud.showInactive();raiseHud();announce();void updateHud();
}
async function authorizationURL(){
  const csrf=await (await api('/api/auth/csrf')).json();
  if(typeof csrf.csrfToken!=='string')throw Error('auth_unavailable');
  const reply=await identity.fetch(site+'/api/auth/signin/battlenet',{method:'POST',credentials:'include',
    headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1',Origin:site},
    body:new URLSearchParams({csrfToken:csrf.csrfToken,callbackUrl:handshake}).toString(),redirect:'error'});
  const start=new URL((await reply.json()).url);
  if(!reply.ok||!safeProvider(start))throw Error('auth_unavailable');
  return start.href;
}
async function authenticate(){
  if(login){login.focus();return;}
  const start=await authorizationURL();
  if(exiting || main.isDestroyed())return;
  const dialog=login=buildWindow({parent:main,width:700,height:760,minWidth:360,minHeight:320,title:'Battle.net',show:false});
  const provider=new WebContentsView({webPreferences:{...secureWeb,session:identity}});
  const remote=provider.webContents;
  remote.setWindowOpenHandler(()=>({action:'deny'}));
  dialog.contentView.addChildView(provider);
  // The local title bar owns the first 44 device-independent pixels.
  const layout=()=>{
    const [width,height]=dialog.getContentSize();
    provider.setBounds({x:0,y:44,width,height:Math.max(0,height-44)});
  };
  layout();dialog.on('resize',layout);
  remote.on('did-navigate',(_event,address)=>{
    const url=new URL(address);
    authHost=safeProvider(url)?url.hostname:'';
    announce();
  });
  let accountLoginUsed=false, awaitingAccount=false, failed=false;
  const finish=(error=false)=>{
    if(dialog.isDestroyed())return;
    failed=error;
    dialog.close();
  };
  const navigate=async(url)=>{
    try{if(!dialog.isDestroyed())await remote.loadURL(url);}
    catch(err){if(err.code!=='ERR_ABORTED')finish(true);}
  };
  const allow=e=>{
    if(!e.isMainFrame)return;
    const u=new URL(e.url);
    // Battle.net's shared sign-in / sign-up form rejects the nested OAuth URL
    // when it passes it to account creation. Finish that form on Battle.net,
    // then request fresh OAuth state and PKCE using the same cookie session.
    if(!accountLoginUsed && safeProvider(u) &&
        (u.hostname==='account.battle.net'||u.hostname.endsWith('.account.battle.net')) &&
        /^\/login(?:\/|$)/.test(u.pathname) && u.searchParams.has('ref')){
      e.preventDefault();
      accountLoginUsed=true;awaitingAccount=true;
      const form=new URL(u.pathname,u.origin);
      form.searchParams.set('ref',accountReturn);
      void navigate(form.href);
      return;
    }
    if(awaitingAccount && u.origin==='https://account.battle.net' && /^\/overview\/?$/.test(u.pathname)){
      e.preventDefault();awaitingAccount=false;
      void authorizationURL().then(navigate,()=>finish(true));
      return;
    }
    if((u.origin===site||u.origin==='https://gildra.net') && u.pathname===callbackPath){
      dialog.hide();return;
    }
    if(u.href===handshake){e.preventDefault();finish();return;}
    if(!safeProvider(u)){e.preventDefault();finish(true);}
  };
  remote.on('will-navigate',allow);remote.on('will-redirect',allow);
  remote.on('did-fail-load',(_event,code,_message,_url,top)=>{if(top&&code!==-3)finish(true);});
  remote.on('did-finish-load',()=>{
    if(!remote.isDestroyed() && remote.getURL().startsWith(site+callbackPath))finish(true);
  });
  const closed=new Promise(resolve=>dialog.once('closed',()=>{
    login=null;authHost='';
    if(!remote.isDestroyed())remote.close();
    announce();resolve();
  }));
  announce();
  try{
    await dialog.loadURL('gear://auth/');
    if(!dialog.isDestroyed()){dialog.show();remote.focus();void navigate(start);}
  }catch{finish(true);}
  await closed;
  if(failed)throw Error('auth_unavailable');
}
function resetPlanner(){planner?.close();planner=null;hudData=null;}
async function action(e,name,value){
  const w=localWindow(e);
  if(!w)throw Error('invalid_source');
  if(w===hud && name==='opacity' && Number.isInteger(value) && value>=20 && value<=100){
    settings.opacity=value;hud.setOpacity(value/100);save();announce();return;
  }
  if(w===hud && name==='item-media'){
    const row=hudData?.rows.find(row=>row.item?.itemId===value);
    if(!row || !Number.isSafeInteger(value)||value<=0)return {};
    const query={id:String(value),region:settings.slug.split('--')[0],locale:settings.lang==='ru'?'ru_RU':'en_GB'};
    const read=async kind=>{const reply=await readInput({...query,read:kind});return reply.status===200?JSON.parse(reply.body):{};};
    const [media,base]=await Promise.all([read('icon'),row.consumable?read('item'):{}]);
    const iconUrl=media.assets?.find(asset=>asset.key==='icon'&&asset.value?.startsWith('https://'))?.value;
    return {iconUrl,...(row.consumable?{name:base.name,quality:base.quality?.id,effects:base.description?[base.description]:undefined}:{})};
  }
  if(name==='window-close'){if(w===hud)hideHud();else w.close();return;}
  if(w!==hud && name==='window-minimize'){w.minimize();return;}
  if(w!==hud && name==='window-maximize'){if(w.isMaximized())w.unmaximize();else w.maximize();return;}
  if(w===login)return;
  if(name==='hud-game' && (w===main || w===hud) && overlayShown)return setHudGame(!hudGame);
  if(name==='edit-key' && (w===hud || w===main)){
    if(!bindKey(value))return false;
    settings.editKey=value;save();announce();return true;
  }
  if(w===hud && name==='pin'){
    const row=value===null?null:hudData?.rows[value];
    if(row?.item || value===null){settings.pin=row?{slug:settings.slug,row}:null;save();announce();}
    return;
  }
  if(w===main && name==='overlay')return toggleHud();
  if(w===hud && name==='open'){if(main.isMinimized())main.restore();main.show();main.focus();return;}
  if(w!==main)return;
  if(name==='profile-save' && settings.slug && typeof value?.name==='string' && value.name.trim() && value.name.length<=48 && typeof value.budget==='string' && value.budget.length<=32){
    const entry={name:value.name.trim(),slug:settings.slug,mode:settings.mode,budget:value.budget,farm:value.farm};
    settings.profiles=[...(settings.profiles||[]).filter(p=>p.slug!==entry.slug || p.name!==entry.name),entry];save();announce();return;
  }
  if(name==='profile-load'){
    const profile=settings.profiles?.find(p=>p.slug===settings.slug && p.name===value);
    if(!profile)return;
    pendingProfile=profile;
    if(profile.mode!==settings.mode){settings.mode=profile.mode;hudData=null;save();await main.loadURL('gear://'+settings.mode+'/');}
    announce();return;
  }
  if(name==='profile-applied'){pendingProfile=null;announce();return;}
  if(name==='login'){signingIn??=authenticate().finally(()=>{signingIn=null;});return signingIn;}
  if(name==='logout'){
    loggingOut=true;
    try{resetPlanner();await identity.clearStorageData();settings.slug='';settings.pin=null;pendingProfile=null;hideHud();save();await main.webContents.session.clearStorageData({storages:['localstorage']});loggingOut=false;await main.loadURL('gear://'+settings.mode+'/');}
    finally{loggingOut=false;}
  }
  if(name==='mode'&&['local','server'].includes(value)&&value!==settings.mode){
    settings.mode=value;hudData=null;save();await main.loadURL('gear://'+value+'/');
  }
  if(name==='lang'&&['ru','en'].includes(value)){settings.lang=value;save();}
  if(name==='character'&&typeof value==='string'&&value.length<256){if(settings.slug!==value){pendingProfile=null;hudData=null;if(hudGame)setHudGame(false);}settings.slug=value;save();}
  announce();
}
protocol.registerSchemesAsPrivileged([{scheme:'gear',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{main?.restore();main?.show();main?.focus();});
  app.whenReady().then(()=>{
    Menu.setApplicationMenu(null);
    identity=session.fromPartition('persist:gildra-account');
    identity.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));identity.setPermissionCheckHandler(()=>false);
    const mayCopy=(wc,permission)=>permission==='clipboard-sanitized-write' && !!main && wc===main.webContents && wc.getURL().startsWith('gear://');
    session.defaultSession.setPermissionRequestHandler((wc,p,cb)=>cb(mayCopy(wc,p)));
    session.defaultSession.setPermissionCheckHandler(mayCopy);
    session.defaultSession.protocol.handle('gear',gearProtocol);
    ipcMain.handle('gear:action',action);
    ipcMain.handle('gear:state',e=>{const w=localWindow(e);return w?windowState(w):null;});
    main=buildWindow({title:'Gildra Gear',width:1180,height:820,minWidth:390,minHeight:360});
    main.on('minimize',()=>setImmediate(raiseHud));
    main.on('focus',()=>setImmediate(raiseHud));
    main.on('closed',()=>{if(!exiting)app.quit();});
    void main.loadURL('gear://'+settings.mode+'/');
    globalShortcut.register('CommandOrControl+Alt+G',toggleHud);
    if(!bindKey(settings.editKey))for(const key of shortcuts)if(bindKey(key))break;
    setInterval(updateHud,1200).unref();
  });
  app.on('before-quit',()=>{
    exiting=true;
    if(login&&!login.isDestroyed())login.destroy();
    if(hud&&!hud.isDestroyed())hud.destroy();
    resetPlanner();
  });
  app.on('will-quit',()=>globalShortcut.unregisterAll());
}
