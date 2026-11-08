// 拆包：Downloads 里出现 ddbundle*.json（{名字: dataURL}）就拆成一张张 PNG 放回 Downloads，下载监视器照常收
import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
const DL = 'C:/Users/suyun/Downloads';
setInterval(() => {
  for (const f of readdirSync(DL)) {
    if (!/^ddbundle.*\.json$/.test(f)) continue;
    try { const m = JSON.parse(readFileSync(DL + '/' + f, 'utf8')); let n = 0;
      for (const [k, v] of Object.entries(m)) { writeFileSync(DL + '/' + k.replace(/[^\w.-]/g, '_'), Buffer.from(v.split(',')[1], 'base64')); n++; }
      renameSync(DL + '/' + f, DL + '/' + f + '.done'); console.log('unpacked', f, n);
    } catch (e) { /* 还没写完 */ }
  }
}, 2000);
