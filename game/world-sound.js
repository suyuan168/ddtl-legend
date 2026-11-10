// Resources/SoundSettings.asset supplies separate ranges for weapon and map sounds.
const worldAttenuation={near:3,far:20,blend:.2};
export const mapAttenuation={near:0,far:5,blend:.2};
export function worldVolume(x,y,listenerX,listenerY,{near,far}=worldAttenuation){
  return 1-Math.max(0,Math.min(1,(Math.hypot(x-listenerX,y-listenerY)-near)/(far-near)));
}
export function createWorldVoice(context,source,position,listener,attenuation=worldAttenuation){
  const {near,blend}=attenuation;
  const panner=context.createPanner();
  panner.panningModel='equalpower';
  panner.distanceModel='inverse';
  // UnityPlayer applies the blended distance rolloff to the whole voice. Keep
  // the Web Audio panner directional even for the map's zero minimum distance.
  panner.rolloffFactor=0;
  const gain=context.createGain(),dry=context.createGain(),wet=context.createGain();
  dry.gain.value=1-blend;wet.gain.value=blend;
  source.connect(dry);source.connect(panner);panner.connect(wet);
  dry.connect(gain);wet.connect(gain);gain.connect(context.destination);
  let sourceVolume=1;
  function listenerMoved(refreshVolume){
    // SetLoopPosition rewrites the source gain each view update. One-shots keep
    // the distance gain from ConfigureSource while their 3D position still pans.
    const dx=position.x-listener.x,dy=position.y-listener.y;
    const distance=Math.hypot(dx,dy);
    if(refreshVolume)sourceVolume=worldVolume(position.x,position.y,listener.x,listener.y,attenuation);
    const rolloff=Math.min(1,near/Math.max(distance,1e-6));
    gain.gain.value=sourceVolume*(1+blend*(rolloff-1));
    // Native GetWorldAudioPosition projects the source onto the listener's XY plane.
    panner.positionX.value=dx;
    panner.positionY.value=dy;
    panner.positionZ.value=0;
  }
  function move(next){
    position={x:next.x,y:next.y};
    listenerMoved(true);
  }
  move(position);
  return {move,listenerMoved,close(){source.disconnect();panner.disconnect();wet.disconnect();dry.disconnect();gain.disconnect();}};
}

class WorldSound{
  constructor(){this.listener={x:0,y:0};this.voices=new Map();}
  setListener(x,y){
    this.listener.x=x;this.listener.y=y;
    for(const [audio,voice] of this.voices)voice.listenerMoved(audio.loop);
  }
  attach(audio,position,attenuation){
    if(!position||!Number.isFinite(position.x)||!Number.isFinite(position.y))return;
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Context)return;
    const ctx=this.context??=new Context();
    if(ctx.state==='suspended'&&navigator.userActivation?.hasBeenActive)ctx.resume().catch(()=>{});
    const voice=createWorldVoice(ctx,ctx.createMediaElementSource(audio),position,this.listener,attenuation);
    this.voices.set(audio,voice);
    const close=()=>{
      voice.close();this.voices.delete(audio);
      for(const event of ['pause','ended','error'])audio.removeEventListener(event,close);
    };
    for(const event of ['pause','ended','error'])audio.addEventListener(event,close);
    return close;
  }
  move(audio,position){this.voices.get(audio)?.move(position);}
}
export const worldSound=new WorldSound();
