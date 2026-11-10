import {worldSound} from './world-sound.js';

// Founttain has a MapObjectView at the prefab root and a Fountain renderer at local (0,-1).
// Its scene and prefab instances override the class default (Sound ID 106) with ID 76.
export class MapAudio{
  constructor(loop){this.loop=loop;}
  clear(){this.voice?.pause();this.voice=null;this.anchor=null;}
  bind(draw){
    this.clear();
    const part=draw.find(p=>p.path.endsWith('/Founttain/Fountain'));
    if(part){const [, ,c,d,x,y]=part.m;this.anchor={x:x+c,y:y+d};}
  }
  update(enabled){
    if(!enabled){this.voice?.pause();this.voice=null;return;}
    if(!this.anchor)return;
    this.voice??=this.loop('sfx_ingame_shotgun_skill',this.anchor);
    if(this.voice)worldSound.move(this.voice,this.anchor);
  }
}
