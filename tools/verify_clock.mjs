import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CombatClock} from '../game/combat-clock.js';
import {quantumRandom} from '../game/quantum-random.js';
import {LocalField} from '../game/simulation.js';

async function readData(name) {
  return JSON.parse(await readFile(new URL('../data/' + name + '.json', import.meta.url)));
}
const [tables, yard, weapons, combat] = await Promise.all(
  ['tables', 'views/lobby', 'views/weapon-parameters', 'views/combat-evidence'].map(readData),
);
const map = tables.GameMap.find(row => row.ModeType === 'Lobby');
let baseline;
for (const refresh of [30, 60, 120]) {
  const field = new LocalField(tables, map, yard, weapons, combat, quantumRandom(123));
  field.equip('1');
  const clock = new CombatClock();
  const samples = [];
  for (let i = 0; i < refresh * 2; i++) {
    clock.advance(1 / refresh, (delta, frame) => {
      assert.equal(delta * 65536, 1092);
      field.step(delta, {
        dx: frame <= 60 ? 1 : 0, dy: frame <= 60 ? 0 : 1,
        angle: 0, distance: 6, fire: frame % 4 === 1,
      });
      samples.push([field.x, field.y, field.ink, field.shots.length, field.paint.length]);
    });
  }
  assert.equal(samples.length, 120);
  assert(samples.some(row => row[3] > 0));
  if (baseline) assert.deepEqual(samples, baseline);
  else baseline = samples;
}
console.log('Identical movement, ink, projectile and paint counts over 120 combat ticks at 30/60/120 Hz.');
