const {spawn} = require('node:child_process');
const {join} = require('node:path');
const {createInterface} = require('node:readline');
const {randomUUID} = require('node:crypto');

const unavailable = {status:503, body:'{"error":"desktop_unavailable"}'};
class Planner {
  constructor(runtime, checkpoints, read) {
    this.pending = new Map();
    this.closed = false;
    const env = {...process.env, GILDRA_AUCTION_STATE_DIR:checkpoints};
    delete env.NODE_OPTIONS;
    const exe = process.platform === 'win32' ? 'node.exe' : 'node';
    this.child = spawn(join(runtime,exe), [join(runtime,'planner.mjs')], {cwd:runtime,env,windowsHide:true,stdio:['pipe','pipe','ignore']});
    const stop = () => {
      this.closed = true;
      for (const settle of this.pending.values()) settle(unavailable);
      this.pending.clear();
    };
    this.child.on('error',stop);
    this.child.on('exit',stop);
    this.child.stdin.on('error',stop);
    createInterface({input:this.child.stdout,crlfDelay:Infinity}).on('line', async line=>{
      let msg; try {msg = JSON.parse(line);} catch {return;}
      if (msg.type === 'response') this.pending.get(msg.id)?.(msg);
      if (msg.type === 'read') {
        let r;
        try { r = await read(msg.query); } catch { r = unavailable; }
        this.write({type:'data', id:msg.id, status:r.status, body:r.body});
      }
    });
  }
  write(msg) { if (!this.closed && this.child.stdin.writable) this.child.stdin.write(JSON.stringify(msg)+'\n'); }
  request(path,method,body,signal) {
    if (this.closed || signal.aborted) return Promise.resolve(unavailable);
    const id=randomUUID();
    return new Promise(resolve=>{
      const finish = value=>{
        clearTimeout(timer);
        signal.removeEventListener('abort',abort);
        this.pending.delete(id);
        resolve(value);
      };
      const abort=()=>{this.write({type:'cancel',id});finish(unavailable);};
      const timer=setTimeout(abort,210000);
      this.pending.set(id,finish);
      signal.addEventListener('abort',abort,{once:true});
      this.write({type:'request',id,path,method,body});
    });
  }
  close(){
    if(this.closed)return;
    if(process.platform==='win32' && this.child.pid){
      const killer=spawn(join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      killer.on('error',()=>this.child.stdin.end());
    }else this.child.stdin.end();
  }
}
module.exports = {Planner};
