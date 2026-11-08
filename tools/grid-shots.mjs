// 把一个目录里的截图拼成带文件名的网格图，方便一次看完。用法：node grid-shots.mjs <目录> <输出.png>
import sharp from 'sharp'; import fs from 'node:fs';
const [dir, out] = process.argv.slice(2); const fs_ = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
const W = 300, H = 210, C = 5; const comps = [];
for (let i = 0; i < fs_.length; i++) { const b = await sharp(dir + '/' + fs_[i]).resize(W, H).composite([{ input: Buffer.from(`<svg width="${W}" height="24"><rect width="${W}" height="24" fill="#000a"/><text x="6" y="17" font-size="15" fill="#ff0">${fs_[i]}</text></svg>`), left: 0, top: 0 }]).png().toBuffer(); comps.push({ input: b, left: (i % C) * W, top: Math.floor(i / C) * H }); }
await sharp({ create: { width: W * C, height: H * Math.ceil(fs_.length / C), channels: 3, background: '#000' } }).composite(comps).png().toFile(out);
