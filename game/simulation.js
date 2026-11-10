import {quantumRandom,roomSeedFromUtc} from './quantum-random.js';
import {GiantSprinkler} from './giant-sprinkler.js';
import {MapVents} from './vents.js';
import {wallContact} from './wall-contact.js';
export {muzzlePosition} from './damage.js';
import {advanceInkProjectile,damageAt,muzzlePosition} from './damage.js';
import {deployedWeapons,damageDeployable} from './damageable-entities.js';
import {MapDrops,MapZones} from './drops.js';
import {WeaponAlt} from './weapon-alt.js';
import {hasMoveInput,updateBoard} from './board-controls.js';
import {releaseFan,releaseSingle,spreadAngle,spreadRange,projectileArc} from './roller-fan.js';
import {Skills} from './skills.js';
const Q=65536;
const fp=n=>Math.trunc(n*Q);
const fpMul=(a,b)=>Math.floor((a*b+Q/2)/Q);
export function sampleCurve(values,ratio){
  const at=Math.max(0,Math.min(1,ratio))*(values.length-1),lo=Math.floor(at),hi=Math.min(lo+1,values.length-1);
  return values[lo]+(values[hi]-values[lo])*(at-lo);
}
// W_3.GetMaxAffordableChargeRatio searches 16 fixed-point bits; the shipped
// paintCostCurve is flat, so the endpoint checks resolve every current loadout.
export function affordableCharge(ink,cost,values){
  if(cost<=0)return 1;
  const available=fp(ink),rawCost=fp(cost);
  const fits=ratio=>fpMul(fp(sampleCurve(values,ratio/Q)),rawCost)<=available;
  if(!fits(0))return 0;
  if(fits(Q))return 1;
  let low=0,high=Q;
  for(let bit=0;bit<16;bit++){
    const mid=Math.floor((low+high+1)/2);
    if(fits(mid))low=mid;else high=mid;
  }
  return low/Q;
}
export function stats(row){const values=(row.StatValues??row.Values).split('|');return Object.fromEntries(row.Types.split('|').map((k,i)=>[k,fp(Number(values[i])||0)/Q]));}
export class LocalField {
  constructor(tables,map,view,parameters={},combat={},rng=quantumRandom(map.ModeType==='Lobby'?0:roomSeedFromUtc())){
    this.rng=rng;
    this.paintPoints=0;this.combat=combat;this.rollHits=[];this.bulletHits=[];
    this.parameters=parameters;
    this.tables=tables;this.map=map;this.view=view;this.player=stats(tables.Entity.find(e=>e.Enum==='Player'));
    this.width=+map.Width;this.height=+map.Height;this.cell=+map.CellSize;this.columns=Math.ceil(this.width/this.cell);
    this.rows=Math.ceil(this.height/this.cell);this.grid=new Uint8Array(this.columns*this.rows);
    const [cx,cy]=view.paintCenter||[0,0];this.left=cx-this.width/2;this.bottom=cy-this.height/2;
    this.targets=(view.trainingTargets||[]).map(target=>{
      const zone=target.zone&&stats(tables.Zone.find(row=>row.Id===target.zone));
      return {...target,zoneStats:zone,originX:target.x,originY:target.y,hp:zone?.Hp,hits:0,hitAge:Infinity,hitSign:1,phase:0,respawn:0,nextShot:0,rollerWait:0};
    });
    this.paintMask = buildPaintMask(this, view.paintShapes);
    this.sprinkler=view.giantSprinkler?new GiantSprinkler(this,stats):null;this.sprinklerRollWait=0;
    const spawn=view.lobbySpawn??view.spawns.find(s=>s[2]===1)??[0,0];this.x=spawn[0];this.y=spawn[1];
    this.respawn=0;this.deathPose=null;this.hitSlowTime=0;
    this.dashFx=0;this.hp=this.player.Hp;this.paintBuff=0;this.speedBuff=0;this.speedBonus=0;
    this.itemTypes=new Map(tables.GameItem.map(item=>[item.Id,{values:stats(item),radius:view.itemRadii[item.Id]}]));
    this.vents=new MapVents(view,tables);this.ventContacts=new Set();
    this.drops=new MapDrops(this);this.zones=new MapZones(this);
    this.stations=(view.itemStations||[]).map(station=>({...station,wait:station.delay,
      values:stats(tables.GameItem.find(item=>item.Id===station.id))}));
    this.team=1;this.boostTimer=0;this.boosting=false;this.submerged=false;this.skills=new Skills(this,stats);
    this.shots=[];this.paint=[];this.rollTimer=0;this.rolling=false;this.cooldown=0;this.aim=0;this.equip('1');
  }
  equip(id,kit={}){this.fanWait=null;this.charge=0;this.chargeTimeRaw=0;this.rolling=false;this.rollTimer=0;this.weapon=this.tables.Weapon.find(w=>w.Id===id);this.w=stats(this.weapon);this.parametersForWeapon=this.parameters[this.weapon.AO]||{};this.projectile=stats(this.tables.Entity.find(e=>e.Id===this.weapon.BulletID));this.ink=this.w.PaintCapacity;this.altWeapon=new WeaponAlt(this);this.skills.equip(kit);}
  get inkCapacity(){return this.w.PaintCapacity*(1+(this.paintBuff>0?9999:0)+(this.fever?1:0));}
  startFever(){
    if(this.fever)return;
    this.fever=true;this.ink=this.inkCapacity;
  }
  collectItems(dt){
    for(const station of this.stations){
      station.wait=Math.max(0,station.wait-dt);
      if(this.respawn>0||station.wait>0||Math.hypot(this.x-station.x,this.y-station.y)>station.radius+this.view.playerRadius)continue;
      this.applyItem(station);station.wait=station.respawn;
    }
  }
  applyItem(item){
    const {ValueA,ValueB}=this.itemTypes.get(item.id).values;
    switch(item.id){
      case '1':this.hp=Math.min(this.player.Hp,this.hp+ValueA*this.player.Hp);break;
      case '2':this.paintBuff=ValueA;this.ink=this.inkCapacity;break;
      case '3':this.speedBuff=ValueB;this.speedBonus=ValueA;break;
      case '4':if(!this.skills.active)this.skills.points=Math.min(this.player.UltCapacity,this.skills.points+this.player.UltCapacity*ValueA);break;
    }
    this.skills.events.push({type:'pickup',id:item.id,x:this.x,y:this.y,team:this.team,chargeFx:item.id==='4'&&!this.skills.active});
  }
  blocked(x,y,index,radius=index===0?this.view.playerRadius:0){
    return this.view.physics.some(([shape,cx,cy,cos,sin,w,h,wall,bullet])=>{
      if(!(index===0?wall:bullet))return false;
      const dx=x-cx,dy=y-cy,lx=Math.abs(dx*cos+dy*sin),ly=Math.abs(-dx*sin+dy*cos);
      if(shape===1)return lx*lx+ly*ly<(w+radius)**2;
      if(shape===32){
        const r=Math.min(w,h)/2,axisX=Math.max(0,(w-h)/2),axisY=Math.max(0,(h-w)/2);
        return Math.hypot(Math.max(0,lx-axisX),Math.max(0,ly-axisY))<r+radius;
      }
      if(lx<w&&ly<h)return true;
      return Math.hypot(Math.max(0,lx-w),Math.max(0,ly-h))<radius;
    });
  }
  move(dx,dy){
    const obstacles=this.view.physics.concat(this.targets.filter(t=>t.model&&!t.respawn).map(t=>[1,t.x,t.y,1,0,t.radius,0,true,false]));
    for(let pass=0;pass<3&&(dx||dy);pass++){
      const hit=wallContact(obstacles,this.x,this.y,dx,dy,this.view.playerRadius,s=>s[7]);
      if(!hit){this.x+=dx;this.y+=dy;return;}
      this.x+=dx*hit.t;this.y+=dy*hit.t;
      const dot=dx*hit.nx+dy*hit.ny;
      dx=(dx-dot*hit.nx)*(1-hit.t);dy=(dy-dot*hit.ny)*(1-hit.t);
    }
  }
  updateTargets(dt){
    for(const t of this.targets){
      t.hitAge+=dt;t.rollerWait=Math.max(0,t.rollerWait-dt);
      if(t.respawn>0){
        t.respawn=Math.max(0,t.respawn-dt);if(t.respawn>0)continue;
        t.hp=t.zoneStats.Hp;t.phase=0;t.nextShot=0;
      }
      const z=t.zoneStats;
      if(t.zone==='18'){
        const length=Math.hypot(...t.move);
        if(length){
          t.phase=(t.phase+dt*z.MoveSpeed/length)%2;
          const fraction=1-Math.abs(1-t.phase);
          t.x=t.originX+t.move[0]*fraction;t.y=t.originY+t.move[1]*fraction;
        }
      }
      if(t.zone==='17'&&dt>0&&(t.nextShot-=dt)<=0){
        t.nextShot=z.AtkSpeed;
        const entity=String(z.ValueA),angle=Math.atan2(t.direction[1],t.direction[0])+spreadAngle(this.rng,z.SpreadAngle,0);
        const bullet=stats(this.tables.Entity.find(row=>row.Id===entity)),range=spreadRange(this.rng,z.AtkRange,z.SpreadDistance);
        this.shots.push({entity,team:2,sourceX:t.x,x:t.x,y:t.y,angle,speed:bullet.MoveSpeed,arc:projectileArc(this.rng,bullet),
          range,left:range,size:z.PaintSize,damage:z.Atk,travelled:0});
      }
    }
  }
  damageTarget(target,damage,contact,source=this){
    if(damage<=0||target.respawn>0)return;
    target.hits++;target.hitAge=0;target.hitSign=target.x>source.x?-1:1;
    this.skills.events.push({type:'dummy-hit',team:source.team??this.team,x:contact?.x??target.x,y:contact?.y??target.y,
      targetX:target.x,targetY:target.y,damage,textId:contact?.critical?3:1});
    if(!target.zoneStats)return;
    target.hp=Math.max(0,target.hp-damage);
    if(!target.hp)target.respawn=3;
  }
  losePlayerHp(amount){
    if(!(amount>0)||this.hp<=0)return;
    this.hp=Math.max(0,this.hp-amount);
    // EntityComponent.TakeDamage: surviving players receive the same group-9
    // stat instance on every hit, refreshing its duration rather than stacking it.
    this.hitSlowTime=this.hp>0?0x199a/Q:0;
  }
  damageFromDummy(shot){
    if(this.respawn>0||this.zones.protected||this.altWeapon.invincible)return;
    this.losePlayerHp(shot.damage);
    this.skills.events.push({type:'player-hit-sound',owner:'local',x:this.x,y:this.y,textId:shot.critical?3:1});
    const attackerX=shot.sourceX??shot.x;
    if(this.hp>0){
      this.skills.events.push({type:'player-hit',owner:'local',team:shot.team,
        x:this.x,y:this.y,sign:this.x>attackerX?1:-1});
      return;
    }
    const angle=Math.atan2(Math.sin(this.aim),Math.cos(this.aim));
    const back=angle>=Math.PI/4&&angle<=3*Math.PI/4;
    this.deathPose=(back?'Back_Dead_':'Front_Dead_')+(this.x<attackerX?'Right':'Left');
    this.respawn=3.5;this.fanWait=null;
    this.boosting=false;this.boostTimer=0;this.submerged=false;this.dashFx=0;
    this.rolling=false;this.charge=0;this.chargeTimeRaw=0;
    this.altWeapon=new WeaponAlt(this);
    this.skills.armed=false;this.skills.remaining=0;this.skills.pendingShot=null;
    this.skills.volley=null;this.skills.missileLocks=[];this.skills.hammerHeading=null;
    // Only a player attacker emits DiedEntity (E_1.OnDied); the dummy has no PlayerComponent.
  }
  respawnInYard(){
    [this.x,this.y]=this.view.lobbyRespawn;
    this.lastGroundSample=null;this.hitSlowTime=0;
    this.hp=this.player.Hp;this.paintBuff=0;this.speedBuff=0;this.speedBonus=0;
    this.ink=this.inkCapacity;this.cooldown=0;this.deathPose=null;
    this.zones=new MapZones(this);this.zones.step(0,this);
    // DeadComponent.Respawn grants three seconds of protection outside a team spawn.
    if(!this.zones.protected)this.zones.exitTime=3;
    this.skills.events.push({type:'player-respawn',owner:'local'});
  }
  sampleGroundOwner(){
    // TeamComponent.UpdateCellState (4556270): repainting beneath a stationary
    // actor doesn't change its cached team flags until it moves or changes board state.
    const x=fp(this.x),y=fp(this.y),last=this.lastGroundSample;
    if(last&&last.board===this.boosting){
      const dx=x-last.x,dy=y-last.y;
      if(fpMul(dx,dx)+fpMul(dy,dy)<0x290)return last.owner;
    }
    const col=Math.floor((this.x-this.left)/this.cell),row=Math.floor((this.y-this.bottom)/this.cell);
    const owner=col>=0&&row>=0&&col<this.columns&&row<this.rows?(this.teamGrid||this.grid)[row*this.columns+col]:0;
    this.lastGroundSample={x,y,board:this.boosting,owner};
    return owner;
  }
  get groundMoveSpeed(){
    const owner=this.lastGroundSample?.owner;
    const terrain=owner&&owner!==this.team?-this.player.ValueA:this.submerged?this.player.ValueB:0;
    let speed=fp(this.player.MoveSpeed);
    for(const modifier of [terrain,this.speedBuff>0?this.speedBonus:0,this.fever?0x3333/Q:0,
      this.rolling?this.w.ValueA:0,this.zones.speedBonus,this.hitSlowTime>0?-0x4cce/Q:0]){
      if(modifier)speed=fpMul(speed,Q+fp(modifier));
    }
    return speed/Q;
  }
  step(dt,input){
    if(!this.zoneInitialized){this.zones.step(0,this);this.zoneInitialized=true;}
    const awaitingRespawn=!!this.deathPose;
    if(awaitingRespawn)input={dx:0,dy:0,angle:this.aim,distance:0};
    const primaryHeld=!!input.fire;
    const {dx,dy}=input;
    this.paintBuff=Math.max(0,this.paintBuff-dt);this.speedBuff=Math.max(0,this.speedBuff-dt);
    this.ink=Math.min(this.ink,this.inkCapacity);
    const allowRight=updateBoard(this,dt,input);
    const actions=(input.actions||[]).map(a=>a.action??a);
    const usingSkill=this.skills.armed||this.skills.active||actions.includes('ultimate');
    this.updateTargets(dt);
    const targets=input.targets||this.targets.filter(t=>!t.respawn);
    this.skills.tick(dt,input,targets);
    if(usingSkill||this.skills.armed||this.skills.active||actions.includes('bomb')){
      // ApplyInput rejects an unavailable E before CancelAltAttack. An existing
      // WeaponChargeComponent continues ticking, even on the rejected input frame.
      // A successful bomb switch already clears charge in Skills.command.
      const keepCharge=!usingSkill&&!this.skills.armed&&!this.skills.active&&this.charge>0;
      if(!keepCharge){this.charge=0;this.chargeTimeRaw=0;}
      input={...input,fire:false,alt:keepCharge};
    }
    else{
      const right=allowRight&&(input.alt||(['1','2'].includes(this.weapon.Id)&&actions.includes('alt-press')));
      const releasingShield=this.altWeapon.shield&&!right;
      if(!allowRight){this.charge=0;this.chargeTimeRaw=0;}
      input={...input,fire:!this.boosting&&!releasingShield&&(input.fire||actions.includes('press')),alt:right};
    }
    const fromX=this.x,fromY=this.y,forced=this.altWeapon.step(dt,input);
    const owner=this.sampleGroundOwner();
    this.onPaint=owner!==0;
    this.submerged=this.boosting&&owner===this.team;
    const dash=this.altWeapon.dash;
    if(forced&&this.weapon.Id==='1'){
      this.skills.events.push({type:'dash-step',id:'1',first:dash.started,last:!dash.direction,
        angle:dash.angle,fromX,fromY,x:this.x,y:this.y,duration:dt,team:this.team});
    }
    // E_1.dashParticleMinVisibleDuration extends the visual after the last active dash frame.
    this.dashFx=this.altWeapon.dash.started||this.altWeapon.dash.direction?0.25:Math.max(0,this.dashFx-dt);
    if(forced)input={...input,fire:false};
    const wasRolling=this.rolling;
    const wantsRoll=this.weapon.Id==='5'&&input.alt&&this.altWeapon.charges>0;
    const roller=wantsRoll&&(wasRolling||this.ink>=this.w[this.combat.roller.startCost]);
    if(wantsRoll&&!roller)this.skills.events.push({type:'no-ink'});
    const laserSlow=this.skills.pendingShot?.firing?1-this.skills.special.ValueC:1;
    const speed=this.groundMoveSpeed*laserSlow*this.altWeapon.speedFactor;
    this.hitSlowTime=Math.max(0,this.hitSlowTime-dt);
    const ymax=this.map.ModeType==='Lobby'?35:this.height/2,ymin=this.map.ModeType==='Lobby'?-30:-this.height/2;
    const advance=(vx,vy)=>{
      const x=Math.max(-this.width/2,Math.min(this.width/2,this.x+vx));
      const y=Math.max(ymin,Math.min(ymax,this.y+vy));
      this.move(x-this.x,y-this.y);
    };
    const hammerMoving=this.skills.advanceHammer(dt,speed,[ymin,ymax]);
    const hammer=this.skills.hammerHeading;
    if(!forced&&!hammerMoving){
      // ApplyInput handles regular movement before W_5 sets or clears its movement lock.
      if(!wasRolling&&hasMoveInput(dx,dy)){
        const length=Math.hypot(dx,dy);
        advance(dx/length*speed*dt,dy/length*speed*dt);
      }
      if(roller&&(input.distance??1)**2*Q>0x28f){
        advance(Math.cos(input.angle)*speed*dt,Math.sin(input.angle)*speed*dt);
      }
    }
    if(!this.teamGrid)this.vents.advance(dt);
    this.ventTransfer=awaitingRespawn?null:this.vents.enter(this);
    const boosted=this.zones.speedTime>0;
    this.zones.step(dt,this);
    if(!boosted&&this.zones.speedTime>0)this.skills.events.push({type:'zone-speed',x:this.x,y:this.y});
    this.collectItems(dt);
    this.aim=hammer??input.angle;this.cooldown-=dt;
    const w=this.w,rule=this.combat.roller;this.rollHits.length=0;
    if(roller){
      const period=rule.periodRaw/Q;
      if(!this.rolling&&this.ink>=w[rule.startCost]){this.ink-=w[rule.startCost];this.rolling=true;this.rollTimer=period;}
      if(this.rolling){
        this.rollTimer-=dt;
        if(this.rollTimer<=0){
          this.rollTimer=period;
          if(this.ink<w[rule.tickCost])this.rolling=false;
          else{
            this.ink-=w[rule.tickCost];
            const tip=muzzlePosition(this.x,this.y,this.aim,this.parametersForWeapon.muzzlePos,input.distance);
            this.splat(tip.x,tip.y,w[rule.paintSize]);
            this.rollHits.push({...tip,radius:w.PaintSize,damage:w[rule.hitDamage]});
          }
        }
      }
    }else this.rolling=false;
    if(wasRolling&&!this.rolling)this.altWeapon.spend();
    const sniper=this.weapon.Id==='3',charged=sniper&&!input.alt&&this.charge>0;
    if(sniper&&input.alt&&this.altWeapon.charges>0&&this.cooldown<=0){
      const cap=affordableCharge(this.ink,w.PaintCost,this.parametersForWeapon.paintCostCurve);
      if(cap>0&&w.WeaponActiveDuration>0){
        const duration=fp(w.WeaponActiveDuration);
        this.chargeTimeRaw=Math.min(fpMul(fp(cap),duration),this.chargeTimeRaw+fp(dt));
        this.charge=Math.trunc(this.chargeTimeRaw*Q/duration)/Q;
      }else{this.charge=0;this.chargeTimeRaw=0;this.skills.events.push({type:'no-ink'});}
    }
    const curve=key=>charged?sampleCurve(this.parametersForWeapon[key],this.charge):1;
    const cost=w.PaintCost*curve('paintCostCurve');
    if((input.fire||charged)&&!input.alt&&this.cooldown<=0&&this.ink>=cost){
      // Primary attacks spend ink first. W_3.FireAndReset (457a5c0) checks its
      // normalized aim before UsePaint, the projectile and the cooldown.
      if(input.distance===0){
        if(!charged)this.ink-=cost;
      }else{
        if(this.weapon.Id==='5'){
          this.fanWait=fp(this.parametersForWeapon.atkDelayTime);this.fanAim=this.aim;
        }else if(this.weapon.Id==='4'){
          releaseFan(this,input);
        }else releaseSingle(this,input,charged,curve);
        if(charged)this.altWeapon.spend();
        this.ink-=cost;this.cooldown=w.AtkSpeed;this.skills.events.push({type:'weapon-fire',id:this.weapon.Id,x:this.x,y:this.y,team:this.team,charge:charged?this.charge:0});input.shot?.();
        if(this.weapon.Id==='1')this.smgBurst=true;
      }
    }
    // W_1_View stops loop 65 when IsAttackHeld clears or CurrentWeaponSlot leaves Main.
    if(this.smgBurst&&(!primaryHeld||this.weapon.Id!=='1'||this.skills.armed||this.skills.active)){
      this.skills.events.push({type:'smg-stop'});
      this.smgBurst=false;
    }
    if(charged){this.charge=0;this.chargeTimeRaw=0;}
    if(this.fanWait!==null){
      this.fanWait-=fp(dt);
      if(this.fanWait<=0){releaseFan(this,input);this.fanWait=null;}
    }
    const regen=owner!==this.team?this.player.ValueC:this.submerged?Math.max(w.FillPaintSpeed*(this.fever?3:1),this.player.ValueD):this.player.ValueD;
    // PaintCapacity.UpdateCurrentValue (4571e30) skips an active WeaponPaintComponent
    // (the pushed roller), not held mouse buttons. Firing still pays the full shot cost.
    if(!this.rolling)this.ink=Math.min(this.inkCapacity,this.ink+regen*dt);
    for(const target of this.targets){
      for(const hit of this.skills.hits)this.damageTarget(target,damageAt(hit,target,target.radius));
      for(const hit of this.rollHits){
        if(target.rollerWait||target.respawn)continue;
        const damage=damageAt(hit,target,target.radius);
        if(damage){this.damageTarget(target,damage);target.rollerWait=rule.perTargetCooldownRaw/Q;}
      }
    }
    this.bulletHits.length=0;
    // W_1002.FireLaser also increments WeaponComponent.HitCount for intersected targets.
    let hitReticle=this.skills.hits.some(hit=>hit.aimHit&&targets.some(t=>damageAt(hit,t,t.radius??this.view.playerRadius)>0));
    for(const s of this.shots){
      const hostile=s.team!=null&&s.team!==this.team;
      const candidates=hostile?[this,...deployedWeapons(this)]:targets.concat((input.deployables??[]).filter(o=>o.life>0));
      const {target:hitTarget,end}=advanceInkProjectile(this,s,dt,candidates,this.sprinkler);
      if(end==='machine'){this.sprinkler.hit(s.damage,s.team??this.team,s.x,s.y);hitReticle=true;}
      if(hitTarget?.altWeapon?.block(s,s.x,s.y))continue;
      if(hitTarget){
        // BulletComponent.TriggerEnter increments the shooter's HitCount after TakeDamage.
        if(!hostile)hitReticle=true;
        if(hostile&&hitTarget===this){
          this.damageFromDummy(s);
        }else if(hostile){
          for(const blast of damageDeployable(this,hitTarget,s.damage)){
            this.skills.events.push(blast.event);
            for(const t of this.targets)this.damageTarget(t,damageAt(blast.hit,t,t.radius));
          }
        }else if(input.onBulletHit)input.onBulletHit({target:hitTarget,damage:s.damage,critical:!!s.critical});
        else if(input.targets)this.bulletHits.push({target:hitTarget,damage:s.damage,critical:!!s.critical});
        else this.damageTarget(hitTarget,s.damage,s);
      }
      // BulletComponent.UpdateEntity / TriggerEnter raise ExplodeEntity(990002)
      // on completed travel and on blocking MapDeco. A target or absorbed shot has its own hit feedback.
      if(end==='wall'||end==='range')this.skills.events.push({type:'bullet-end',entity:s.entity,x:s.x,y:s.y,team:s.team??this.team,end});
      if(end)this.splat(s.x,s.y,s.size,s.team??this.team);}
    if(hitReticle)this.skills.events.push({type:'aim-hit'});
    this.shots=this.shots.filter(s=>s.left>0);
    if(this.sprinkler){
      for(const hit of this.skills.hits)this.sprinkler.damage(hit,this.team);
      this.sprinklerRollWait=Math.max(0,this.sprinklerRollWait-dt);
      for(const hit of this.rollHits)if(!this.sprinklerRollWait){
        const before=this.sprinkler.hitSerial;this.sprinkler.damage(hit,this.team);
        if(this.sprinkler.hitSerial!==before)this.sprinklerRollWait=rule.perTargetCooldownRaw/Q;
      }
      if(!this.teamGrid)this.sprinkler.update(dt,this,team=>team===this.team?[]:[this],(shot,target)=>{
        if(!target.zones.protected&&!target.altWeapon.invincible)target.losePlayerHp(shot.damage);
      },(s,end)=>{
        this.splat(s.x,s.y,s.size,s.team,undefined,false);
        if(end!=='target')this.skills.events.push({type:'bullet-end',entity:s.entity,x:s.x,y:s.y,team:s.team,end});
      });
    }
    if(!this.teamGrid){this.drops.step(dt,this);this.skills.events.push(...this.drops.events);if(!awaitingRespawn)this.drops.collect(this);}
    if(awaitingRespawn){
      this.respawn=Math.max(0,this.respawn-dt);
      if(!this.respawn)this.respawnInYard();
    }
  }
  splat(x,y,size,team=this.team,texture,credit=true){
    const col=Math.floor((x-this.left)/this.cell),row=Math.floor((y-this.bottom)/this.cell);
    if(col<0||row<0||col>=this.columns||row>=this.rows||this.paintMask[row*this.columns+col]===2)return;
    const mark={x,y,size,team,texture:texture??this.rng.nextInt(0,this.tables.PaintAsset.length),rotation:this.rng.nextInt(0,360)};
    this.paint.push(mark);
    if(!this.teamGrid){
      let changed=0;this.eachPaintCell(mark,index=>{if(this.grid[index]!==team){this.grid[index]=team;changed++;}});
      if(credit&&team===this.team){this.paintPoints+=changed;this.skills.credit(changed);}
    }
  }
  // MapManager.PaintToPosition (0x4541e90) compares rounded Q16 squared distances to radius squared.
  eachPaintCell(mark,visit){
    const {x,y,size:radius}=mark;
    const x0=Math.max(0,Math.floor((x-radius-this.left)/this.cell));
    const x1=Math.min(this.columns-1,Math.floor((x+radius-this.left)/this.cell));
    const y0=Math.max(0,Math.floor((y-radius-this.bottom)/this.cell));
    const y1=Math.min(this.rows-1,Math.floor((y+radius-this.bottom)/this.cell));
    const radiusSquared=fpMul(fp(radius),fp(radius));
    for(let row=y0;row<=y1;row++){
      const dy=fp(y)-fp((row+.5)*this.cell+this.bottom);
      for(let col=x0;col<=x1;col++){
        const index=row*this.columns+col;
        if(this.paintMask[index])continue;
        const dx=fp(x)-fp((col+.5)*this.cell+this.left);
        if(fpMul(dx,dx)+fpMul(dy,dy)<=radiusSquared)visit(index);
      }
    }
  }
}

// MapManager.MarkDecoAreasAsNoUse (0x4540e40) handles boxes/circles, then overlays zone 7.
function buildPaintMask(field,shapes){
  const mask=new Uint8Array(field.grid.length);
  for(const [kind,x,y,cos,sin,w,h,flag] of shapes){
    const reach=kind===1?w:Math.hypot(w,h);
    const x0=Math.max(0,Math.floor((x-reach-field.left)/field.cell));
    const x1=Math.min(field.columns-1,Math.floor((x+reach-field.left)/field.cell));
    const y0=Math.max(0,Math.floor((y-reach-field.bottom)/field.cell));
    const y1=Math.min(field.rows-1,Math.floor((y+reach-field.bottom)/field.cell));
    for(let row=y0;row<=y1;row++)for(let col=x0;col<=x1;col++){
      const dx=(col+.5)*field.cell+field.left-x,dy=(row+.5)*field.cell+field.bottom-y;
      const inside=kind===1?dx*dx+dy*dy<=w*w:Math.abs(dx*cos+dy*sin)<=w&&Math.abs(dy*cos-dx*sin)<=h;
      if(inside){const i=row*field.columns+col;mask[i]=Math.max(mask[i],flag);}
    }
  }
  return mask;
}
