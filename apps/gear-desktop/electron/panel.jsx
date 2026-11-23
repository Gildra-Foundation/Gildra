import React,{useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,RefreshCw,Star,X,House,BookOpen,Play,Pause,Volume2,VolumeX,PictureInPicture2} from 'lucide-react';
const act=(name,v)=>window.gear.action(name,v);
const music={soundcloud:'SoundCloud',spotify:'Spotify',youtube:'YouTube'};
export function Player({player,t}){
  const [notice,setNotice]=useState(false);
  useEffect(()=>setNotice(false),[player?.key,player?.title,player?.playing]);
  if(!player)return null;
  const Toggle=player.playing?Pause:Play,Sound=player.muted?VolumeX:Volume2;
  return <div className="media-strip">
    <button title={t('Мини-плеер поверх игры','Floating mini player')} aria-label={t('Мини-плеер','Mini player')} onClick={()=>act('mini-open')}><PictureInPicture2 size={16}/></button>
    <button className="media-title" title={player.service+' · '+player.title} onClick={()=>act('media-open')}>{player.title}</button>
    <button aria-label={player.playing?t('Пауза','Pause'):t('Воспроизвести','Play')} onClick={async()=>setNotice(!await act('media-toggle'))}><Toggle size={15}/></button>
    {!player.native&&<button aria-label={t('Отключить звук','Mute')} aria-pressed={player.muted} onClick={()=>act('media-mute')}><Sound size={15}/></button>}
    {notice&&<small role="status">{t('Выбери трек в плеере','Choose a track in the player')}</small>}
  </div>;
}
export function Panel({s,t}){
  const p=s.panel,[address,setAddress]=useState(p.url),[invalid,setInvalid]=useState(false),[connecting,setConnecting]=useState(false),[missing,setMissing]=useState(false);
  useEffect(()=>{setAddress(p.url);setInvalid(false);setMissing(false);},[p.url,p.active]);
  const icon=(name,label,Icon,disabled=false)=><button aria-label={label} title={label} disabled={disabled} onClick={()=>act(name)}><Icon size={16}/></button>;
  return <div className="web-panel"><header className="chrome"><strong>Gildra Gear</strong>
    {Object.entries({browser:t('Браузер','Browser'),telegram:'Telegram',whatsapp:'WhatsApp'}).map(([k,label])=><button key={k} aria-pressed={p.active===k} onClick={()=>act('panel-tab',k)}>{label}</button>)}
    <select className="media-select" aria-label={t('Музыка и видео','Music and video')} value={music[p.active]?p.active:''} onChange={e=>act('panel-tab',e.target.value)}>
      <option value="" disabled>{t('Плеер','Player')}</option>{Object.entries(music).map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </select>
    {icon('window-close',t('Скрыть панель','Hide panel')+' · Ctrl+Alt+B',X)}</header>
    <form onSubmit={async e=>{e.preventDefault();setInvalid(!await act('panel-url',address.trim()));}}>
      {iconNav('panel-back',t('Назад','Back'),ArrowLeft,!p.back)}{iconNav('panel-forward',t('Вперёд','Forward'),ArrowRight,!p.forward)}
      {iconNav('panel-refresh',t('Обновить','Reload'),RefreshCw)}
      <input aria-label={t('Адрес','Address')} value={address} aria-invalid={invalid} readOnly={p.active!=='browser'&&!music[p.active]} onChange={e=>setAddress(e.target.value)}/>
      {music[p.active]&&iconNav('panel-service-home',music[p.active],House)}
      {p.windows&&p.active==='spotify'&&<button type="button" disabled={connecting} onClick={async()=>{setConnecting(true);try{setMissing(!await act('panel-spotify-desktop'));}finally{setConnecting(false);}}}>{connecting?'…':t('Spotify на ПК','Desktop Spotify')}</button>}
      {p.canEmbed && <button type="button" onClick={()=>act('panel-embed')}>{t('В плеер','Open player')}</button>}
      {p.active==='browser'&&iconNav('panel-bookmark',t('Добавить или убрать закладку','Toggle bookmark'),Star)}
    </form>
    <nav><button onClick={()=>act('panel-home')}><House size={13}/>{t('Главная Gildra','Gildra home')}</button>
      <button onClick={()=>act('panel-library')}><BookOpen size={13}/>{t('База предметов','Item database')}</button>
      {p.bookmarks.length>0&&<select aria-label={t('Закладки','Bookmarks')} value="" onChange={e=>act('panel-url',e.target.value)}><option value="">{t('Закладки','Bookmarks')}</option>{p.bookmarks.map(b=><option key={b.url} value={b.url}>{b.title}</option>)}</select>}
      {missing&&<small role="status">{t('Включи трек в Spotify на ПК','Start a track in desktop Spotify')}</small>}{p.failed&&<small role="alert">{t('Не удалось загрузить страницу','Page failed to load')}</small>}
      <input aria-label={t('Непрозрачность панели','Panel opacity')} type="range" min="40" max="100" value={p.opacity} onChange={e=>act('panel-opacity',Number(e.target.value))}/></nav><Player player={s.player} t={t}/>
  </div>;
}
function iconNav(name,label,Icon,disabled=false){return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={()=>act(name)}><Icon size={15}/></button>;}
