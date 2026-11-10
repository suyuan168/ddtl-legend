// 拆包：Downloads 里出现 ddbundle*.json（{名字: 带名字标记的 PNG dataURL}）就拆开，直接按新编号放进 art/incoming（sync-raw.mjs 按标记收图）
import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
const DL = 'C:/Users/suyun/Downloads'; const IN = 'C:/morihaishang/art/incoming';
const next = () => Math.max(0, ...readdirSync(IN).map((f) => parseInt(f)).filter((x) => x > 0)) + 1;
setInterval(() => {
  for (const f of readdirSync(DL)) {
    if (!/^ddbundle.*\.json$/.test(f)) continue;
    try { const m = JSON.parse(readFileSync(DL + '/' + f, 'utf8')); let n = next(); let c = 0;
      for (const v of Object.values(m)) { writeFileSync(IN + '/' + String(n++).padStart(3, '0') + '.png', Buffer.from(v.split(',')[1], 'base64')); c++; }
      renameSync(DL + '/' + f, DL + '/' + f + '.done'); console.log('unpacked', f, c);
    } catch (e) { /* 还没写完 */ }
  }
}, 2000);
