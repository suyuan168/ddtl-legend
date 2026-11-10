import {HammerImpacts} from './hammer-impact.js';
import {MuzzleParticles} from './muzzle-particles.js';
import {UiSound} from './ui-sound.js';
import {SkillAudio} from './skill-audio.js';
import {mountVersionOverlay} from './version-overlay.js';
import {PlayerLabels} from './player-labels.js';
import {PlayerHit} from './player-hit.js';
import {BushHologram,visibleInBush,weaponSpriteRadius} from './bush-hologram.js';
import {BushLeaves} from './bush-leaves.js';
import {Bushes} from './bushes.js';
import {DeathView,deathClips} from './player-death.js';
import {WorldTimeGauge} from './world-time-gauge.js';
import {VentView} from './vent-view.js';
import {drawSpawnPaint,drawPadLine} from './map-surface.js';
import {BombEntities} from './bomb-entities.js';
import {showLoading,hideLoading,setLoadingProgress,showLoadingFailure} from './loading.js';
import {YardChat} from './yard-chat.js';
import {MissileView} from './missile-view.js';
import {equippedCostumes} from './owned-costumes.js';
import {readOwned} from './gacha.js';
import {LobbyZones} from './lobby-zones.js';
import {WeaponAim} from './weapon-aim.js';
import {WeaponAudio} from './weapon-audio.js';
import {mapAttenuation,worldSound} from './world-sound.js';
import {WeaponView,particleCurve} from './weapon-view.js';
import {translated} from './language.js';
import {equipmentClip,spriteLayer} from './equipment.js';
import {skillLoadout} from './loadout.js';
import {EquipmentPanel,character,bombLayers} from './equipment.js';
import {SceneMenus} from './scene-menus.js';
import {Results} from './results.js';
import {BattleUI} from './battle-ui.js';
import {MapAudio} from './map-audio.js';
import {RoundAudio} from './round-audio.js';
import {projectilePose} from './damage.js';
import {projectileLayer} from './projectile-view.js';
import {drawSharkBeam,drawUltimateRange} from './ultimate-view.js';
import {FieldCamera} from './camera.js';
import {playerPose} from './player-pose.js';
import {hasMoveInput} from './board-controls.js';
import {weaponDepth,compareDepth,DashParticles} from './entity-depth.js';
import {GiantSprinklerView} from './giant-sprinkler-view.js';
import {BuffView} from './buff-view.js';
import {DummyFeedback} from './dummy-feedback.js';
import {Renderer,sceneLayers,inCamera} from './render.js';
import {net,connect,disconnect,sendInput,sendYardPose,playerName} from './rooms.js';
import {LocalField,stats} from './simulation.js';
import {CombatClock} from './combat-clock.js';
const $=s=>document.querySelector(s), json=p=>fetch(p).then(r=>{if(!r.ok)throw Error(p);return r.json()});
// Final floor colors sampled from the supplied battle reference in display space.
let inkPalette=['#c5dd0d','#2e3cdb'],paletteIndex=1;
const teamColor=team=>tables.Team[team-1].TeamColor.split('|')[paletteIndex];
const colorVector=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).concat(1);
const inRoomBattle=()=>!!net.room&&state==='field';
function viewport(){
  const aspect=Math.max(4/3,Math.min(21/9,innerWidth/innerHeight));
  return [Math.max(1920,Math.round(1080*aspect)),Math.max(1080,Math.round(1920/aspect))];
}
let [W,H]=viewport(),surface;
const keys=new Set();let state='boot',field,world,paintLayer,actorMap,render,assets,tables,locale,actorView,ctx,game,texture;
const inspection=new URLSearchParams(location.search).get('inspect')==='1';
document.body.classList.toggle('inspection',inspection);
const volume={master:100,music:100,sfx:100};
try{for(const [k,v] of Object.entries(JSON.parse(localStorage.getItem('chill-volume')||'{}')))if(k in volume&&Number.isFinite(v))volume[k]=Math.max(0,Math.min(100,v));}catch{}
const gain=key=>volume.master*volume[key]/10000;
let uiSound,chat,results,menus,originalViews,previewRegistration,lobbyZones,cameraSettings,fieldCamera,pointerAt=null;
let angle=0,fire=false,touchFire=false,stick=[0,0],lastHud='',muted=localStorage.getItem('chill-mute')==='1',equipped=localStorage.getItem('chill-weapon')||'1';
let entityDepth;const dashParticles=new DashParticles();
const poses=new Map(),poseClocks=new Map(),deathView=new DeathView();let distance=1,parameters,combat,alt=false,motions;
let dummyFeedback,buffView,sprinklerView,ventView,worldTimeGauge,padMotion,bushes,bushLeaves;
let explosionPools,laserParticle,missileRadius,bindings,projectiles,baseActor,panels,hud,ui,equipment,foreground,actorBuild=0;let weaponAim,weaponView,ultimateViews,missiles;
const bombRanges=new Map();
let bombEntities;
const ultimateStats=new Map();const bombViews=new Map();
const launchView=new URLSearchParams(location.search).get('view');
const previewInventory=inspection||['costume','catalog','weapon','park'].includes(launchView);
const kitKey=previewInventory?'chill-preview-kit':'chill-owned-kit';
let owned=new Set(),saved={};
try{saved=JSON.parse(localStorage.getItem(kitKey)||localStorage.getItem('chill-kit')||'{}')||{};}catch{}
// Local starting outfit matches the Steam wardrobe demonstration.
let kit,emojiMenu=null,emojiPick=0,emojiOrigin,localEmoji=0,emojiUntil=0,nextEmojiTime=0;
const queuedActions=[];
let localClock;
const bushHologram=new BushHologram();
const fieldProps=new Map();
const battleClips=new Map();
function equipmentFrame(name,time,fallback){
  const clip=battleClips.get(name);
  if(!clip?.frames.length)return fallback;
  const phase=(clip.loop?time%clip.duration:Math.min(time,clip.duration-0.00001))/clip.duration;
  return clip.frames[Math.floor(Math.max(0,phase)*clip.frames.length)];
}
function perform(action){
  if(results?.panel)return;
  if(action==='ultimate'&&field&&field.skills.points<field.player.UltCapacity)hud?.notice('涂地蓄能 '+Math.floor(field.skills.points)+' / '+field.player.UltCapacity);
  if(typeof action==='number'){
    const now=performance.now();
    if(now<nextEmojiTime){uiSound.cue(9);hud.notice(translated(locale,'TM_Emoji_CoolDown'));return;}
    const emoji=tables.EmojiAsset.find(row=>+row.Id===action);
    if(!emoji)return;
    nextEmojiTime=now+3000;
    sound(tables.Sound.find(row=>row.Enum===emoji.SoundType).SoundName);
  }
  if(inRoomBattle()){if(net.room.connection.isOpen)net.room.send('action',{action,angle,distance});}
  else if(typeof action==='number'){localEmoji=action;emojiUntil=performance.now()+2000;}
  else queuedActions.push({action,angle,distance});
}

let tab='map';const sounds=new Map(),lastOneShot=new Map(),oneShots=[]; const viewCache=new Map();
const preparedShots=new Map();
function prepareShot(key){
  const file=sounds.get(key)?.file;
  if(!file||muted||preparedShots.has(file))return;
  const audio=new Audio(file);
  audio.preload='auto';
  preparedShots.set(file,audio);
  audio.load();
}
// The shipped mixer opens all three buses at 0 dB. Track live voices so
// moving either fader also adjusts effects already in flight.
const activeEffects=new Map();
function playEffect(audio,scale,position,attenuation){
  audio.volume=gain('sfx')*scale;
  activeEffects.set(audio,scale);
  const detach=worldSound.attach(audio,position,attenuation);
  const release=()=>{
    activeEffects.delete(audio);
    for(const event of ['pause','ended','error'])audio.removeEventListener(event,release);
  };
  for(const event of ['pause','ended','error'])audio.addEventListener(event,release);
  audio.play().catch(()=>{release();detach?.();});
}
function sound(key,loop=false,volumeScale=1,position=null,attenuation){const a=sounds.get(key),file=a?.file;if(!file||muted)return;
  {
    const now=performance.now();
    if(now-(lastOneShot.get(file)??-Infinity)<100)return;
    for(let i=oneShots.length-1;i>=0;i--)if(oneShots[i].ended||oneShots[i].paused)oneShots.splice(i,1);
    if(oneShots.length>=50)oneShots.shift().pause();
    lastOneShot.set(file,now);
    const player=preparedShots.get(file)||new Audio(file);
    preparedShots.delete(file);
    oneShots.push(player);playEffect(player,volumeScale,position,attenuation);
  }}
function startEffectLoop(key,volumeScale=1,position=null,attenuation){
  const file=sounds.get(key)?.file;
  if(!file||muted)return null;
  const audio=new Audio(file);audio.loop=true;playEffect(audio,volumeScale,position,attenuation);
  return audio;
}
const weaponAudio=new WeaponAudio(sound,startEffectLoop,()=>gain('sfx'),prepareShot);
let playerHit,playerLabels;
const skillAudio=new SkillAudio(()=>tables.Sound,sound,startEffectLoop,()=>net.room?.sessionId);
const bursts=[];
const hammerImpacts=new HammerImpacts();
function stopRides(){sprinklerView?.stop();skillAudio.update([]);weaponAudio.clearMovement?.();}
function skillEvent(e){
  if(e.type==='smg-stop'){weaponAudio.stopGun(e.owner);return;}
  if(e.type==='zone-speed'){skillAudio.owner(98,e,e.owner);return;}
  if(e.type==='drop-ship'||e.type==='drop-impact'){skillAudio.at(e.type==='drop-ship'?107:108,e);return;}
  if(e.type==='shield-block'){
    weaponView.block(e,performance.now()/1000);
    sound(tables.Sound.find(s=>s.Enum==='Block_Attack').SoundName);
    dummyFeedback.floating({targetX:e.x,targetY:e.y,textId:8});
    return;
  }
  if(e.type==='death-ink-end'||e.type==='bullet-end'){
    weaponAudio.bulletEnd(e);
    buffView.bulletEnd(e,performance.now()/1000,colorVector(teamColor(e.team)));
    return;
  }
  if(e.type==='kill-log'){hud?.killFeed.add(e,paletteIndex);return;}
  if(e.type==='player-hit'){playerHit.impact(e,teamColor(e.team),performance.now()/1000);return;}
  if(e.type==='player-hit-sound'){skillAudio.hit(e);return;}
  if(e.type==='player-death'){weaponAudio.stopGun(e.owner);playerHit.reset(e.owner);skillAudio.owner(53,e,e.owner);return;}
  if(e.type==='player-respawn'){
    deathView.reset(e.owner);playerLabels.ratios.delete(e.owner);poseClocks.set(e.owner,{revived:true});
    if(e.owner==='local'||e.owner===net.room?.sessionId)sound('sfx_ingame_player_respawn');
    return;
  }
  if(e.type==='dash-step'){
    dashParticles.step(e,entityDepth.dash,performance.now()/1000);
    if(e.first)weaponAudio.dash(e);
    return;
  }
  if(e.type==='no-ink'){
    if((!e.owner||e.owner===net.room?.sessionId)&&fieldCamera.startInkWarning()){
      uiSound.cue(9);hud.notice(translated(locale,'TM_NotEnough_Paint'));
    }
    return;
  }
  if(e.type==='dummy-hit'){
    dummyFeedback.impact(e,teamColor(e.team));
    skillAudio.hit(e);return;
  }
  const own=!e.owner||e.owner===net.room?.sessionId;
  if(own&&['weapon-fire','smash','charge'].includes(e.type))hud.reticle.shoot();
  if(e.type==='aim-hit'){if(own)hud.reticle.hit();return;}
  if(e.type==='weapon-fire'){const now=performance.now()/1000;weaponView.fire(e,now);weaponAudio.fire(e,now);return;}
  if(e.type==='ultimate'){if(e.id==='1003'||e.id==='1004')skillAudio.owner(94,e,e.owner);return;}
  if(e.type==='pickup'){
    const self=!e.owner||e.owner===net.room?.sessionId;
    skillAudio.owner(37,e,e.owner);
    if(self&&e.id==='4')setTimeout(()=>sound('sfx_ingame_gauge_charge_ultimate'),150);
    buffView.pickup(e,performance.now()/1000,self,e.chargeFx);
    return;
  }
  if(e.type==='charge'){const now=performance.now()/1000;weaponView.fire(e,now);weaponAudio.fire(e,now);return;}
  if(e.type==='shoot')return;
  if(e.type==='smash-release'){weaponView.releaseHammer(e.owner);return;}
  if(e.type==='smash'){
    weaponView.fire(e,performance.now()/1000);
    sound('sfx_ingame_hammer_attack_'+(Math.floor(Math.random()*2)+1),false,1,weaponAudio.source({x:e.actorX,y:e.actorY},e.owner));
    // EffectViewModel.Start sets _w1001Offset=(0,-0.5) for the visual pool only.
    hammerImpacts.start(e.x,e.y-.5,bindings.smash,colorVector(teamColor(e.team)));return;
  }
  skillAudio.bomb(e);
  if(e.type==='explode'){
    // EffectViewModel.EventExplodeEntity 0xa36060: skill 1003 spawns entity 1001, whose
    // Explode_2 pool skips the generic startColor override and retains the original tint.
    const particles=new MuzzleParticles();
    particles.trigger(explosionPools[e.id==='1003'?'Explode_2':'Explode'],0);
    bursts.push({...e,age:0,particles});
  }
}
function drawThrowAim(ctx,aim){
  const arc=bindings.throwLine,skill=field.skills;
  const length=Math.min(distance,field.player.ThrowingDistance);
  const dx=Math.cos(aim)*length,dy=Math.sin(aim)*length;
  const radius=skill.bombEntity.AtkRange||0;
  ctx.save();ctx.lineWidth=arc.width;
  const rgb=arc.color.map(c=>Math.round(c*255)).join(',');
  let x=0,y=0;
  for(let i=1;i<=arc.segments;i++){
    const t=i/arc.segments,stop=arc.alpha.findIndex(([at])=>at>=t);
    const [t0,a0]=arc.alpha[stop-1],[t1,a1]=arc.alpha[stop];
    ctx.strokeStyle='rgba('+rgb+','+(a0+(a1-a0)*(t-t0)/(t1-t0))+')';
    ctx.beginPath();ctx.moveTo(x,y);x=dx*t;y=dy*t+Math.sin(Math.PI*t)*Number(skill.bomb.ThrowHeight)*.5;
    ctx.lineTo(x,y);ctx.stroke();
  }
  if(radius>0)render.layer(ctx,{id:arc.circle,m:[2*radius,0,0,2*radius,dx,dy],flip:[false,false],size:[1,1],pivot:[.5,.5],color:arc.circleColor,mode:0});
  ctx.restore();
}
function drawBursts(ctx,dt){
  for(let i=bursts.length-1;i>=0;i--){
    const b=bursts[i],tint=colorVector(teamColor(b.team));
    ctx.save();ctx.translate(b.x,b.y);
    b.particles.draw(ctx,render,b.age,tint,particleCurve);ctx.restore();
    b.age+=dt;if(!b.particles.live.length)bursts.splice(i,1);
  }
}
const playMapSound=(key,point)=>sound(key,false,1,point,mapAttenuation);
const loopMapSound=(key,point)=>startEffectLoop(key,1,point,mapAttenuation);
const mapAudio=new MapAudio(loopMapSound);
// TitleView.titleSound directly references its scene clip; the SoundDataStore also has an identically named addressable.
const roundAudio=new RoundAudio(key=>(key==='bgm_title'?render.byId.get('sharedassets1.assets/46'):sounds.get(key))?.file,()=>gain('music'),()=>gain('sfx'),()=>!muted,sound);
function poseFrame(outfit,pose,index,team=1,bush=false){
  const key=[teamColor(team),outfit.Head,outfit.Body,outfit.Skin,pose,index,bush].join('|');
  if(!poses.has(key)){
    if(poses.size>=256)poses.delete(poses.keys().next().value);
    const entry={value:null};poses.set(key,entry);
    entry.ready=character(render,equipment,tables,outfit,motions[pose].frames[index],pose,teamColor(team),bush ? .3 : 1).then(value=>entry.value=value);
  }
  return poses.get(key);
}
async function preparePoses(outfit){
  await Promise.all(Object.keys(motions).filter(p=>/^(Front|Back)_/.test(p)).map(p=>poseFrame(outfit,p,0).ready));
}
function screenState(mode){state=mode;if(mode==='lobby')chat?.resize();$('#waiting-ui').hidden=true;$('#battle-ui').hidden=mode!=='field'&&mode!=='lobby';if(mode!=='loading')hideLoading();$('#hud').hidden=mode!=='lobby'&&mode!=='field';$('#touch').hidden=$('#hud').hidden||!matchMedia('(pointer:coarse)').matches;document.body.dataset.screen=mode;}
async function view(key){if(!viewCache.has(key))viewCache.set(key,json('data/views/'+key+'.json'));return viewCache.get(key);}
function boxFor(map){return map.ModeType==='Lobby'?{x:-72,y:-50,w:144,h:116}:{x:-map.Width/2-16,y:-map.Height/2-16,w:+map.Width+32,h:+map.Height+32};}
async function switchMap(id,online=false){
  if(!online&&net.room)await disconnect();
  mapAudio.clear();chat?.reset();hud?.killFeed.clear();results?.clear();dashParticles.reset();buffView?.reset();weaponView?.actors.clear();bombEntities?.shaking.clear();if(missiles){missiles.flights.length=0;missiles.targetClocks.clear();}weaponAudio.clear();stopRides();bursts.length=0;hammerImpacts.clear();poses.clear();poseClocks.clear();deathView.clocks.clear();playerLabels?.reset();playerHit?.hits.clear();closeEmoji(false);
  if(state==='loading')return;
  $('#menu').close();menus.close();lobbyZones.reset();screenState('loading');showLoading('scene');keys.clear();fire=false;alt=false;touchFire=false;stick=[0,0];
  try{
    const map=tables.GameMap.find(m=>m.Id===id),isLobby=map.ModeType==='Lobby';
    paletteIndex=isLobby?0:1;inkPalette=isLobby?['#0cdd6d','#bf16dd']:['#c5dd0d','#2e3cdb'];
    const v=await view(isLobby?'lobby':map.MapData);await Promise.all([render.prepare(v),preparePoses(kit)]);
    // Tint the 2048px beam atlas while the loading screen is up. Its first
    // full-image readback would otherwise stall the laser flash and sound.
    const beam=render.byId.get(bindings.laser.id);
    for(const team of isLobby?[1]:[1,2])render.tint(beam,colorVector(teamColor(team)));
    const box=boxFor(map);const floor=v.draw.filter(s=>s.order[0]<2&&!s.path.includes('/ZN_10/')).map(s=>{
      if(!s.teamTint)return s;const color=teamColor(s.teamTint);
      return {...s,color:[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).concat(s.color[3])};});
    // The PaintView SpriteRenderer is BackGround / 0 in both LobbyScene and GameScene.
    const layers=sceneLayers(floor),abovePaint=layers.findIndex(l=>l.layer===1&&l.order>0);
    const split=abovePaint===-1?layers.length:abovePaint;
    world={box,floor:layers.slice(0,split),abovePaint:layers.slice(split),enteredAt:performance.now()/1000};
    paintLayer=document.createElement('canvas');paintLayer.width=Math.ceil(box.w*36);paintLayer.height=Math.ceil(box.h*36);
    fieldCamera=new FieldCamera(cameraSettings);pointerAt=null;
    field=new LocalField(tables,map,v,parameters,combat);
    localClock=new CombatClock();
    bushes.bind(v.triggerZones||[]);
    sprinklerView=null;
    if(field.sprinkler){
      const spec=field.sprinkler.spec;
      await render.prepare({draw:[spec.Surface,spec.LiquidColor]});
      const soundKey=id=>tables.Sound.find(s=>+s.Id===id).SoundName;
      sprinklerView=new GiantSprinklerView(field.sprinkler,render,v.draw.filter(p=>p.path.includes('/ZN_10/')),{
        hit:(x,y,team)=>dummyFeedback.impactParticles(x,y,teamColor(team)),
        play:(id,point)=>playMapSound(soundKey(id),point),loop:(id,point)=>loopMapSound(soundKey(id),point)});
    }
    for(const part of v.draw)if(part.path.endsWith('/MapObject_12/Line/Line_1')){
      const [x,y]=part.m.slice(4);
      buffView.start('Fx_MapOject_12',world.enteredAt,x,y,null,Infinity);
    }
    mapAudio.bind(v.draw);
    const lids=ventView.bind(field,v.draw);
    foreground=sceneLayers(v.draw.filter(s=>s.order[0]>=2&&!lids.has(s)));
    dummyFeedback.bind(field);field.equip(equipped,kit);queuedActions.length=0;field.practiceTime=+tables.GameMode.find(m=>m.Enum==='PaintBattle').GameEndTime;screenState(isLobby?'lobby':'field');$('#place').textContent=isLobby?'大厅':map.Enum.trim()+' · 练习';lastHud='';hud.show(kit,!isLobby);roundAudio.enter(isLobby?'lobby':'field');
    return true;
  }catch(e){showLoadingFailure('场景加载失败：'+e.message);console.error(e);return false;}
}
function blit(ctx,bake){ctx.save();ctx.translate(bake.box.x,bake.box.y+bake.box.h);ctx.scale(1,-1);ctx.drawImage(bake.c,0,0,bake.box.w,bake.box.h);ctx.restore();}
function one(ctx,asset,x,y,w,h,rotation=0){const im=render.images.get(asset?.file)?.im;if(!im)return;ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(1,-1);ctx.drawImage(im,-w/2,-h/2,w,h);ctx.restore();}
function paintMarks(){const g=paintLayer.getContext('2d'),box=world.box;g.setTransform(36,0,0,-36,-box.x*36,(box.y+box.h)*36);

  for(const b of field.paint){const asset=render.byName.get(tables.PaintAsset[(b.texture||0)%tables.PaintAsset.length].SplatTexture);const teamColor=inkPalette[(b.team||field.team)-1];const im=render.paintBrush(asset,teamColor);g.save();g.translate(b.x,b.y);g.rotate((b.rotation||0)*Math.PI/180);g.scale(1,-1);g.drawImage(im,-b.size,-b.size,b.size*2,b.size*2);g.restore();}field.paint.length=0;}
function tick(dt,wallSeconds){if(!ctx)return;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=(state==='field'||state==='lobby')?'#000':'#262534';ctx.fillRect(0,0,W,H);
  if(!field||state==='loading')return;
  const ended=state==='field'&&(net.room?net.last?.phase==='finished':field.practiceTime<=0);
  const paused=ended||$('#menu').open||$('#equipment').open||menus.dialog.open;const dx=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+stick[0],dy=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+stick[1];
  if(pointerAt)updateAim();
  const controlsBlocked=paused||chat.active;
  if(controlsBlocked)queuedActions.length=0;
  const input={boost:!controlsBlocked&&keys.has('Space'),dx:controlsBlocked?0:dx,dy:controlsBlocked?0:dy,angle,distance,alt:!controlsBlocked&&alt,fire:!controlsBlocked&&(fire||touchFire)};
  if(state==='lobby'&&net.last?.phase==='playing'){switchMap(net.last.mapId,true);return;}
  $('#roomHud').hidden=!inRoomBattle();menus.waiting(net.room,net.last,net.quick,net.started);
  if(inRoomBattle()&&net.last){sendInput(input);const snap=net.last,me=snap.players.find(p=>p.id===net.room.sessionId);
    if(me){field.x=me.x;field.y=me.y;field.ink=me.ink;field.hp=me.hp;field.team=me.team;field.paintBuff=me.paintBuff;field.charge=me.charge;field.skills.points=me.points;}
    if(net.reset){paintLayer.width=paintLayer.width;field.paint.length=0;net.reset=false;}
    net.skillEvents.splice(0).forEach(skillEvent);
    field.paint.push(...net.marks.splice(0,256));
    field.shots=snap.players.flatMap(p=>p.shots.map(shot=>({...shot,team:p.team}))).concat(snap.deathShots||[]);
    if(field.sprinkler)Object.assign(field.sprinkler,{shots:snap.mapShots,team:snap.machineTeam,charge:Math.round(snap.machineCharge*65536),hitSerial:snap.machineHits,hitX:snap.machineHitX,hitY:snap.machineHitY,fireSerial:snap.machineFires,active:snap.machineActive});
    const scores=snap.scores.join(' : ');const message=snap.phase==='waiting'?'等待 '+snap.players.length+'/6 · '+snap.wait+'s':snap.phase==='finished'?'结算 '+scores:snap.time+'s · '+scores+' · HP '+(me?.hp??0);
    $('#roomHud').textContent=net.room.roomId+' · '+message;

  }else if(!paused){
    localClock.advance(wallSeconds,step=>{
      if(state==='field'){
        if(field.practiceTime<=0)return;
        field.practiceTime=Math.max(0,field.practiceTime-step);
        if(!field.fever&&field.practiceTime<=Number(tables.GameMode.find(r=>r.Enum==='PaintBattle').FeverTime)){
          field.startFever();roundAudio.fever();
        }
      }
      input.actions=queuedActions.splice(0);
      field.step(step,input);
      field.skills.events.forEach(skillEvent);
    });
  }
  if(state==='field'){const seconds=net.last?.time??Math.ceil(field.practiceTime);
    hud.time(seconds,ended);roundAudio.clock(seconds,ended);
    const fever=!ended&&seconds<=Number(tables.GameMode.find(r=>r.Enum==='PaintBattle').FeverTime);
    if(fever&&!field.fever){field.startFever();roundAudio.fever();}
    hud.fever.hidden=!fever;
    if(ended&&roundAudio.resultReady){
      if(!results.panel)roundAudio.result();
      if(net.room)results.show(net.last.scores,net.last.players,net.room.sessionId,net.last.persistentRewards);
      else results.show([1,2].map(t=>field.grid.reduce((a,v)=>a+Number(v===t),0)),[{id:'local',team:field.team,name:playerName(),weapon:equipped,paintPoints:field.paintPoints,kills:0,deaths:0}],'local',false);
    }}
  const localPlayer=inRoomBattle()?net.last?.players.find(p=>p.id===net.room.sessionId):null;
  const specialId=ended?null:localPlayer?(localPlayer.special?localPlayer.ultimate:null):field.skills.active?field.skills.ult?.Id:null;
  const specialAsset=specialId&&tables.WeaponAsset.find(w=>w.Id===specialId);
  const lens=tables.WeaponAsset.find(w=>w.Id===equipped);
  fieldCamera.update(paused?0:dt,lens,field.charge>0,angle,distance,specialAsset);
  const scale=ended?Math.min(W/field.width,H/field.height):H/(2*fieldCamera.size.value);
  const frameTime=performance.now()/1000;
  const focus=dashParticles.sample({id:localPlayer?.id||'local',x:field.x,y:field.y},frameTime);
  const cameraX=ended?field.left+field.width/2:focus.x+fieldCamera.x.value,cameraY=ended?field.bottom+field.height/2:focus.y+fieldCamera.y.value+fieldCamera.shakeY;
  weaponAudio.setListener(cameraX,cameraY,localPlayer?.id||'local');
  mapAudio.update(!ended&&!muted);
  const visible={left:cameraX-W/(2*scale),right:cameraX+W/(2*scale),bottom:cameraY-H/(2*scale),top:cameraY+H/(2*scale)};
  ctx.translate(W/2,H/2);ctx.scale(scale,-scale);ctx.translate(-cameraX,-cameraY);
  const sorted=foreground.filter(layer=>inCamera(layer,visible));
  const impactFloor=[];
  hammerImpacts.collect(ctx,render,paused?0:dt,impactFloor,sorted);
  ventView.collect(ctx,field,sorted,frameTime,inRoomBattle()?net.last?.ventTimes:null,worldTimeGauge);
  if(sprinklerView){
    sprinklerView.sample(frameTime,!paused&&!muted&&!ended);
    const [layer,order,y]=field.sprinkler.spec.groupOrder;
    sorted.push({layer,order,y:field.sprinkler.y+y,draw:()=>{
      const color=colorVector(teamColor(Math.max(field.sprinkler.team,1)));
      for(const part of sprinklerView.parts)sprinklerView.floor(ctx,part,color);
    }});
  }
  const labels=[];

  const actors=(inRoomBattle()?net.last?.players:null)??[{id:'local',deathPose:field.deathPose,deathAge:3.5-field.respawn,speedBuff:field.speedBuff,dashFx:field.dashFx>0||field.zones.speedTime>0||field.speedBuff>0,charge:field.charge,charges:field.altWeapon.charges,weaponTimeLeft:field.altWeapon.timeLeft,shield:field.altWeapon.shield,shieldRatio:field.altWeapon.shield?field.altWeapon.shieldHp/field.w.ValueA:0,passing:field.altWeapon.passing,rolling:field.rolling,hp:field.hp,bush:field.zones.bush,protected:field.zones.protected,x:field.x,y:field.y,angle,weapon:equipped,team:field.team,pending:field.boostTimer>0,boost:field.boosting,onPaint:field.onPaint,submerged:field.submerged,armed:field.skills.armed,shakes:field.skills.shake,shakeRatio:field.skills.shakeRatio,shakeX:field.skills.shakeX,shakeY:field.skills.shakeY,bombStock:field.skills.stock,bombRefill:field.skills.refill,ink:field.ink,bomb:kit.bomb,ultimate:kit.ultimate,special:field.skills.active,emoji:performance.now()<emojiUntil?localEmoji:0,effects:field.skills.objects}];
  if(state==='lobby'&&net.room&&net.last?.phase==='waiting'){
    sendYardPose(field.x,field.y,angle,hasMoveInput(input.dx,input.dy));
    for(const p of net.last.players){
      const pose=net.yardPeers.get(p.id);
      if(p.id===net.room.sessionId||!pose||!p.connected)continue;
      actors.push({...p,...pose,bodyAim:pose.angle,moveInput:pose.moving,team:1,bush:-1,protected:false,
        shots:[],effects:[],special:false,boost:false,dashFx:false});
    }
    for(const msg of net.chat.splice(0))chat.message(msg.id,msg.text);
  }
  // Dispatch due animation audio before drawing the expensive laser impact frame.
  weaponAudio.updateLasers(ended||muted?[]:actors,field.skills.pendingShot?.id==='1002');
  weaponAudio.update(frameTime,actors);
  for(const actor of actors)for(const o of actor.effects||[])if(o.id==='1003'){
    sorted.push({layer:2,order:-3,y:o.y,draw:()=>missiles.warning(ctx,o,missileRadius)});
  }
  skillAudio.update(paused||muted||ended?[]:actors);
  for(const actor of actors)for(const o of actor.effects||[])if(bombRanges.has(o.id)&&(!o.flying||o.id==='1004')&&o.fuseTotal>0){
    const remaining=o.timeLeft??o.life;
    sorted.push({layer:2,order:-3,y:o.y,draw:()=>missiles.warning(ctx,o,bombRanges.get(o.id),1-remaining/o.fuseTotal)});
  }
  bushes.collect(actors,frameTime,visible,sorted,ctx);
  bushLeaves.collect(actors,bushes.cells,frameTime,sorted,ctx,!paused&&!ended);
  const viewer=actors.find(a=>a.id==='local'||a.id===net.room?.sessionId);
  for(const source of (ended?[]:[...actors]).sort((a,b)=>b.y-a.y)){
    const actor=dashParticles.sample(source,frameTime);
    if(!visibleInBush(actor,viewer))continue;
    const self=actor.id==='local'||actor.id===net.room?.sessionId;
    if(actor.deathPose){
      const clip=motions[actor.deathPose];
      const frame=deathView.sample(actor,frameTime,clip);
      if(self)hud.gauge.hidden=true;
      if(clip.frames[frame].length){
        const image=poseFrame(actor,actor.deathPose,frame,actor.team).value||poseFrame(actor,actor.deathPose,0,actor.team).value;
        sorted.push({layer:2,order:0,y:actor.y+entityDepth.body[1],draw:()=>{
          ctx.save();ctx.translate(actor.x+bindings.body[0],actor.y+bindings.body[1]);
          if(image)blit(ctx,image);
          deathView.drawHit(ctx,weaponView,actor.deathPose,frame/60,colorVector(teamColor(actor.team)));
          ctx.restore();
        }});
      }
      continue;
    }
    const localInput=self && !paused;
    const laserAim=actor.id==='local' && field.skills.pendingShot?.id==='1002'
      ? field.skills.pendingShot.angle : actor.laserLocked ? actor.laserAim : undefined;
    const now=performance.now();
    const aim=laserAim??actor.dashAim??(self&&!actor.special?angle:(actor.id==='local'?field.aim:actor.angle));
    const prev=poseClocks.get(actor.id);
    const facing=prev?.revived?{pose:'Front_Idle',action:'Idle',start:now,back:false,scaleX:1}:playerPose(prev,{
      aim:actor.dashAim??(self?angle:(actor.bodyAim??actor.angle)),distance:actor.dashAim!=null?1:self?distance:(actor.aimDistance??1),
      moveX:localInput?dx:Number(actor.moveInput??actor.moving??false),moveY:localInput?dy:0,
      pending:actor.pending,boost:actor.boost,disableFollowAim:Number.isFinite(laserAim),
      skillX:Math.cos(laserAim),skillY:Math.sin(laserAim)
    },motions,now);
    poseClocks.set(actor.id,facing);
    const {pose,back}=facing,clip=motions[pose];
    const index=Math.floor((now-facing.start)/1000%clip.duration*clip.frames.length/clip.duration);
    weaponAudio.movement?.(actor,facing,clip.duration,now,paused||muted);
    const outfit=self?kit:actor;
    const poseArt=poseFrame(outfit,pose,index,actor.team).value||poseFrame(outfit,pose,0,actor.team).value;
    const ghost=actor.bush>=0;
    const ghostArt=ghost&&(poseFrame(outfit,pose,index,actor.team,true).value||poseFrame(outfit,pose,0,actor.team,true).value);
    const weaponFrame=weaponView.sample(actor,now/1000,aim);
    const queueAvatar=(order,y,draw,material=false)=>{
      sorted.push({layer:2,order,y:actor.y+y,draw:()=>{
        const place=(g,mask=false)=>{
          g.save();g.translate(actor.x,actor.y);
          if(material&&ghost&&!mask&&material!=='body')g.globalAlpha=.3;
          if(actor.protected&&!ghost&&!mask)g.filter='brightness(1.8) saturate(.45)';
          draw(g,mask);g.restore();
        };
        if(material&&ghost){
          bushHologram.blend(place,actor.x,actor.y,material==='body'?4:weaponSpriteRadius(weaponFrame,bindings.gun));
          bushHologram.stencil(g=>place(g,true));
        }else place(ctx);
      }});
    };
    weaponAim.collect(actor,aim,bindings.gun,sorted,ctx);
    dashParticles.collect(actor,entityDepth.dash,now/1000,sorted,render,ctx);
    for(const front of [false,true]){
      const depth=weaponDepth(weaponFrame,aim,back,front,entityDepth.weapon);
      if(depth)queueAvatar(depth.order,bindings.gun[1]+depth.y,(g,mask)=>{
        g.translate(...bindings.gun);
        weaponView.draw(g,weaponFrame,actor,aim,front,back,colorVector(teamColor(actor.team)),mask);
      },'weapon');
    }
    if(actor.targeted)queueAvatar(10,0,()=>missiles.target(ctx,actor.id,now/1000));else missiles.targetClocks.delete(actor.id);
    if(self&&actor.armed&&pointerAt&&field.ink>=field.skills.b.PaintSkillCost)queueAvatar(-2,0,()=>drawThrowAim(ctx,aim));
    const hitAngle=playerHit.angle(actor.id,now/1000);
    const hitArt=art=>playerHit.render(art,pose,index*clip.duration/clip.frames.length,hitAngle);
    queueAvatar(0,entityDepth.body[1],(g,mask)=>{
      g.translate(...bindings.body);g.scale(facing.scaleX,1);
      if(!mask&&ghost&&!ghostArt)g.globalAlpha=.3;
      blit(g,hitArt((!mask&&ghostArt)||poseArt)||(self?actorMap:baseActor));
    },'body');
    if(!actor.armed||actor.bomb!=='5')bombEntities.shaking.delete(actor.id);
    if(actor.armed)queueAvatar(1,bindings.pickup[1],()=>{
      ctx.translate(...bindings.pickup);
      bombEntities.held(ctx,actor.bomb,now/1000,colorVector(teamColor(actor.team)),actor);
    });
    labels.push(()=>{
    ctx.save();ctx.translate(actor.x,actor.y);
    const displayName=self?playerName():actor.name;
    playerLabels.draw(ctx,actor.id,displayName,tables.Team[actor.team-1].NameColor.split('|')[paletteIndex],actor.hp,field.player.Hp,paused?0:dt);
    if(actor.emoji)one(ctx,render.byName.get('Emoji_'+actor.emoji),0,2.8,1.3,1.3);
    if(self){
      hud.gauge.hidden=!!actor.special||!(field.ink<field.inkCapacity||actor.submerged||field.fever);
      if(!hud.gauge.hidden)hud.paintGauge(W/2+(actor.x-cameraX)*scale,H/2-(actor.y-cameraY)*scale,scale,field.ink,field.inkCapacity,actor.team,field.paintBuff>0,actor.submerged);
      else hud.rainbow.hidden=true;
}ctx.restore();
    });
  }
  buffView.collect(frameTime,ended?[]:actors.filter(a=>visibleInBush(a,viewer)),sorted,ctx,hud.host,impactFloor);
  const locks=field.skills.missileLocks;
  for(const target of field.targets)if(target.model)dummyFeedback.collect(target,fieldProps.get(target.model),sorted,ctx,locks);
  if(state==='lobby')lobbyZones.addOutlines(sorted,field);
  for(const actor of actors)for(const o of actor.effects||[]){
    const team=colorVector(teamColor(actor.team));
    if(o.id==='1004')sorted.push({layer:3,order:0,y:o.y,draw:()=>bombEntities.bazooka(ctx,o,bindings.bazooka,team)});
    if(o.id==='1003')sorted.push({layer:3,order:2,y:o.y,draw:()=>missiles.strike(ctx,o,missileRadius)});
    if(bombViews.has(o.id))sorted.push({layer:3,order:2,y:o.y,draw:()=>bombEntities.thrown(ctx,o,team)});
  }
  for(const station of [...field.stations,...(inRoomBattle()?net.last?.items||[]:field.drops.items)])if(!station.wait){
    const prefab='GI_'+station.id,group=entityDepth.items[prefab];
    sorted.push({layer:group.layer,order:group.order,y:station.y+group.y,draw:()=>{
      ctx.save();ctx.translate(station.x,station.y);
      for(const part of fieldProps.get(prefab))render.layer(ctx,part);
      ctx.restore();
    }});
  }
  for(const shot of [...field.shots,...(field.sprinkler?.shots||[])]){
    const prefab=tables.EntityAsset.find(e=>e.Id===shot.entity)?.PrefabName,view=projectiles[prefab];
    if(!view)continue;
    const pose=projectilePose(shot),color=colorVector(teamColor(shot.team||field.team));
    // The five bullet sprites have centered pivots and zero local position.
    for(const part of fieldProps.get(prefab)){
      sorted.push({layer:part.sortLayer,order:part.order,y:pose.y,draw:()=>{
        ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate((pose.angle||0)+view.rotationOffsetDegrees*Math.PI/180);
        render.layer(ctx,projectileLayer(shot,part,view,color));
        ctx.restore();
      }});
    }
  }
  if(impactFloor.length){
    const floor=world.floor.filter(layer=>inCamera(layer,visible)).concat(impactFloor).sort(compareDepth);
    for(const layer of floor){if(layer.draw)layer.draw();else render.layer(ctx,layer.part);}
  }else for(const layer of world.floor)if(inCamera(layer,visible))render.layer(ctx,layer.part);
  paintMarks();blit(ctx,{c:paintLayer,box:world.box});
  for(const layer of world.abovePaint)if(inCamera(layer,visible)){
    if(layer.part.teamTint)drawSpawnPaint(ctx,field,layer.part,inkPalette[layer.part.teamTint-1]);
    render.layer(ctx,layer.part);
  }
  if(specialAsset)drawUltimateRange(ctx,render,ultimateViews,specialId,ultimateStats.get(specialId),field.x,field.y,angle,
    localPlayer?localPlayer.laserLocked:field.skills.pendingShot?.id==='1002');
  sorted.sort(compareDepth);
  bushHologram.begin(ctx);
  for(const entry of sorted){
    if(entry.bush){bushHologram.vegetation(entry.draw);continue;}
    bushHologram.flush();
    if(entry.part?.groupPath?.endsWith('/MapObject_12/Line'))drawPadLine(ctx,render,entry.part,padMotion,frameTime-world.enteredAt);
    else if(entry.part)dummyFeedback.sceneLayer(ctx,entry.part,locks);else entry.draw();}
  bushHologram.flush();
  for(const draw of labels)draw();
  if(state==='lobby')chat.draw(actors,cameraX,cameraY,scale,W,H);
  for(const actor of actors)for(const o of actor.effects||[]){
    if(o.id==='1002'){
      drawSharkBeam(ctx,render,laserParticle,bindings.laser,o,colorVector(teamColor(actor.team)),parameters.W_1002.muzzlePos);
    }
  }
  for(const actor of actors)for(const o of actor.effects||[]){
    if(!o.flying&&bombViews.has(o.id))worldTimeGauge.draw(ctx,'bomb'+o.id,o.x,o.y,(o.timeLeft??o.life)/o.fuseTotal);
  }
  for(const station of field.stations)if(station.wait>0)worldTimeGauge.draw(ctx,'station',station.x,station.y,station.wait/station.respawn);
  missiles.drawFlights(ctx,performance.now()/1000);
  if(controlsBlocked)weaponAudio.stopGun(localPlayer?.id);
  weaponAudio.updateAlternates(ended||muted||paused?[]:actors,frameTime);
  weaponAudio.pruneMovement?.(ended||muted||paused?[]:actors.filter(a=>!a.deathPose&&visibleInBush(a,viewer)));
  const player=actors.find(p=>p.id==='local'||p.id===net.room?.sessionId);
  const gauge=inRoomBattle()?player?.gauge:field.skills.gauge;
  hud.skillState(gauge??0,player,dx,dy,ended);
  drawBursts(ctx,paused?0:dt);
  dummyFeedback.draw(ctx,paused?0:dt,Math.min(W/1920,H/1080)/scale);
  const ink=translated(locale,'W_'+equipped+'_Name')+' · '+Math.round(field.ink)+' / '+field.inkCapacity;
  if(ink!==lastHud){$('#ink').textContent=ink;lastHud=ink;}
  if(state==='lobby'){
    lobbyZones.draw(ctx,field,visible);
    if(!controlsBlocked&&!field.deathPose)lobbyZones.enter(field,enterZone);
  }

}
function openMenu(which){if(!field)return;if(which==='costume'||which==='catalog'||(which==='weapon'&&!net.room)){keys.clear();fire=false;touchFire=false;$('#menu').close();panels.open(which,kit);return;}tab=which;keys.clear();fire=false;touchFire=false;if(!$('#menu').open)$('#menu').showModal();showOptions();}
function showOptions(){const area=$('#options');area.replaceChildren();for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('selected',b.dataset.tab===tab);
  const add=(label,selected,action,img)=>{const b=document.createElement('button');b.classList.toggle('selected',selected);if(img){const im=new Image();im.src=img;b.append(im);}b.append(document.createTextNode(label));b.onclick=action;area.append(b);};
  if(tab==='room'){
    if(net.room){const info=document.createElement('p');info.textContent='房间码 '+net.room.roomId+' · '+(net.last?.players.length||1)+' / 6';area.append(info);
      if(net.last?.phase==='finished'&&net.last.host===net.room.sessionId)add('再来一局',false,()=>{net.room.send('again');$('#menu').close();});
      add('离开房间',false,()=>switchMap('1'));}
    else {const input=document.createElement('input');input.placeholder='五位房间码';input.setAttribute('aria-label','房间码');input.maxLength=5;area.append(input);
      const msg=document.createElement('p');msg.setAttribute('role','status');msg.textContent=net.notice;area.append(msg);
      async function enter(kind){if(net.pending)return;msg.textContent='连接中…';try{await enterRoom(kind,input.value);}catch(e){msg.textContent='连接失败：'+e.message;}}
      add('自动匹配 · 3v3',false,()=>enter('match'));add('创建房间',false,()=>enter('create'));add('加入房间',false,()=>enter('join'));
      add('排行榜',false,async()=>{try{const {persistent,players}=await json('/api/leaderboard');msg.textContent=persistent?(players.map((p,i)=>(i+1)+'. '+p.id.slice(0,8)+' · '+p.wins+' 胜 / '+p.games+' 局').join(' ｜ ')||'还没有已结算的对局'):'此服务未连接战绩库';}catch{msg.textContent='排行榜暂时不可用';}});}}
  if(tab==='map')for(const m of tables.GameMap)add(m.ModeType==='Lobby'?'大厅':m.Enum.trim()+' · 本地练习',m.Id===field.map.Id,()=>switchMap(m.Id));
  if(tab==='weapon'&&net.room){area.append(document.createTextNode('房间使用入场时选择的武器。'));}else if(tab==='weapon')for(const w of tables.Weapon.filter(row=>row.WeaponType==='Normal')){const s=tables.WeaponAsset.find(r=>r.Id===w.Id);add(translated(locale,s.Name,w.Enum),equipped===w.Id,()=>{equipped=w.Id;field.equip(equipped);localStorage.setItem('chill-weapon',equipped);sound('sfx_outgame_weapon_decide');showOptions();},render.byName.get(s.ColorIcon)?.file);}
  if(tab==='help'){const p=document.createElement('p');p.textContent='WASD 移动，鼠标瞄准，按住左键射击，使用滚筒时按住右键向前涂地。靠近大厅武器点或传送点时按 F。触屏可用左下摇杆移动，点场地瞄准射击。';area.append(p);}
  $('#music').textContent='音乐 '+(muted?'关':'开');}
async function enterRoom(kind,code){
  if(net.pending||net.room)return;
  const snap=await connect(kind,code,field.map.ModeType==='PaintBattle'?field.map.Id:'2',equipped,kit,()=>{if(state!=='loading')switchMap('1');});
  if(!snap)return;
  menus.close();$('#menu').close();
  if(snap.phase==='waiting'){if(state!=='lobby')await switchMap('1',true);}
  else await switchMap(snap.mapId,true);
}
function enterZone(id){
  if(id===2){uiSound.cue(35);paintLayer.width=paintLayer.width;field.paint.length=0;field.grid.fill(0);return;}
  if(id===1){if(!net.room){keys.clear();menus.match();}return;}
  if(id===15&&net.room)return;
  if(net.room&&[3,6].includes(id)){
    uiSound.cue(9);hud.notice(translated(locale,id===6?'TM_Matching_NoChangeCostume':'TM_Matching_NoChangeWeapon'));
    return;
  }
  keys.clear();fire=false;alt=false;touchFire=false;
  if(id===15)menus.gacha();
  else openMenu(id===6?'costume':'weapon');
}
async function boot(){
 const version=await json('data/views/product-version.json');mountVersionOverlay(version.bundleVersion);
 ultimateViews=await view('ultimate-views');
 entityDepth=await view('entity-depth');
 explosionPools=await view('explosion-particles');bindings=await view('battle-bindings');projectiles=await view('projectiles');
 previewRegistration=await view('preview-registration');
 originalViews=Object.assign({},...await Promise.all([view('original-level1'),view('original-level2')]));
 [assets,tables,locale,actorView,ui,equipment,parameters,combat,cameraSettings,motions]=await Promise.all([json('data/assets.json'),json('data/tables.json'),json('data/localization.json'),view('actor'),view('ui'),view('equipment'),view('weapon-parameters'),view('combat-evidence'),view('camera'),Promise.all(['preview','Front_Idle','Front_Walk','Back_Idle','Back_Walk','Front_Boost','Back_Boost','Front_Boost_ON','Back_Boost_ON',...deathClips].map(async name=>[name,await view('motion-'+name)] )).then(Object.fromEntries)]);
 setLoadingProgress(1/5);
 for(const row of tables.Weapon.filter(w=>w.WeaponType==='Special'))ultimateStats.set(row.Id,stats(row));
 laserParticle=await view('laser-particle');
 missileRadius=stats(tables.Entity.find(row=>row.Enum==='MultiMissileBullet')).AtkRange;
 if(!tables.Weapon.some(w=>w.WeaponType==='Normal'&&w.Id===equipped))equipped='1';
 if(!previewInventory)owned=await readOwned().catch(()=>new Set());
 kit={Head:'',Body:'',Skin:'30001',...saved,weapon:equipped};
 if(!previewInventory)Object.assign(kit,equippedCostumes(kit,owned,tables.ItemAsset));
 Object.assign(kit,skillLoadout(tables,tables.Weapon.find(w=>w.Id===equipped),kit,true));
 const query=new URLSearchParams(location.search);
 if(['park','yard'].includes(query.get('view'))){
   if(query.get('look')==='base')kit={...kit,Head:'',Body:'',Skin:'30001'};
   const trial=tables.Weapon.find(w=>w.WeaponType==='Normal'&&w.Id===query.get('weapon'));
   if(trial){
     const selection=skillLoadout(tables,trial,{bomb:query.get('bomb'),ultimate:query.get('ultimate')});
     if(selection.bomb&&selection.ultimate){equipped=trial.Id;kit={...kit,...selection,weapon:equipped};}
   }
 }
 render=new Renderer(assets);
 for(const a of assets)if(a.type==='AudioClip'&&a.file)sounds.set(a.name,a);
 bushLeaves=new BushLeaves(await view('bush-leaves'),render,playMapSound);
 await bushLeaves.prepare();
 bushes=new Bushes(await view('bushes'),render);
 await render.prepare({draw:[...bushes.parts.values()]});
 ui.paintGaugeGradient=await view('paint-gauge');
 const gaugeLayout=await view('time-gauges');
 padMotion=await view('map-pad-motion');
 worldTimeGauge=new WorldTimeGauge(gaugeLayout,render);
 bombRanges.set('1004',stats(tables.Entity.find(e=>e.Id==='1002')).AtkRange);
 bombEntities=new BombEntities(await view('bomb-entities'),render,(id,phase,age)=>equipmentFrame('Bomb_'+id+'_'+phase,age,bombViews.get(id)||[]));
 await render.prepare({draw:Object.values(gaugeLayout).flatMap(g=>[g.empty,g.fill])});
 for(const skill of tables.Skill.filter(s=>['1','4','5'].includes(s.Id))){
   const entityId=skill.Values.split('|')[skill.Types.split('|').indexOf('ValueA')];
   bombRanges.set(skill.Id,stats(tables.Entity.find(e=>e.Id===entityId)).AtkRange);
 }
 const missileSpec=await view('missiles');
 missiles=new MissileView(missileSpec,ultimateViews.circle,
   render,age=>equipmentFrame('Bomb_4_Idle',age,bombViews.get('4')));
 await render.prepare({draw:[{id:missileSpec.inner},missileSpec.marker]});
 const buffData=await view('buff-effects');
 const speedItem=stats(tables.GameItem.find(i=>i.Id==='3'));
 buffView=new BuffView(buffData,render,speedItem.ValueB);await render.prepare({draw:Object.values(buffData).flat()});
 const ventMotion=await view('vent-motion');
 ventView=new VentView(ventMotion,render,playMapSound);
 const ventIds=new Set(Object.values(ventMotion).flatMap(c=>c.frames?c.frames.map(f=>f[0]):[c.id]));
 await render.prepare({draw:[...ventIds].map(id=>({id}))});
 dummyFeedback=new DummyFeedback(await view('dummy-feedback'),render,tables);
 playerHit=new PlayerHit(await view('player-hit'),dummyFeedback);
 playerLabels=new PlayerLabels(await view('player-labels'),render);await playerLabels.load();
 await render.prepare({draw:dummyFeedback.data.layers});await render.load(render.byId.get(entityDepth.dash.id));
 await render.prepare({draw:[{id:ultimateViews.circle.texture},...Object.values(ultimateViews.ready).flat()]});
 for(const name of ['Dummy_2','Dummy_3',...tables.GameItem.map(i=>i.PrefabName),...new Set(tables.EntityAsset.filter(e=>+e.Id>=10001).map(e=>e.PrefabName))]){
   const layers=equipment[name].filter(p=>p.enabled).map(p=>{const layer=spriteLayer(render,p);if(layer)layer.sortLayer=p.layer;return layer;}).filter(Boolean).sort((a,b)=>a.order-b.order);
   fieldProps.set(name,layers);await render.prepare({draw:layers});
 }
 setLoadingProgress(2/5);
 await render.prepare({draw:[...Object.values(explosionPools).flat(),...bindings.smash,bindings.laser,bindings.bazooka,{id:bindings.throwLine.circle}]});
 await Promise.all([render.prepare(actorView),...[...tables.PaintAsset.map(row=>row.SplatTexture),...tables.Weapon.filter(w=>w.WeaponType==='Normal').map(w=>'Weapon_'+w.Id)].map(k=>render.load(render.byName.get(k)))]);
 setLoadingProgress(3/5);
 await document.fonts.load('36px ChillGothic');
 weaponAim=new WeaponAim(render,equipment,tables,parameters);
 await render.prepare({draw:[weaponAim.inner]});
 weaponView=new WeaponView(render);
 weaponView.onMissile=(actor,side,at,aim)=>{const emitter=missiles.launch(actor,bindings.gun,side,aim,at);skillAudio.owner(95,emitter,actor.id);};
 const weaponMotion=await view('weapon-motion');
 weaponAudio.setAttackClips(weaponMotion);
 await Promise.all([weaponView.load(equipment,weaponMotion,laserParticle.charge,await view('muzzle-particles')),deathView.load(render,await view('death-particles'))]);
 for(const skill of tables.Skill.filter(s=>s.SkillType==='Bomb')){
   const parts=bombLayers(render,equipment,skill.Id);bombViews.set(skill.Id,parts);await render.prepare({draw:parts});
 }
 for(const id of bombViews.keys()){
   await Promise.all((id==='5'?['Idle','Throw','Set','Explosion']:['Idle','Throw','Set']).map(async phase=>{
     const name='Bomb_'+id+'_'+phase;
     battleClips.set(name,await equipmentClip(render,equipment['Bomb_'+id],await view('motion-'+name)));
   }));
 }
 await Promise.all([...tables.SkillAsset,...tables.EmojiAsset].map(s=>render.load(render.byName.get(s.Icon))));
 baseActor=await character(render,equipment,tables,{},motions.Front_Idle.frames[0],'Front_Idle');actorMap=await character(render,equipment,tables,kit,motions.Front_Idle.frames[0],'Front_Idle');
 ui.ProfileView=originalViews.ProfileView;
 [ui.dailyResultMotion,ui.resultGaugePoses]=await Promise.all([view('daily-result-motion'),view('result-gauge-poses')]);
 setLoadingProgress(4/5);
 results=new Results($('#battle-ui'),ui,render,tables,locale,()=>switchMap('1'),sound);
 ui.EmojiElement=await view('emoji-element');
 hud=new BattleUI(render,ui,tables,locale,originalViews.ControlDisplayView,ultimateViews,()=>sound(tables.Sound.find(row=>row.Enum==='Ready_Ultimate').SoundName));
 chat=new YardChat(await view('chat'),render,locale,message=>{
   chat.message('local',message);sound('sfx_outgame_popup_chat');
   if(net.room?.connection.isOpen&&net.last?.phase==='waiting')net.room.send('chat',message);
 });
 uiSound=new UiSound(await view('ui-audio'),tables.Sound,sound);
 menus=new SceneMenus(render,locale,originalViews,{tables,uiSound,
   languageChanged(){if(field)hud.show(kit,state==='field');},
   sound,acquired:id=>owned.add(id),start:()=>switchMap('1'),enter:enterRoom,leave:async()=>{await disconnect();menus.waiting(null);if(state!=='lobby')await switchMap('1');},volume,
   setVolume(key,v){volume[key]=Math.min(100,Math.max(0,v));localStorage.setItem('chill-volume',JSON.stringify(volume));roundAudio.level();for(const [audio,scale] of activeEffects)audio.volume=gain('sfx')*scale;},
   quit:async()=>{chat.reset();await disconnect();field=null;weaponAudio.clear();mapAudio.clear();roundAudio.leave();location.assign(location.pathname);}
 });
 lobbyZones=new LobbyZones(await view('lobby-zones'),render,locale,uiSound);await lobbyZones.load();
 panels=new EquipmentPanel({uiSound,owned,previewInventory,renderer:render,equipment,motions,previewRegistration,tables,locale,layout:ui,onConfirm:selection=>{
   const rev=++actorBuild;poses.clear();kit=selection;preparePoses(kit);if(net.room)net.room.send('outfit',{Head:kit.Head,Body:kit.Body,Skin:kit.Skin});const changed=equipped!==kit.weapon;equipped=kit.weapon;
   if(changed)field.equip(equipped,kit);else field.skills.equip(kit);localStorage.setItem('chill-weapon',equipped);localStorage.setItem(kitKey,JSON.stringify(kit));
   character(render,equipment,tables,kit,motions.Front_Idle.frames[0],'Front_Idle').then(value=>{if(actorBuild===rev)actorMap=value;});
   hud.show(kit,state==='field');
 }});
 game=new Phaser.Game({type:Phaser.CANVAS,parent:'stage',width:W,height:H,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},audio:{noAudio:true},banner:false,scene:{create(){texture=this.textures.createCanvas('scene-surface',W,H);ctx=texture.getContext();surface=this.add.image(0,0,'scene-surface').setOrigin(0);setLoadingProgress(1);
      const preview=launchView && launchView!=='settings'?launchView:'yard';
      if(!['park','match','weapon','costume','catalog'].includes(preview)){switchMap('1');return;}
      if(preview==='match')switchMap('1').then(ready=>{if(ready)menus.match();});
      if(['weapon','costume','catalog','park'].includes(preview)){const id=preview==='park'&&tables.GameMap.some(m=>m.ModeType==='PaintBattle'&&m.Id===query.get('map'))?query.get('map'):'2';
        switchMap(preview==='park'?id:'1').then(ready=>{
          if(!ready)return;
          if(preview!=='park')openMenu(preview);
          else if(query.get('team')==='2'){
            field.team=2;const spawn=field.view.spawns.find(p=>p[2]===2);if(spawn)[field.x,field.y]=spawn;
          }
        });}
    },update(_,ms){tick(ms/1000,this.game.loop.rawDelta/1000);}}});
 $('#controls').onclick=()=>openMenu('map');for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>openMenu(b.dataset.tab);
 $('#music').onclick=()=>{muted=!muted;localStorage.setItem('chill-mute',muted?'1':'0');if(muted){roundAudio.mute();weaponAudio.clear();}else roundAudio.resume();showOptions();};
}
addEventListener('keydown',e=>{if($('#menu').open||$('#equipment').open||menus?.dialog.open||chat?.active)return;
  if(state==='lobby'&&(e.code==='Enter'||e.code==='NumpadEnter')){
    e.preventDefault();if(!e.repeat){keys.clear();queuedActions.length=0;fire=false;alt=false;touchFire=false;stick=[0,0];closeEmoji(false);chat.open();}return;
  }
  if(e.code==='Escape'&&field){e.preventDefault();if(inspection)openMenu('map');else menus.settings();return;}if(field&&['Space','KeyE','KeyQ','KeyR'].includes(e.code)){
  e.preventDefault();if(e.repeat)return;
  if(e.code==='KeyE')perform('bomb');if(e.code==='KeyQ')perform('ultimate');if(e.code==='KeyR')showEmoji();
}keys.add(e.code);});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyR')closeEmoji(true);});addEventListener('blur',()=>{stopRides();closeEmoji(false);queuedActions.length=0;keys.clear();fire=false;alt=false;touchFire=false;stick=[0,0];});
function updateAim(){
  const b=game.canvas.getBoundingClientRect(),scale=H/(2*fieldCamera.size.value);
  const dx=((pointerAt.x-b.left)/b.width-.5)*W/scale+fieldCamera.x.value;
  const dy=(.5-(pointerAt.y-b.top)/b.height)*H/scale+fieldCamera.y.value+fieldCamera.shakeY;
  angle=Math.atan2(dy,dx);distance=Math.hypot(dx,dy);
}
function showEmoji(){
  if(emojiMenu)return;
  const box=game.canvas.getBoundingClientRect();
  emojiOrigin=pointerAt?{...pointerAt}:{x:box.left+box.width/2,y:box.top+box.height/2};
  emojiPick=0;emojiMenu=hud.emojiWheel(emojiOrigin,box);
  let x=emojiOrigin.x,y=emojiOrigin.y;
  function hover(){
    emojiPick=emojiMenu.pick(x,y);
    hud.highlightEmoji(emojiMenu,emojiPick);
  }
  emojiMenu.pointer=e=>{
    if(document.pointerLockElement)return;
    x=e.clientX;y=e.clientY;hover();
  };
  emojiMenu.relative=e=>{
    if(!document.pointerLockElement)return;
    x+=e.movementX;y+=e.movementY;hover();
  };
  addEventListener('pointermove',emojiMenu.pointer,true);
  addEventListener('mousemove',emojiMenu.relative,true);
}
function closeEmoji(send){
  if(!emojiMenu)return;
  removeEventListener('pointermove',emojiMenu.pointer,true);
  removeEventListener('mousemove',emojiMenu.relative,true);
  emojiMenu.remove();emojiMenu=null;
  if(send&&emojiPick)perform(emojiPick);
}
function aim(e){if(!fieldCamera)return;pointerAt={x:e.clientX,y:e.clientY};if(state==='field'||state==='lobby')hud.aim(e.clientX,e.clientY);updateAim();}
function pressWeaponButton(e){
  if(!field||chat.active)return;
  aim(e);
  if(e.button===2&&!alt){alt=true;perform('alt-press');}
  if(e.button===0&&!fire){fire=true;perform('press');}
}
function releaseWeaponButton(e){
  if(e.button===2)alt=false;
  if(e.button===0&&(fire||touchFire)){perform('release');fire=false;touchFire=false;}
}
const stage=$('#stage');
stage.oncontextmenu=e=>e.preventDefault();stage.onpointermove=aim;stage.onpointerdown=pressWeaponButton;
addEventListener('pointerup',releaseWeaponButton);
// After the first mouse button goes down, presses and releases of other
// buttons arrive as pointermove with the changed button and current mask.
addEventListener('pointermove',e=>{
  if(e.pointerType!=='mouse'||(e.button!==0&&e.button!==2))return;
  const mask=e.button===0?1:2;
  if(!(e.buttons&mask))releaseWeaponButton(e);
  else if(stage.contains(e.target))pressWeaponButton(e);
});
addEventListener('pointercancel',()=>{fire=false;alt=false;touchFire=false;stick=[0,0];});
$('#stick').onpointerdown=e=>{$('#stick').setPointerCapture(e.pointerId);const move=e=>{const b=$('#stick').getBoundingClientRect();stick=[(e.clientX-b.left-b.width/2)/(b.width/2),-(e.clientY-b.top-b.height/2)/(b.height/2)];};move(e);$('#stick').onpointermove=move;};$('#stick').onlostpointercapture=()=>{stick=[0,0];$('#stick').onpointermove=null;};$('#fire').onpointerdown=e=>{e.target.setPointerCapture(e.pointerId);touchFire=true;};
boot().catch(e=>{showLoadingFailure('加载失败：'+e.message);console.error(e);});

addEventListener('resize',()=>{if(game&&surface){
  [W,H]=viewport();
  game.scale.getParentBounds();
  game.scale.setGameSize(W,H);
  texture.setSize(W,H);surface.setSizeToFrame();
  if(field&&hud){closeEmoji(false);hud.show(kit,state==='field');results?.resize();}
  if(net.room)menus.waitState='';
}if(chat&&game?.canvas)chat.resize();hud?.resize();menus?.resize(true);if(panels?.dialog.open)panels.resize();});
