const {execFile,spawn}=require('node:child_process');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {promisify}=require('node:util');
const run=promisify(execFile);
function command(){
  const script=readFileSync(join(__dirname,'spotify-session.ps1'),'utf8');
  const exe=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  return {exe,args:['-NoLogo','-NoProfile','-NonInteractive','-Command',script]};
}
async function spotifySession(toggle=false){
  if(process.platform!=='win32')return null;
  const {exe,args}=command();
  const {stdout}=await run(exe,args,{
    windowsHide:true,timeout:6500,env:{...process.env,GILDRA_SPOTIFY_ACTION:toggle?'toggle':'read'}
  });
  return JSON.parse(stdout.trim());
}
function watchSpotify(onState){
  const {exe,args}=command();
  const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','ignore'],env:{...process.env,GILDRA_SPOTIFY_ACTION:'watch'}});
  const lines=require('node:readline').createInterface({input:child.stdout});
  lines.on('line',line=>{try{onState(JSON.parse(line));}catch{}});
  child.once('error',()=>onState(null));child.once('exit',()=>onState(null));
  return child;
}
function spotifyUri(address){
  try{
    const u=new URL(address);
    const m=u.pathname.match(/^\/(?:intl-[\w-]+\/|embed\/)?(track|album|artist|playlist|episode|show)\/([a-zA-Z0-9]+)\/?$/);
    if(u.origin==='https://open.spotify.com' && m)return 'spotify:'+m[1]+':'+m[2];
  }catch{}
  return 'spotify:';
}
module.exports={spotifySession,spotifyUri,watchSpotify};
