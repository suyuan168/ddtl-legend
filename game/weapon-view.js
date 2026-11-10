import {MuzzleParticles} from './muzzle-particles.js';
import {RollerParticles} from './roller-particles.js';
import {equipmentClip,spriteLayer} from './equipment.js';
import {LaserCharge} from './laser-charge.js';

export function particleCurve(keys,t,fallback){
  if(!keys?.length)return fallback;
  if(t<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++){
    const a=keys[i-1],b=keys[i];
    if(t<=b[0]){
      const dt=b[0]-a[0],u=(t-a[0])/dt;
      if(a.length===2)return a[1]+u*(b[1]-a[1]);
      return (1+2*u)*(1-u)**2*a[1]+u*(1-u)**2*dt*a[3]+u*u*(3-2*u)*b[1]+u*u*(u-1)*dt*b[2];
    }
  }
  return keys.at(-1)[1];
}

// W_4_View.UpdateWeaponView indexes the two serialized arrays in parallel.
// Its helper at RVA a63af0 calls the x64 roundsd instruction with mode 9 (floor).
function shieldIndex(count, ratio) {
  return Math.max(0,Math.min(count-1,count-1-Math.floor(count*Math.max(0,Math.min(1,ratio)))));
}

export class WeaponView {
  constructor(renderer) {
    this.renderer=renderer;
    this.rigs=new Map();
    this.actors=new Map();
  }
  async load(equipment, groups, laserGlow, movingBursts={}) {
    this.laserGlow=laserGlow;
    if(laserGlow)await this.renderer.prepare({draw:laserGlow.layers});
    for(const [id,group] of Object.entries(groups)) {
      const source=equipment['Weapon_'+id];
      const states={};
      for(const [name,clip] of Object.entries(group.states)) {
        states[name]={...await equipmentClip(this.renderer,source,clip),rate:clip.rate,events:clip.events};
      }
      const prefix='/Weapon_'+id+'/';
      const shield=new Map();
      for(const [path,ids] of Object.entries(group.shield||{})) {
        const entry=source.find(p=>p.path===prefix+path);
        const layers=ids.map(sid=>spriteLayer(this.renderer,entry,sid));
        await this.renderer.prepare({draw:layers});
        shield.set(prefix+path,layers);
      }
      await this.renderer.prepare({draw:[...Object.values(group.bursts).flat(),...Object.values(movingBursts[id]||{}).flat(),...(group.rollingParticles||[])]});
      this.rigs.set(id,{states,movingBursts:movingBursts[id]||{},bursts:group.bursts,rollingParticles:group.rollingParticles,tint:new Set(group.tint.map(path=>prefix+path)),shield});
    }
  }
  actor(owner) {
    if(!this.actors.has(owner))this.actors.set(owner,{});
    return this.actors.get(owner);
  }
  block(event,now) {
    this.actor(event.owner||'local').blockedAt=now;
  }
  fire(event,now) {
    const state=this.actor(event.owner||'local');
    // W_1001_View only calls Animator.Play when the state hash changes.
    if(event.id==='1001'&&state.attack?.id==='1001')return;
    state.attack={id:String(event.id),at:now,clip:event.id==='3'&&(event.charge??state.charge)>.5?'Skill_Attack':'Attack'};
  }
  releaseHammer(owner){
    const state=this.actor(owner||'local');
    if(state.attack?.id==='1001')state.attack=null;
  }
  sample(actor,now,aim=actor.angle) {
    const id=String(actor.special?actor.ultimate:actor.weapon),rig=this.rigs.get(id);
    if(!rig)return null;
    const state=this.actor(actor.id),attack=state.attack;
    if(id==='3'&&actor.charge>=1&&!(state.charge>=1))state.chargedAt=now;
    if(state.id!==id)state.muzzleParticles=new MuzzleParticles();
    if(attack?.id===id&&!attack.particlesStarted&&rig.movingBursts.muzzleFlash){
      const binding=attack.clip==='Skill_Attack'?'chargeMuzzleFlash':'muzzleFlash';
      const at=attack.at+(rig.states[attack.clip].events.find(e=>e[1]==='PlayMuzzleFlash')?.[0]??0);
      if(now>=at){state.muzzleParticles.trigger(rig.movingBursts[binding],at);attack.particlesStarted=true;}
    }
    const mode=id==='4'&&actor.shield?'shield':id==='5'&&actor.rolling?'roll':id==='3'&&actor.charge>0?'charge':'idle';
    if(state.id!==id&&state.attack?.id==='1001'&&id!=='1001')state.attack=null;
    if(state.id!==id||state.mode!==mode) {
      if(state.id==='5'&&state.id!==id)state.rollerParticles=null;
      state.id=id;state.mode=mode;state.since=now;
    }
    state.charge=actor.charge||0;
    let elapsed=Math.max(0,now-state.since),name='Idle';
    // Base Skill_ON -> Skill_Idle has zero exit time and no blend. Unity must
    // evaluate the source state once to cross that exit. Weapon 5 has no override.
    if(mode==='shield') {
      const first=1/rig.states.Skill_ON.rate;
      name=elapsed<first?'Skill_ON':'Skill_Idle';
      if(name==='Skill_Idle')elapsed-=first;
    } else if(mode==='roll'||mode==='charge')name='Skill_Idle';
    else if(attack?.id===id) {
      const speed=id==='1001'?1.5:id==='1003'||id==='1004'?2.5:1;
      const age=(now-attack.at)*speed,clip=rig.states[attack.clip];
      if(clip&&age>=0&&(id==='1001'||id==='1003'||age<clip.duration)){name=attack.clip;elapsed=age;}
    }
    const clip=rig.states[name];
    const t=clip.duration&&clip.loop?elapsed%clip.duration:elapsed;
    const index=Math.min(clip.frames.length-1,Math.floor(t*clip.rate+1e-7));
    const effects=[];
    if(attack?.id===id){
      const age=now-attack.at;
      if(['1','2','3','4'].includes(id))effects.push([attack.clip==='Skill_Attack'?'chargeMuzzleFlash':'muzzleFlash',age]);
      const eventNames={PlayMuzzleFlash:'muzzleFlash',PlayMuzzleParticle:'muzzleFlash',StartLeftSplashParticle:'leftSplashParticle',StartRightSplashParticle:'rightSplashParticle'};
      const speed=id==='1003'||id==='1004'?2.5:1;
      for(const [at,callback] of rig.states[attack.clip].events){
        if(!eventNames[callback]||age<at/speed)continue;
        if(id==='1003'){
          const period=rig.states[attack.clip].duration/speed;
          const span=Math.max(0,...rig.bursts[eventNames[callback]].map(p=>p.seconds+p.delay));
          for(let cycle=Math.max(0,Math.ceil((age-at/speed-span)/period));cycle<=(age-at/speed)/period;cycle++)
            effects.push([eventNames[callback],age-at/speed-cycle*period]);
        }else effects.push([eventNames[callback],age-at/speed]);
      }
    }
    if(mode==='charge'&&actor.charge>=1)effects.push(['chargeWeaponEffect',now-state.chargedAt]);
    let hammerScale=1;
    if(id==='1001'){
      const tween=state.hammer;
      if(tween){
        const t=Math.min(1,(now-tween.at)/.1);
        hammerScale=tween.from+(tween.to-tween.from)*t*(2-t);
      }
      const target=name==='Attack'?2:1;
      if(tween?.to!==target)state.hammer={from:hammerScale,to:target,at:now};
    }else state.hammer=null;
    if(id==='1003'&&name==='Attack'){
      const period=clip.duration/2.5;
      // Animation events are consumed once; a slow frame can cross more than one.
      const age=now-attack.at;
      for(let cycle=Math.max(0,Math.floor((attack.lastEventAge??0)/period));cycle*period<=age;cycle++){
        for(const [t,callback] of clip.events){
          const eventAge=cycle*period+t/2.5;
          if(eventAge>(attack.lastEventAge??-1)&&eventAge<=age){
            this.onMissile?.(actor,callback==='StartLeftSplashParticle'?'left':'right',attack.at+eventAge,aim);
          }
        }
      }
      attack.lastEventAge=age;
    }else if(id!=='1003'&&attack?.id==='1003'&&now-attack.at>.3)state.attack=null;
    if(id==='1002'&&name==='Attack'&&this.laserGlow)attack.glow??=new LaserCharge(this.laserGlow);
    // W_4_View.EventBulletBlock: punch Umbrella_2 locally and flash its BgColor.
    const age=mode==='shield'?now-(state.blockedAt??-Infinity):Infinity,peak=.2/3;
    // SetPunch assigns OutQuad to each Vector3ArrayPlugin segment.
    let shieldKick=0;
    if(age>=0&&age<.2){
      const returning=age>peak, t=returning?(age-peak)/(.2-peak):age/peak;
      const eased=t*(2-t);
      shieldKick=.1*(returning?1-eased:eased);
    }
    const shieldFlash=age>=0&&age<.17?(age<.07?1-(1-age/.07)**2:1-((age-.07)/.1)**2):0;
    if(id==='5')state.rollerParticles??=new RollerParticles(rig.rollingParticles||[]);
    const rollParticles=id==='5'?state.rollerParticles.sample(now,mode==='roll'):null;
    return {id,name,elapsed,index,now,rollParticles,shieldKick,shieldFlash,layers:clip.frames[index],rig,effects,muzzleParticles:state.muzzleParticles,hammerScale,glow:id==='1002'&&name==='Attack'?attack.glow:null};
  }
  draw(ctx,frame,actor,aim,front,back,team,mask=false) {
    if(!frame||actor.boost||actor.armed)return;
    const {id,name,layers,rig}=frame;
    // W_1003_View sorts its two missile launchers on opposite sides of the body.
    if(id!=='1003'&&front===back)return;
    const right=Math.trunc(Math.cos(aim)*65536)>0;
    ctx.save();
    if(id==='1001'||id==='1003'){
      if(id==='1001'&&name==='Attack')ctx.translate(1.7*Math.cos(aim),1.7*Math.sin(aim));
      ctx.scale(right?-1:1,1);
      if(id==='1001')ctx.scale(frame.hammerScale,frame.hammerScale);
    }else{
      ctx.rotate(aim+Math.PI);
      ctx.scale(1,right?-1:1);
    }
    for(const part of layers) {
      if(id==='1003'&&front!==(part.path.includes('/Root_1/')?back:!back))continue;
      let layer=part;
      const variants=rig.shield.get(part.path);
      if(variants){
        const variant=variants[shieldIndex(variants.length,actor.shieldRatio??1)];
        layer={...part,id:variant.id,size:variant.size,pivot:variant.pivot};
      }
      if(frame.shieldKick&&part.path.startsWith('/Weapon_4/Root/Umbrella_2/')){
        const m=layer.m.slice();m[4]+=frame.shieldKick;m[5]+=frame.shieldKick;layer={...layer,m};
      }
      if(rig.tint.has(part.path)){
        const flash=part.path==='/Weapon_4/Root/Umbrella_2/BgColor'?frame.shieldFlash:0;
        layer={...layer,color:[0,1,2].map(i=>team[i]+(1-team[i])*flash).concat(part.color[3])};
      }
      this.renderer.layer(ctx,layer);
    }
    if(mask){ctx.restore();return;}
    frame.rollParticles?.draw(ctx,this.renderer,team,frame.now,particleCurve);
    frame.glow?.draw(ctx,this.renderer,frame.elapsed,team,aim,right?-1:1,particleCurve);
    for(const [binding,age] of frame.effects){
      if(id==='1003'&&front!==(binding==='leftSplashParticle'?back:!back))continue;
      for(const part of rig.bursts[binding]||[])this.drawFlash(ctx,part,age,team);
    }
    frame.muzzleParticles?.draw(ctx,this.renderer,frame.now,team,particleCurve);
    ctx.restore();
  }
  drawFlash(ctx,part,age,team){
    const t=(age-part.delay)/part.seconds;
    if(t<0||t>=1)return;
    const image=this.renderer.tint(this.renderer.byId.get(part.id),part.tint?team:part.color);
    if(!image)return;
    const count=part.cols*part.rows;
    const n=Math.max(0,Math.min(count-1,Math.floor(particleCurve(part.frames,t,t)*count)));
    const sw=image.width/part.cols,sh=image.height/part.rows;
    const size=particleCurve(part.scale,t,1),w=part.w*size,h=part.h*particleCurve(part.scaleY,t,size);
    ctx.save();ctx.translate(...part.xy);ctx.rotate(-part.angle);ctx.scale(1,-1);
    ctx.globalAlpha*=part.color[3]*particleCurve(part.alpha,t,1);
    if(part.add)ctx.globalCompositeOperation='lighter';
    ctx.drawImage(image,(n%part.cols)*sw,Math.floor(n/part.cols)*sh,sw,sh,w*((part.pivot?.[0]??0)-.5),-h*((part.pivot?.[1]??0)+.5),w,h);
    ctx.restore();
  }
}
