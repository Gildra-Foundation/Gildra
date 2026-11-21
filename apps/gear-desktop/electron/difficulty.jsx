import React from 'react';
import {AtlasValyroSelect as Select} from '@gildra/atlas-ui/AtlasValyroSelect';
import {Shield,Swords,Flame,Crown,KeyRound,Users} from 'lucide-react';

const symbols={normal:Shield,heroic:Flame,mythic:Crown,'mythic-plus':KeyRound,'raid-finder':Users};
export function AtlasValyroSelect(props){
  const {id,value,options,onValueChange}=props;
  if(!id.endsWith('-dungeon')&&!id.endsWith('-raid'))return <Select {...props}/>;
  return <div className="difficulty-grid" role="radiogroup" aria-labelledby={id+'-label'}>
    {options.map(option=>{
      const Icon=symbols[option.value]||Swords;
      return <label key={option.value} className="difficulty-option">
        <input id={option.value===value?id:undefined} type="radio" name={id} value={option.value} disabled={props.disabled}
          checked={value===option.value} onChange={()=>onValueChange(option.value)}/>
        <span><Icon size={19} aria-hidden="true"/>{option.label}</span>
      </label>;
    })}
  </div>;
}
