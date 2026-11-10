// Pin RNG only in this isolated simulation. Both targets and attacks use the browser game's LocalField.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {LocalField} from '../game/simulation.js';
import {quantumRandom} from '../game/quantum-random.js';
import {damageAt} from '../game/damage.js';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n+'.json',import.meta.url)));
const tables=read('tables'),map=tables.GameMap[0],yard=read('views/lobby');
const params=read('views/weapon-parameters'),combat=read('views/combat-evidence');
const input={dx:0,dy:0,angle:0,distance:6};
const rows=[];
function arena(targetX,targetY,wall){
  const model=yard.trainingTargets.find(row=>row.zone==='17');
  const field=new LocalField(tables,map,{...yard,lobbySpawn:[0,0],physics:wall?[wall]:[],bombShapes:wall?[wall]:[],
    paintShapes:[],itemStations:[],trainingTargets:[{...model,x:targetX,y:targetY}]},params,combat,quantumRandom(0));
  const target=field.targets[0];target.nextShot=1e6;
  const hits=[];
  const apply=field.damageTarget.bind(field);
  field.damageTarget=(t,damage)=>{
    const hp=t.hp;apply(t,damage);if(t.hp<hp)hits.push({from:hp,to:t.hp,amount:damage});
  };
  return {field,target,hits};
}
function untilHit(a,seconds=4){
  for(let i=0;i<seconds*120&&!a.hits.length;i++)a.field.step(1/120,input);
  assert(a.hits.length,'no hit: '+a.field.weapon.Enum+' / '+a.field.skills.ult?.Enum);
  return a.hits[0];
}
function check(label,a,expected){
  const first=untilHit(a);
  assert.equal(first.amount,expected,label);
  assert.equal(first.from-first.to,Math.min(first.from,expected),label);
  rows.push({label,firstHit:first});
}
{
  for(const [id,expected] of [['1',2],['2',3],['3',4],['4',3],['5',2]]){
    const a=arena(3,0);a.field.equip(id);
    a.field.step(1/120,{...input,fire:true});
    check('weapon-'+id,a,expected);
  }
  const charged=arena(3,0);charged.field.equip('3');
  for(let i=0;i<146;i++)charged.field.step(1/120,{...input,alt:true});
  charged.field.step(1/120,input);check('weapon-3-full-charge',charged,20);
  const roller=arena(2,0);roller.field.equip('5');
  for(let i=0;i<60&&!roller.hits.length;i++)roller.field.step(1/120,{...input,alt:true});
  check('weapon-5-rolling',roller,20);
  const Es=[['1','1',3,3,20],['2','2',-2,0,2],['3','1',3,0,5],['4','4',3,3,8],['5','1',3,3,4]];
  for(const [id,w,x,distance,damage] of Es){
    const a=arena(x,0);a.field.equip(w,{bomb:id});
    if(id==='2')a.field.rng=quantumRandom(2); // First spray points towards the dummy left of the emitter.
    a.field.step(1/120,{...input,distance,actions:['bomb','release']});
    check('E-'+id,a,damage);
  }
  for(const [id,w,x,damage] of [['1001','1',3,4],['1002','2',6,3],['1003','3',6,20],['1004','1',6,10]]){
    const a=arena(x,0);a.field.equip(w,{ultimate:id});a.field.skills.points=a.field.player.UltCapacity;
    // Seed 6 puts the first locked missile within the native full-damage inner radius.
    if(id==='1003')a.field.rng=quantumRandom(6);
    a.field.step(1/120,{...input,actions:['ultimate','press']});
    check('Q-'+id,a,damage);
  }
  const laserPulses=[];
  for(const fps of [30,60,120]){
    const a=arena(6,0);a.field.equip('2',{ultimate:'1002'});a.field.skills.points=a.field.player.UltCapacity;
    let pulses=0,shots=0;
    for(let i=0;i<2*fps;i++){
      a.field.step(1/fps,{...input,actions:i?[]:['ultimate','press']});
      pulses+=a.field.skills.hits.filter(h=>h.aimHit).length;
      shots+=a.field.skills.events.filter(e=>e.type==='shoot').length;
    }
    assert.equal(pulses,34);assert.equal(shots,1);
    assert.equal(a.target.hp,0);assert(a.target.respawn>0);assert(a.hits.every(h=>h.amount===3));
    laserPulses.push({fps,pulses,shots,hits:a.hits});
  }
  // Cap, side and end-corner of W_1002's oriented 20 x 1.39999 box.
  const beam={x:0,y:0,angle:0,length:20,radius:Math.trunc(1.4*65536)/131072,damage:3};
  assert.equal(damageAt(beam,{x:20.3,y:0},.35),3);
  assert.equal(damageAt(beam,{x:10,y:1.06},.35),0);
  assert.equal(damageAt(beam,{x:20.25,y:.94},.35),3);
  assert.equal(damageAt(beam,{x:20.27,y:.97},.35),0);
  const torpedo=arena(3,0);torpedo.field.equip('4',{bomb:'4'});
  for(let i=0;i<360;i++)torpedo.field.step(1/120,{...input,distance:0,actions:i?[]:['bomb','release']});
  assert.deepEqual(torpedo.hits.map(hit=>hit.amount),[8,8],'torpedo collision followed by its separate proximity blast');
  const wall=[4,4,0,1,0,.2,4,true,true];
  function rocket(wall,targetX){
    const a=arena(targetX,0,wall);a.field.equip('1',{ultimate:'1004'});a.field.skills.points=a.field.player.UltCapacity;
    for(let i=0;i<240;i++){
      a.field.step(1/120,{...input,distance:12,actions:i?[]:['ultimate','press']});
      const explosion=a.field.skills.events.find(e=>e.type==='explode');
      if(explosion)return {x:explosion.x,damage:a.hits[0]?.amount||0};
    }
    assert.fail('missing Q-1004 detonation');
  }
  const onWall=rocket(wall,7),onTarget=rocket(null,4);
  assert(Math.abs(onWall.x-(4-.2-combat.bazookaRadius))<1e-5);
  assert(onWall.damage>5&&onWall.damage<10,'blast reaches the player behind the wall with distance falloff');
  assert(Math.abs(onTarget.x-(4-combat.bazookaRadius-.86))<.02);
  assert.equal(onTarget.damage,10);
  const aoe={x:0,y:0,radius:3,damage:20,inner:1.5,floor:.5};
  for(const [x,expect] of [[0,20],[1.5,20],[2.25,15],[3.1,10],[4,0]])assert.equal(damageAt(aoe,{x,y:0},.65),expect);
  const report={scope:'Isolated H5 simulation, controlled RNG, original Yard attack-dummy HP/radius, fixed poses, first damaging hit. Not a Windows frame replay.',rows,laserPulses,torpedoContactThenBlast:torpedo.hits,rocketWall:onWall,rocketTarget:onTarget,sourceRVAs:combat.damageRVAs};
  writeFileSync(new URL('../verification/damage-simulation.json',import.meta.url),JSON.stringify(report,null,2));
  console.log('Passed',rows.length,'actual attack / HP loss cases, explosion falloff, laser edges, Q rocket wall and player impacts.');
}
