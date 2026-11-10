// WeaponAsset.CamSize and Weapon_3's serialized aim offset drive the local camera.
function tween(previous,target,dt,duration,ease){
  if(previous.target!==target){previous.from=previous.value;previous.target=target;previous.time=0;}
  previous.time+=dt;
  const progress=Math.min(1,previous.time/duration);
  previous.value=previous.from+(target-previous.from)*ease(progress);
  return previous.value;
}
const channel=value=>({value,from:value,target:value,time:0});
const inOutSine=t=>(1-Math.cos(Math.PI*t))/2;
const outSine=t=>Math.sin(t*Math.PI/2);

export class FieldCamera{
  constructor(settings){
    this.settings=settings;
    this.size=channel(settings.defaultSize);
    this.x=channel(0);this.y=channel(0);
    this.inkWarningTime=1;this.shakeY=0;
  }
  startInkWarning(){
    if(this.inkWarningTime<1)return false;
    this.inkWarningTime=0;
    return true;
  }
  update(dt,weapon,charging,angle,distance,special){
    // PlayerView.EventNotEnoughPaint calls ShakeCamera(.2,1,(0,.3,0),1).
    // Four alternating kicks, each using OutQuad on the way out and InQuad on return.
    this.inkWarningTime+=dt;
    this.shakeY=0;
    if(this.inkWarningTime<.2){
      const t=this.inkWarningTime*20,cycle=Math.floor(t),phase=(t-cycle)*2;
      const displacement=phase<=1?1-(1-phase)**2:1-(phase-1)**2;
      this.shakeY=.3*(1-cycle/4)*(cycle%2?-1:1)*displacement;
    }
    const aimed=!special&&charging&&weapon.Id==='3',cfg=this.settings;
    tween(this.size,special?Number(special.CamSize):aimed?Number(weapon.CamSize):cfg.defaultSize,dt,cfg.zoomDuration,inOutSine);
    tween(this.x,aimed&&distance>0?cfg.aimOffset.x*Math.cos(angle):0,dt,cfg.offsetDuration,outSine);
    tween(this.y,aimed&&distance>0?cfg.aimOffset.y*Math.sin(angle):0,dt,cfg.offsetDuration,outSine);
  }
}
