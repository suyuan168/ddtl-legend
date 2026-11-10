import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalField} from '../game/simulation.js';
import {quantumRandom} from '../game/quantum-random.js';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n+'.json',import.meta.url)));
const tables=read('tables'),map=tables.GameMap[1],scene=read('views/'+map.MapData),combat=read('views/combat-evidence'),params=read('views/weapon-parameters');
const input={dx:0,dy:0,angle:0,distance:5};
const field=()=>new LocalField(tables,map,{...scene,lobbySpawn:[0,0],physics:[],bombShapes:[],paintShapes:[]},params,combat);
const f=field();f.ink=0;f.step(.1,input);assert(Math.abs(f.ink-.3)<1e-8);
const idx=Math.floor(f.height/2/f.cell)*f.columns+Math.floor(f.width/2/f.cell);
f.grid[idx]=f.team;f.ink=0;f.step(.1,input);assert(Math.abs(f.ink-.3)<1e-8,'stationary recolor retains the sampled cell');
f.x=.125;f.ink=0;f.step(.1,input);assert.equal(f.ink,1);
f.step(0,{...input,boost:true});f.step((0x2b83-1)/65536,{...input,boost:true});assert(!f.boosting);
f.step(1/65536,{...input,boost:true});assert(f.submerged);
f.ink=0;f.step(.01,{...input,boost:true,dx:1});assert.equal(f.x,.125+.105);assert(Math.abs(f.ink-.7)<1e-8);
f.step(0,input);assert(!f.boosting);f.grid[idx]=2;f.x=0;f.step(.1,{...input,dx:1});assert.equal(f.x,.525);
for(const row of tables.Skill){
 const g=field(),weapon=tables.Weapon.find(w=>w.SkillList?.split('|').includes(row.Id)&&w.WeaponType==='Normal');
 g.equip(weapon.Id,{[row.SkillType==='Bomb'?'bomb':'ultimate']:row.Id});
 const s=g.skills;
 if(row.SkillType==='Bomb'){
  g.step(0,{...input,actions:['bomb']});assert(s.armed);g.step(0,{...input,actions:['bomb']});assert(!s.armed);
  g.step(0,{...input,actions:['bomb','release']});assert.equal(s.objects.length,1);assert.equal(g.ink,g.w.PaintCapacity-s.b.PaintSkillCost);assert(!s.armed);
 }else{
  g.step(0,{...input,actions:['ultimate']});assert.equal(s.remaining,0);
  g.splat(0,0,5);const credit=s.points;g.splat(0,0,5);assert(credit>0&&s.points===credit);
  for(let y=-20;y<=20;y+=5)for(let x=-20;x<=20;x+=5)g.splat(x,y,4);
  assert.equal(s.points,g.player.UltCapacity);g.paint.length=0;g.step(1/60,{...input,actions:['ultimate'],fire:true});
  assert(s.remaining>0&&s.points===0);assert(s.hits.length||s.objects.length||s.pendingShot||s.volley);
 }
 let painted=g.paint.length>0;
 for(let i=0;i<500;i++){g.step(.02,input);if(g.paint.length)painted=true;}
 assert(painted,'no paint from '+row.Enum);assert.equal(s.objects.length,0);assert.equal(s.remaining,0);
}
// Released at the player's feet: the explosion event must survive a zero-length throw.
for(const [id,weapon] of [['1','1'],['4','4'],['5','1']]){
 const g=field();g.equip(weapon,{bomb:id});let blasts=0;
 for(let i=0;i<400;i++){
   g.step(.02,{...input,distance:0,actions:i===0?['bomb','release']:[]});
   blasts+=g.skills.events.filter(e=>e.type==='explode').length;
 }
 assert.equal(blasts,1,'Point-blank E '+id);
}
// The compiled ValueD is 6553/65536. Ten reversals still fall below full charge.
// SK_5.ReleaseSkill adds at least one extra hop for any positive charge, up to three at full charge.
for(const [reversals,expected] of [[1,2],[10,3],[11,4]]){
 const g=field();g.equip('1',{bomb:'5'});g.step(.02,{...input,actions:['bomb'],dx:1});
 for(let i=0;i<reversals;i++)g.step(.05,{...input,dx:i%2?1:-1});
 let blasts=0;
 for(let i=0;i<300;i++){g.step(.02,{...input,actions:i===0?['release']:[]});blasts+=g.skills.events.filter(e=>e.type==='explode').length;}
 assert.equal(blasts,expected);
}
const rocket=field(),target={x:0,y:3};rocket.equip('4',{bomb:'4'});
rocket.step(.01,{...input,distance:0,actions:['bomb','release'],targets:[target]});
for(let i=0;i<55;i++)rocket.step(.01,{...input,targets:[target]});
assert.equal(rocket.skills.objects[0].target,undefined);
let chased=false,detonated=false;
for(let i=0;i<80;i++){rocket.step(.01,{...input,targets:[target]});chased||=rocket.skills.objects[0]?.target===target;
 detonated||=rocket.skills.events.some(e=>e.type==='explode'&&Math.hypot(e.x-target.x,e.y-target.y)<.3);}
assert(chased&&detonated);
console.log('Verified point-blank E 1/4/5 explosions, shaken E 5 chains of two/four blasts, E 4 delay and contact explosion.');
console.log('Verified skate startup, release, own/enemy speed and refill, all five bomb casts and four charged special activations through shared simulation.');

// MeteorMissileComponent acquires up to five enemy centers, with last-known positions retained across concealment.
{
 const g=field();g.equip('3',{ultimate:'1003'});const skill=g.skills;
 const enemy=x=>({x,y:0,zones:{bush:-1},radius:.5});
 const targets=[enemy(17.001),enemy(17),enemy(2),enemy(3),enemy(4),enemy(5),enemy(6)];
 skill.points=g.player.UltCapacity;
 skill.tick(0,{...input,actions:['ultimate']},targets);
 assert.deepEqual(skill.missileLocks,targets.slice(1,6));
 targets[1].zones.bush=8;targets[1].x=12;
 skill.tick(0,input,targets);
 assert.equal(skill.missilePositions[0].x,17);assert(!skill.missileLocks.includes(targets[1]));
 g.zones.bush=8;skill.tick(0,input,targets);assert.equal(skill.missilePositions[0].x,12);
 targets[1].respawn=3;skill.tick(0,input,targets);assert.equal(skill.missilePositions[0].target,null);
 assert.equal(skill.missilePositions.length,5);assert.equal(skill.missileLocks.length,4);
 // First unlocked strike in GameAssembly.dll with seed 0, relative to its owner.
 const alone=field();alone.equip('3',{ultimate:'1003'});const s=alone.skills;s.points=alone.player.UltCapacity;
 alone.rng=quantumRandom(0);
 s.tick(0,{...input,actions:['ultimate','press']},[]);
 s.updateSpecialShots(s.volley.delay);
 const o=s.objects[0];assert.deepEqual([o.x*65536,o.y*65536],[-56176,2552]);
}
