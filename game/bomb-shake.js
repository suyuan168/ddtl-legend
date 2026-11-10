// UnityPlayer Mathf.PerlinNoise (icall RVA B39C0, body 589390), with z=0.
export function nativeBombNoise(config,x,y){
  x=Math.abs(x);y=Math.abs(y);
  const ix=Math.floor(x)&255,iy=Math.floor(y)&255;
  x-=Math.floor(x);y-=Math.floor(y);
  const p=config.permutation,fade=t=>t*t*t*(t*(6*t-15)+10);
  function gradient(i,j,dx,dy){
    const hash=p[p[(p[i&255]+j)&255]]&15;
    const u=hash<8?dx:dy,v=hash<4?dy:hash===12||hash===14?dx:0;
    return (hash&1?-u:u)+(hash&2?-v:v);
  }
  const u=fade(x),v=fade(y);
  const lower=gradient(ix,iy,x,y),upper=gradient(ix,iy+1,x,y-1);
  const a=lower+u*(gradient(ix+1,iy,x-1,y)-lower);
  const b=upper+u*(gradient(ix+1,iy+1,x-1,y-1)-upper);
  return (a+v*(b-a)+config.noiseBias)/config.noiseDivisor;
}

export function heldShakeTransform(state,config,actor,now){
  const dt=state.time==null?0:Math.max(0,now-state.time);
  state.time=now;
  const ratio=Math.max(0,Math.min(1,actor.shakeRatio||0)),square=ratio*ratio;
  const mix=(a,b)=>a+(b-a)*square;
  const time=now*mix(config.minVibrationSpeed,config.maxVibrationSpeed);
  const amp=mix(config.minVibrationAmplitude,config.maxVibrationAmplitude);
  const follow=1-Math.exp(-dt*config.directionalFollowSpeed);
  state.x+=((actor.shakeX||0)*config.directionalMoveDistance-state.x)*follow;
  state.y+=((actor.shakeY||0)*config.directionalMoveDistance-state.y)*follow;
  if((actor.shakes||0)>state.count)state.pulse=1;
  state.count=actor.shakes||0;
  state.pulse=Math.max(0,state.pulse-dt*config.pulseDecay);
  const angle=Math.sin(time*config.angleSpeed)*mix(config.minVibrationAngle,config.maxVibrationAngle)-state.x*config.directionalTiltAngle;
  return {x:state.x+(nativeBombNoise(config,time,config.xSeed)-.5)*2*amp,
    y:state.y+(nativeBombNoise(config,config.ySeed,time)-.5)*2*amp,
    radians:angle*Math.PI/180,scale:1+state.pulse*(config.scaleMin+ratio*config.scaleRange)};
}
