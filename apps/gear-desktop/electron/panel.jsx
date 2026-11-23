import React,{useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,RefreshCw,Star,X,House,BookOpen} from 'lucide-react';
const act=(name,v)=>window.gear.action(name,v);
export function Panel({s,t}){
  const p=s.panel,[address,setAddress]=useState(p.url),[invalid,setInvalid]=useState(false);
  useEffect(()=>{setAddress(p.url);setInvalid(false);},[p.url,p.active]);
  const icon=(name,label,Icon,disabled=false)=><button aria-label={label} title={label} disabled={disabled} onClick={()=>act(name)}><Icon size={16}/></button>;
  return <div className="web-panel"><header className="chrome"><strong>Gildra Gear</strong>
    {Object.entries({browser:t('Браузер','Browser'),telegram:'Telegram',whatsapp:'WhatsApp'}).map(([k,label])=><button key={k} aria-pressed={p.active===k} onClick={()=>act('panel-tab',k)}>{label}</button>)}
    {icon('window-close',t('Скрыть панель','Hide panel')+' · Ctrl+Alt+B',X)}</header>
    <form onSubmit={async e=>{e.preventDefault();setInvalid(!await act('panel-url',address.trim()));}}>
      {iconNav('panel-back',t('Назад','Back'),ArrowLeft,!p.back)}{iconNav('panel-forward',t('Вперёд','Forward'),ArrowRight,!p.forward)}
      {iconNav('panel-refresh',t('Обновить','Reload'),RefreshCw)}
      <input aria-label={t('Адрес','Address')} value={address} aria-invalid={invalid} readOnly={p.active!=='browser'} onChange={e=>setAddress(e.target.value)}/>
      {p.active==='browser'&&iconNav('panel-bookmark',t('Добавить или убрать закладку','Toggle bookmark'),Star)}
    </form>
    <nav><button onClick={()=>act('panel-home')}><House size={13}/>{t('Главная Gildra','Gildra home')}</button>
      <button onClick={()=>act('panel-library')}><BookOpen size={13}/>{t('База предметов','Item database')}</button>
      {p.bookmarks.length>0&&<select aria-label={t('Закладки','Bookmarks')} value="" onChange={e=>act('panel-url',e.target.value)}><option value="">{t('Закладки','Bookmarks')}</option>{p.bookmarks.map(b=><option key={b.url} value={b.url}>{b.title}</option>)}</select>}
      {p.failed&&<small role="alert">{t('Не удалось загрузить страницу','Page failed to load')}</small>}
      <input aria-label={t('Непрозрачность панели','Panel opacity')} type="range" min="40" max="100" value={p.opacity} onChange={e=>act('panel-opacity',Number(e.target.value))}/></nav>
  </div>;
}
function iconNav(name,label,Icon,disabled=false){return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={()=>act(name)}><Icon size={15}/></button>;}
