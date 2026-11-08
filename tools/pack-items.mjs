// 物品图标：按物品表的外观号（Looks）排进两套图集：dnitems（地上掉落，小）和 items（背包、快捷格，大）。
// 金币堆用外观号 9999。用法：node pack-items.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'art/raw'); const OUT = join(ROOT, 'ddres/Data');
// 物品名 → 图标（物品名暂用现有物品表的名字，改名时这里一起改）
const MAP = {
  '金创药(小量)': 'it_hp_s', '金创药(中量)': 'it_hp_m', '强效金创药': 'it_hp_m',
  '魔法药(小量)': 'it_mp_s', '魔法药(中量)': 'it_mp_m', '强效魔法药': 'it_mp_m',
  '木剑': 'it_sword_wood', '青铜剑': 'it_sword_bronze', '铁剑': 'it_sword_iron', '短剑': 'it_sword_bronze',
  '布衣(男)': 'it_armor_cloth', '布衣(女)': 'it_armor_cloth', '青铜头盔': 'it_helmet_bronze',
  '乌木剑': 'it_staff', '回城卷': 'it_scroll', '随机传送卷': 'it_scroll',
};
const rows = readFileSync(join(ROOT, 'gamedata/mud2/DB/StdItems.csv'), 'utf8').split(/\r?\n/).slice(1).map((l) => l.split(','));
const looksOf = {}; for (const r of rows) if (r[1]) looksOf[r[1]] = Number(r[8]);
const want = new Map(); // looks → icon
for (const [name, icon] of Object.entries(MAP)) if (looksOf[name] != null && existsSync(join(RAW, icon + '.png'))) want.set(looksOf[name], icon);
if (existsSync(join(RAW, 'it_gold.png'))) want.set(9999, 'it_gold');
async function atlas(name, size) {
  const json = { image: name + '.png', frames: {} }; const comps = []; let i = 0;
  for (const [looks, icon] of want) {
    const buf = await sharp(join(RAW, icon + '.png')).trim({ threshold: 10 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const x = (i % 16) * size; const y = Math.floor(i / 16) * size; comps.push({ input: buf, left: x, top: y }); json.frames[looks] = [x, y, size, size, 0, 0]; i++;
  }
  if (!i) return;
  mkdirSync(OUT, { recursive: true });
  await sharp({ create: { width: 16 * size, height: Math.ceil(i / 16) * size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(join(OUT, name + '.png'));
  writeFileSync(join(OUT, name + '.json'), JSON.stringify(json));
  console.log(name, i, '个图标');
}
await atlas('dnitems', 34); await atlas('items', 48);
writeFileSync(join(ROOT, 'frontend/assets/ui/itemlooks.json'), JSON.stringify(Object.fromEntries([...want].map(([l, k]) => [k, l]))));
