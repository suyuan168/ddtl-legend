import {projectilePose} from '../game/damage.js';
import {hasMoveInput} from '../game/board-controls.js';
import {schema,t} from '@colyseus/schema';
const Projectile=schema({x:t.float32(),y:t.float32(),angle:t.float32(),speed:t.float32(),travelled:t.float32(),entity:t.string(),left:t.float32(),team:t.uint8()},'Projectile');
const Effect=schema({rebounded:t.boolean(),serial:t.uint32(),id:t.string(),x:t.float32(),y:t.float32(),z:t.float32(),angle:t.float32(),range:t.float32(),phaseTime:t.float32(),flying:t.boolean(),timeLeft:t.float32(),fuseTotal:t.float32(),locked:t.boolean()},'SkillEffect');
const Item=schema({id:t.string(),x:t.float32(),y:t.float32()},'MapItem');
const Player=schema({id:t.string(),name:t.string(),mvp:t.boolean(),paintPoints:t.uint32(),kills:t.uint16(),deaths:t.uint16(),reward:t.uint16(),dailyRewardId:t.uint16(),dailyCoins:t.uint16(),balance:t.float64(),weapon:t.string(),team:t.uint8(),Head:t.string(),Body:t.string(),Skin:t.string(),moving:t.boolean(),x:t.float32(),y:t.float32(),angle:t.float32(),bodyAim:t.float32(),aimDistance:t.float32(),moveInput:t.boolean(),laserLocked:t.boolean(),laserAim:t.float32(),charge:t.float32(),charges:t.uint8(),weaponTimeLeft:t.float32(),shield:t.boolean(),shieldRatio:t.float32(),dashFx:t.boolean(),passing:t.boolean(),rolling:t.boolean(),paintBuff:t.float32(),speedBuff:t.float32(),ink:t.float32(),hp:t.float32(),deathPose:t.string(),deathAge:t.float32(),connected:t.boolean(),shots:t.array(Projectile),bush:t.int16(),protected:t.boolean(),targeted:t.boolean(),pending:t.boolean(),boost:t.boolean(),onPaint:t.boolean(),submerged:t.boolean(),armed:t.boolean(),shakes:t.uint32(),shakeRatio:t.float32(),shakeX:t.float32(),shakeY:t.float32(),bombStock:t.uint8(),bombRefill:t.float32(),bomb:t.string(),ultimate:t.string(),special:t.boolean(),gauge:t.float32(),points:t.float32(),emoji:t.uint8(),effects:t.array(Effect)},'Player');
export const Board=schema({
  deathShots:t.array(Projectile),mapShots:t.array(Projectile),machineCharge:t.float32(),machineTeam:t.int8(),machineHits:t.uint32(),machineHitX:t.float32(),machineHitY:t.float32(),machineFires:t.uint32(),machineActive:t.boolean(),ventTimes:t.array('float32'),items:t.array(Item),persistentRewards:t.boolean(),host:t.string(),mapId:t.string(),phase:t.string(),time:t.uint16(),wait:t.uint8(),reason:t.string(),scores:t.array('uint32'),players:t.map(Player),
  updateFrom(room){
    this.host=room.host||'';this.mapId=room.mapId;this.phase=room.phase;this.time=Math.ceil(room.time);this.wait=Math.ceil(room.wait);this.reason=room.reason||'';
    for(let i=0;i<2;i++)this.scores[i]=room.scores[i];
    const vents=room.rules.vents?.entries||[];
    while(this.ventTimes.length>vents.length)this.ventTimes.pop();
    for(const [i,v] of vents.entries())this.ventTimes[i]=v.left;
    const machine=room.rules.sprinkler;
    this.machineCharge=(machine?.charge||0)/65536;this.machineTeam=machine?.team??-1;
    this.machineHitX=machine?.hitX??0;this.machineHitY=machine?.hitY??0;
    this.machineHits=machine?.hitSerial||0;this.machineFires=machine?.fireSerial||0;this.machineActive=!!machine?.active;
    for(const [dest,shots] of [[this.mapShots,machine?.shots||[]],[this.deathShots,room.deathInk.shots]]){
      while(dest.length>shots.length)dest.pop();
      shots.forEach((s,i)=>{
        if(!dest[i])dest.push(new Projectile());
        const pose=projectilePose(s);
        Object.assign(dest[i],{x:pose.x,y:pose.y,angle:pose.angle,speed:s.speed,travelled:s.travelled,entity:s.entity,left:s.left,team:s.team});
      });
    }
    const items=room.rules.drops.items;
    while(this.items.length>items.length)this.items.pop();
    items.forEach((item,i)=>{
      if(!this.items[i])this.items.push(new Item());
      Object.assign(this.items[i],{id:item.id,x:item.x,y:item.y});
    });
    const players=room.finalPlayers||[...room.members.values()];
    for(const id of this.players.keys())if(!players.some(p=>p.id===id))this.players.delete(id);
    const targeted=new Set(players.flatMap(p=>p.game.skills.missileLocks));
    for(const p of players){
      if(!this.players.has(p.id))this.players.set(p.id,new Player());
      const v=this.players.get(p.id),g=p.game;
      Object.assign(v,p.outfit,{dashFx:g.dashFx>0||g.zones.speedTime>0||g.speedBuff>0,bush:g.zones.bush,protected:g.zones.protected,pending:g.boostTimer>0,boost:g.boosting,onPaint:!!g.onPaint,submerged:g.submerged,armed:g.skills.armed,shakes:g.skills.shake||0,shakeRatio:g.skills.shakeRatio,shakeX:g.skills.shakeX||0,shakeY:g.skills.shakeY||0,bombStock:g.skills.stock,bombRefill:g.skills.refill,bomb:g.skills.bomb?.Id||'',ultimate:g.skills.ult?.Id||'',special:g.skills.active,gauge:g.skills.gauge,points:g.skills.points,emoji:p.emoji,moving:p.moving,mvp:!!p.mvp,paintPoints:p.paintPoints,kills:p.kills,deaths:p.deaths,reward:p.reward||0,dailyRewardId:p.dailyRewardId||0,dailyCoins:p.dailyCoins||0,balance:p.balance||0,name:p.name,id:p.id,weapon:p.weapon,team:p.team,x:g.x,y:g.y,angle:g.aim,charge:g.charge,charges:g.altWeapon.charges,weaponTimeLeft:g.altWeapon.timeLeft,shield:g.altWeapon.shield,shieldRatio:g.altWeapon.shield?g.altWeapon.shieldHp/g.w.ValueA:0,passing:g.altWeapon.passing,rolling:g.rolling,ink:g.ink,paintBuff:g.paintBuff,speedBuff:g.speedBuff,hp:p.hp,connected:p.connected});
      v.deathPose=p.death?.pose||'';v.deathAge=p.death?room.roundClock-p.death.at:0;
      v.targeted=!p.death&&targeted.has(g);
      const input=p.input;
      v.bodyAim=input.angle;
      v.aimDistance=input.distance??1;
      v.moveInput=hasMoveInput(input.dx,input.dy);
      v.laserLocked=g.skills.pendingShot?.id==='1002';
      v.laserAim=v.laserLocked?g.skills.pendingShot.angle:0;
      const effects=g.skills.objects;
      while(v.effects.length>effects.length)v.effects.pop();
      effects.forEach((o,i)=>{if(!v.effects[i])v.effects.push(new Effect());Object.assign(v.effects[i],{rebounded:!!o.rebounded,serial:o.serial||0,id:o.id,x:o.x,y:o.y,z:o.z||0,angle:o.id==='4'&&o.target?Math.atan2(o.target.y-o.y,o.target.x-o.x):o.angle,range:o.range||0,phaseTime:o.phaseTime||0,flying:!!o.flying,timeLeft:o.life,fuseTotal:o.fuseTotal||0,locked:!!o.locked});});
      while(v.shots.length>g.shots.length)v.shots.pop();
      for(let i=0;i<g.shots.length;i++){if(!v.shots[i])v.shots.push(new Projectile());const shot=g.shots[i],pose=projectilePose(shot);Object.assign(v.shots[i],{x:pose.x,y:pose.y,angle:pose.angle,speed:shot.speed,travelled:shot.travelled,entity:shot.entity,left:shot.left});}
    }
  }
},'Board');
