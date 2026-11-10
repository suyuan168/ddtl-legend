import {intersectsDisc} from './drops.js';
import {FRAME_RAW,SIMULATION_DELTA} from './combat-clock.js';
import {wallContact} from './wall-contact.js';
import {damageAt,advanceInkProjectile} from './damage.js';
import {spreadRange,projectileArc} from './roller-fan.js';

const raw=n=>Math.trunc(n*65536);
const eligible=()=>true;

export class GiantSprinkler{
  constructor(field,readStats){
    this.spec=field.view.giantSprinkler;
    this.config=readStats(field.tables.Zone.find(z=>z.Enum==='GiantSprinkler'));
    this.entity=String(this.config.ValueA);
    this.projectile=readStats(field.tables.Entity.find(e=>e.Id===this.entity));
    this.x=this.spec.shape[1];this.y=this.spec.shape[2];this.team=-1;
    this.charge=0;this.active=false;this.cooldownRaw=0;this.tickRemainder=0;
    this.shots=[];this.hitSerial=0;this.fireSerial=0;
  }
  hit(amount,team,x=this.x,y=this.y){
    if(this.active||amount<=0||team<0)return;
    this.team=team;this.charge=Math.min(raw(this.config.PaintCapacity),this.charge+raw(amount));
    this.hitSerial++;this.hitX=x;this.hitY=y;
  }
  contact(x,y,dx,dy,r){
    return wallContact([this.spec.shape],x,y,dx,dy,r,eligible);
  }
  damage(hit,team){
    const [,cx,cy,,,w,h]=this.spec.shape,half=Math.max(0,(h-w)/2),radius=w/2;
    if(hit.length){
      const dx=Math.cos(hit.angle)*hit.length,dy=Math.sin(hit.angle)*hit.length;
      const t=intersectsDisc(this.spec.shape,hit.x,hit.y,hit.radius)?0:this.contact(hit.x,hit.y,dx,dy,hit.radius)?.t;
      if(t!=null)this.hit(hit.damage,team,hit.x+t*dx,hit.y+t*dy);
      return;
    }
    const y=cy+Math.max(-half,Math.min(half,hit.y-cy));
    this.hit(damageAt(hit,{x:cx,y},radius),team,cx,y);
  }
  update(dt,field,candidates,impact,splat){
    const elapsed=this.tickRemainder+dt,ticks=Math.floor(elapsed/SIMULATION_DELTA+1e-9);
    this.tickRemainder=Math.max(0,elapsed-ticks*SIMULATION_DELTA);
    for(let i=0;i<ticks;i++)this.tick(field,candidates,impact,splat);
  }
  tick(field,candidates,impact,splat){
    const w=this.config,capacity=raw(w.PaintCapacity),cost=raw(w.PaintCost);
    if(!this.active){
      if(this.charge>=capacity)this.active=true;
    }else if(this.cooldownRaw>0)this.cooldownRaw-=FRAME_RAW;
    else if(this.charge<cost){
      this.charge=0;this.team=-1;this.active=false;
    }else{
      this.charge-=cost;this.cooldownRaw=raw(w.AtkSpeed);
      // ZN_10.UpdateZone 0x457f4e0 uses a rounded FP multiply by 2π.
      const dir=Math.floor(((field.rng.nextUInt32()>>>16)*0x6487f+32768)/65536)/65536;
      const x=this.x+this.spec.muzzle[0],y=this.y+this.spec.muzzle[1];
      const dx=this.x+Math.cos(dir)*w.AtkRange-x,dy=this.y+Math.sin(dir)*w.AtkRange-y;
      const range=spreadRange(field.rng,Math.hypot(dx,dy),w.SpreadDistance);
      this.shots.push({entity:this.entity,team:this.team,travelled:0,x,y,angle:Math.atan2(dy,dx),
        range,left:range,arc:projectileArc(field.rng,this.projectile),speed:this.projectile.MoveSpeed,damage:w.Atk,size:w.PaintSize});
      this.fireSerial++;
    }
    for(const shot of this.shots){
      const {target,end}=advanceInkProjectile(field,shot,SIMULATION_DELTA,candidates(shot.team));
      if(target?.altWeapon?.block(shot,shot.x,shot.y))continue;
      if(target)impact(shot,target);
      if(end)splat(shot,end);
    }
    this.shots=this.shots.filter(s=>s.left>0);
  }
}
