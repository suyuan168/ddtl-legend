// 把浏览器出图（下载后存到 C:\morihaishang\art\incoming\NNN.png，图里带 ddname 名字标记）按名字收进 art/raw/<名字>.png。
// 用法：node sync-raw.mjs [起始编号]
import { readdirSync, readFileSync, copyFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN = 'C:/morihaishang/art/incoming'; const OUT = join(ROOT, 'art/raw');
const from = Number(process.argv[2] || 436);
mkdirSync(OUT, { recursive: true });
function nameOf(b) {
  let p = 8;
  while (p < b.length - 12) { const len = b.readUInt32BE(p); const t = b.toString('ascii', p + 4, p + 8); if (t === 'tEXt') { const [k, v] = b.toString('latin1', p + 8, p + 8 + len).split('\0'); if (k === 'ddname') return v; } if (t === 'IDAT') return null; p += 12 + len; }
  return null;
}
let n = 0;
for (const f of readdirSync(IN).filter((x) => parseInt(x) >= from).sort()) {
  const src = join(IN, f); const b = readFileSync(src); if (b.toString('ascii', 1, 4) !== 'PNG' || b.readUInt32BE(16) < 8) continue;
  const name = nameOf(b); if (!name) continue; const dst = join(OUT, name + '.png');
  if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) continue;
  copyFileSync(src, dst); n++;
}
console.log('收进', n, '张；art/raw 共', readdirSync(OUT).length, '张');
