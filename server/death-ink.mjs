import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

const Q=65536;
const mul=(a,b)=>Math.floor((a*b+32768)/Q);
const delta=gunzipSync(readFileSync(new URL('../data/views/fp-sincos-delta.gz',import.meta.url)));
const lut=new Int32Array(delta.length);
for(let i=0,sin=0,cos=Q;i<delta.length;i+=2){
  lut[i]=sin+=delta.readInt8(i);
  lut[i+1]=cos+=delta.readInt8(i+1);
}
const lookup=(angle,component)=>lut[2*(Math.abs(angle)%0x6487f)+component];
const sine=angle=>(angle<0?-1:1)*lookup(angle,0);
function length(x,y){
  const sq=mul(x,x)+mul(y,y);
  if(!sq)return 0;
  const shift=sq<=Q?0:(Math.floor(Math.log2(sq))&~1)-14;
  return Math.floor(Math.round(Math.sqrt(Math.floor(sq/2**shift))*16384)*2**(shift/2)/64);
}

// FPVector2.Normalize (0x439b790) indexes FPSqrt with the unsplit 32-fraction-bit square.
function normalize(x,y){
  const sq=x*x+y*y,shift=(Math.floor(Math.log2(sq))&~1)-14;
  const lookup=Math.round(Math.sqrt(Math.floor(sq/2**shift))*16384);
  const inverse=Math.trunc(2**44/lookup),scale=2**(14+shift/2);
  return [Math.floor(x*inverse/scale),Math.floor(y*inverse/scale)];
}

// E_1.OnDied -> BulletSystem.CreateBullet -> MV_1.Move -> E_10007.OnUpdateEntity.
// B_2 has no PhysicsCollider2D, so the arc can cross players, deployables and walls.
export class DeathInk{
  constructor(random){this.random=random;this.shots=[];}
  spawn(killer,victim){
    if(killer.mapActor)return;
    killer.paintPoints+=10;
    const x=victim.game.x,y=victim.game.y;
    const spread=Math.round((killer.game.w.SpreadDistance||0)*Q);
    const rawRandom=()=>Math.floor(this.random()*Q);
    for(let i=0;i<10;i++){
      const angle=i*0xa0d9+Math.floor((rawRandom()*0xa0d9-0x506c0000)/Q);
      let range=Math.max(Q,3*rawRandom());
      if(spread>0)range=Math.max(0x199a,range+mul(rawRandom()-32768,spread));
      rawRandom(); // RNGSession.Next(ValueB,ValueC) advances even though both equal three.
      const [dx,dy]=normalize(lookup(angle,1),sine(angle));
      this.shots.push({entity:'10007',owner:killer,team:killer.team,x,y,angle:angle/Q,
        dx,dy,gx:Math.round(x*Q),gy:Math.round(y*Q),
        groundDistance:0,range,travelled:0,left:range/Q,speed:7});
    }
  }
  step(seconds,land){
    const tick=Math.round(seconds*Q);
    for(const shot of this.shots){
      const vx=mul(tick,7*shot.dx),vy=mul(tick,7*shot.dy);
      shot.gx+=vx;shot.gy+=vy;shot.groundDistance+=length(vx,vy);
      const progress=Math.min(Q,Math.trunc(shot.groundDistance*Q/shot.range));
      const height=3*sine(mul(progress,0x3243f));
      const x=shot.gx/Q,y=(shot.gy+mul(height,Q/2))/Q;
      shot.angle=Math.atan2(y-shot.y,x-shot.x);shot.x=x;shot.y=y;
      shot.travelled=shot.groundDistance/Q;
      shot.left=Math.max(0,shot.range-shot.groundDistance)/Q;
      if(progress===Q)land(shot);
    }
    this.shots=this.shots.filter(shot=>shot.left>0);
  }
}
