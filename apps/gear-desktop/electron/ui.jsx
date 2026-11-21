import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Layers,RefreshCw,LogOut,Monitor,Server} from 'lucide-react';
import {CharacterUpgrades} from '@/components/wow/audit/CharacterUpgrades';
import {characterSlug} from '@/lib/wow/characterSlug';
import './shell.css';

const api=window.gear;
function useShell(){
  const [s,set]=useState(null);
  useEffect(()=>{const off=api.subscribe(set);api.state().then(set);return off;},[]);
  return s;
}
function Overlay({s,t}){
  const data=s.hud;
  return <div className="hud"><header><img src="/brand.ico" alt=""/><strong>{data?.title||t('Подбор предметов','Gear planner')}</strong></header>
    <main>{data?.lines?.length?<ul>{data.lines.map((line,i)=><li key={i}>{line}</li>)}</ul>:<p>{data?.empty||t('Выберите персонажа и запустите подбор.','Choose a character and start a search.')}</p>}</main>
    <footer><button onClick={()=>api.action('open')}>{t('Открыть подбор','Open planner')}</button></footer></div>;
}
function Desk({s,t}){
  const [version,bump]=useState(0),[region,setRegion]=useState(()=>localStorage.getItem('region')||'eu');
  const [account,setAccount]=useState({status:'loading',list:[]}),[profile,setProfile]=useState(null),[problem,setProblem]=useState(''),[signError,setSignError]=useState(false);
  const lang=s.lang;
  useEffect(()=>{
    if(s.authOpen)return;
    const c=new AbortController();
    setAccount({status:'loading',list:[]});setProfile(null);setProblem('');
    (async()=>{
      const r=await fetch('/api/wow/characters/roster?'+new URLSearchParams({regions:region,locale:lang}),{signal:c.signal});
      if(r.status===401){setAccount({status:'auth',list:[]});return;}
      const entry=(await r.json()).regions?.[0];
      if(entry?.status===401){setAccount({status:'auth',list:[]});return;}
      if(!r.ok||entry?.status!==200)throw Error();
      setAccount({status:'ready',list:entry.characters});
    })().catch(()=>{if(!c.signal.aborted)setAccount({status:'error',list:[]});});
    return ()=>c.abort();
  },[version,region,lang,s.authOpen]);
  const selected=account.list.find(ch=>characterSlug(ch)===s.slug);
  useEffect(()=>{
    setProfile(null);setProblem('');if(!selected)return;
    const c=new AbortController();
    (async()=>{
      const r=await fetch('/api/wow/characters/'+encodeURIComponent(s.slug),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale:lang}),signal:c.signal});
      const result=await r.json();
      if(!r.ok||!result.snapshot){setProblem(result.error||'profile_unavailable');return;}
      setProfile(result);
    })().catch(()=>{if(!c.signal.aborted)setProblem('profile_unavailable');});
    return ()=>c.abort();
  },[selected,s.slug,lang]);
  const refresh=()=>bump(v=>v+1);
  return <div className="desktop gildra-atlas" data-atlas-scope="" data-theme="dark"><header className="toolbar">
    <div className="wordmark"><img src="/brand.ico" alt=""/><b>Gildra Gear</b></div>
    <label className="mode">{s.mode==='local'?<Monitor size={16}/>:<Server size={16}/>}<select aria-label={t('Где выполнять расчёт','Calculation mode')} value={s.mode} onChange={e=>api.action('mode',e.target.value)}>
      <option value="server">{t('Сервер Gildra','Gildra server')}</option><option value="local">{t('На моём ПК','On my PC')}</option></select></label>
    <button aria-pressed={s.overlay} onClick={()=>api.action('overlay')} title="Ctrl+Alt+G"><Layers size={16}/>{t('Оверлей','Overlay')}</button>
    <button className="lang" onClick={()=>api.action('lang',lang==='ru'?'en':'ru')}>{lang==='ru'?'EN':'RU'}</button>
    {account.status==='ready'&&<button aria-label={t('Выйти','Sign out')} title={t('Выйти','Sign out')} onClick={()=>api.action('logout')}><LogOut size={16}/></button>}
  </header>
  {account.status==='auth'?<main className="welcome"><div><img src="/assets/wow/characters/frost-login/crest.webp" alt=""/><h1>{t('Подбор предметов','Gear planner')}</h1>
    <p>{t('Войдите в Battle.net, чтобы подобрать экипировку для своего персонажа.','Sign in to Battle.net to find upgrades for your character.')}</p>
    <button className="primary" disabled={s.authOpen} onClick={()=>{setSignError(false);api.action('login').catch(()=>setSignError(true));}}>{t('Войти через Battle.net','Sign in with Battle.net')}</button>
    {signError&&<p role="alert">{t('Не удалось войти через Battle.net. Попробуйте ещё раз.','Could not sign in with Battle.net. Try again.')}</p>}</div></main>:
    <main className="workspace"><div className="context"><div data-character-identity><h1>{selected?.name||t('Персонажи','Characters')}</h1>
    {selected&&<p>{selected.realm.name} · {selected.playableClass.name} · {selected.level}</p>}</div>
    <div className="selectors"><select aria-label={t('Регион','Region')} value={region} onChange={e=>{localStorage.setItem('region',e.target.value);setRegion(e.target.value);}}>{['eu','us','kr','tw'].map(v=><option key={v} value={v}>{v.toUpperCase()}</option>)}</select>
    {account.list.length>0&&<select aria-label={t('Персонаж','Character')} value={selected?s.slug:''} onChange={e=>api.action('character',e.target.value)}><option value="">{t('Выбрать персонажа','Choose character')}</option>{account.list.map(ch=><option value={characterSlug(ch)} key={characterSlug(ch)}>{ch.name} · {ch.realm.name}</option>)}</select>}
    <button title={t('Обновить данные','Refresh data')} aria-label={t('Обновить данные','Refresh data')} onClick={refresh}><RefreshCw size={16}/></button></div></div>
    {account.status==='error'?<p role="alert">{t('Не удалось получить данные Gildra. Проверьте интернет и обновите данные.','Gildra data is unavailable. Check your connection and refresh.')}</p>:
      account.status==='loading'||selected&&!profile&&!problem?<p role="status">{t('Загружаем персонажей и экипировку…','Loading characters and equipment…')}</p>:
      problem?<p role="alert">{problem==='incomplete_profile'?t('У персонажа нет активного набора талантов.','The character has no active talent loadout.'):t('Не удалось обновить профиль персонажа.','Could not refresh the character profile.')}</p>:
      profile?<section data-tool-panel="upgrades"><CharacterUpgrades key={s.slug+profile.fingerprint+lang} snapshot={profile.snapshot} snapshotKey={profile.fingerprint} localePrefix={lang==='ru'?'/ru':''}/></section>:
      <p>{!account.list.length?t('В этом регионе нет персонажей.','No characters in this region.'):t('Выберите персонажа для подбора.','Choose a character to find upgrades.')}</p>}
    </main>}</div>;
}
function App(){
  const s=useShell();const t=(ru,en)=>s?.lang==='en'?en:ru;
  useEffect(()=>{document.documentElement.lang=s?.lang||'ru';},[s?.lang]);
  if(!s)return null;
  return location.hostname==='overlay'?<Overlay s={s} t={t}/>:<Desk s={s} t={t}/>;
}
createRoot(document.getElementById('root')).render(<App/>);
