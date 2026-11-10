import {FRAME_RAW,SIMULATION_DELTA} from './combat-clock.js';
import {skillLoadout} from './loadout.js';
import {bulletOrigin,targetContact} from './damage.js';
import {wallContact} from './wall-contact.js';
// Keyboard transitions follow ControlSystem (455fb00). Skill and entity stats come from the release tables.
export class Skills {
  constructor(field,readStats){
    this.field=field;this.readStats=readStats;this.nextBombSerial=1;this.objects=[];this.missileLocks=[];this.missilePositions=[];this.events=[];this.hits=[];this.points=0;
    this.pendingShot=null;this.volley=null;this.armed=false;this.remaining=0;this.attackWait=0;this.stock=0;this.refill=0;
  }
  equip(kit){
    const f=this.field,selected=skillLoadout(f.tables,f.weapon,kit,true);
    const resolve=key=>f.tables.Skill.find(s=>s.Id===selected[key]);
    const bomb=resolve('bomb'),ult=resolve('ultimate');
    if(this.bomb!==bomb){
      this.bomb=bomb;this.b=bomb&&this.readStats(bomb);
      this.bombEntity=bomb&&this.readStats(f.tables.Entity.find(row=>row.Id===String(this.b.ValueA)));this.stock=this.b?.ValueC||0;this.refill=0;this.armed=false;
    }
    if(this.ult!==ult){
      this.pendingShot=null;this.volley=null;this.missileLocks=[];this.missilePositions=[];this.ult=ult;this.u=ult&&this.readStats(ult);this.remaining=0;
      this.special=ult&&this.readStats(f.tables.Weapon.find(w=>w.Id===String(this.u.ValueA)));
    }
  }
  get active(){return this.remaining>0||this.pendingShot?.id==='1002';}
  get gauge(){
    return this.remaining>0?this.remaining/this.u.ActiveDuration:this.points/this.field.player.UltCapacity;
  }
  credit(cells){
    if(!this.remaining&&!this.pendingShot&&!this.volley)this.points=Math.min(this.field.player.UltCapacity,this.points+cells*(0x199a/65536)*this.field.w.UltChargeOffset);
  }
  command(action,input){
    const f=this.field;
    if(action==='bomb'){
      if(this.armed){this.armed=false;return;}
      if(!this.b||this.stock<=0||this.remaining)return;
      if(f.ink<this.b.PaintSkillCost){this.event('no-ink',this.bomb.Id,f.x,f.y);return;}
      this.armed=true;this.shake=0;this.shakeTime=0;this.shakeDirection=null;f.charge=0;
    }else if(action==='release'&&this.armed){
      if(this.stock>0&&f.ink>=this.b.PaintSkillCost){
        f.ink-=this.b.PaintSkillCost;this.stock--;if(!this.refill)this.refill=this.b.ValueB;
        this.throw(input);this.armed=false;
      }
    }else if(action==='ultimate'&&this.ult&&this.points>=f.player.UltCapacity){
      this.event('ultimate',this.ult.Id,f.x,f.y);this.swingCount=0;
      if(this.ult.Id==='1001'){this.hammerClock=0;this.hammerWait=0;this.hammerHeading=null;this.hammerQueued=null;}
      this.points=0;this.remaining=this.u.ActiveDuration;this.armed=false;this.attackWait=0;f.charge=0;
    }
  }
  throw(input){
    const f=this.field,entity=this.bombEntity;
    const soda=this.bomb.Id==='5';
    const rocket=this.bomb.Id==='4',requested=input.distance??1;
    const dist=Math.min(Math.max(soda||rocket?0x199a/65536:0,requested),f.player.ThrowingDistance);
    // SK_4.ReleaseSkill falls back to FPVector2.Up for a zero-length cursor vector.
    const angle=rocket&&Math.round(requested*requested*65536)===0?Math.PI/2:input.angle;
    const sliding=this.bomb.Id==='3';
    this.event('throw',this.bomb.Id,f.x,f.y);
    this.objects.push({serial:this.nextBombSerial++,radius:f.combat.bombRadii?.[this.bomb.Id]??0,id:this.bomb.Id,x:f.x,y:f.y,angle,travel:sliding?0:dist,life:entity.ActiveDuration,fuseTotal:soda?0:entity.ActiveDuration,
      airborne:sliding?0:dist,z:0,bounces:soda&&this.shake>0?Math.max(1,Math.floor(Math.min(1,this.shake*this.b.ValueD)*entity.ValueD)):0,next:0,stats:entity});
  }
  updateSprinkler(o,groundSeconds,frameSeconds){
    const tickSeconds=SIMULATION_DELTA;
    o.sprayFrames=(o.sprayFrames??0)+groundSeconds/tickSeconds;
    while(o.sprayFrames>=1-1e-9&&o.life>0){
      o.sprayFrames=Math.max(0,o.sprayFrames-1);
      // EntitySystem updates AtkSpeed before E_3 subtracts ActiveDuration,
      // checks expiry, and potentially fires. The landing step only arms it.
      o.next=Math.max(0,o.next-tickSeconds);
      o.life=Math.max(0,o.life-tickSeconds);
      if(!o.life||o.next>0)continue;
      o.next=o.stats.AtkSpeed;
      const field=this.field,bullet=this.readStats(field.tables.Entity.find(r=>r.Enum==='Sprinkler_Bullet'));
      // E_3 chooses its angle with NextUInt32 and its distance with NextInclusive(FP,FP).
      const q=65536,angle=2*Math.floor(((field.rng.nextUInt32()>>>16)*0x3243f+q/2)/q)/q;
      const distanceFraction=field.rng.nextInt(0,q+1);
      const range=1.5+Math.floor(distanceFraction*(o.stats.AtkRange-1.5))/q;
      // CreateBullet consumes a third draw for the arc even when ValueB and ValueC coincide.
      const arc=field.rng.nextFixedRaw(bullet.ValueB*q,bullet.ValueC*q)/q;
      // The projectile pass will add the entire outer frame. Credit only the
      // firing tick and the time remaining after it, also for a batched update.
      const flightRemainder=(1+o.sprayFrames)*tickSeconds-frameSeconds;
      field.shots.push({entity:'10006',travelled:0,x:o.x,y:o.y,angle,range,left:range,flightRemainder,
        speed:bullet.MoveSpeed,arc,damage:o.stats.Atk,size:o.stats.PaintSize});
    }
  }
  event(type,id,x,y){this.events.push({type,id,x,y,team:this.field.team});}
  hit(x,y,size,damage,radius=size,floor=1,inner=0){
    const f=this.field;
    // EntityComponent.Explode picks the paint asset before the map tests the centre.
    const texture=f.rng.nextInt(0,f.tables.PaintAsset.length);
    f.splat(x,y,size,f.team,texture);this.hits.push({x,y,radius,damage,floor,inner});
  }
  specialAttack(input){
    const f=this.field,w=this.special,id=this.ult.Id,c=Math.cos(input.angle),s=Math.sin(input.angle);
    this.attackWait=w.AtkSpeed;
    if(id==='1003'||id==='1004')this.event('weapon-fire',id,f.x,f.y);
    if(id==='1003'){
      // W_1003.UpdateWeapon arms MeteorMissileComponent once. It fires independently of further clicks.
      this.volley={left:w.ValueB,delay:w.ValueD,weapon:w,entity:this.readStats(f.tables.Entity.find(v=>v.Id===String(w.ValueA)))};
      this.remaining=Math.min(this.remaining,w.ValueD);
      this.attackWait=Infinity;
      return;
    }
    // W_1002/1004.Attack spend gauge immediately and retain the aim during their wind-up.
    this.remaining=Math.max(0,this.remaining-this.u.ActiveDuration*this.u.ValueB/f.player.UltCapacity);
    this.pendingShot={id,delay:w.ValueB,angle:input.angle,distance:input.distance??w.AtkRange,weapon:w};
    if(id==='1002'){
      this.pendingShot.frame=0;this.pendingShot.clock=0;
      this.event('charge',id,f.x,f.y);
    }
  }
  advanceHammer(dt,speed,bounds){
    const input=this.hammerInput;
    if(!input)return false;
    const f=this.field,w=this.special,Q=65536,step=FRAME_RAW;
    const fixed=v=>Math.round(v*Q),mul=(a,b)=>Math.floor((a*b+Q/2)/Q);
    const advance=mul(fixed(speed),Q+fixed(w.ValueB)),turn=mul(fixed(w.ValueA),step)/Q;
    this.hammerClock+=dt/SIMULATION_DELTA;
    if(input.held&&this.hammerClock<1&&this.hammerHeading==null)this.hammerQueued=input;
    if(!input.held&&!this.hammerQueued&&this.hammerHeading!=null){
      this.hammerHeading=null;
      this.event('smash-release','1001',f.x,f.y);
    }
    // AtkSpeed.UpdateCurrentValue runs once per Quantum frame, including while released.
    while(this.hammerClock+1e-8>=1&&this.remaining>0){
      this.hammerClock-=1;this.hammerWait=Math.max(0,this.hammerWait-step);
      const frameInput=this.hammerQueued??input;this.hammerQueued=null;
      if(frameInput.held){
        const old=this.hammerHeading;
        const requested=fixed((frameInput.distance??1)**2)<=0x28f?(old??Math.PI/2):frameInput.angle;
        if(old==null)this.hammerHeading=requested;
        else{
          const cross=fixed(Math.sin(requested-old)),dot=Math.max(-1,Math.min(1,Math.cos(requested-old)));
          const diff=Math.acos(dot);
          this.hammerHeading=diff<=turn?requested:old+(cross<0?-turn:turn);
        }
        const c=fixed(Math.cos(this.hammerHeading)),s=fixed(Math.sin(this.hammerHeading));
        const dx=mul(mul(c,advance),step)/Q,dy=mul(mul(s,advance),step)/Q;
        const x=f.x+dx,y=f.y+dy;
        if(x>=-f.width/2&&x<=f.width/2&&y>=bounds[0]&&y<=bounds[1]&&
           (f.map.ModeType==='Lobby'||!f.blocked(x,y,0,0x199a/Q)))f.move(dx,dy);
        if(!this.hammerWait){
          // The native center is computed from the post-movement Transform2D.
          const x=f.x+mul(c,fixed(w.AtkRange))/Q,y=f.y+mul(s,fixed(w.AtkRange))/Q;
          this.hits.push({x,y,radius:w.AtkRange,damage:w.Atk});
          const texture=f.rng.nextInt(0,f.tables.PaintAsset.length);
          f.splat(x,y,w.AtkRange,f.team,texture);
          this.events.push({type:'smash',id:'1001',x,y,actorX:f.x,actorY:f.y,angle:this.hammerHeading,team:f.team,sequence:this.swingCount++});
          this.hammerWait=fixed(w.AtkSpeed);
        }
      }
      this.remaining=Math.max(0,this.remaining-step/Q);
    }
    return input.held;
  }
  updateLaser(shot,dt){
    const f=this.field,w=shot.weapon;
    // SessionConfig.UpdateFPS=60. AtkSpeed.UpdateCurrentValue subtracts a Q16 frame.
    const stepRaw=FRAME_RAW,end=w.AtkSpeed*65536,start=w.ValueB*65536;
    shot.clock+=dt/SIMULATION_DELTA;
    while(shot.clock+1e-9>=1){
      shot.clock-=1;
      const elapsed=++shot.frame*stepRaw;
      if(elapsed<=start)continue;
      if(!shot.firing){
        shot.firing=true;
        this.event('shoot',shot.id,f.x,f.y);
        this.objects=this.objects.filter(o=>o.id!==shot.id);
        this.objects.push({id:shot.id,x:f.x,y:f.y,angle:shot.angle,life:1.5,range:w.AtkRange,z:0});
      }
      // W_1002.FireLaser runs its box query and selects one paint mask per Quantum frame.
      const c=Math.cos(shot.angle),s=Math.sin(shot.angle);
      const strokes=Math.ceil(Math.max(0,w.AtkRange-f.parameters.W_1002.paintLengthOffset.RawValue/65536)/w.ValueA);
      const texture=f.rng.nextInt(0,f.tables.PaintAsset.length);
      for(let i=0;i<=strokes;i++)f.splat(f.x+c*i*w.ValueA,f.y+s*i*w.ValueA,w.ValueA,f.team,texture);
      this.hits.push({x:f.x,y:f.y,angle:shot.angle,length:w.AtkRange,radius:w.ValueA/2,damage:w.Atk,aimHit:true});
      if(elapsed>=end){this.pendingShot=null;break;}
    }
  }
  updateSpecialShots(dt){
    const f=this.field,shot=this.pendingShot;
    if(shot?.id==='1002'){
      this.updateLaser(shot,dt);
    }else if(shot&&(shot.delay-=dt)<=0){
      this.pendingShot=null;
      const w=shot.weapon,{angle,id}=shot,c=Math.cos(angle),s=Math.sin(angle);
      this.event('shoot',id,f.x,f.y);
      const entity=this.readStats(f.tables.Entity.find(v=>v.Id===String(w.ValueA)));
      const tip=bulletOrigin(f,angle,f.parameters.W_1004?.muzzlePos,shot.distance);
      const maxTravel=Math.max(0,w.AtkRange-Math.hypot(tip.x-f.x,tip.y-f.y));
      const cursorDistance=Math.hypot(f.x+c*shot.distance-tip.x,f.y+s*shot.distance-tip.y);
      const travel=cursorDistance>0x28f/65536?Math.min(cursorDistance,maxTravel):maxTravel;
      this.objects.push({id,x:tip.x,y:tip.y,angle,life:entity.ActiveDuration,z:0,travel,fuseTotal:entity.ActiveDuration,stats:entity,radius:f.combat.bazookaRadius});
    }
    const volley=this.volley;
    if(!volley||(volley.delay-=Math.round(dt*65536)/65536)>0)return;
    // FindEnemyPosition chooses one cached slot or two square offsets about the owner.
    // SpawnOneMissile consumes two more FP draws in either case.
    const w=volley.weapon,spreadRaw=w.ValueC*65536;
    const offset=()=>f.rng.nextFixedRaw(-spreadRaw,spreadRaw);
    const locked=this.missilePositions;
    const target=locked.length?locked[f.rng.nextInt(0,locked.length)]:f;
    let xRaw=Math.round(target.x*65536),yRaw=Math.round(target.y*65536);
    if(!locked.length){xRaw+=offset();yRaw+=offset();}
    const x=(xRaw+offset())/65536,y=(yRaw+offset())/65536;
    this.objects.push({id:'1003',x,y,angle:0,z:0,travel:0,life:volley.entity.ActiveDuration,stats:volley.entity});
    this.event('shoot','1003',x,y);
    // UpdateMeteor resets the countdown to the full interval and discards overshoot.
    volley.delay=w.AtkSpeed;
    if(--volley.left===0){this.volley=null;this.missileLocks=[];this.missilePositions=[];}
  }
  get shakeRatio(){return this.armed?Math.min(1,(this.shake||0)*(this.b.ValueD||0)):0;}
  tick(dt,input,targets){
    const f=this.field;
    this.hits.length=0;this.events.length=0;
    if(this.refill>0&&(this.refill-=dt)<=0){this.stock=Math.min(this.b.ValueC,this.stock+1);this.refill=this.stock<this.b.ValueC?this.b.ValueB:0;}
    for(const event of input.actions||[])this.command(event.action??event,typeof event==='string'?input:event);
    if(this.armed&&this.bomb.Id==='5'){
      this.shakeTime+=dt;const len=Math.hypot(input.dx,input.dy);
      this.shakeX=len>.1?input.dx/len:0;this.shakeY=len>.1?input.dy/len:0;
      if(len>.1){const d=[input.dx/len,input.dy/len];
        if(!this.shakeDirection)this.shakeTime=0;
        else if(d[0]*this.shakeDirection[0]+d[1]*this.shakeDirection[1]<=-.5){if(this.shakeTime<=.35){this.shake++;this.event('shake',this.bomb.Id,f.x,f.y);}this.shakeTime=0;}
        this.shakeDirection=d;
      }
    }
    const attacking=input.fire||(input.actions||[]).some(a=>(a.action??a)==='press');
    this.hammerInput=this.remaining>0&&this.ult.Id==='1001'?{held:attacking,angle:input.angle,distance:input.distance}:null;
    if(!this.hammerInput)this.hammerHeading=null;
    if(this.remaining>0&&!this.hammerInput){
      this.attackWait-=dt;
      if(attacking&&this.attackWait<=0&&!this.pendingShot)this.specialAttack({...input,angle:this.hammerHeading??input.angle});
      this.remaining=Math.max(0,this.remaining-dt);
    }
    if(this.ult?.Id==='1003'&&(this.remaining>0||this.volley)){
      // LockTargets keeps the last acquired position when visibility or range is lost.
      // An invalid/dead EntityRef still occupies its slot until the volley completes.
      const canTrack=t=>t&&!t.respawn&&Math.hypot(t.x-f.x,t.y-f.y)<=this.special.AtkRange
        &&(!t.zones||t.zones.bush<0||t.zones.bush===f.zones.bush);
      const visible=[];
      for(const slot of this.missilePositions){
        const t=slot.target;
        if(!t)continue;
        if(t.respawn||!targets.includes(t)){
          if(t.respawn){slot.x=t.x;slot.y=t.y;}
          slot.target=null;
        }else if(canTrack(t)){
          slot.x=t.x;slot.y=t.y;visible.push(t);
        }
      }
      for(const t of targets){
        if(this.missilePositions.length===5)break;
        if(canTrack(t)&&!this.missilePositions.some(slot=>slot.target===t)){
          this.missilePositions.push({target:t,x:t.x,y:t.y});visible.push(t);
        }
      }
      this.missileLocks=visible;
    }else{this.missileLocks=[];this.missilePositions=[];}
    this.updateSpecialShots(dt);
    const collidables=targets.concat(input.deployables||[]).filter(target=>target.life!==0);
    for(const o of this.objects){
      const e=o.stats;
      if(o.id==='1002'){o.x=f.x;o.y=f.y;o.life-=dt;continue;}

      let elapsed=dt;
      const shapes=f.view.bombShapes||f.view.physics;
      if(o.id==='1004'){
        const step=Math.min(o.travel,elapsed*e.MoveSpeed),dx=Math.cos(o.angle)*step,dy=Math.sin(o.angle)*step;
        const wall=wallContact(f.view.physics,o.x,o.y,dx,dy,o.radius,shape=>shape[8]);
        const hit=targetContact(o.x,o.y,o.angle,step,collidables,f.view.playerRadius,wall?.t??Infinity,o.radius);
        const fraction=hit?.t??wall?.t??1;
        o.x+=dx*fraction;o.y+=dy*fraction;o.travel-=step*fraction;
        if(wall||hit||o.travel<=0){o.life=0;o.travel=0;}
        else continue;
      }
      if(o.travel>0){
        const speed=o.jumpSpeed||20,step=Math.min(o.travel,elapsed*speed);
        const dx=Math.cos(o.angle)*step,dy=Math.sin(o.angle)*step;
        const endZ=o.airborne&&step<o.travel?Math.sin(Math.PI*(1-(o.travel-step)/o.airborne))*Number(f.tables.Skill.find(s=>s.Id===o.id).ThrowHeight):0;
        const hit=o.airborne&&wallContact(shapes,o.x,o.y+o.z*.5,dx,dy+(endZ-o.z)*.5,o.radius??0,s=>s[7]);
        if(hit){
          // MV_1 and HandleWallCollision preserve this tick's last ground position and drop vertically.
          o.x+=dx*hit.t;o.y+=dy*hit.t;o.z+=(endZ-o.z)*hit.t;
          o.drop=o.z>0?0x199a/65536:0;o.dropHeight=o.z;o.travel=0;elapsed-=step*hit.t/speed;
        }else{
          o.x+=dx;o.y+=dy;o.travel-=step;elapsed-=step/speed;
          o.z=endZ;
          if(o.travel>0)continue;
        }
        if(o.airborne&&!o.drop&&!o.jumpSpeed)this.event('land',o.id,o.x,o.y);
      }
      if(o.drop>0){
        const t=Math.min(o.drop,elapsed);o.drop-=t;elapsed-=t;o.z=o.dropHeight*o.drop/(0x199a/65536);
        if(o.drop>0)continue;
        if(!o.jumpSpeed)this.event('land',o.id,o.x,o.y);
      }
      if(o.id==='2'){
        this.updateSprinkler(o,elapsed,dt);
        continue;
      }
      o.life-=o.id==='1003'?Math.round(elapsed*65536)/65536:elapsed;o.next-=elapsed;
      if(o.id==='5')o.fuseTotal=Math.max(o.fuseTotal,o.life);
      if(o.id==='3'||o.id==='4'){
        let speed=e.MoveSpeed;
        if(o.id==='4'){
          // Frame.IsVisibleAttackableTarget rejects dead and concealed units. The source of the
          // visibility query is this rocket, which has no player invisibility component.
          const visible=t=>!t.respawn&&t.hp!==0&&(t.zones?.bush??-1)<0;
          const squared=t=>Math.round((t.x-o.x)**2*65536)+Math.round((t.y-o.y)**2*65536);
          const limit=Math.round(e.SearchRange**2*65536);
          if(e.ActiveDuration-(o.life+elapsed)>=e.ValueA&&(!targets.includes(o.target)||!visible(o.target)||squared(o.target)>limit)){
            o.target=undefined;
            let nearest=limit;
            for(const t of targets)if(visible(t)&&squared(t)<nearest){o.target=t;nearest=squared(t);}
          }
          const target=o.target;
          if(target){o.angle=Math.atan2(target.y-o.y,target.x-o.x);speed=e.MoveSpeed*(1+e.ValueB);if(squared(target)<0xcce)o.life=0;}
          o.locked=!!target;
          if(o.life<=0)elapsed=0;
        }
        const dx=Math.cos(o.angle)*elapsed*speed,dy=Math.sin(o.angle)*elapsed*speed;
        const x0=o.x,y0=o.y,hit=wallContact(shapes,o.x,o.y,dx,dy,o.radius,s=>s[8]);
        if(hit){
          o.x+=dx*hit.t;o.y+=dy*hit.t;
          const dot=Math.cos(o.angle)*hit.nx+Math.sin(o.angle)*hit.ny;
          o.angle=Math.atan2(Math.sin(o.angle)-2*dot*hit.ny,Math.cos(o.angle)-2*dot*hit.nx);
          if(o.id==='3'){
            const sx=Math.cos(o.angle)*0x199a/65536,sy=Math.sin(o.angle)*0x199a/65536;
            if(!wallContact(shapes,o.x,o.y,sx,sy,o.radius,s=>s[8])){o.x+=sx;o.y+=sy;}
            this.event('reflect',o.id,o.x,o.y);
          }else{
            const nudge=0x199a/65536,nx=o.x-hit.nx*nudge,ny=o.y-hit.ny*nudge;
            if(!f.blocked(nx,ny,0,nudge)){o.x=nx;o.y=ny;}
          }
        }else{o.x+=dx;o.y+=dy;}
        if(o.life>0&&elapsed>0){
          // E_4 and E_5 both damage on collision ENTER. Only E_4 paints along its slide.
          if(o.id==='3')f.splat(o.x,o.y,e.PaintSize);
          const prior=o.touching||new Set();o.touching=new Set();
          for(const target of collidables){
            if(target===o)continue;
            const radius=o.radius+(target.radius??f.view.playerRadius),tx=target.x-x0,ty=target.y-y0,dx1=o.x-x0,dy1=o.y-y0;
            const t=Math.max(0,Math.min(1,(tx*dx1+ty*dy1)/(dx1*dx1+dy1*dy1||1)));
            if(!prior.has(target)&&Math.hypot(tx-dx1*t,ty-dy1*t)<=radius)this.hits.push({target,damage:e.Atk});
            if(Math.hypot(target.x-o.x,target.y-o.y)<=radius)o.touching.add(target);
          }
        }
      }
      if(o.life<=0&&o.id!=='2'&&o.id!=='3'){
        if(o.id==='1003'){
          // EntityComponent.Explode clamps the event, hit query and paint centre together.
          o.x=Math.max(f.left+1,Math.min(f.left+f.width-1,o.x));
          o.y=Math.max(f.bottom+.5,Math.min(f.bottom+f.height-.5,o.y));
        }
        if(['1','4','5','1003','1004'].includes(o.id))this.event('explode',o.id,o.x,o.y);
        this.hit(o.x,o.y,e.PaintSize,e.Atk,e.AtkRange||e.PaintSize,e.ExplodeDamageFloor,e.ExplodeRange);
        if(o.bounces>0){
          o.rebounded=true;o.bounces--;o.life=e.ValueC;
          o.angle=f.rng.nextFixedRaw(0,0x6487f)/65536;
          o.travel=e.ValueB;o.airborne=o.travel;o.jumpSpeed=e.MoveSpeed;
        }
      }
    }
    this.objects=this.objects.filter(o=>o.life>0);
    for(const o of this.objects){
      const flying=!!(o.travel>0||o.drop>0);
      o.phaseTime=o.flying===undefined||(o.flying===flying)?(o.phaseTime||0)+dt:0;
      o.flying=flying;
    }
  }
}
