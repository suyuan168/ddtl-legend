// 界面字体：思源宋体 CN Heavy（Adobe，SIL OFL 1.1，可商用，许可见 art/fonts/LICENSE.txt）
// 只保留前端源码里出现的字 + GB2312 一级常用字 3755 个（玩家起名也够用），输出 woff2。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import iconv from 'iconv-lite';
const require = createRequire('C:/morihaishang/package.json');
const subsetFont = require('subset-font');
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const chars = new Set('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,:;!?%/+-()（）「」，。、：！？·…—'.split(''));
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(mjs|js|json|csv)$/.test(f)) for (const ch of readFileSync(p, 'utf8')) if (ch.charCodeAt(0) > 0x2e80) chars.add(ch); } };
walk(join(ROOT, 'frontend')); walk(join(ROOT, 'gamedata/mud2/DB'));
for (let hi = 0xb0; hi <= 0xd7; hi++) for (let lo = 0xa1; lo <= 0xfe; lo++) { if (hi === 0xd7 && lo > 0xf9) break; const s = iconv.decode(Buffer.from([hi, lo]), 'gbk'); if (s && s !== '\ufffd') chars.add(s); }
const src = readFileSync(join(ROOT, 'art/fonts/SourceHanSerifCN-Heavy.otf'));
const out = await subsetFont(src, [...chars].join(''), { targetFormat: 'woff2' });
writeFileSync(join(ROOT, 'frontend/assets/fonts/ddserif.woff2'), out);
console.log('字数', chars.size, '字体', Math.round(out.length / 1024) + 'KB');
