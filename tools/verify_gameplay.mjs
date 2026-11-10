import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalField,muzzlePosition} from '../game/simulation.js';
const data=name=>JSON.parse(readFileSync(new URL('../data/'+name+'.json',import.meta.url)));
const tables=data('tables'),params=data('views/weapon-parameters'),combat=data('views/combat-evidence');
const close=(a,b,eps=1e-4)=>assert.ok(Math.abs(a-b)<=eps,JSON.stringify({a,b,eps}));
for(const map of tables.GameMap){
  const view=data('views/'+(map.ModeType==='Lobby'?'lobby':map.MapData));
  const f=new LocalField(tables,map,view,params,combat);
  close(view.playerRadius,42598/65536);assert(view.physics.length>0);
  for(const direction of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const x=13,y=2,off=params.W_1.muzzlePos;
    const out=muzzlePosition(x,y,direction,off),dx=out.x-x,dy=out.y-y;
    close(dx*Math.cos(direction)+dy*Math.sin(direction),-off.x);
    close(-dx*Math.sin(direction)+dy*Math.cos(direction),Math.trunc(Math.cos(direction)*65536)>0?off.y:-off.y);
  }
  assert.deepEqual(muzzlePosition(13,2,0,params.W_1.muzzlePos,0),{x:13,y:2});
  for(const w of tables.Weapon.filter(w=>w.WeaponType==='Normal')){
    const test=new LocalField(tables,map,view,params,combat);test.equip(w.Id);
    const ownShots=()=>test.shots.filter(shot=>shot.entity===test.weapon.BulletID).length;
    test.step(0,{dx:0,dy:0,angle:Math.PI,fire:true});
    assert.equal(test.ink,test.w.PaintCapacity-test.w.PaintCost);
    if(w.Id==='5'){
      assert.equal(ownShots(),0);
      const delay=test.fanWait;assert.equal(delay,Math.trunc(params.W_5.atkDelayTime*65536));
      test.step((delay-1)/65536,{dx:0,dy:0,angle:Math.PI});assert.equal(ownShots(),0);
      test.step(1/65536,{dx:0,dy:0,angle:Math.PI});
    }
    assert.equal(ownShots(),['4','5'].includes(w.Id)?test.w.ValueE:1);
  }
}
const map=tables.GameMap[1],view=data('views/'+map.MapData);
const roll=new LocalField(tables,map,view,params,combat);roll.equip('5');
roll.x=10;roll.y=8;
const right={dx:0,dy:0,angle:Math.PI,alt:true};
roll.step(0,right);close(roll.ink,85);assert.equal(roll.paint.length,0);
roll.step((combat.roller.periodRaw-1)/65536,right);assert.equal(roll.paint.length,0);
roll.step(1/65536,right);assert.equal(roll.paint.length,1);close(roll.ink,83.8);
close(roll.paint[0].size,1.7);assert.equal(roll.rollHits[0].damage,20);
console.log('Passed five maps, five weapons, four muzzle directions, zero aim, roller activation, tick and damage values.');

const sniper=new LocalField(tables,map,view,params,combat);sniper.equip('3');
// Each .01-second tick is truncated to 16.16 before accumulation. Release only at full charge.
for(let i=0;i<150&&sniper.charge<1;i++)sniper.step(.01,{dx:0,dy:0,angle:0,alt:true});
assert.equal(sniper.charge,1);
sniper.step(0,{dx:0,dy:0,angle:0,alt:false});
assert.equal(sniper.shots.length,1);close(sniper.shots[0].damage,20);
close(sniper.shots[0].size,2);close(sniper.shots[0].speed,2.5*sniper.projectile.MoveSpeed);
close(sniper.ink,60);close(sniper.charge,0);
console.log('Charge Rifle release uses all five original W_3 curves.');

// W_3.FireAndReset validates the aim before paying, while W_3.Attack pays first.
const centered=new LocalField(tables,map,view,params,combat);centered.equip('3');
const atPlayer={dx:0,dy:0,angle:0,distance:0};
for(let i=0;i<90&&centered.charge<1;i++)centered.step(1/60,{...atPlayer,alt:true});
assert.equal(centered.charge,1);
centered.step(0,atPlayer);
assert.equal(centered.shots.length,0,'aiming at the player cannot create a charged shot');
assert.equal(centered.ink,100);
assert.equal(centered.altWeapon.charges,1);
assert(centered.cooldown<=0);
assert.equal(centered.charge,0);
assert(!centered.skills.events.some(e=>e.type==='weapon-fire'));
centered.step(0,{...atPlayer,fire:true});
assert.equal(centered.ink,60,'regular left click still spends the shot cost at zero aim');
assert.equal(centered.shots.length,0);
console.log('Charge Rifle resets a directionless charge without using ink or a charge.');

// ControlSystem.ApplyInput's Q16 squared-length gate precedes EntityComponent.Move's normalization.
const analog=new LocalField(tables,map,{...view,physics:[],trainingTargets:[],triggerZones:[]},params,combat);
for(const [dx,dy,expectedSpeed] of [[.04,0,0],[.1,0,0],[.101,0,7],[0,-.5,7],[.5,.5,7],[1,1,7]]){
  analog.x=0;analog.y=0;
  analog.step(1/60,{dx,dy,angle:0});
  close(Math.hypot(analog.x,analog.y)*60,expectedSpeed);
  if(expectedSpeed)close(Math.atan2(analog.y,analog.x),Math.atan2(dy,dx));
}
console.log('Analog stick ignores the native dead zone and walks at full speed above it.');
// W_2.AltAttack checks each squared component rounded separately. This pair
// would cross the threshold if the full squared length were rounded only once.
analog.equip('2');
analog.step(1/60,{dx:-1,dy:0,angle:0});
analog.step(1/60,{dx:5000/65536,dy:4238/65536,angle:0});
assert.deepEqual([analog.altWeapon.moveX,analog.altWeapon.moveY],[-1,0]);

const cleanField=new LocalField(tables,map,{...view,paintShapes:[]},params,combat);
const painted=new Set();
cleanField.eachPaintCell({x:.25,y:.25,size:1},i=>painted.add(i));
assert.equal(painted.size,13,'one-world-unit radius on the original half-unit grid');
const base=view.paintShapes.find(shape=>shape[7]===2);
roll.paint.length=0;
roll.splat(base[1],base[2],2);assert.equal(roll.paint.length,0,'base-center paint event must be suppressed');
console.log('Verified native radius/diameter interpretation, boundary cells and spawn-zone exclusion.');

const {FieldCamera}=await import('../game/camera.js');
const camera=new FieldCamera(data('views/camera')),rifle=tables.WeaponAsset.find(w=>w.Id==='3');
camera.update(.4,rifle,true,0,1);
close(camera.size.value,Number(rifle.CamSize));close(camera.x.value,1.2);close(camera.y.value,0);
camera.update(.4,rifle,false,0,1);close(camera.size.value,10);close(camera.x.value,0);
console.log('Verified rifle-camera default, charged size, aim offset and release.');
