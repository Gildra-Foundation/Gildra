import React,{useEffect,useRef,useState} from 'react';
import {farmPreferencesKey,readFarmPreferences,writeFarmPreferences} from '@/lib/wow/gearFarm/preferences';

export function Profiles({s,t,fingerprint,form}){
  const [name,setName]=useState(''),[selected,setSelected]=useState('');
  const applied=useRef(false);
  const key=farmPreferencesKey(s.slug,fingerprint);
  useEffect(()=>{
    const p=s.pendingProfile;
    if(!p){applied.current=false;return;}
    if(applied.current || form.locked || p.slug!==s.slug || p.mode!==s.mode)return;
    applied.current=true;
    form.setBudget(p.budget);
    writeFarmPreferences(key,p.farm);
    setSelected(p.name);setName(p.name);
    void window.gear.action('profile-applied');
  },[s.pendingProfile,s.slug,s.mode,key,form]);
  return <div className="gear-profiles selectors">
    <select aria-label={t('Профиль подбора','Planner profile')} value={selected} onChange={e=>{setSelected(e.target.value);setName(e.target.value);}}>
      <option value="">{t('Выбрать профиль','Choose profile')}</option>{s.profiles.map(p=><option key={p.name}>{p.name}</option>)}
    </select>
    <button disabled={!selected||form.locked} onClick={()=>window.gear.action('profile-load',selected)}>{t('Применить','Apply')}</button>
    <input aria-label={t('Название профиля','Profile name')} placeholder={t('Название профиля','Profile name')} maxLength={48} value={name} onChange={e=>setName(e.target.value)}/>
    <button disabled={!name.trim()||!form.budget||form.locked} onClick={async()=>{await window.gear.action('profile-save',{name:name.trim(),budget:form.budget,farm:JSON.parse(readFarmPreferences(key))});setSelected(name.trim());}}>{t('Сохранить профиль','Save profile')}</button>
  </div>;
}
