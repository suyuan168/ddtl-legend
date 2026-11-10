import {quantumRandom,roomSeedFromUtc} from '../game/quantum-random.js';
import {chatText} from '../game/chat-text.js';
import {ownedCostumes} from './gacha.mjs';
import {equippedCostumes} from '../game/owned-costumes.js';
import {applyRoomHit} from './room-damage.mjs';
import {deployedWeapons} from '../game/damageable-entities.js';
import {Board} from './state.mjs';
import {redis,identity,settle,persistent} from './services.mjs';
import {randomUUID} from 'node:crypto';
import {botLoadout} from './bot-roster.mjs';
import {randomFor,updateBotInput} from './bot-player.mjs';
import {DeathInk} from './death-ink.mjs';
import {Room} from '@colyseus/core';
import {readFileSync} from 'node:fs';
import {FriendRoomCodeLease} from './friend-room-codes.mjs';
import {LocalField} from '../game/simulation.js';
import {CombatClock,FRAME_SECONDS,SIMULATION_DELTA} from '../game/combat-clock.js';
const readJSON=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const data=readJSON('../data/tables.json'),mode=data.GameMode.find(r=>r.Enum==='PaintBattle');
const parameters=readJSON('../data/views/weapon-parameters.json'),combat=readJSON('../data/views/combat-evidence.json');
const maps=new Map(data.GameMap.filter(m=>m.ModeType==='PaintBattle').map(m=>[m.Id,[m,readJSON('../data/views/'+m.MapData+'.json')]]));
const allowedWeapons=new Set(data.Weapon.filter(w=>w.WeaponType==='Normal').map(w=>w.Id));
const PAINT_BATCH=64;
const blank=()=>({dx:0,dy:0,angle:0,fire:false});
export class PaintRoom extends Room{
  async onCreate(opts={}){
    this.maxClients=+mode.MaxPlayerCount;this.maxMessagesPerSecond=120;
    this.setState(new Board());this.state.persistentRewards=persistent;this.setPatchRate(100);
    if(this.roomName==='chillcat'){this.lease=new FriendRoomCodeLease({redis});this.roomId=await this.lease.acquire();await this.setPrivate(true);this.clock.setInterval(()=>this.lease.renew().catch(console.error),40000);}
    this.mapId=maps.has(opts.mapId)?opts.mapId:'2';this.members=new Map();this.phase='waiting';this.wait=+mode.PlayerJoinWaitTime;this.time=+mode.GameEndTime;this.seq=0;this.host=null;
    this.onMessage('outfit',(c,m)=>{const p=this.members.get(c.sessionId);if(p&&this.phase==='waiting')p.outfit=equippedCostumes(m,p.owned,data.ItemAsset);});
    this.onMessage('sync',c=>this.sendBoard(c));
    this.onMessage('yardPose',(client,pose)=>{
      const p=this.members.get(client.sessionId);
      if(this.phase!=='waiting'||!p||!pose||![pose.x,pose.y,pose.angle].every(Number.isFinite)||
          Math.abs(pose.x)>72||Math.abs(pose.y)>66)return;
      p.yardPose={x:pose.x,y:pose.y,angle:pose.angle,moving:pose.moving===true};
      this.broadcast('yardPose',{id:p.id,...p.yardPose},{except:client});
    });
    this.onMessage('chat',(client,message)=>{
      const p=this.members.get(client.sessionId),text=chatText(message);
      if(this.phase==='waiting'&&p&&text)this.broadcast('chat',{id:p.id,text,pose:p.yardPose},{except:client});
    });
    this.onMessage('input',(c,m)=>{const p=this.members.get(c.sessionId);if(!p||p.death||this.phase!=='playing'||!m||![m.dx,m.dy,m.angle].every(Number.isFinite))return;
      p.input={dx:Math.max(-1,Math.min(1,m.dx)),dy:Math.max(-1,Math.min(1,m.dy)),angle:m.angle%(2*Math.PI),distance:Number.isFinite(m.distance)?Math.max(0,Math.min(100,m.distance)):1,boost:m.boost===true,alt:m.alt===true,fire:m.fire===true};p.inputAt=Date.now();});
    this.onMessage('action',(c,m)=>{
      const p=this.members.get(c.sessionId);
      if(!p||p.death||this.phase!=='playing')return;
      const action=m?.action;if(Number.isInteger(action)&&action>=1&&action<=8){p.emoji=action;p.emojiTime=2;return;}
      if(['bomb','ultimate','press','release','alt-press'].includes(action)&&p.actions.length<12&&Number.isFinite(m.angle)&&Number.isFinite(m.distance)){
        p.actions.push({action,angle:m.angle%(2*Math.PI),distance:Math.max(0,Math.min(100,m.distance))});
        // Button edges can arrive before the next periodic held-input update.
        if(p.weapon==='1'&&(action==='press'||action==='release')){
          p.input.fire=action==='press';p.inputAt=Date.now();
        }
      }
    });
    this.onMessage('again',c=>{if(c.sessionId!==this.host||this.phase!=='finished')return;this.phase='waiting';this.time=+mode.GameEndTime;this.wait=+mode.PlayerJoinWaitTime;this.resetBoard();this.unlock();this.broadcast('reset',{matchId:this.matchId});this.sendState();});
    this.combatClock=new CombatClock();
    this.resetBoard();
    this.setSimulationInterval(ms=>this.combatClock.advance(ms/1000,dt=>this.advance(dt)),1000*FRAME_SECONDS);
  }
  resetBoard(){
    for(const [id,p] of this.members)if(p.bot)this.members.delete(id);
    this.matchSeed=roomSeedFromUtc();
    this.matchRandom=quantumRandom(this.matchSeed);
    this.deathInk=new DeathInk(randomFor(this));
    this.cycleWait=0;this.roundClock=0;this.spawnPools=new Map();
    this.matchId=randomUUID();this.roster=[];this.finalPlayers=null;const [map,view]=maps.get(this.mapId);this.rules=new LocalField(data,map,view,parameters,combat,this.matchRandom);this.grid=new Uint8Array(this.rules.grid.length);this.scores=[0,0];this.paintHistory=[];this.pending=[];this.toPublish=0;
    for(const p of this.members.values()){p.paintPoints=p.kills=p.deaths=0;p.reward=p.dailyRewardId=p.dailyCoins=p.balance=0;this.spawn(p);}}
  spawn(p){p.death=null;const [map,v]=maps.get(this.mapId);p.game=new LocalField(data,map,v,parameters,combat,this.matchRandom);p.game.equip(p.weapon,p.kit);p.paintPoints??=0;p.kills??=0;p.deaths??=0;p.game.team=p.team;
    p.game.onShieldBlock=e=>this.broadcast('skillEvents',[{...e,owner:p.id}]);
    p.game.teamGrid=this.grid;p.game.sprinkler=this.rules.sprinkler;p.game.vents=this.rules.vents;if(this.phase==='playing'&&this.time<=Number(mode.FeverTime))p.game.startFever();p.actions=[];p.emoji=0;p.emojiTime=0;
    if(this.phase==='playing')this.placeAtTeamSpawn(p);
    p.moving=false;p.rollerCooldowns=new Map();p.hp=p.game.player.Hp;p.input=blank();p.inputAt=0;}
  placeAtTeamSpawn(p){
    // Both CreatePlayerEntity and Respawn draw from the map's same team pool.
    let pool=this.spawnPools.get(p.team);
    if(!pool?.length){
      pool=this.rules.view.spawns.filter(([x,y,team])=>team===p.team&&(x!==0||y!==0));
      this.spawnPools.set(p.team,pool);
    }
    if(pool.length){
      const [position]=pool.splice(this.matchRandom.nextInt(0,pool.length),1);
      [p.game.x,p.game.y]=position;
    }
    p.game.zones.step(0,p.game);p.game.zoneInitialized=true;
  }
  async onAuth(c,options){const account=await identity(options?.credential);return {account,owned:await ownedCostumes(account)};}
  onJoin(c,options){if(this.phase!=='waiting')throw Error('该对局已开始');if(c.auth?.account&&[...this.members.values()].some(p=>p.account===c.auth.account))throw Error('同一账号已经在房间中');const teamSize=t=>[...this.members.values()].filter(p=>p.team===t).length,team=teamSize(1)<=teamSize(2)?1:2;
    const p={id:c.sessionId,name:typeof options?.name==='string'&&options.name.trim()?options.name.trim().slice(0,24):'ChillCat',owned:c.auth?.owned??new Set(),outfit:equippedCostumes(options?.outfit,c.auth?.owned??new Set(),data.ItemAsset),kit:{bomb:options?.outfit?.bomb,ultimate:options?.outfit?.ultimate},connected:true,account:c.auth?.account,team,weapon:allowedWeapons.has(options?.weapon)?options.weapon:'1'};this.spawn(p);
    this.members.set(p.id,p);this.host??=p.id;this.sendState();}
  onDrop(c){const p=this.members.get(c.sessionId);if(!p)return;p.connected=false;p.actions=[];p.input=blank();this.allowReconnection(c,60);this.sendState();}
  onReconnect(c){const p=this.members.get(c.sessionId);if(!p)return;p.connected=true;p.input=blank();this.sendState();this.sendBoard(c);}
  onLeave(c){this.members.delete(c.sessionId);if(this.host===c.sessionId)this.host=[...this.members.values()].find(p=>!p.bot)?.id??null;
    if(this.phase==='playing'&&this.members.size&&new Set([...this.members.values()].map(p=>p.team)).size<2){this.finish('opponent-left');}
    if(this.phase==='waiting'&&this.members.size<+mode.MinPlayerCountToStart)this.wait=+mode.PlayerJoinWaitTime;this.sendState();}
  async onDispose(){await this.lease?.release();await this.saving;}
  finish(reason){if(this.phase==='finished')return;this.phase='finished';this.reason=reason;this.finalPlayers=this.roster.map(p=>({...p}));
    const players=this.finalPlayers;
    // GameManager.SelectMvp (0x453b4f0) samples ties as it visits the roster.
    let mvp,high=-Infinity,ties=0;
    for(const p of players){
      if(p.paintPoints>high){
        high=p.paintPoints;mvp=p;ties=1;
      }else if(p.paintPoints===high&&this.matchRandom.nextInt(0,++ties)===0){
        mvp=p;
      }
    }
    if(mvp)mvp.mvp=true;
    this.saving=settle(this.matchId,this.mapId,[...this.scores],players).then(rows=>{
      if(this.finalPlayers!==players)return;
      for(const p of players){const row=rows.find(r=>r.account_id===p.account);if(row){p.reward=row.coins;p.dailyRewardId=row.daily_reward_id||0;p.dailyCoins=row.daily_coins;p.balance=Number(row.balance_after);}}
      this.sendState();
    }).catch(e=>console.error('Chillcat settlement',e.message));}
  defeated(killer,victim){
    if(victim.death)return;
    const f=victim.game,aim=f.skills.pendingShot?.angle??victim.input.angle,angle=Math.atan2(Math.sin(aim),Math.cos(aim));
    // E_1.OnDied stores the normalized victim minus attacker direction.
    const back=angle>=Math.PI/4&&angle<=3*Math.PI/4;
    const origin=killer.mapActor?killer.game.sprinkler:killer.game;
    const side=f.x<origin.x?'Right':'Left';
    victim.death={at:this.roundClock,killer,credited:false,pose:(back?'Back_Dead_':'Front_Dead_')+side};
    this.deathInk.spawn(killer,victim);
    victim.hp=f.hp=0;f.respawn=3.5;victim.input=blank();victim.actions=[];victim.moving=false;
    f.skills.remaining=0;f.skills.pendingShot=null;f.skills.volley=null;f.skills.armed=false;f.skills.missileLocks=[];
    f.skills.objects.length=0;f.shots.length=0;f.charge=0;f.boosting=false;f.boostTimer=0;
    this.broadcast('skillEvents',[{type:'player-death',owner:victim.id,x:f.x,y:f.y}]);
  }
  advanceDeath(p){
    const death=p.death,age=this.roundClock-death.at;
    p.game.respawn=Math.max(0,3.5-age);
    // E_1.OnDied sets DeadWait=0x8000; Dead() then sets RespawnTime=0x30000.
    if(age>=.5&&!death.credited){
      const killer=death.killer;
      killer.kills++;p.deaths++;death.credited=true;
      this.broadcast('skillEvents',[{type:'kill-log',attacker:killer.name??'',attackerTeam:killer.team,victim:p.name,victimTeam:p.team}]);
    }
    if(age<3.5)return;
    this.spawn(p);
    this.broadcast('skillEvents',[{type:'player-respawn',owner:p.id}]);
  }
  recordMark(p,mark){
    let changed=0;
    p.game.eachPaintCell(mark,index=>{
      const old=this.grid[index];
      if(old===p.team)return;
      if(old)this.scores[old-1]--;
      changed++;this.grid[index]=p.team;
      this.scores[p.team-1]++;
    });
    if(!p.mapActor){p.paintPoints+=changed;p.game.skills.credit(changed);}
    const brush={...mark,team:p.team};this.paintHistory.push(brush);this.pending.push(brush);
  }
  updateSprinkler(dt){
    const machine=this.rules.sprinkler;if(!machine)return;
    const actors=[...this.members.values()];
    const source=team=>({team,game:this.rules,mapActor:true,kills:0,rollerCooldowns:new Map()});
    machine.update(dt,this.rules,team=>actors.filter(p=>p.team!==team&&!p.death).flatMap(p=>[p.game,...deployedWeapons(p.game)]),
      (shot,target)=>applyRoomHit(this,source(shot.team),{target,damage:shot.damage}),
      (shot,end)=>{
        if(end!=='target')this.broadcast('skillEvents',[{type:'bullet-end',entity:shot.entity,x:shot.x,y:shot.y,team:shot.team,end}]);
        this.rules.splat(shot.x,shot.y,shot.size,shot.team,undefined,false);
        for(const mark of this.rules.paint.splice(0))this.recordMark(source(shot.team),mark);
      });
  }
  startBattle(){
    this.lock();
    this.phase='playing';this.reason='';this.roster=[...this.members.values()];
    for(const p of this.roster)this.placeAtTeamSpawn(p);
  }
  advanceWaiting(dt){
    if(this.roomName==='chillcat_match'){
      if(!this.members.size)return;
      if(this.members.size===this.maxClients){this.startBattle();return;}
      // MatchService.FindReadyMatchRoomAsync starts cycle 1, allows five 10s windows,
      // then the coordinator fills only empty places in its settled reservation roster.
      this.cycleWait+=dt;
      if(this.cycleWait<5*10 || Object.keys(this._reservedSeats).length ||
          [...this.members.values()].some(p=>!p.connected))return;
      while(this.members.size<this.maxClients){
        const index=this.members.size;
        const first=[...this.members.values()].filter(p=>p.team===1).length;
        const team=first<=index-first?1:2;
        const bot={...botLoadout(data,index,this.matchSeed),id:'bot-'+index,team,
          bot:true,account:null,connected:true};
        this.spawn(bot);this.members.set(bot.id,bot);
      }
      this.startBattle();
    }else if(this.members.size>=+mode.MinPlayerCountToStart){
      this.wait=Math.max(0,this.wait-dt);
      if(this.wait===0||this.members.size===this.maxClients)this.startBattle();
    }
  }
  advance(dt){
    if(this.phase==='waiting')this.advanceWaiting(dt);
    if(this.phase==='playing'){this.roundClock+=dt;this.time=Math.max(0,this.time-dt);
      const deathLandings=[];
      this.deathInk.step(dt,shot=>{
        deathLandings.push({type:'death-ink-end',x:shot.x,y:shot.y,team:shot.team});
        this.rules.splat(shot.x,shot.y,1,shot.team,undefined,false);
        for(const mark of this.rules.paint.splice(0))this.recordMark(shot.owner,mark);
      });
      if(deathLandings.length)this.broadcast('skillEvents',deathLandings);
      this.rules.vents.advance(dt);
      for(const p of this.members.values()){if(p.death){this.advanceDeath(p);continue;}const f=p.game;if(this.time<=Number(mode.FeverTime))f.startFever();if(p.bot)updateBotInput(p,this,dt);else if(Date.now()-p.inputAt>400)p.input=blank();
        const oldX=f.x,oldY=f.y;const enemies=[...this.members.values()].filter(q=>q.team!==p.team&&!q.death);
        f.step(dt,{...p.input,actions:p.actions.splice(0),targets:enemies.map(q=>q.game),
          deployables:enemies.flatMap(q=>deployedWeapons(q.game)),onBulletHit:hit=>applyRoomHit(this,p,hit)});
        if(p.game===f)f.hp=p.hp;
        if(f.skills.events.length)this.broadcast('skillEvents',f.skills.events.map(e=>({...e,owner:p.id})));
        p.emojiTime-=dt;if(p.emojiTime<=0)p.emoji=0;
        for(const hit of f.skills.hits)applyRoomHit(this,p,hit);
        p.moving=p.game===f&&(f.x!==oldX||f.y!==oldY);
        for(const [id,left] of p.rollerCooldowns){if(left<=dt)p.rollerCooldowns.delete(id);else p.rollerCooldowns.set(id,left-dt);}
        for(const hit of f.rollHits)applyRoomHit(this,p,hit,combat.roller.perTargetCooldownRaw/65536);
        for(const mark of f.paint)this.recordMark(p,mark);f.paint.length=0;
      }
      this.updateSprinkler(dt);
      // AddSystemsUser places GameItemSystem after weapon, entity and skill updates.
      this.rules.drops.step(dt,this.rules);
      if(this.rules.drops.events.length)this.broadcast('skillEvents',this.rules.drops.events);
      for(const p of this.members.values()){
        if(p.death)continue;
        const f=p.game,before=f.skills.events.length;
        f.hp=p.hp;
        this.rules.drops.collect(f);
        p.hp=f.hp;
        if(f.skills.events.length>before)this.broadcast('skillEvents',f.skills.events.slice(before).map(e=>({...e,owner:p.id})));
      }
      if(this.time===0){this.finish('timer');}}
    this.toPublish+=dt;
    const snapshotPeriod=6*SIMULATION_DELTA;
    if(this.toPublish>=snapshotPeriod){this.toPublish%=snapshotPeriod;if(this.pending.length){this.sendPaint(this.paintHistory.length-this.pending.length,this.paintHistory.length);this.pending.length=0;}this.sendState();}}
  sendState(){this.state.updateFrom(this);}
  sendPaint(start,end,client){
    for(let i=start;i<end;i+=PAINT_BATCH){
      const batch={matchId:this.matchId,start:i,marks:this.paintHistory.slice(i,Math.min(i+PAINT_BATCH,end))};
      if(client)client.send('paint',batch);else this.broadcast('paint',batch);
    }
  }
  sendBoard(c){
    const end=this.paintHistory.length;
    c.send('board',{matchId:this.matchId,count:end});
    this.sendPaint(0,end,c);
  }
}
