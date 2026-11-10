import {inCamera} from './render.js';

function sampleScale(keys,time){
  const index=keys.findIndex(k=>k[0]>time);
  if(index<1)return (index===0?keys[0]:keys.at(-1)).slice(1,3);
  const a=keys[index-1],b=keys[index],dt=b[0]-a[0],t=(time-a[0])/dt;
  return [1,2].map(i=>(2*t**3-3*t*t+1)*a[i]+(t**3-2*t*t+t)*dt*a[i+4]
    +(-2*t**3+3*t*t)*b[i]+(t**3-t*t)*dt*b[i+2]);
}

export class Bushes{
  constructor(spec,renderer){
    this.spec=spec;this.renderer=renderer;
    this.parts=new Map();
    for(const clip of Object.values(spec.clips))for(const track of clip.sprites)for(const [,id] of track){
      const a=renderer.byId.get(id);
      this.parts.set(id,{id,path:'/Bush/Root',pivot:a.pivot,size:a.rect.map(n=>n/a.ppu),
        color:[1,1,1,1],flip:[false,false],mode:0});
    }
  }
  bind(zones){
    this.cells=[];this.previous=new Map();
    const {spacing}=this.spec;
    for(const zone of zones.filter(z=>z.id==='14')){
      const [kind,x,y,c,s,w,h]=zone.shape;
      if(kind!==4)throw Error('Unexpected vegetation shape '+kind);
      const cols=Math.max(1,Math.ceil(2*w/spacing)),rows=Math.max(1,Math.ceil(2*h/spacing));
      for(let col=0;col<cols;col++)for(let row=0;row<rows;row++){
        const dx=(col-(cols-1)/2)*spacing,dy=(row-(rows-1)/2)*spacing;
        this.cells.push({x:x+c*dx-s*dy,y:y+s*dx+c*dy,c,s,entity:zone.entity,clip:'Idle',time:0});
      }
    }
  }
  collect(actors,now,visible,sorted,ctx){
    const next=new Map();
    for(const a of actors){
      if(a.bush<0)continue;
      const prior=this.previous.get(a.id),dx=a.x-(prior?.x??a.x),dy=a.y-(prior?.y??a.y);
      const moving=Math.abs(dx)>0x28f/65536||Math.abs(dy)>0x28f/65536;
      const direction=Math.abs(dx)>0x28f/65536?(dx<0?'Left':'Right'):prior?.direction||'Right';
      next.set(a.id,{x:a.x,y:a.y,direction});
      if(!moving)continue;
      for(const cell of this.cells)if(cell.entity===a.bush&&Math.hypot(cell.x-a.x,cell.y-a.y)<=this.spec.triggerRadius){
        if(cell.clip!==direction||now-cell.time>=this.spec.clips[direction].duration){
          cell.clip=direction;cell.time=now;
        }
      }
    }
    this.previous=next;
    for(const cell of this.cells){
      if(!inCamera({left:cell.x-2,right:cell.x+2,bottom:cell.y-2,top:cell.y+2},visible))continue;
      const clip=this.spec.clips[cell.clip],age=now-cell.time;
      if(age>=clip.duration)cell.clip='Idle';
      const active=this.spec.clips[cell.clip],[sx,sy]=sampleScale(active.scale,age);
      active.sprites.forEach((track,i)=>{
        const part=this.parts.get((track.findLast(key=>key[0]<=age)||track[0])[1]);
        const offset=this.spec.baseY+this.spec.offsets[i]*sy;
        const x=cell.x-cell.s*offset,y=cell.y+cell.c*offset;
        const m=[cell.c*sx,cell.s*sx,-cell.s*sy,cell.c*sy,x,y];
        sorted.push({bush:true,layer:2,order:0,y:y+cell.c*sy*(.5-part.pivot[1])*part.size[1],draw:(g=ctx)=>this.renderer.layer(g,{...part,m})});
      });
    }
  }
}
