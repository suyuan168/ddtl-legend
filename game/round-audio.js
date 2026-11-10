// GameViewModel's two-entry battle playlist and SoundService's separate fever voice.
export class RoundAudio{
  constructor(file,musicVolume,sfxVolume,enabled,play){
    Object.assign(this,{file,musicVolume,sfxVolume,enabled,play});this.waiting=new Set();
    const unlock=()=>{for(const voice of this.waiting){this.waiting.delete(voice);this.tryPlay(voice);}};
    addEventListener('pointerdown',unlock,{capture:true});addEventListener('keydown',unlock,{capture:true});
  }
  tryPlay(voice){
    voice.play().catch(error=>{if(error.name==='NotAllowedError'&&this.enabled()&&(voice===this.base||voice===this.overlay))this.waiting.add(voice);});
  }
  voice(key,loop,volume){
    const file=this.file(key);if(!file||!this.enabled())return null;
    const audio=new Audio(file);audio.loop=loop;audio.volume=volume;return audio;
  }
  reset(){
    clearTimeout(this.intro);clearTimeout(this.endCue);this.waiting.clear();this.base?.pause();this.overlay?.pause();this.base=this.overlay=null;
  }
  enter(scene){
    this.reset();this.inFever=false;this.scene=scene;this.previous=null;this.finished=false;this.baseScale=1;
    this.track=scene==='field'?['bgm_ingame_chillshooter','bgm_ingame_immigrantcolor'][Math.floor(Math.random()*2)]:
      scene==='lobby'?'bgm_lobby_cityofcolors':'bgm_title';
    if(scene==='field'){
      this.play('sfx_ingame_start');
      this.intro=setTimeout(()=>this.resume(),2000); // PvPStartView.anim / WaitAnimationEnd
    }else this.resume();
  }
  get titleCue(){return this.scene==='title';}
  resume(){
    if(!this.track||this.base)return;
    this.base=this.voice(this.track,['field','lobby'].includes(this.scene),this.titleCue?this.sfxVolume():this.musicVolume()*this.baseScale);
    if(this.base)this.tryPlay(this.base);
    if(this.inFever&&!this.overlay)this.fever(false);
  }
  level(){
    if(this.base)this.base.volume=this.titleCue?this.sfxVolume():this.musicVolume()*this.baseScale;
    if(this.overlay)this.overlay.volume=this.musicVolume();
  }
  fever(start=true){
    this.inFever=true;this.baseScale=0;this.level();
    this.overlay=this.voice('bgm_ingame_fevertime',false,this.musicVolume());
    if(this.overlay){this.overlay.onended=()=>{this.overlay=null;this.inFever=false;this.baseScale=.5;this.level();};this.tryPlay(this.overlay);}
    if(start)this.play('sfx_ingame_fevertime_start');
  }
  clock(seconds,ended){
    if(ended)seconds=0; // FinishCountDown also shows zero when a room ends early.
    if(this.previous!==seconds&&seconds<=10&&seconds>=0)this.play('sfx_ingame_fevertime_count');
    this.previous=seconds;
    if(ended&&!this.finished){this.finished=true;this.endedAt=performance.now();this.endCue=setTimeout(()=>this.play('sfx_ingame_gameover'),1000);}
  }
  get resultReady(){return this.finished&&performance.now()-this.endedAt>=3000;}
  result(){this.baseScale=.5;this.level();}
  mute(){this.waiting.clear();this.base?.pause();this.overlay?.pause();this.base=this.overlay=null;}
  leave(){this.reset();this.inFever=false;this.track=null;}
}
