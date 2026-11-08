// 生成第一张原创野外地图“晨雾林”（df1）：地面图块图集、物件图集、.map 地图文件。
// 地面：草地 / 林地 / 土路三种无缝贴图，按地形噪声在图块角点上取类型，边界用全局噪声做柔和过渡（跨图块连续）。
// 物件：树、石、残柱等按 48 像素一列切开，每列贴在一个格子上、底边对齐（和原版对象层一样，前后遮挡自然）。
// 用法：node make-map.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'art/raw'); const DATA = join(ROOT, 'ddres/Data');
const MAPS = [join(ROOT, 'ddres/Map'), join(ROOT, 'gamedata/Mir200/Map')];
const MAP_ID = 'df1'; const W = 120; const H = 120; // 格子数
const TW = 96; const TH = 64; const TCOL = 6; const TROW = 9; // 一张贴图切 6×9 块大地砖

// —— 可复现的随机数和值噪声
let seed = 20261108; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, s) { const xi = Math.floor(x); const yi = Math.floor(y); const xf = smooth(x - xi); const yf = smooth(y - yi); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; }
const fbm = (x, y, s) => vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.1;

// —— 地形：在大地砖角点网格（W/2+1 × H/2+1）上定类型 0 草地 1 土路 2 林地
const GW = W / 2 + 1; const GH = H / 2 + 1; const CX = W / 2; const CY = H / 2;
const road = (x, y) => { // 两条弯曲土路十字交叉 + 出生点空地
  const dx = Math.abs(y - (CY + Math.sin(x / 11) * 6)); const dy = Math.abs(x - (CX + Math.sin(y / 13) * 7));
  return Math.min(dx, dy) < 2.2 || Math.hypot(x - CX, y - CY) < 5;
};
const terrainAt = (gx, gy) => { const x = gx * 2; const y = gy * 2; if (road(x, y)) return 1; return fbm(x / 22, y / 22, 3) > 0.56 ? 2 : 0; };
const corner = []; for (let gy = 0; gy < GH; gy++) { corner[gy] = []; for (let gx = 0; gx < GW; gx++) corner[gy][gx] = terrainAt(gx, gy); }

// —— 贴图：缩到 576×576（6×9 块），读成 RGBA
async function tex(name) { return sharp(join(RAW, name + '.png')).resize(TCOL * TW, TROW * TH, { fit: 'cover' }).removeAlpha().raw().toBuffer(); }
const TEX = [await tex('gt_grass'), await tex('gt_dirt'), await tex('gt_forest')];
const tileCache = new Map(); const tileImgs = [];
function makeTile(tx, ty) {
  const c = [corner[ty][tx], corner[ty][tx + 1], corner[ty + 1][tx], corner[ty + 1][tx + 1]];
  const px = tx % TCOL; const py = ty % TROW;
  const uniform = c.every((v) => v === c[0]);
  const key = uniform ? 'u' + c[0] + ':' + px + ':' + py : 'b' + tx + ':' + ty;
  if (tileCache.has(key)) return tileCache.get(key);
  const out = Buffer.alloc(TW * TH * 3); const SW = TCOL * TW;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const si = ((py * TH + y) * SW + px * TW + x) * 3; const fx = x / TW; const fy = y / TH;
    let r = TEX[0][si], g = TEX[0][si + 1], b = TEX[0][si + 2];
    if (!uniform) {
      const gxw = tx * TW + x; const gyw = ty * TH + y; const nz = (fbm(gxw / 41, gyw / 28, 9) - 0.5) * 0.9 + (vnoise(gxw / 9, gyw / 7, 21) - 0.5) * 0.25;
      for (const t of [2, 1]) { // 先铺林地再铺土路
        const w = (c[0] === t) * (1 - fx) * (1 - fy) + (c[1] === t) * fx * (1 - fy) + (c[2] === t) * (1 - fx) * fy + (c[3] === t) * fx * fy;
        const a = Math.max(0, Math.min(1, (w + nz - 0.25) / 0.5)); if (a <= 0) continue;
        const k = smooth(a); r += (TEX[t][si] - r) * k; g += (TEX[t][si + 1] - g) * k; b += (TEX[t][si + 2] - b) * k;
      }
    } else if (c[0] !== 0) { const t = c[0]; r = TEX[t][si]; g = TEX[t][si + 1]; b = TEX[t][si + 2]; }
    const o = (y * TW + x) * 3; out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }
  const idx = tileImgs.length; tileImgs.push(out); tileCache.set(key, idx); return idx;
}
const bngIdx = []; for (let ty = 0; ty < H / 2; ty++) { bngIdx[ty] = []; for (let tx = 0; tx < W / 2; tx++) bngIdx[ty][tx] = makeTile(tx, ty); }
{ // 地面图集（JPG，不透明）
  const cols = 20; const rows = Math.ceil(tileImgs.length / cols); const json = { image: 'tiles.jpg', frames: {} };
  const comps = tileImgs.map((buf, i) => { const x = (i % cols) * TW; const y = Math.floor(i / cols) * TH; json.frames[i] = [x, y, TW, TH, 0, 0]; return { input: buf, raw: { width: TW, height: TH, channels: 3 }, left: x, top: y }; });
  mkdirSync(DATA, { recursive: true });
  await sharp({ create: { width: cols * TW, height: rows * TH, channels: 3, background: '#000' } }).composite(comps).jpeg({ quality: 86 }).toFile(join(DATA, 'tiles.jpg'));
  writeFileSync(join(DATA, 'tiles.json'), JSON.stringify(json));
  console.log('地面图块', tileImgs.length);
}

// —— 物件：缩放到目标高度，切成 48 宽的列
const OBJ = { ob_tree1: [300, 2, [-1, 0, 1]], ob_tree2: [290, 2, [0]], ob_tree3: [230, 2, [0]], ob_rock1: [80, 0, [-1, 0, 1]], ob_rock2: [64, 0, [-1, 0]], ob_pillar: [160, 1, [0]], ob_bush: [62, 0, []], ob_stump: [50, 0, [0]] };
const objStrips = {}; const stripImgs = [];
for (const [name, [th]] of Object.entries(OBJ)) {
  const f = join(RAW, name + '.png'); if (!existsSync(f)) { console.log('缺少物件图', name); continue; }
  const trimmed = await sharp(f).trim({ threshold: 10 }).toBuffer();
  const m = await sharp(trimmed).metadata(); const w = Math.round(m.width * th / m.height); const ncol = Math.ceil(w / 48); const pad = ncol * 48 - w;
  const img = await sharp(trimmed).resize(w, th).extend({ left: Math.floor(pad / 2), right: Math.ceil(pad / 2), top: 0, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  objStrips[name] = [];
  for (let k = 0; k < ncol; k++) { const s = await sharp(img).extract({ left: k * 48, top: 0, width: 48, height: th }).png().toBuffer(); objStrips[name].push(stripImgs.length); stripImgs.push({ buf: s, h: th }); }
}
{
  let x = 0, y = 0, rowH = 0; const AW = 2048; const json = { image: 'objects.png', frames: {} }; const comps = [];
  stripImgs.forEach((s, i) => { if (x + 48 > AW) { x = 0; y += rowH; rowH = 0; } json.frames[i] = [x, y, 48, s.h, 0, 0]; comps.push({ input: s.buf, left: x, top: y }); x += 48; rowH = Math.max(rowH, s.h); });
  await sharp({ create: { width: AW, height: y + rowH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png({ compressionLevel: 9 }).toFile(join(DATA, 'objects.png'));
  writeFileSync(join(DATA, 'objects.json'), JSON.stringify(json));
  console.log('物件列', stripImgs.length);
}

// —— 摆物件：林地里多树，草地零星石头灌木，路和出生点留空
const cellT = (x, y) => corner[Math.min(GH - 1, Math.round(y / 2))][Math.min(GW - 1, Math.round(x / 2))];
const objAt = new Int16Array(W * H).fill(-1); const block = new Uint8Array(W * H);
const free = (x0, x1, y) => { for (let x = x0; x <= x1; x++) if (x < 1 || x >= W - 1 || objAt[y * W + x] >= 0 || road(x, y)) return false; return true; };
function place(name, bx, by) {
  const strips = objStrips[name]; if (!strips) return false; const n = strips.length; const x0 = bx - Math.floor(n / 2);
  if (!free(x0 - 1, x0 + n, by)) return false;
  strips.forEach((s, k) => { objAt[by * W + x0 + k] = s; });
  for (const dx of OBJ[name][2]) { const x = bx + dx; if (x >= 0 && x < W) block[by * W + x] = 1; }
  return true;
}
for (let y = 3; y < H - 1; y++) for (let x = 2; x < W - 2; x++) {
  if (Math.hypot(x - CX, y - CY) < 9) continue; const t = cellT(x, y); const r = rnd();
  if (t === 2 && r < 0.05) place(['ob_tree1', 'ob_tree2', 'ob_tree2', 'ob_tree3'][Math.floor(rnd() * 4)], x, y);
  else if (t === 0 && r < 0.012) place(['ob_rock1', 'ob_rock2', 'ob_bush', 'ob_bush', 'ob_stump', 'ob_tree3'][Math.floor(rnd() * 6)], x, y);
  else if (t === 0 && r < 0.0135) place('ob_pillar', x, y);
}
// 地图四周一圈阻挡
for (let x = 0; x < W; x++) { block[x] = 1; block[(H - 1) * W + x] = 1; } for (let y = 0; y < H; y++) { block[y * W] = 1; block[y * W + W - 1] = 1; }

// —— 写 .map：52 字节头 + 每格 12 字节，按列（x 外层）
const buf = Buffer.alloc(52 + W * H * 12); buf.writeUInt16LE(W, 0); buf.writeUInt16LE(H, 2);
let off = 52;
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
  let bng = (x % 2 === 0 && y % 2 === 0) ? bngIdx[y / 2][x / 2] + 1 : 0; if (block[y * W + x]) bng |= 0x8000;
  const obj = objAt[y * W + x] >= 0 ? objAt[y * W + x] + 1 : 0;
  buf.writeUInt16LE(bng, off); buf.writeUInt16LE(0, off + 2); buf.writeUInt16LE(obj, off + 4); off += 12;
}
for (const d of MAPS) { mkdirSync(d, { recursive: true }); writeFileSync(join(d, MAP_ID + '.map'), buf); }
console.log('地图', MAP_ID, W + 'x' + H, '物件格', objAt.filter((v) => v >= 0).length, '阻挡格', block.reduce((a, b) => a + b, 0));

// —— 小地图：整张地图（地面 + 物件）按 1/8 缩小成一张 JPG，客户端照着裁一块显示
{
  const FW = W * 48; const FH = H * 32; const full = Buffer.alloc(FW * FH * 3);
  for (let ty = 0; ty < H / 2; ty++) for (let tx = 0; tx < W / 2; tx++) {
    const t = tileImgs[bngIdx[ty][tx]];
    for (let y = 0; y < TH; y++) t.copy(full, ((ty * TH + y) * FW + tx * TW) * 3, y * TW * 3, (y + 1) * TW * 3);
  }
  const comps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = objAt[y * W + x]; if (o < 0) continue; const s = stripImgs[o]; const top = y * 32 + 32 - s.h; if (top < 0) continue; comps.push({ input: s.buf, left: x * 48, top }); }
  const SC = 8;
  const img = await sharp(full, { raw: { width: FW, height: FH, channels: 3 } }).composite(comps).png().toBuffer();
  await sharp(img).resize(Math.round(FW / SC), Math.round(FH / SC), { kernel: 'lanczos3' }).modulate({ brightness: 1.08, saturation: 1.1 }).jpeg({ quality: 85 }).toFile(join(DATA, 'minimap_' + MAP_ID + '.jpg'));
  console.log('小地图', Math.round(FW / SC) + 'x' + Math.round(FH / SC));
}
