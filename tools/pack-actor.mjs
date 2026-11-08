// 把 GPT 出的人物/怪物动图（横条 PNG：每帧一格，名字 <前缀>_<动作>_<方向>.png）按原版动作表排进图集。
// 用法：
//   node pack-actor.mjs hum hw 0-7            → ddres/Data/hum.json + hum.png（外观 0~7 都用 hw 这套图）
//   node pack-actor.mjs ddmon mb:0 mg:1 mc:2  → ddres/Data/ddmon.json（每只怪占 SLOT 帧，appr=900+槽位）
// 输出帧表 { 帧号: [x, y, w, h, px, py] }，px/py 让脚底落在格子中心（锚点 = 格子左上角）。
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'art/raw');
const OUT = join(ROOT, 'ddres/Data');
export const MON_SLOT = 440;
// 原版方向：0 上 1 右上 2 右 3 右下 4 下 5 左下 6 左 7 左上
const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const MIRROR = { w: 'e', sw: 'se', nw: 'ne', e: 'w', se: 'sw', ne: 'nw' };
// 人物动作表 HA 和怪物动作表 MA14（见 frontend/actor/actorData.mjs）
const HA = { stand: [0, 4, 4, 'stand'], walk: [64, 6, 2, 'walk'], run: [128, 6, 2, 'walk'], hit: [200, 6, 2, 'atk'], spell: [392, 6, 2, 'atk'], struck: [472, 3, 5, 'struck'], die: [536, 4, 4, 'die'] };
const MA50 = { stand: [0, 4, 6, 'stand'] };   // NPC：只有站立待机
const NPC_SLOT = 60;
const MA14 = { stand: [0, 4, 6, 'stand'], walk: [80, 6, 4, 'walk'], attack: [160, 6, 4, 'atk'], struck: [240, 2, 0, 'struck'], die: [260, 10, 0, 'die'], death: [340, 10, 0, 'dead'] };
const CELL_X = 24; const FOOT_Y = 26; // 格子中心偏下一点

async function loadStrip(file) {
  const img = sharp(file); const { width, height } = await img.metadata();
  const n = Math.max(1, Math.round(width / height));
  const raw = await img.ensureAlpha().raw().toBuffer();
  return { raw, width, height, n };
}
// 一条动图：每帧的不透明区域
function bboxOf(raw, W, x0, w, h) {
  let minx = w, miny = h, maxx = -1, maxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (raw[(y * W + x0 + x) * 4 + 3] > 24) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  return maxx < 0 ? null : { minx, miny, maxx, maxy };
}
const cache = new Map();
async function strip(pre, act, dir) {
  const key = pre + act + dir; if (cache.has(key)) return cache.get(key);
  let res = null; let flip = false;
  const f = join(RAW, `${pre}_${act}_${dir}.png`);
  if (existsSync(f)) res = await loadStrip(f);
  else if (MIRROR[dir] && existsSync(join(RAW, `${pre}_${act}_${MIRROR[dir]}.png`))) { res = await loadStrip(join(RAW, `${pre}_${act}_${MIRROR[dir]}.png`)); flip = true; }
  else if (act === 'die' && existsSync(join(RAW, `${pre}_die_se.png`))) res = await loadStrip(join(RAW, `${pre}_die_se.png`));
  else if (pre.startsWith('n_') && act === 'stand' && existsSync(join(RAW, `${pre}.png`))) res = await loadStrip(join(RAW, `${pre}.png`));   // NPC 只出一个朝向，各方向共用
  const out = res ? { ...res, flip } : null; cache.set(key, out); return out;
}
// 取一帧：缩放、可镜像，返回 { buf(PNG), w, h, px, py }
async function frameOf(s, i, scale, ref, opt = {}) {
  const fw = s.height; const x0 = i * fw;
  let img = sharp(s.raw, { raw: { width: s.width, height: s.height, channels: 4 } }).extract({ left: x0, top: 0, width: fw, height: s.height });
  if (s.flip) img = img.flop();
  const size = Math.max(1, Math.round(fw * scale));
  let buf = await img.resize(size, size, { kernel: 'lanczos3' }).raw().toBuffer();
  if (opt.flash) for (let k = 0; k < buf.length; k += 4) if (buf[k + 3]) { buf[k] = Math.min(255, buf[k] + 90); buf[k + 1] = Math.min(255, buf[k + 1] + 70); buf[k + 2] = Math.min(255, buf[k + 2] + 70); }
  const bb = bboxOf(buf, size, 0, size, size); if (!bb) return null;
  const w = bb.maxx - bb.minx + 1; const h = bb.maxy - bb.miny + 1;
  const png = await sharp(buf, { raw: { width: size, height: size, channels: 4 } }).extract({ left: bb.minx, top: bb.miny, width: w, height: h }).png().toBuffer();
  // 参考点：这条动图的脚底（所有帧最低点）和水平中心，镜像时水平中心跟着翻
  const cx = (s.flip ? fw - ref.cx : ref.cx) * scale; const by = ref.by * scale + (opt.dy || 0);
  return { png, w, h, px: Math.round(CELL_X - (cx - bb.minx) + (opt.dx || 0)), py: Math.round(FOOT_Y - (by - bb.miny)) };
}
async function refOf(s) {
  let minx = 1e9, maxx = -1, by = -1; const fw = s.height;
  for (let i = 0; i < s.n; i++) { const bb = bboxOf(s.raw, s.width, i * fw, fw, s.height); if (!bb) continue; minx = Math.min(minx, bb.minx); maxx = Math.max(maxx, bb.maxx); by = Math.max(by, bb.maxy); }
  return { cx: (minx + maxx) / 2, by };
}
// 用正面站立的高度定统一缩放：人物约 84 像素高
async function scaleFor(pre, targetH) {
  const s = await strip(pre, 'stand', 's') || await strip(pre, 'stand', 'se');
  const bb = bboxOf(s.raw, s.width, 0, s.height, s.height); return targetH / (bb.maxy - bb.miny + 1);
}
const pick = (n, k, i) => Math.min(n - 1, Math.floor(i * n / k));

async function buildFrames(pre, table, targetH) {
  const scale = await scaleFor(pre, targetH); const frames = {}; // 相对帧号 → frame
  for (const [, [start, count, skip, src]] of Object.entries(table)) {
    for (let d = 0; d < 8; d++) {
      const dir = DIRS[d];
      const act = src === 'struck' ? 'stand' : src === 'dead' ? 'die' : src;
      const s = await strip(pre, act, dir); if (!s) continue;
      const ref = await refOf(s);
      for (let i = 0; i < count; i++) {
        let fi = pick(s.n, count, i); const opt = {};
        if (src === 'struck') { fi = 0; opt.flash = i === 0; opt.dy = -1; }
        if (src === 'dead') fi = s.n - 1;
        const fr = await frameOf(s, fi, scale, ref, opt); if (fr) frames[start + d * (count + skip) + i] = fr;
      }
    }
  }
  return frames;
}
// 简单货架打包，同一张 PNG 只放一次
async function writeAtlas(name, entries) {
  const uniq = new Map(); const order = [];
  for (const [idx, fr] of entries) { const k = fr.png.toString('base64'); if (!uniq.has(k)) { uniq.set(k, { fr, idx: [] }); order.push(k); } uniq.get(k).idx.push([idx, fr]); }
  const W = 2048; let x = 0, y = 0, rowH = 0; const place = [];
  for (const k of order.sort((a, b) => uniq.get(b).fr.h - uniq.get(a).fr.h)) { const { fr } = uniq.get(k); if (x + fr.w > W) { x = 0; y += rowH + 1; rowH = 0; } place.push({ k, x, y }); x += fr.w + 1; rowH = Math.max(rowH, fr.h); }
  const H = y + rowH + 1; const json = { image: name + '.png', frames: {} };
  const comps = place.map(({ k, x, y }) => { const u = uniq.get(k); for (const [idx, fr] of u.idx) json.frames[idx] = [x, y, fr.w, fr.h, fr.px, fr.py]; return { input: u.fr.png, left: x, top: y }; });
  mkdirSync(OUT, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png({ compressionLevel: 9, palette: false }).toFile(join(OUT, name + '.png'));
  writeFileSync(join(OUT, name + '.json'), JSON.stringify(json));
  console.log(name, '帧', Object.keys(json.frames).length, '不重复', order.length, '图集', W + 'x' + H);
}

const [lib, ...args] = process.argv.slice(2);
const entries = [];
if (lib === 'hum') {
  // 用法：hum hw:0-1 hm:2-3 hs:4-5（每套图放进一段外观号）
  for (const arg of args) {
    const [pre, range] = arg.split(':'); const [a, b] = (range || '0-0').split('-').map(Number);
    if (!existsSync(join(RAW, pre + '_stand_s.png')) && !existsSync(join(RAW, pre + '_stand_se.png'))) { console.log('还没有图', pre); continue; }
    const fr = await buildFrames(pre, HA, 84);
    for (let ap = a; ap <= b; ap++) for (const [k, v] of Object.entries(fr)) entries.push([600 * ap + Number(k), v]);
  }
} else if (lib === 'ddnpc') {
  // 用法：ddnpc n_smith:0:86 n_guide:1:88（appr = 900 + 槽位）
  for (const arg of args) {
    const [pre, slot, h] = arg.split(':'); if (!existsSync(join(RAW, pre + '.png'))) { console.log('还没有图', pre); continue; }
    const fr = await buildFrames(pre, MA50, Number(h || 84));
    for (const [k, v] of Object.entries(fr)) entries.push([NPC_SLOT * Number(slot) + Number(k), v]);
  }
} else {
  for (const arg of args) {
    const [pre, slot, h] = arg.split(':'); const fr = await buildFrames(pre, MA14, Number(h || 70));
    for (const [k, v] of Object.entries(fr)) entries.push([MON_SLOT * Number(slot) + Number(k), v]);
  }
}
await writeAtlas(lib, entries);
