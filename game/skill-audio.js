import {worldSound} from './world-sound.js';

// IDs here follow the shipped Sound.Enums and the final BombView prefab fields.
// PlayAt has no owner relation and uses the world position even for one's own E.
export class SkillAudio {
  constructor(rows,play,loop,localId){
    this.rows=rows;this.play=play;this.loop=loop;this.localId=localId;
    this.voices=new Map();
  }
  owner(id,point,owner){
    const row=this.rows().find(r=>r.Id===String(id));
    if(!row)return;
    const local=!owner||owner==='local'||owner===this.localId();
    if(!local&&row.IsOnlyMe==='True')return;
    const pan=(local?row.PanningMe:row.PanningOther)==='True';
    this.play(row.SoundName,false,1,pan?point:null);
  }
  at(id,point){
    const row=this.rows().find(r=>r.Id===String(id));
    if(row)this.play(row.SoundName,false,1,point);
  }
  hit(e){
    const id=e.textId===3?50+Math.floor(Math.random()*2):47+Math.floor(Math.random()*3);
    this.owner(id,e,e.type==='dummy-hit'?'yard-target':e.owner);
  }
  bomb(e){
    const id=e.id;
    if(e.type==='throw'){
      if(id==='3')this.at(61,e);
      else this.owner(id==='4'?84:30,e,e.owner);
    }else if(e.type==='land'){
      if(id==='3'||e.repeatLand)return;
      this.owner(id==='4'?85:31,e,e.owner);
      if(['1','4','5'].includes(id))this.owner(94,e,e.owner);
    }else if(e.type==='reflect'&&id==='3')this.at(83,e);
    else if(e.type==='shake'&&id==='5')this.owner(87,e,e.owner);
    else if(e.type==='explode'){
      // EventExplodeEntity plays 96 only for entity 1001 (MultiMissileBullet).
      const soundId={'1':63,'4':63,'5':88,'1003':96}[id];
      if(soundId)this.at(soundId,e);
    }
  }
  update(actors){
    const live=new Set();
    for(const actor of actors)for(const o of actor.effects||[]){
      if(o.flying||o.travel>0||o.drop>0)continue;
      // E_3_View starts two distinct loops once the movement component is gone.
      const ids=o.id==='2'?[79,80]:o.id==='3'?[82]:o.id==='4'&&o.locked?[86]:[];
      for(const id of ids){
        const key=actor.id+'/'+o.serial+'/'+id;
        live.add(key);
        if(!this.voices.has(key)){
          const row=this.rows().find(r=>r.Id===String(id));
          if(row){const voice=this.loop(row.SoundName,1,o);if(voice)this.voices.set(key,voice);}
        }
        const voice=this.voices.get(key);
        if(voice)worldSound.move(voice,o);
      }
    }
    for(const [key,voice] of this.voices)if(!live.has(key)){
      voice.pause();this.voices.delete(key);
    }
  }
}
