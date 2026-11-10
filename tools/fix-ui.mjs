// 整理 GPT 出的界面图：液体球按主色找出圆形区域裁成正方形；球框量出中间空洞的圆心和半径（写进 ui.json 给界面对齐）。
import sharp from 'sharp';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
const RAW = '../art/raw/'; const OUT = '../frontend/assets/ui/';
const meta = existsSync(OUT + 'ui.json') ? JSON.parse(readFileSync(OUT + 'ui.json', 'utf8')) : {};
async function orb(name, test) {
  if (!existsSync(RAW + name + '.png')) return;
  const { data, info } = await sharp(RAW + name + '.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const o = (y * info.width + x) * 4; if (data[o + 3] > 200 && test(data[o], data[o + 1], data[o + 2])) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const d = Math.min(x1 - x0, y1 - y0); const cx = (x0 + x1) / 2; const cy = y0 + d / 2;
  await sharp(RAW + name + '.png').extract({ left: Math.round(cx - d / 2), top: Math.round(cy - d / 2), width: Math.round(d), height: Math.round(d) }).resize(256, 256).png().toFile(OUT + name + '.png');
  console.log(name, '球体', Math.round(d));
}
await orb('hud_orb_red', (r, g, b) => r > 90 && r > g * 1.8 && r > b * 1.8);
await orb('hud_orb_blue', (r, g, b) => b > 90 && b > r * 1.5);
if (existsSync(RAW + 'hud_orb_frame.png')) {
  const { data, info } = await sharp(RAW + 'hud_orb_frame.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = (x, y) => data[(y * info.width + x) * 4 + 3];
  // 从图中心往四个方向找第一处不透明 → 空洞边界
  let cx = info.width / 2, cy = info.height / 2;
  for (let it = 0; it < 3; it++) {
    const scan = (dx, dy) => { let x = Math.round(cx), y = Math.round(cy); while (x > 0 && y > 0 && x < info.width - 1 && y < info.height - 1 && a(x, y) < 40) { x += dx; y += dy; } return [x, y]; };
    const [l] = scan(-1, 0); const [r] = scan(1, 0); const [, t] = scan(0, -1); const [, b] = scan(0, 1);
    cx = (l + r) / 2; cy = (t + b) / 2; meta.frame = { w: info.width, h: info.height, cx, cy, r: Math.min(r - l, b - t) / 2 };
  }
  await sharp(RAW + 'hud_orb_frame.png').png().toFile(OUT + 'hud_orb_frame.png');
  console.log('球框', JSON.stringify(meta.frame));
}
for (const k of ['hud_panel', 'hud_btn']) if (existsSync(RAW + k + '.png')) await sharp(RAW + k + '.png').trim({ threshold: 8 }).png().toFile(OUT + k + '.png');
writeFileSync(OUT + 'ui.json', JSON.stringify(meta));
// 红球直接用蓝球换色（GPT 出的红球底下带了棋盘格）
if (existsSync(OUT + 'hud_orb_blue.png')) {
  const { data, info } = await sharp(OUT + 'hud_orb_blue.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) { const r = data[i], g = data[i + 1], b = data[i + 2]; data[i] = Math.min(255, b * 1.05); data[i + 1] = Math.round(g * 0.25); data[i + 2] = Math.round(r * 0.6); }
  await sharp(data, { raw: info }).png().toFile(OUT + 'hud_orb_red.png'); console.log('红球由蓝球换色生成');
}
