import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {LocalField} from '../game/simulation.js';
import {projectilePose} from '../game/damage.js';

const read=async name=>JSON.parse(await readFile(new URL('../data/'+name+'.json',import.meta.url)));
const [tables,lobby,park,parameters,combat]=await Promise.all(['tables','views/lobby','views/M_5','views/weapon-parameters','views/combat-evidence'].map(read));
const idle={dx:0,dy:0,angle:0,distance:4};
// DeterministicSession.get_DeltaTime divides 65536 by the configured 60 FPS.
const dt=1092/65536;
const dummyTemplate=lobby.trainingTargets.find(t=>t.zone==='18');
const map=tables.GameMap.find(m=>m.Id==='5');
function fieldFor(machine=false,physics=[],target){
  const scene={...park,physics,paintShapes:[],triggerZones:[],itemStations:[],
    giantSprinkler:machine?park.giantSprinkler:null,
    trainingTargets:target?[{...dummyTemplate,x:target[0],y:target[1],move:[0,0]}]:[]};
  return new LocalField(tables,map,scene,parameters,combat);
}
function withDraws(field,draws,action){
  const original=field.rng;
  function next(){assert(draws.length,'unexpected random draw during release');return draws.shift();}
  field.rng={nextUInt32:()=>Math.floor(next()*2**32),nextInt:(a,b)=>a+Math.floor(next()*(b-a)),
    nextFixedRaw:(a,b)=>a+Math.floor(Math.floor(next()*65536)*(b-a)/65536)};
  try{action();assert.equal(draws.length,0);}finally{field.rng=original;}
}
function nativeShots(){
  const field=fieldFor();field.equip('2',{bomb:'2'});field.x=0;field.y=0;
  const input={...idle,distance:0};
  field.skills.command('bomb',input);field.skills.command('release',input);
  withDraws(field,[0,.96,.5],()=>field.skills.tick(dt,input,[]));
  const sprinkler=field.shots[0];assert.equal(sprinkler.entity,'10006');
  const m5=fieldFor(true),machine=m5.sprinkler;
  machine.hit(machine.config.PaintCapacity,2);machine.update(dt,m5,()=>[],()=>{},()=>{});
  // The original muzzle sits three units north of the M5 machine. Choose an
  // azimuth whose point on the random aim circle is due east of that muzzle.
  const [mx,my]=machine.spec.muzzle,dir=Math.asin(my/machine.config.AtkRange);
  withDraws(m5,[dir/(2*Math.PI),.5,.5],()=>machine.update(dt,m5,()=>[],()=>{},()=>{}));
  const launched=machine.shots[0];assert.equal(launched.entity,'10009');
  assert(Math.abs(launched.angle)<2*Math.PI/65536&&launched.range>8&&launched.range<13);
  assert(Math.abs(launched.x-mx-launched.travelled)<.0001&&Math.abs(launched.y-my)<.0001);
  const giant={...launched,x:mx,y:my,travelled:0,previousTravelled:0,left:launched.range,flightRemainder:0};
  const chargeRifle=fieldFor();chargeRifle.equip('3');chargeRifle.x=0;chargeRifle.y=0;
  chargeRifle.step(0,{...idle,distance:7,fire:true});
  const straight=chargeRifle.shots[0];assert.equal(straight.entity,'10003');
  assert.equal(straight.arc,0);
  // Hold RMB from a fresh W3 until it reports full charge, then release it.
  const charger=fieldFor();charger.equip('3');charger.x=0;charger.y=0;
  for(let i=0;i<180&&charger.charge<1;i++)charger.step(dt,{...idle,alt:true});
  assert.equal(charger.charge,1);charger.step(0,idle);
  const charged=charger.shots[0];assert.equal(charged.entity,'10008');assert.equal(charged.critical,true);
  const shotgun=fieldFor();shotgun.equip('4');shotgun.x=0;shotgun.y=0;
  withDraws(shotgun,Array(shotgun.w.ValueE*3).fill(.5),()=>shotgun.step(0,{...idle,fire:true}));
  assert.equal(shotgun.shots.length,9);
  const pellet=shotgun.shots.find(s=>s.angle===0);assert.equal(pellet?.entity,'10004');
  return {sprinkler,giant,straight,charged,pellet};
}
const shots=nativeShots(),results=[];
const wallAt=(x,y)=>[8,x,y,1,0,.04,.12,true,true];
const point=p=>({x:p.x,y:p.y});
const near=(a,b,message,epsilon=.002)=>assert(Math.abs(a-b)<=epsilon,`${message}: ${a} vs ${b}`);
function trial(name,template,{wall,target,player,team=1,shield=false,start,angle=0,frameTime=dt}={}){
  const machine=template.entity==='10009',f=fieldFor(machine,wall?[wall]:[],target);
  if(player){[f.x,f.y]=player;f.equip('4');}
  const shot={...template,x:start?.[0]??0,y:start?.[1]??0,travelled:0,previousTravelled:0,angle,team};
  const origin=point(shot),shieldHp=f.altWeapon.shieldHp;
  const source=machine?f.sprinkler:f;source.shots.push(shot);
  const hp=f.hp,events=[],markCounts=[];let frames=0,highest=0;
  while(source.shots.includes(shot)&&frames<180){
    f.step(frameTime,{...idle,alt:shield,angle:Math.PI});frames++;
    markCounts.push(f.paint.length);
    events.push(...f.skills.events);
    if(source.shots.includes(shot))highest=Math.max(highest,projectilePose(shot).y-origin.y);
  }
  assert(frames<180,name+' timed out');
  const splashes=events.filter(e=>e.type==='bullet-end');assert(splashes.length<=1);
  const dummyHits=events.filter(e=>e.type==='dummy-hit');
  const result={name,origin,frameTime,frames,highest,marks:f.paint.map(point),splash:splashes[0]??null,
    targetDamage:target?f.targets[0].zoneStats.Hp-f.targets[0].hp:0,
    playerDamage:hp-f.hp,shieldDamage:shieldHp-f.altWeapon.shieldHp,blocks:events.filter(e=>e.type==='shield-block').length,
    dummyHits:dummyHits.map(point)};
  if(['10004','10008'].includes(shot.entity))result.markCounts=markCounts;
  results.push(result);return result;
}
function ground(result,shot){
  assert.equal(result.splash?.end,'range',result.name);
  const end=Math.ceil(shot.range/(shot.speed*dt)-1e-8)*shot.speed*dt;
  near(result.splash.x,end,result.name+' ground center X');
  near(result.splash.y,0,result.name+' landing Y');
  assert.equal(result.marks.length,1);assert.deepEqual(result.marks[0],point(result.splash));
  near(result.highest,shot.arc/2,result.name+' peak',.006);
}
for(const shot of [shots.sprinkler,shots.giant]){
  const machine=shot.entity==='10009',half=shot.range/2,height=shot.arc/2;
  const prefix=machine?'M5':'E2';
  const hitOptions=machine?{player:[half,height],team:2}:{target:[half,height]};
  const hit=trial(prefix+' raised target',shot,hitOptions);
  assert.equal(machine?hit.playerDamage:hit.targetDamage,shot.damage,hit.name);
  assert.equal(hit.splash,null);assert.equal(hit.marks.length,1);
  assert(hit.marks[0].y>height*.65,'contact ink follows raised transform');
  if(!machine)assert.deepEqual(hit.dummyHits,[hit.marks[0]]);
  const high=trial(prefix+' raised wall',shot,{wall:wallAt(half,height)});
  assert.equal(high.splash?.end,'wall',high.name);
  // Colliders see a physics frame's transform. Decals/splash use the bullet center,
  // not the intersection between two frames or the unraised horizontal centerline.
  const step=shot.speed*dt,at=high.frames*step;
  near(high.splash.x,at,high.name+' frame center X');
  near(high.splash.y,height*Math.sin(Math.PI*at/shot.range),high.name+' frame center Y');
  assert.deepEqual(high.marks,[point(high.splash)]);
  const grouped=trial(prefix+' raised wall at 20 FPS',shot,{wall:wallAt(half,height),frameTime:1/20});
  assert.deepEqual(grouped.splash,high.splash);
  const split=trial(prefix+' raised wall at 120 FPS',shot,{wall:wallAt(half,height),frameTime:1/120});
  assert.deepEqual(split.splash,high.splash);
  ground(trial(prefix+' clears low wall',shot,{wall:wallAt(half,0)}),shot);
  ground(trial(prefix+' open ground',shot),shot);
}
const east=[2,0];
const straightWall=trial('straight shot at ground wall',shots.straight,{wall:wallAt(...east)});
assert.equal(straightWall.splash?.end,'wall');near(straightWall.splash.y,0,'straight wall Y');
near(straightWall.splash.x,straightWall.frames*dt*shots.straight.speed,'straight wall frame X');
assert.deepEqual(straightWall.marks,[point(straightWall.splash)]);
const enemy=trial('enemy straight shot',shots.straight,{player:east,team:2});
assert.equal(enemy.playerDamage,shots.straight.damage);assert.equal(enemy.splash,null);
const ally=trial('allied straight shot passes player',shots.straight,{player:east,team:1});
assert.equal(ally.playerDamage,0);ground(ally,shots.straight);
const blocked=trial('front shield takes enemy shot',shots.straight,{player:east,team:2,shield:true});
assert.equal(blocked.blocks,1);assert.equal(blocked.shieldDamage,shots.straight.damage);assert.equal(blocked.playerDamage,0);
assert.equal(blocked.splash,null);assert.deepEqual(blocked.marks,[]);
const sameMachine=trial('allied M5 shot passes player',shots.giant,{player:[shots.giant.range/2,shots.giant.arc/2],team:1});
assert.equal(sameMachine.playerDamage,0);ground(sameMachine,shots.giant);
const west=-Number(map.Width)/2;
const edge=trial('west edge wall clamps impact',shots.straight,{start:[west+.9,0],angle:Math.PI,wall:wallAt(west-.45,0)});
assert.equal(edge.splash?.end,'wall');near(edge.splash.x,west,'west clamped X');assert.deepEqual(edge.marks,[point(edge.splash)]);
const eastEdge=trial('east edge wall clamps splash outside the last grid cell',shots.straight,{start:[-west-.9,0],wall:wallAt(-west+.45,0)});
// MapManager.PaintToPosition checks the center's cell index after the world bounds.
assert.equal(eastEdge.splash?.end,'wall');near(eastEdge.splash.x,-west,'east clamped X');assert.deepEqual(eastEdge.marks,[]);
for(const shot of [shots.pellet,shots.charged]){
  const step=shot.speed*dt,ticks=Math.ceil(shot.range/step-1e-8);
  let baseline;
  for(const hz of [60,20,30,120]){
    const r=trial(shot.entity+' paint trail at '+hz+' FPS',shot,{frameTime:1/hz});
    assert.equal(r.splash?.end,'range');assert.equal(r.marks.length,ticks);
    r.markCounts.forEach((count,i)=>assert.equal(count,Math.min(ticks,Math.floor((i+1)*60/hz+1e-8)),r.name+' update '+i));
    r.marks.forEach((p,i)=>{near(p.x,(i+1)*step,r.name+' ground X');near(p.y,0,r.name+' ground Y');});
    assert.deepEqual(point(r.splash),r.marks.at(-1));
    if(baseline){assert.deepEqual(r.marks,baseline.marks);assert.deepEqual(r.splash,baseline.splash);}
    else baseline=r;
  }
}
// DummySystem.InitializeAttackingDummy copies Zone 17's SpreadDistance into
// the shooter stats; CreateBullet uses a second RNG draw after spread angle.
const shooter=lobby.trainingTargets.find(t=>t.zone==='17');
const yard=new LocalField(tables,tables.GameMap[0],{...lobby,trainingTargets:[shooter]},parameters,combat);
const dummyRanges=[0,.5,65535/65536].map(sample=>{
  yard.targets[0].nextShot=0;
  withDraws(yard,[.5,sample,.5],()=>yard.updateTargets(dt));
  return yard.shots.at(-1).range;
});
assert.deepEqual(dummyRanges,[501351/65536,8,547225/65536]);
const report={dummyRanges,procedure:'Node integration. Original E2 released via skill command, M5 charged and fired via its map object, W3 and W4 fired via normal input. The W4 trail replays the center pellet from its nine-shot fan. W3 charged through normal RMB hold and release. Controlled RNG at release only. Replayed those shots against separately positioned walls, original-radius stationary yard target, or player through unmodified LocalField.step (including GiantSprinkler.update). Variable render time supplies 60 physics steps per second.',
  limits:'Purpose-built physics fixtures, not a Windows runtime capture, online match, or a frame-by-frame Quantum fixed-point comparison. Flight scale and hit outcomes are checked independently of the rendering path.',
  shots:Object.fromEntries(Object.entries(shots).map(([k,v])=>[k,{entity:v.entity,range:v.range,arc:v.arc,speed:v.speed,damage:v.damage}])),results};
await writeFile(new URL('../verification/projectile-contacts.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`Passed ${results.length} projectile contact scenarios.`);
