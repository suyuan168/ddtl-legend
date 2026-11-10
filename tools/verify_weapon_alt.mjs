import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {LocalField} from '../game/simulation.js';
import {WeaponAlt} from '../game/weapon-alt.js';

const read = name => JSON.parse(readFileSync(new URL('../data/'+name+'.json',import.meta.url)));
const tables = read('tables'), yard = read('views/lobby'), combat = read('views/combat-evidence');
const map = tables.GameMap[0], params = read('views/weapon-parameters');
const idle = {dx:0,dy:0,angle:0,distance:5,alt:false};
const right = {...idle,alt:true};
const wall = (x,passable) => [4,x,0,1,0,.25,1,true,true,false,passable];
const rows = [];
function arena(id,physics=[],decoShapes=physics.map(s=>s.slice(0,7))) {
  const field = new LocalField(tables,map,{...yard,physics,decoShapes,lobbySpawn:[0,0],
    trainingTargets:[],paintShapes:[],itemStations:[]},params,combat);
  field.equip(id);
  return {field,alt:new WeaponAlt(field)};
}

{
  const {field,alt} = arena('2',[wall(1,true)]);
  assert.equal(alt.step(.01,right),false);
  assert.equal(alt.charges,2);
  alt.step(.01,{...idle,dx:1});
  assert.equal(alt.step(.01,{...right,angle:Math.PI}),true);
  assert.equal(alt.charges,1);
  assert(alt.passing && alt.invincible);
  assert.equal(field.paint.length,0);
  for (let i=0;i<25;i++) alt.step(.01,idle);
  assert.equal(alt.passing,false);
  assert.equal(alt.invincible,false);
  assert.equal(field.x,1.25+field.view.playerRadius);
  assert.equal(field.paint.length,1);
  assert.equal(field.paint[0].x,field.x);
  assert.equal(field.paint[0].size,2);
  assert.equal(field.ink,field.w.PaintCapacity);
  assert.equal(field.shots.length,0);
  alt.step(2,idle);
  assert.equal(alt.charges,2);
  rows.push({weapon:'W_2',exitX:field.x,paintRadius:field.paint[0].size,projectiles:field.shots.length});
}
for (const [name,physics] of [['empty',[]],['solid',[wall(1,false)]],
  ['non-passable beyond passable',[wall(1,true),wall(3,false)]],['outside range',[wall(5,true)]]]) {
  const {alt}=arena('2',physics);
  assert.equal(alt.step(1/60,{...right,dx:1}),false,name);
  assert.equal(alt.charges,2,name);
}
{
  const {field,alt}=arena('4');
  alt.step(1/60,right);
  const front={damage:3,angle:Math.PI};
  assert(alt.shield);
  assert.equal(alt.shieldHp,30);
  assert.equal(alt.block(front,.4,0),true);
  assert.equal(alt.shieldHp,27);
  assert.equal(alt.block(front,-.4,0),false);
  assert.equal(alt.block({...front,angle:0},.4,0),false);
  assert.equal(alt.block({...front,angle:Math.PI*.60},.4,0),false);
  assert.equal(alt.block({...front,angle:Math.PI*.75},.4,0),true);
  assert.equal(alt.block({...front,blockable:false},.4,0),false);
  assert.equal(alt.shieldHp,24);
  alt.step(1,idle);
  assert.equal(alt.shieldHp,26);
  assert.equal(alt.speedFactor,1);
  alt.step(1,right);
  assert.equal(alt.shieldHp,26);
  assert.equal(alt.speedFactor,1-39324/65536);
  assert.equal(alt.block({...front,damage:100},.4,0),true);
  assert.equal(alt.shield,false);
  assert.equal(alt.shieldHp,30);
  assert.equal(alt.charges,0);
  alt.step(6.9,right);
  assert.equal(alt.shield,false);
  alt.step(.11,right);
  assert(alt.shield);
  assert.equal(alt.charges,1);
  assert.equal(field.shots.length,0);
  rows.push({weapon:'W_4',maxHp:30,frontAbsorbed:3,regeneration:2,rechargeSeconds:7});
}
const report = {tests:rows,source:combat.secondaryRVAs,
  shotDownCallbacks:{E_2:'explode',E_3:'despawn',E_4:'despawn',E_5:'despawn',E_6:'OnAttacked before despawn'},
  limitations:['Synthetic center-line casts use JavaScript arithmetic; corner-by-corner Quantum physics parity is unmeasured.',
    'For live entity-target filtering and original E callbacks see verify_room_deployables.mjs.']};
writeFileSync(new URL('../verification/damage-secondary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(rows));
