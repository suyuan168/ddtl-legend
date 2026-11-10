import {intersectsDisc} from './drops.js';

// ZN_4.InitZone, UpdateZone and OnTriggerEnterEvent use the map's explicit ConnectERef links.
export class MapVents {
  constructor(view,tables){
    const row=tables.Zone.find(z=>z.Id==='4'),keys=row.Types.split('|'),values=row.Values.split('|').map(Number);
    this.duration=values[keys.indexOf('ActiveDuration')];
    this.entries=(view.triggerZones||[]).filter(z=>z.id==='4').map(z=>({...z,left:values[keys.indexOf('StartActiveDuration')]}));
    this.byEntity=new Map(this.entries.map(z=>[z.entity,z]));
  }
  advance(dt){for(const v of this.entries)v.left=Math.max(0,v.left-dt);}
  enter(field){
    if(!this.entries.length)return false;
    const previous=field.ventContacts,inside=new Set();
    let entry;
    for(const vent of this.entries)if(intersectsDisc(vent.shape,field.x,field.y,field.view.playerRadius)){
      inside.add(vent.entity);
      if(!entry&&!previous.has(vent.entity)&&vent.left===0)entry=vent;
    }
    field.ventContacts=inside;
    const exit=entry&&this.byEntity.get(entry.destination);
    if(!exit)return false;
    field.x=exit.x;field.y=exit.y;
    entry.left=exit.left=this.duration;
    field.ventContacts=new Set([exit.entity]);
    return true;
  }
}
