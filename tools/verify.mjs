import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {projectRoot, startCombatService} from './combat-service.mjs';

const suites = new Map([
  ['combat', ['clock', 'gameplay', 'damage', 'skills', 'weapon_alt', 'projectile_contacts']],
  ['shield', ['yard_shield', 'shield_room']],
  ['equipment', ['equipment_cards']],
]);
const suite = process.argv[2];
if (!suites.has(suite)) {
  throw new Error('Choose a test suite: ' + [...suites.keys()].join(', '));
}

function run(test, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/verify_' + test + '.mjs'], {
      env, cwd: projectRoot, stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(test + ' failed (' + (signal || code) + ')'));
    });
  });
}

await mkdir(new URL('../verification/', import.meta.url), {recursive: true});
const service = suite === 'combat' ? null : await startCombatService();
try {
  const env = service ? {...process.env, CHILLCAT_URL: service.url} : process.env;
  for (const test of suites.get(suite)) await run(test, env);
} finally {
  if (service) await service.stop();
}
