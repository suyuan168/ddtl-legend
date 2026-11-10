import {worldSound} from './world-sound.js';

// W_1_View uses one loop for a burst. The native last-shot watchdog is .18 s.
// W_2/3/4 select the paired attack clips; W_5 plays on its .1 s animation event.
export class WeaponAudio {
  constructor(play,loop,currentVolume,prepare){
    this.play=play;
    this.loop=loop;
    this.currentVolume=currentVolume;
    this.prepare=prepare;
    this.guns=new Map();
    this.muzzleCues=new Map();
    this.alternates=new Map();
    this.footsteps=new Map();
    this.lasers=new Map();
  }
  setListener(x,y,localId){
    this.localOwner=localId;
    worldSound.setListener(x,y);
  }
  source(point,owner){
    return owner&&owner!=='local'&&owner!==this.localOwner?point:null;
  }
  setAttackClips(motion){
    this.cueTimes=new Map();
    for(const [id,event,speed] of [['5','PlayMuzzleFlash',1],['1002','PlayLaserParticle',1],['1004','PlayMuzzleParticle',2.5]]){
      const [time]=motion[id].states.Attack.events.find(([,name])=>name===event);
      this.cueTimes.set(id,time/speed);
    }
  }
  fire(e,now){
    const owner=e.owner||'local';
    if(e.id==='1'){
      let loop=this.guns.get(owner);
      if(!loop){
        const audio=this.loop('sfx_ingame_machinegun',1,this.source(e,owner));
        if(!audio)return;
        this.guns.set(owner,loop={audio});
      }
      loop.end=now+.18;
    }else if(this.cueTimes?.has(e.id)){
      if(e.id==='1002')this.prepare?.('sfx_ingame_sharklazer_shoot');
      this.muzzleCues.set(owner,{id:e.id,at:now+this.cueTimes.get(e.id)});
    }else if(e.id==='2'||e.id==='3'||e.id==='4'){
      if(e.id==='3'&&this.alternates.get(owner)?.mode==='charge'){
        this.alternates.get(owner).audio?.pause();this.alternates.delete(owner);
      }
      if(e.id==='3'&&e.charge>.5){this.play('sfx_ingame_chargegun_skill_shoot',false,1,this.source(e,owner));return;}
      const stem={'2':'smallgun','3':'chargegun','4':'shotgun'}[e.id];
      this.play('sfx_ingame_'+stem+'_'+(Math.random()<.5?1:2),false,1,this.source(e,owner));
    }
  }
  stopGun(owner='local'){
    const gun=this.guns.get(owner);
    if(gun){gun.audio.pause();this.guns.delete(owner);}
  }
  dash(e){
    const owner=e.owner||'local';
    this.stopGun(owner);
    this.play('sfx_ingame_machinegun_skill',false,1,this.source(e,owner));
  }
  bulletEnd(event){
    // EffectViewModel.PlayBulletEndEffect selects Paint_Pop_1 through 3.
    this.play('sfx_ingame_paint_pop_'+(1+Math.floor(Math.random()*3)),false,1,event);
  }
  updateAlternates(actors,now){
    const active=new Set();
    for(const actor of actors){
      if(actor.deathPose)continue;
      const owner=actor.id;
      const gun=this.guns.get(owner);
      if(gun)worldSound.move(gun.audio,actor);
      const mode=actor.weapon==='2'&&actor.passing?'pass':
        actor.weapon==='3'&&actor.charge>0?'charge':
        actor.weapon==='4'&&actor.shield?'shield':
        actor.weapon==='5'&&actor.rolling?'roll':null;
      if(!mode)continue;
      active.add(owner);
      let state=this.alternates.get(owner);
      if(state?.mode!==mode){
        state?.audio?.pause();
        this.alternates.set(owner,state={mode});
        if(mode==='pass')this.play('sfx_ingame_smallgun_skill',false,1,this.source(actor,owner));
        if(mode==='shield')this.play('sfx_ingame_shotgun_skill',false,1,this.source(actor,owner));
      }
      if(mode==='roll')state.audio??=this.loop('sfx_ingame_roller_skill',1,this.source(actor,owner));
      if(mode==='roll'&&state.audio&&this.currentVolume)state.audio.volume=this.currentVolume();
      if(state.audio)worldSound.move(state.audio,actor);
      if(mode==='charge'){
        // In the shipped W_3 paintCostCurve all samples are 1. A charging
        // component can therefore reach full ratio whenever it can start.
        if(actor.charge<1){
          if(state.fadeAt!=null){state.audio?.pause();state.audio=null;state.fadeAt=null;}
          state.audio??=this.loop('sfx_ingame_chargegun_skill_charge',1,this.source(actor,owner));
          if(state.audio&&this.currentVolume)state.audio.volume=this.currentVolume();
        }else if(state.audio){
          if(state.fadeAt==null){state.fadeAt=now;state.volume=state.audio.volume;}
          const fraction=Math.min(1,(now-state.fadeAt)/.2);
          state.audio.volume=(this.currentVolume?this.currentVolume():state.volume)*(1-fraction);
          if(fraction>=1){state.audio.pause();state.audio=null;}
        }
      }
    }
    for(const [owner,state] of this.alternates)if(!active.has(owner)){
      state.audio?.pause();
      this.alternates.delete(owner);
    }
  }
  movement(actor,facing,duration,nowMs,paused){
    const owner=actor.id;
    let state=this.footsteps.get(owner);
    if(paused||actor.deathPose){
      state?.ride?.pause();
      this.footsteps.delete(owner);
      return;
    }
    if(!state)this.footsteps.set(owner,state={});
    if(actor.pending&&!state.pending)this.play('sfx_ingame_player_skateboard',false,1,this.source(actor,owner));
    state.pending=actor.pending;
    const ride=actor.boost?(actor.onPaint?'sfx_ingame_player_skateboard_ride_paint':'sfx_ingame_player_skateboard_ride'):null;
    if(ride!==state.key){
      state.ride?.pause();
      state.ride=null;
      state.key=ride;
    }
    if(ride)state.ride??=this.loop(ride,1,this.source(actor,owner));
    if(state.ride)worldSound.move(state.ride,actor);
    if(state.ride&&this.currentVolume)state.ride.volume=this.currentVolume();
    if(actor.pending||actor.boost||facing.action!=='Walk'){
      state.phase=null;
      return;
    }
    const t=(nowMs-facing.start)/(1000*duration);
    const phase=t-Math.floor(t),prior=state.phase;
    // PlayerView.DidPassFootstepContact uses the Animator's wrapped normalized time.
    const contact=Math.fround(.94);
    if(prior!=null&&(prior<=phase?prior<contact&&phase>=contact:prior<contact||phase>=contact)){
      const stem=actor.onPaint?'sfx_ingame_player_step_paint_':'sfx_ingame_player_step_';
      this.play(stem+(Math.random()<.5?1:2),false,1,this.source(actor,owner));
    }
    state.phase=phase;
  }
  pruneMovement(actors){
    const present=new Set(actors.map(a=>a.id));
    for(const [owner,state] of this.footsteps)if(!present.has(owner)){
      state.ride?.pause();this.footsteps.delete(owner);
    }
  }
  clearMovement(){this.pruneMovement([]);}
  laserShot(owner,point){
    const actor=this.lasers.get(owner);
    actor?.charge?.pause();
    if(actor)actor.charge=null;
    this.play('sfx_ingame_sharklazer_shoot',false,1,this.source(point,owner));
  }
  updateLasers(actors,localLocked){
    const active=new Set();
    for(const a of actors){
      if(!a.special||a.ultimate!=='1002')continue;
      const id=a.id;
      active.add(id);
      if(!this.lasers.has(id)){
        this.lasers.set(id,{charge:null});
        this.play('sfx_ingame_sharklazer_aim',false,1,this.source(a,id));
      }
      const state=this.lasers.get(id),locked=id==='local'?localLocked:a.laserLocked;
      if(locked){
        state.charge??=this.loop('sfx_ingame_sharklazer_charge',1,this.source(a,id));
        if(state.charge)worldSound.move(state.charge,a);
      }
      else if(state.charge){state.charge.pause();state.charge=null;}
    }
    for(const [id,actor] of this.lasers)if(!active.has(id)){
      actor.charge?.pause();this.lasers.delete(id);
    }
  }
  update(now,actors=[]){
    for(const [owner,loop] of this.guns)if(now>loop.end)this.stopGun(owner);
    for(const [owner,cue] of this.muzzleCues){
      const actor=actors.find(a=>a.id===owner);
      if(!actor||actor.deathPose||(actor.special?actor.ultimate:actor.weapon)!==cue.id||(cue.id==='5'&&actor.rolling)){
        this.muzzleCues.delete(owner);continue;
      }
      if(now<cue.at)continue;
      this.muzzleCues.delete(owner);
      if(cue.id==='1002')this.laserShot(owner,actor);
      else this.play(cue.id==='5'?'sfx_ingame_roller':'sfx_ingame_bazooka_shoot',false,1,this.source(actor,owner));
    }
  }
  clear(){
    for(const {audio} of this.guns.values())audio.pause();
    this.guns.clear();this.muzzleCues.clear();this.clearMovement();this.updateAlternates([],0);this.updateLasers([],false);
  }
}
