import {wallContact} from './wall-contact.js';
import {SIMULATION_DELTA} from './combat-clock.js';

const Q=65536;
const raw=n=>Math.trunc(n*Q);
const product=(a,b)=>Math.floor((a*b+Q/2)/Q);

// FPMath.Sqrt (0x438be20) indexes the shipped FPSqrt lookup with an even shift.
export function fixedSqrtRaw(squared){
  const shift=squared<=Q?0:(Math.floor(Math.log2(squared))&~1)-14;
  const lookup=Math.round(Math.sqrt(Math.floor(squared/2**shift))*16384);
  return Math.floor(lookup*2**(shift/2)/64);
}

// WeaponAO.GetMuzzlePosition, RVA 457d9d0. The local Y offset flips on rightward aim.
export function muzzlePosition(x,y,angle,offset,distance=1){
  if(!offset||distance<=0)return {x,y};
  const dx=raw(Math.cos(angle)),dy=raw(Math.sin(angle)),mx=raw(offset.x),my=raw(offset.y)*(dx>0?-1:1);
  return {x:x+(product(-dx,mx)-product(-dy,my))/Q,y:y+(product(-dx,my)+product(-dy,mx))/Q};
}

// WeaponAO.GetBulletSpawnPos, RVA 457d470, tests the segment to the muzzle.
export function bulletOrigin(field,angle,offset,distance){
  const {x,y}=field,tip=muzzlePosition(x,y,angle,offset,distance);
  const dx=tip.x-x,dy=tip.y-y,length=Math.hypot(dx,dy);
  if(length&&wallContact(field.view.physics,x,y,dx,dy,0,shape=>shape[8])){
    return {x:x-.5*dx/length,y:y-.5*dy/length};
  }
  return tip;
}

// Return the first intersection along the bullet's travelled segment, including an overlapping start.
export function targetContact(x,y,angle,step,targets,playerRadius,wallTime,projectileRadius=0){
  if(step<=0)return null;
  const vx=Math.cos(angle),vy=Math.sin(angle);
  let first=null;
  for(const target of targets){
    if(target.respawn>0)continue;
    const tx=target.x-x,ty=target.y-y,r=(target.radius??playerRadius)+projectileRadius;
    const along=tx*vx+ty*vy,cross=tx*vy-ty*vx;
    if(Math.abs(cross)>r)continue;
    const span=Math.sqrt(Math.max(0,r*r-cross*cross));
    if(along+span<0)continue;
    const t=Math.max(0,(along-span)/step);
    if(t<=1&&t<wallTime&&(!first||t<first.t))first={t,target};
  }
  return first;
}

// MV_1.Move keeps NoHeightPosition separately from the actual Transform2D.
function flightHeight(shot,distance){
  if(!shot.arc||!shot.range)return 0;
  return .5*shot.arc*Math.sin(Math.PI*Math.min(1,distance/shot.range));
}

export function projectilePose(shot){
  if(!shot.arc)return shot;
  const previous=shot.previousTravelled??0,distance=shot.travelled-previous;
  const height=flightHeight(shot,shot.travelled),rise=height-flightHeight(shot,previous);
  return {x:shot.x,y:shot.y+height,angle:distance>0?
    Math.atan2(Math.sin(shot.angle)*distance+rise,Math.cos(shot.angle)*distance):shot.angle};
}

// A wall callback sees the bullet centre at the physics tick. Natural range completion
// uses NoHeightPosition instead. Only MapDeco clamps the hit to the paint bounds.
export function advanceInkProjectile(field,shot,dt,targets,machine){
  const tick=SIMULATION_DELTA;
  const available=(shot.flightRemainder??0)+dt;
  const ticks=Math.floor(available/tick+1e-9);
  shot.flightRemainder=Math.max(0,available-ticks*tick);
  shot.travelled??=0;
  const radius=field.combat.projectileRadii?.[shot.entity]??0;
  const cos=Math.cos(shot.angle),sin=Math.sin(shot.angle);
  const trail=shot.entity==='10004'||shot.entity==='10008';
  for(let i=0;i<ticks&&shot.left>0;i++){
    const step=tick*shot.speed;
    const startY=shot.y+flightHeight(shot,shot.travelled);
    const dx=cos*step,groundDy=sin*step;
    const nextY=shot.y+groundDy+flightHeight(shot,shot.travelled+step),dy=nextY-startY;
    const wall=wallContact(field.view.physics,shot.x,startY,dx,dy,radius,shape=>shape[8]);
    const hit=targetContact(shot.x,startY,Math.atan2(dy,dx),Math.hypot(dx,dy),targets,field.view.playerRadius,wall?.t??Infinity,radius);
    const tank=machine?.contact(shot.x,startY,dx,dy,radius);
    const hitsTank=tank&&tank.t<(hit?.t??Infinity)&&tank.t<=(wall?.t??Infinity);
    shot.previousTravelled=shot.travelled;
    shot.travelled+=step;
    shot.x+=dx;
    shot.y+=groundDy;
    if(hitsTank||hit||wall){
      shot.left=0;
      shot.y=nextY;
      if(hitsTank)return {end:'machine'};
      if(hit)return {end:'target',target:hit.target};
      shot.x=Math.max(field.left,Math.min(field.left+field.width,shot.x));
      shot.y=Math.max(field.bottom,Math.min(field.bottom+field.height,shot.y));
      return {end:'wall'};
    }
    shot.left=shot.left-step>1e-9?shot.left-step:0;
    // E_10004 and E_10008 request PaintToPosition on every progressed simulation tick.
    if(trail&&shot.left>0)field.splat(shot.x,shot.y,shot.size,shot.team??field.team);
  }
  return {end:shot.left<=0?'range':null};
}

export function damageAt(hit,target,radius){
  if(hit.target)return hit.target===target?hit.damage:0;
  const dx=target.x-hit.x,dy=target.y-hit.y;
  if(hit.length){
    // FireLaser uses a rotated box. A disc can overlap its end face or a rounded corner.
    const c=Math.cos(hit.angle),s=Math.sin(hit.angle);
    const along=dx*c+dy*s,side=Math.abs(dy*c-dx*s);
    const gap=Math.hypot(Math.max(0,-along,along-hit.length),Math.max(0,side-hit.radius));
    return gap<=radius?hit.damage:0;
  }
  // CircleCircle.Check rounds each squared axis in FP16 before its strict overlap test.
  const rx=raw(target.x)-raw(hit.x),ry=raw(target.y)-raw(hit.y);
  const squared=product(rx,rx)+product(ry,ry);
  const combined=raw(hit.radius)+raw(radius);
  if(squared>=product(combined,combined))return 0;
  // EntityComponent.Explode, RVA 4536ca0: only entities with positive ExplodeRange attenuate.
  if(!hit.inner)return hit.damage;
  const distance=fixedSqrtRaw(squared);
  const inner=raw(hit.inner);
  if(distance<=inner)return hit.damage;
  const floor=raw(hit.floor??1),range=raw(hit.radius)-inner;
  const fraction=range>0?Math.min(Q,Math.trunc((distance-inner)*Q/range)):Q;
  const factor=Q+product(floor-Q,fraction);
  return product(raw(hit.damage),factor)/Q;
}
