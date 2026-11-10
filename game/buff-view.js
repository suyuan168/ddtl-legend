import {particleCurve} from './weapon-view.js';

const sample=([a,b])=>a+Math.random()*(b-a);
const tau=2*Math.PI;

function emit(spec,time,x,y){
  const heading=spec.shapeArc===undefined?Math.random()*tau:
    (spec.shapeAngle+Math.random()*spec.shapeArc)*Math.PI/180;
  const sphere=spec.shape===0||spec.shape===10,box=spec.shape===5;
  const projection=spec.shape===0?Math.sqrt(1-(2*Math.random()-1)**2):1;
  const radius=sphere?spec.radius*Math.sqrt(Math.random())*projection:0;
  const speed=sphere?sample(spec.speed)*projection:0,size=sample(spec.size);
  const boxTilt=spec.boxTiltX*Math.PI/180||0;
  return {spec,time,row:spec.singleRow?Math.floor(Math.random()*spec.tiles[1]):0,x:x+spec.pos[0]+radius*Math.cos(heading)+(box?(Math.random()-.5)*spec.box[0]:0),
    y:y+spec.pos[1]+radius*Math.sin(heading)+(box?(Math.random()-.5)*spec.box[1]:0),
    vx:Math.cos(heading)*speed,vy:Math.sin(heading)*speed-(boxTilt?sample(spec.speed)*Math.sin(boxTilt):0),flowX:sample(spec.velocity[0]),flowY:sample(spec.velocity[1]),
    life:sample(spec.life),rotation:spec.stretch>1?heading-Math.PI/2:sample(spec.rotation),
    w:size*spec.scale[0],h:(spec.height?sample(spec.height):size)*spec.scale[1]*spec.stretch};
}

export class BuffView{
  constructor(data,renderer,speedSeconds){
    Object.assign(this,{data,renderer,speedSeconds});this.reset();
  }
  reset(){
    this.effects=[];this.seen=new Set();this.canvases?.forEach(c=>c.remove());this.canvases=null;
  }
  start(key,start,x,y,owner,duration){
    const effect={key,start,x,y,owner,duration,previous:-.000001,particles:[]};
    this.effects.push(effect);return effect;
  }
  bulletEnd(event,now,color){
    // EffectViewModel.PlayBulletEndEffect tints the three pooled BulletEnd emitters.
    // Keep the original color-over-lifetime modulation on the inner glow.
    const effect=this.start('BulletEnd',now,event.x,event.y,null,.5);
    effect.color=color;
  }
  pickup(event,now,self,showCharge){
    this.start('ItemGain',now,event.x,event.y,null,.5);
    if(event.id==='3'){
      const owner=event.owner||'local';this.seen.add(owner);
      this.effects=this.effects.filter(e=>!(e.restored&&e.owner===owner));
      this.start('SpeedBuff',now,event.x,event.y,owner,this.speedSeconds);
    }
    if(event.id==='4'&&self&&showCharge)this.start('Fx_UI_Buff_2',now,0,0,null,1);
  }
  drawParticle(ctx,effect,p,elapsed,anchor){
    const l=p.spec,age=elapsed-p.time,t=age/p.life;
    const color=effect.color??l.color;
    const alpha=color[3]*particleCurve(l.alpha,t,1),scale=particleCurve(l.sizeCurve,t,1);
    if(alpha<=0||scale<=0)return;
    const image=this.renderer.tint(this.renderer.byId.get(l.id),color);if(!image)return;
    const [cols,rows]=l.tiles,frames=l.singleRow?cols:cols*rows;
    const idx=p.row*cols+Math.min(frames-1,Math.floor(((l.startFrame+particleCurve(l.frame,t,0))%1)*frames));
    const w=image.width/cols,h=image.height/rows;
    // Integrate the exported Limit Velocity dampening while retaining the configured minimum speed.
    const speed=Math.hypot(p.vx,p.vy),decay=l.damping?-60*Math.log(1-l.damping):0;
    const limit=Math.min(speed,l.limit),distance=decay&&speed?
      (limit*age+(speed-limit)*(-Math.expm1(-decay*age))/decay)/speed:age;
    const x=p.x+(l.world?0:anchor.x)+p.vx*distance+p.flowX*age;
    const y=p.y+(l.world?0:anchor.y)+p.vy*distance+p.flowY*age;
    ctx.save();ctx.translate(x,y);ctx.rotate(p.rotation);ctx.scale(scale,-scale);
    ctx.globalAlpha*=alpha;
    // Inner Glow's color-over-lifetime gradient is grayscale; keep modulation separate from alpha.
    if(effect.color&&l.grad.length&&l.grad.some(k=>k[1]!==1)){
      const brightness=particleCurve(l.grad.map(([time,value])=>[time,value]),t,1);
      ctx.filter='brightness('+brightness+')';
    }
    if(l.shader===10720||l.material.includes('add')||l.texture==='fxtm_flare_06')ctx.globalCompositeOperation='lighter';
    ctx.drawImage(image,idx%cols*w,Math.floor(idx/cols)*h,w,h,-p.w/2,-p.h/2,p.w,p.h);
    ctx.restore();
  }
  update(effect,now,anchor,add){
    const elapsed=now-effect.start;
    for(const l of this.data[effect.key]){
      const from=Math.max(effect.previous,elapsed-Math.max(...l.life))-l.delay,to=elapsed-l.delay;
      if(to<0)continue;
      const enqueue=time=>{
        if(time<=from||time>to)return;
        effect.particles.push(emit(l,time+l.delay,l.world?anchor.x:0,l.world?anchor.y:0));
      };
      for(const [offset,count] of l.burst){
        const first=Math.max(0,Math.floor((from-offset)/l.duration)+1);
        const last=l.loop?Math.floor((to-offset)/l.duration):0;
        for(let i=first;i<=last;i++)for(let n=0;n<count;n++)enqueue(offset+i*l.duration);
      }
      if(l.rate)for(let i=Math.max(1,Math.floor(from*l.rate)+1);i<=(l.loop?to:Math.min(l.duration,to))*l.rate;i++)enqueue(i/l.rate);
    }
    effect.previous=elapsed;
    effect.particles=effect.particles.filter(p=>elapsed-p.time<p.life);
    for(const p of effect.particles)add(p,elapsed);
  }
  collect(now,actors,queue,ctx,host,floor){
    this.effects=this.effects.filter(e=>now<e.start+e.duration);
    // A reconnect can occur after GainItem. Restore the remaining part of the attached emitter.
    for(const actor of actors){
      if(!actor.speedBuff){
        if(!this.effects.some(e=>e.owner===actor.id))this.seen.delete(actor.id);
        continue;
      }
      if(this.seen.has(actor.id))continue;
      this.seen.add(actor.id);
      const age=Math.max(0,this.speedSeconds-actor.speedBuff);
      this.start('SpeedBuff',now-age,actor.x,actor.y,actor.id,this.speedSeconds).restored=true;
    }
    if(this.canvases){
      if(this.effects.some(e=>e.key==='Fx_UI_Buff_2')){
        for(const c of this.canvases)c.getContext('2d').clearRect(0,0,c.width,c.height);
      }else{
        this.canvases.forEach(c=>c.remove());this.canvases=null;
      }
    }
    for(const e of this.effects){
      if(e.key==='Fx_UI_Buff_2'){
        const group=host.querySelector('[data-unity="SpecialWeaponGroup"]');
        if(!group)continue;
        if(!this.canvases?.[0].isConnected){
          const keyboard=[...group.children].find(c=>c.dataset.unity==='Keyboard');
          // The battery's additive glow is behind its three alpha-blended graphics.
          // The scene places the entire group after the ready front pass and before Keyboard.
          this.canvases=['plus-lighter','normal'].map(blend=>{
            const c=document.createElement('canvas');c.width=c.height=640;
            Object.assign(c.style,{position:'absolute',left:'calc(50% - 320px)',top:'calc(50% - 320px)',pointerEvents:'none',mixBlendMode:blend});
            group.insertBefore(c,keyboard??null);return c;
          });
        }
        this.update(e,now,e,(p,age)=>{
          const g=this.canvases[p.spec.uiAdditive?0:1].getContext('2d');
          g.save();g.translate(320,320);g.scale(1,-1);
          this.drawParticle(g,e,p,age,e);g.restore();
        });
      }else{
        const anchor=e.owner?actors.find(a=>a.id===e.owner):e;
        if(!anchor)continue;
        this.update(e,now,anchor,(p,age)=>{
          const layers=p.spec.layer===0?floor:queue;
          layers.push({layer:p.spec.layer,order:p.spec.order,y:anchor.y,draw:()=>this.drawParticle(ctx,e,p,age,anchor)});
        });
      }
    }
  }
}
