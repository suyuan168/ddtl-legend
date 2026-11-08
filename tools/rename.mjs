// 按 gamedata/names.csv 把原版名字换成原创名字：技能表、物品表、掉落表、出图映射。可重复运行。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import iconv from 'iconv-lite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pairs = readFileSync(join(ROOT, 'gamedata/names.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(','));
const map = Object.fromEntries(pairs.map(([, a, b]) => [a, b]));
// CSV：只换名字那一列（技能表第 2 列、物品表第 2 列）
for (const f of ['gamedata/mud2/DB/Magic.csv', 'gamedata/mud2/DB/StdItems.csv']) {
  const p = join(ROOT, f); let n = 0;
  const out = readFileSync(p, 'utf8').split(/\r?\n/).map((l, i) => { if (!i || !l) return l; const c = l.split(','); if (map[c[1]]) { c[1] = map[c[1]]; n++; } return c.join(','); }).join('\n');
  writeFileSync(p, out); console.log(f, '改名', n);
}
// 掉落表（GBK）和生成脚本里的物品名
const sub = (s) => s.replace(/(\S+)/g, (w) => map[w] || w);
const mi = join(ROOT, 'gamedata/Mir200/Envir/MonItems');
for (const f of readdirSync(mi)) { if (!/^(角兽|矿坑尸鬼|洞穴甲虫)\.txt$/.test(f)) continue; const p = join(mi, f); writeFileSync(p, iconv.encode(sub(iconv.decode(readFileSync(p), 'gbk')), 'gbk')); }
for (const f of ['tools/make-data.mjs', 'tools/pack-items.mjs']) { const p = join(ROOT, f); let s = readFileSync(p, 'utf8'); for (const [a, b] of Object.entries(map)) s = s.split("'" + a).join("'" + b).split(' ' + a + "'").join(' ' + b + "'"); writeFileSync(p, s); }
console.log('完成');
