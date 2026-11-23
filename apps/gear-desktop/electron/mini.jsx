import React,{useEffect,useState} from 'react';
import {Music2,Play,Pause,Volume2,X,ExternalLink} from 'lucide-react';

const act=(name,value)=>window.gear.action(name,value);
function time(seconds=0){
  const n=Math.floor(seconds);
  return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
}
function Slider({label,value,max,commit,disabled,step=1}){
  const [draft,setDraft]=useState(null);
  function finish(input){
    commit(Number(input.value));
    setDraft(null);
  }
  return <input type="range" aria-label={label} title={label} disabled={disabled} min="0" max={max} step={step}
    value={draft??value} onChange={e=>setDraft(Number(e.target.value))}
    onPointerUp={e=>finish(e.currentTarget)} onKeyUp={e=>{if(draft!==null)finish(e.currentTarget);}}
    onPointerCancel={()=>setDraft(null)} onBlur={()=>setDraft(null)}/>;
}
export function Mini({player,t}){
  const [data,setData]=useState(null);
  const key=player?.key;
  useEffect(()=>{
    let active=true,timer;
    setData(null);
    async function poll(){
      try{const current=await act('mini-read');if(active)setData(current);}
      finally{if(active)timer=setTimeout(poll,650);}
    }
    if(key&&!player.native)void poll();
    return ()=>{active=false;clearTimeout(timer);};
  },[key,player?.native,player?.title]);
  const Toggle=player?.playing?Pause:Play;
  const name=data?.title||player?.title||t('Выбрать музыку','Choose music');
  const change=(name,amount)=>act(name,{key,amount});
  return <main className="mini-radio">
    <div className="mini-cover">{data?.art?<img src={data.art} alt="" referrerPolicy="no-referrer"/>:<Music2/>}</div>
    <section className="mini-track"><small>{player?.service||'Gildra Gear'}{data?.artist?' · '+data.artist:''}</small>
      <strong title={name}>{name}</strong></section>
    <button className="mini-close" aria-label={t('Закрыть','Close')} onClick={()=>act('window-close')}><X size={14}/></button>
    <div className="mini-timeline"><Slider label={t('Позиция трека','Track position')} value={data?.position||0} max={data?.duration||1}
      disabled={!data?.seekable||!data.duration} commit={v=>change('mini-seek',v)}/><span>{data?.duration?time(data.position)+' / '+time(data.duration):'—'}</span></div>
    <div className="mini-controls"><button aria-label={player?.playing?t('Пауза','Pause'):t('Играть','Play')} disabled={!player} onClick={()=>act('media-toggle')}><Toggle size={16}/></button>
      <Volume2 size={14}/><Slider label={t('Громкость','Volume')} value={player?.muted?0:data?.volume??0} max={1} step={0.01} disabled={data?.volume==null} commit={v=>change('mini-volume',v)}/>
      <button className="mini-source" aria-label={t('Открыть сервис','Open service')} onClick={()=>act('media-open')}><ExternalLink size={15}/></button></div>
  </main>;
}
