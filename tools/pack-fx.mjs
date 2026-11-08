// 技能特效：把 GPT 出的特效动图（黑底，游戏里用“发光叠加”画，黑色不显示）按客户端 FX_FRAMES 的帧号排进 magic / magic2 图集。
// 需要分方向的（刀光 8 向、电光和符纸 16 向）用同一段图按角度旋转生成；图里朝右为 0 度。
// 用法：node pack-fx.mjs
import sharp from 'sharp';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'art/raw'); const OUT = join(ROOT, 'ddres/Data');
// key: 图名；base/frames：客户端帧号；size：画面大小；dirs：方向数（8 或 16）；anchor：center/bottom/head/body/forward
const FX = [
  { key: 'fx_fireball_fly', lib: 'magic', base: 10, frames: 6, size: 76, dirs: 16 },
  { key: 'fx_fire_boom', lib: 'magic', base: 170, frames: 10, size: 150 },
  { key: 'fx_bigfire_fly', lib: 'magic', base: 410, frames: 6, size: 100, dirs: 16 },
  { key: 'fx_bigfire_boom', lib: 'magic', base: 570, frames: 10, size: 190 },
  { key: 'fx_heal', lib: 'magic', base: 370, frames: 10, size: 140, anchor: 'body' },
  { key: 'fx_fire_ring', lib: 'magic', base: 900, frames: 6, size: 190 },
  { key: 'fx_firegun', lib: 'magic', base: 930, frames: 6, size: 70, crop: 0.4 },   // 原图是横向火柱，取中间一团当火焰团
  { key: 'fx_beam', lib: 'magic', base: 970, frames: 6, size: 280, dirs: 16 },
  { key: 'fx_talisman_fly', lib: 'magic', base: 1160, frames: 3, size: 60, dirs: 16, pick: -1 },   // 只有最后一帧带符纸
  { key: 'fx_ghost_shield', lib: 'magic', base: 1320, frames: 16, size: 140, anchor: 'body' },
  { key: 'fx_gold_armor', lib: 'magic', base: 1340, frames: 16, size: 140, anchor: 'body' },
  { key: 'fx_spirit_boom', lib: 'magic', base: 1360, frames: 10, size: 150 },
  { key: 'fx_bind', lib: 'magic', base: 1380, frames: 20, size: 160 },
  { key: 'fx_hide', lib: 'magic', base: 1540, frames: 10, size: 150, anchor: 'body' },
  { key: 'fx_charm', lib: 'magic', base: 1570, frames: 10, size: 90, anchor: 'head' },
  { key: 'fx_teleport', lib: 'magic', base: 1600, frames: 10, size: 150, anchor: 'body' },
  { key: 'fx_firewall', lib: 'magic', base: 1630, frames: 6, size: 110, anchor: 'bottom' },
  { key: 'fx_burst', lib: 'magic', base: 1660, frames: 20, size: 220 },
  { key: 'fx_thunder_ring', lib: 'magic', base: 1680, frames: 10, size: 210 },
  { key: 'fx_heal_group', lib: 'magic', base: 1800, frames: 10, size: 210 },
  { key: 'fx_ice', lib: 'magic', base: 3850, frames: 20, size: 230 },
  { key: 'fx_shield', lib: 'magic', base: 3880, frames: 12, size: 130, anchor: 'body' },
  { key: 'fx_spirit_boom', lib: 'magic', base: 3930, frames: 16, size: 190 },   // 净灭咒先借灵焰爆
  { key: 'fx_thunder', lib: 'magic2', base: 10, frames: 6, size: 270, anchor: 'bottom' },
  // 武者剑技刀光：帧 = base + 方向×10 + 0..5，画在攻击者身上，往面朝方向偏一点
  { key: 'fx_slash_power', lib: 'magic', base: 800, frames: 6, size: 150, dirs: 8, anchor: 'forward' },
  { key: 'fx_slash_long', lib: 'magic', base: 1410, frames: 6, size: 170, dirs: 8, anchor: 'forward' },
  { key: 'fx_slash_wide', lib: 'magic', base: 1700, frames: 6, size: 170, dirs: 8, anchor: 'forward' },
  { key: 'fx_slash_fire', lib: 'magic', base: 3480, frames: 6, size: 160, dirs: 8, anchor: 'forward' },
];
const CX = 24; const CY = 16; const BODY_Y = -18;   // 格子中心、人物身体中心（相对格子左上角）
async function strip(key) {
  const f = join(RAW, key + '.png'); if (!existsSync(f)) return null;
  const img = sharp(f); const { width, height } = await img.metadata();
  return { f, width, height, n: Math.max(1, Math.round(width / height)) };
}
// 圆形渐隐蒙版：中间不变，靠边逐渐变黑（发光叠加下黑 = 透明）
const edgeMask = (n) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><defs><radialGradient id="g" r="0.5"><stop offset="0.7" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><rect width="${n}" height="${n}" fill="url(#g)"/></svg>`);
// 每段特效只存一个方向；其他方向在帧表里记旋转角度，客户端用到时再转（省内存）
const atlases = { magic: [], magic2: [] };
for (const fx of FX) {
  const s = await strip(fx.key); if (!s) { console.log('还没有', fx.key); continue; }
  const dirs = fx.dirs || 1;
  for (let i = 0; i < fx.frames; i++) {
    const fi = fx.pick === -1 ? s.n - 1 : Math.min(s.n - 1, Math.floor(i * s.n / fx.frames));
    const cw = Math.round(s.height * (fx.crop || 1)); const co = Math.round((s.height - cw) / 2);
    const png = await sharp(s.f).extract({ left: fi * s.height + co, top: co, width: cw, height: cw }).resize(fx.size, fx.size).flatten({ background: '#000' })
      .composite([{ input: edgeMask(fx.size), blend: 'multiply' }]).png().toBuffer();   // 四周渐黑：裁切处不出硬边
    const w = fx.size; const h = fx.size; const views = [];
    for (let d = 0; d < dirs; d++) {
      const ang = dirs === 1 ? 0 : (-90 + d * 360 / dirs);   // 方向 0 = 向上；图里朝右 = 0 度
      const r = ang * Math.PI / 180; const rw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r)); const rh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
      let px = CX - rw / 2; let py = CY - rh / 2;
      if (fx.anchor === 'bottom') py = CY + 6 - rh;
      if (fx.anchor === 'body') py = BODY_Y - rh / 2;
      if (fx.anchor === 'head') py = -70 - rh / 2;
      if (fx.anchor === 'forward') { px += Math.cos(r) * 30; py = BODY_Y - rh / 2 + Math.sin(r) * 22; }
      views.push([fx.base + (dirs > 1 ? d * 10 : 0) + i, Math.round(px), Math.round(py), Math.round(ang)]);
    }
    atlases[fx.lib].push({ png, w, h, views });
  }
}
async function write(name, entries) {
  if (!entries.length) return;
  const AW = 2048; let x = 0, y = 0, rowH = 0; const json = { image: name + '.png', frames: {} }; const comps = [];
  for (const fr of entries.sort((a, b) => b.h - a.h)) {
    if (x + fr.w > AW) { x = 0; y += rowH + 1; rowH = 0; }
    comps.push({ input: fr.png, left: x, top: y });
    for (const [idx, px, py, ang] of fr.views) json.frames[idx] = ang ? [x, y, fr.w, fr.h, px, py, ang] : [x, y, fr.w, fr.h, px, py];
    x += fr.w + 1; rowH = Math.max(rowH, fr.h);
  }
  mkdirSync(OUT, { recursive: true });
  // 特效是发光叠加画的，黑底就当透明；存成 JPG 体积小很多
  await sharp({ create: { width: AW, height: y + rowH + 1, channels: 3, background: '#000' } }).composite(comps).jpeg({ quality: 82 }).toFile(join(OUT, name + '.jpg'));
  json.image = name + '.jpg';
  writeFileSync(join(OUT, name + '.json'), JSON.stringify(json));
  console.log(name, Object.keys(json.frames).length, '帧', AW + 'x' + (y + rowH + 1));
}
await write('magic', atlases.magic); await write('magic2', atlases.magic2);
