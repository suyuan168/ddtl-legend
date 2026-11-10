import {heldShakeTransform} from './bomb-shake.js';
import {particleCurve} from './weapon-view.js';
import {rocketRotation} from './paint-rocket.js';

export class BombEntities {
  constructor(spec,renderer,sample){
    this.shaking=new Map();this.spec=spec;this.renderer=renderer;this.sample=sample;
  }
  layers(ctx,id,phase,age,team){
    const binding=this.spec[id];
    for(const part of this.sample(id,phase,age)){
      const layer=part.path.endsWith('/'+binding.tint)?{...part,color:team}:part;
      this.renderer.layer(ctx,layer);
    }
  }
  held(ctx,id,age,team,actor){
    if(id!=='5')return this.layers(ctx,id,'Idle',age,team);
    const state=this.shaking.get(actor.id)||{x:0,y:0,count:0,pulse:0};
    this.shaking.set(actor.id,state);
    const m=heldShakeTransform(state,this.spec.shake,actor,age);
    ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.radians);ctx.scale(m.scale,m.scale);
    this.layers(ctx,id,'Idle',age,team);ctx.restore();
  }
  thrown(ctx,o,team){
    const binding=this.spec[o.id],age=o.phaseTime||0;
    const phase=o.flying?'Throw':o.rebounded?'Explosion':'Set';
    const heading=o.id==='4'?rocketRotation(o):o.flying?(Math.cos(o.angle)<-1e-8?1:-1)*2*Math.PI*age:0;
    ctx.save();ctx.translate(o.x+binding.offset[0],o.y+(o.z||0)*.5+binding.offset[1]);
    ctx.rotate(heading);ctx.scale(...binding.scale);
    this.layers(ctx,o.id,phase,age,team);
    ctx.restore();
  }
  bazooka(ctx,o,atlas,team){
    const d=this.spec.bazooka,image=this.renderer.tint(this.renderer.byId.get(atlas.id),team);
    if(!image)return;
    const t=((o.phaseTime||0)%atlas.seconds)/atlas.seconds,w=d.width*particleCurve(d.sizeCurve,t,1);
    const n=Math.min(atlas.cols*atlas.rows-1,Math.floor(particleCurve(d.frameCurve,t,t)*atlas.cols*atlas.rows));
    const sw=image.width/atlas.cols,sh=image.height/atlas.rows;
    ctx.save();ctx.translate(o.x+d.offset[0],o.y+d.offset[1]);
    ctx.rotate(o.angle+Math.PI);ctx.scale(d.scale[0],-d.scale[1]);
    ctx.globalCompositeOperation='lighter';
    ctx.drawImage(image,n%atlas.cols*sw,Math.floor(n/atlas.cols)*sh,sw,sh,w*(d.pivot[0]-.5),w*(-d.pivot[1]-.5),w,w);
    ctx.restore();
  }
}
