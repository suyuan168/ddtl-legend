import {bulletOrigin} from './damage.js';
const Q=65536;
const raw=n=>Math.trunc(n*Q),mul=(a,b)=>Math.floor((a*b+Q/2)/Q);
const next=rng=>rng.nextUInt32()>>>16;
const jitter=(rng,range,spread)=>spread>0?Math.max(0x199a,range+mul(next(rng)-Q/2,spread)):range;
export const spreadRange=(rng,range,spread)=>jitter(rng,raw(range),raw(spread))/Q;

// BulletSystem.CreateBullet (0x45495e0) samples movement spread before distance,
// then draws a fixed-point arc even for straight bullets or equal arc endpoints.
export function spreadAngle(rng,degrees,movementMin){
  const spread=raw(degrees);
  let offset=0;
  if(movementMin>0)offset=(raw(movementMin)+mul(next(rng),spread))*(rng.nextUInt32()<0x80000000?-1:1);
  else if(spread>0)offset=mul(next(rng)-Q/2,spread);
  return mul(offset,0x478)/Q;
}
export function projectileArc(rng,bullet){
  const arc=rng.nextFixedRaw(raw(bullet.ValueB),raw(bullet.ValueC))/Q;
  return bullet.ValueA===1?arc:0;
}

// W_5.Attack arms WeaponFanComponent instead of spawning on the input tick.
// UpdateFan follows the current aim at discharge and begins at +half-angle.
export function releaseFan(field,input){
  const w=field.w,aim=input.distance===0?field.fanAim:input.angle;
  const tip=bulletOrigin(field,aim,field.parametersForWeapon.muzzlePos,input.distance);
  const range=raw(Math.max(0,w.AtkRange-Math.hypot(tip.x-field.x,tip.y-field.y)));
  const spread=raw(w.SpreadDistance),halfAngle=mul(raw(w.SpreadAngle/2),0x478);
  for(let n=0;n<w.ValueE;n++){
    const sweep=halfAngle-Math.trunc(2*halfAngle*n/(w.ValueE-1));
    // WeaponFanComponent.GetSpreadRange clamps its sample to the base range.
    // BulletSystem.CreateBullet takes a second independent distance sample.
    const capped=Math.min(range,jitter(field.rng,range,spread)),total=jitter(field.rng,capped,spread)/Q;
    const b=field.projectile,arc=projectileArc(field.rng,b);
    field.shots.push({entity:field.weapon.BulletID,travelled:0,x:tip.x,y:tip.y,angle:aim+sweep/Q,left:total,
      arc,range:total,speed:b.MoveSpeed,damage:w.Atk,size:w.PaintSize});
  }
}

// W_1/2/3.Attack shorten primary travel at the cursor. W_3.FireAndReset
// uses the charged range curve even when the cursor is nearby.
export function releaseSingle(field,input,charged,curve){
  const w=field.w,aim=field.aim,tip=bulletOrigin(field,aim,field.parametersForWeapon.muzzlePos,input.distance);
  const limit=charged?w.AtkRange*curve('rangeCurve'):Math.min(input.distance??Infinity,w.AtkRange);
  const base=Math.max(field.weapon.Id==='3'&&!charged?0x28f/Q:0,limit-Math.hypot(tip.x-field.x,tip.y-field.y));
  const moving=mul(raw(input.dx||0),raw(input.dx||0))+mul(raw(input.dy||0),raw(input.dy||0))>0x28f;
  const angle=spreadAngle(field.rng,w.SpreadAngle,moving?w.MoveSpreadAngle:0);
  const length=spreadRange(field.rng,base,w.SpreadDistance);
  const b=field.projectile;
  field.shots.push({entity:charged?'10008':field.weapon.BulletID,critical:charged&&field.charge>=1,travelled:0,
    x:tip.x,y:tip.y,angle:aim+angle,left:length,range:length,arc:projectileArc(field.rng,b),
    speed:b.MoveSpeed*curve('bulletSpeedCurve'),damage:w.Atk*curve('damageCurve'),size:w.PaintSize*curve('paintSizeCurve')});
}
