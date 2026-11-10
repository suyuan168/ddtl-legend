// 生成原创地图：野外“晨雾林”（df1）和主城“天亮城”（dt0）。所有地图共用一张地面图集和一张物件图集。
// 地面：草地 / 土路 / 林地 / 石板四种无缝贴图，按地形在图块角点上取类型，边界用全局噪声做柔和过渡（跨图块连续）。
// 物件：树、石、房子等按 48 像素一列切开，每列贴在一个格子上、底边对齐（和原版对象层一样，前后遮挡自然）。
// 用法：node make-map.mjs   （输出 ddres/Data/tiles、objects、minimap_<图>.jpg 和 <图>.map；主城 NPC 坐标写到 tools/town-npcs.json）
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'art/raw'); const DATA = join(ROOT, 'ddres/Data');
const MAPS = [join(ROOT, 'ddres/Map'), join(ROOT, 'gamedata/Mir200/Map')];
const TW = 96; const TH = 64; const TCOL = 6; const TROW = 9; // 一张贴图切 6×9 块大地砖

// —— 可复现的随机数和值噪声
let seed = 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, s) { const xi = Math.floor(x); const yi = Math.floor(y); const xf = smooth(x - xi); const yf = smooth(y - yi); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; }
const fbm = (x, y, s) => vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.1;

// —— 贴图：0 草地 1 土路 2 林地 3 石板；缩到 576×576（6×9 块），读成 RGB
async function tex(name) { const f = join(RAW, name + '.png'); if (!existsSync(f)) return null; return sharp(f).resize(TCOL * TW, TROW * TH, { fit: 'cover' }).removeAlpha().raw().toBuffer(); }
const TEX = [await tex('gt_grass'), await tex('gt_dirt'), await tex('gt_forest'), await tex('gt_stone')];
if (!TEX[3]) TEX[3] = TEX[1];   // 石板图还没出时先用土路顶替
const tileCache = new Map(); const tileImgs = [];
function makeTile(mapId, corner, tx, ty) {
  const c = [corner[ty][tx], corner[ty][tx + 1], corner[ty + 1][tx], corner[ty + 1][tx + 1]];
  const px = tx % TCOL; const py = ty % TROW;
  const uniform = c.every((v) => v === c[0]);
  const key = uniform ? 'u' + c[0] + ':' + px + ':' + py : mapId + 'b' + tx + ':' + ty;
  if (tileCache.has(key)) return tileCache.get(key);
  const out = Buffer.alloc(TW * TH * 3); const SW = TCOL * TW;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const si = ((py * TH + y) * SW + px * TW + x) * 3; const fx = x / TW; const fy = y / TH;
    let r = TEX[0][si], g = TEX[0][si + 1], b = TEX[0][si + 2];
    if (!uniform) {
      const gxw = tx * TW + x; const gyw = ty * TH + y; const nz = (fbm(gxw / 41, gyw / 28, 9) - 0.5) * 0.9 + (vnoise(gxw / 9, gyw / 7, 21) - 0.5) * 0.25;
      for (const t of [2, 1, 3]) { // 先铺林地，再铺土路，最后石板
        const w = (c[0] === t) * (1 - fx) * (1 - fy) + (c[1] === t) * fx * (1 - fy) + (c[2] === t) * (1 - fx) * fy + (c[3] === t) * fx * fy;
        const a = Math.max(0, Math.min(1, (w + nz - 0.25) / 0.5)); if (a <= 0) continue;
        const k = smooth(a); r += (TEX[t][si] - r) * k; g += (TEX[t][si + 1] - g) * k; b += (TEX[t][si + 2] - b) * k;
      }
    } else if (c[0] !== 0) { const t = c[0]; r = TEX[t][si]; g = TEX[t][si + 1]; b = TEX[t][si + 2]; }
    const o = (y * TW + x) * 3; out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }
  const idx = tileImgs.length; tileImgs.push(out); tileCache.set(key, idx); return idx;
}

// —— 物件：[目标高度(像素), 阻挡]。阻挡是数字数组 = 底排哪些列相对中心挡路；{ depth } = 整个底座按列宽往上挡 depth 排（房子）
// 顺序不要改：晨雾林的地图文件按这里的列号存物件
const OBJ = {
  ob_tree1: [300, [-1, 0, 1]], ob_tree2: [290, [0]], ob_tree3: [230, [0]], ob_rock1: [80, [-1, 0, 1]], ob_rock2: [64, [-1, 0]], ob_pillar: [160, [0]], ob_bush: [62, []], ob_stump: [50, [0]],
  ob_smithy: [270, { depth: 4 }], ob_armory: [300, { depth: 4 }], ob_apothecary: [240, { depth: 4 }], ob_store: [250, { depth: 4 }], ob_warehouse: [280, { depth: 5 }],
  ob_house1: [290, { depth: 4 }], ob_house2: [220, { depth: 3 }], ob_fountain: [170, { depth: 3 }], ob_well: [110, { depth: 2 }], ob_stall: [130, { depth: 2 }],
  ob_lamp: [150, [0]], ob_barrels: [72, { depth: 1 }], ob_cart: [80, { depth: 1 }], ob_banner: [230, [0]], ob_fence: [58, { depth: 1 }],
};
const objStrips = {}; const stripImgs = [];
for (const [name, [th]] of Object.entries(OBJ)) {
  const f = join(RAW, name + '.png'); if (!existsSync(f)) { console.log('缺少物件图', name); continue; }
  const trimmed = await sharp(f).trim({ threshold: 10 }).toBuffer();
  const m = await sharp(trimmed).metadata(); const w = Math.round(m.width * th / m.height); const ncol = Math.ceil(w / 48); const pad = ncol * 48 - w;
  const img = await sharp(trimmed).resize(w, th).extend({ left: Math.floor(pad / 2), right: Math.ceil(pad / 2), top: 0, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  objStrips[name] = [];
  for (let k = 0; k < ncol; k++) { const s = await sharp(img).extract({ left: k * 48, top: 0, width: 48, height: th }).png().toBuffer(); objStrips[name].push(stripImgs.length); stripImgs.push({ buf: s, h: th }); }
}

// —— 一张地图：地形角点 → 地面图块；摆物件；写 .map 和小地图
function newMap(id, W, H, terrainAt, isRoad) {
  const GW = W / 2 + 1; const GH = H / 2 + 1;
  const corner = []; for (let gy = 0; gy < GH; gy++) { corner[gy] = []; for (let gx = 0; gx < GW; gx++) corner[gy][gx] = terrainAt(gx * 2, gy * 2); }
  const bngIdx = []; for (let ty = 0; ty < H / 2; ty++) { bngIdx[ty] = []; for (let tx = 0; tx < W / 2; tx++) bngIdx[ty][tx] = makeTile(id, corner, tx, ty); }
  const M = { id, W, H, corner, bngIdx, isRoad, objAt: new Int16Array(W * H).fill(-1), block: new Uint8Array(W * H) };
  M.cellT = (x, y) => corner[Math.min(GH - 1, Math.round(y / 2))][Math.min(GW - 1, Math.round(x / 2))];
  return M;
}
// 摆一个物件：bx 中心列、by 底排；force = 忽略道路（主城里房子、灯可以贴着石板路放）
function place(M, name, bx, by, force = false) {
  const strips = objStrips[name]; if (!strips) return false; const n = strips.length; const x0 = bx - Math.floor(n / 2); const { W } = M;
  const bl = OBJ[name][1]; const depth = Array.isArray(bl) ? 1 : bl.depth;
  for (let y = by - depth + 1; y <= by; y++) for (let x = x0 - 1; x <= x0 + n; x++) {
    if (x < 1 || x >= W - 1 || y < 1 || y >= M.H - 1 || M.objAt[y * W + x] >= 0) return false;
    if (!force && M.isRoad(x, y)) return false;
  }
  strips.forEach((s, k) => { M.objAt[by * W + x0 + k] = s; });
  if (Array.isArray(bl)) { for (const dx of bl) { const x = bx + dx; if (x >= 0 && x < W) M.block[by * W + x] = 1; } }
  else for (let y = by - depth + 1; y <= by; y++) for (let x = x0; x < x0 + n; x++) M.block[y * W + x] = 1;
  return true;
}
function border(M) { const { W, H, block } = M; for (let x = 0; x < W; x++) { block[x] = 1; block[(H - 1) * W + x] = 1; } for (let y = 0; y < H; y++) { block[y * W] = 1; block[y * W + W - 1] = 1; } }
function writeMap(M) {
  const { W, H } = M; const buf = Buffer.alloc(52 + W * H * 12); buf.writeUInt16LE(W, 0); buf.writeUInt16LE(H, 2);
  let off = 52;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    let bng = (x % 2 === 0 && y % 2 === 0) ? M.bngIdx[y / 2][x / 2] + 1 : 0; if (M.block[y * W + x]) bng |= 0x8000;
    const obj = M.objAt[y * W + x] >= 0 ? M.objAt[y * W + x] + 1 : 0;
    buf.writeUInt16LE(bng, off); buf.writeUInt16LE(0, off + 2); buf.writeUInt16LE(obj, off + 4); off += 12;
  }
  for (const d of MAPS) { mkdirSync(d, { recursive: true }); writeFileSync(join(d, M.id + '.map'), buf); }
  console.log('地图', M.id, W + 'x' + H, '物件格', M.objAt.filter((v) => v >= 0).length, '阻挡格', M.block.reduce((a, b) => a + b, 0));
}
// 小地图：整张地图（地面 + 物件）按 1/8 缩小成一张 JPG，客户端照着裁一块显示
async function writeMini(M) {
  const { W, H } = M; const FW = W * 48; const FH = H * 32; const full = Buffer.alloc(FW * FH * 3);
  for (let ty = 0; ty < H / 2; ty++) for (let tx = 0; tx < W / 2; tx++) {
    const t = tileImgs[M.bngIdx[ty][tx]];
    for (let y = 0; y < TH; y++) t.copy(full, ((ty * TH + y) * FW + tx * TW) * 3, y * TW * 3, (y + 1) * TW * 3);
  }
  const comps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = M.objAt[y * W + x]; if (o < 0) continue; const s = stripImgs[o]; const top = y * 32 + 32 - s.h; if (top < 0) continue; comps.push({ input: s.buf, left: x * 48, top }); }
  const SC = 8;
  const img = await sharp(full, { raw: { width: FW, height: FH, channels: 3 } }).composite(comps).png().toBuffer();
  await sharp(img).resize(Math.round(FW / SC), Math.round(FH / SC), { kernel: 'lanczos3' }).modulate({ brightness: 1.08, saturation: 1.1 }).jpeg({ quality: 85 }).toFile(join(DATA, 'minimap_' + M.id + '.jpg'));
}

// ===== 晨雾林 df1：两条弯曲土路十字交叉，林地里多树，草地零星石头灌木 =====
const all = [];
{
  const W = 120; const H = 120; const CX = W / 2; const CY = H / 2;
  const road = (x, y) => { const dx = Math.abs(y - (CY + Math.sin(x / 11) * 6)); const dy = Math.abs(x - (CX + Math.sin(y / 13) * 7)); return Math.min(dx, dy) < 2.2 || Math.hypot(x - CX, y - CY) < 5; };
  const M = newMap('df1', W, H, (x, y) => (road(x, y) ? 1 : fbm(x / 22, y / 22, 3) > 0.56 ? 2 : 0), road);
  seed = 20261108;
  for (let y = 3; y < H - 1; y++) for (let x = 2; x < W - 2; x++) {
    if (Math.hypot(x - CX, y - CY) < 9) continue; const t = M.cellT(x, y); const r = rnd();
    if (t === 2 && r < 0.05) place(M, ['ob_tree1', 'ob_tree2', 'ob_tree2', 'ob_tree3'][Math.floor(rnd() * 4)], x, y);
    else if (t === 0 && r < 0.012) place(M, ['ob_rock1', 'ob_rock2', 'ob_bush', 'ob_bush', 'ob_stump', 'ob_tree3'][Math.floor(rnd() * 6)], x, y);
    else if (t === 0 && r < 0.0135) place(M, 'ob_pillar', x, y);
  }
  border(M); all.push(M);
}

// ===== 天亮城 dt0：中央石板广场 + 十字石板街，四周商铺民居，外圈树林；东门出城去晨雾林 =====
const npcs = []; const rooms = [];
{
  const W = 80; const H = 80; const CX = 40; const CY = 40;
  const plaza = (x, y) => Math.hypot((x - CX) * 0.9, y - CY) < 12;
  const street = (x, y) => (Math.abs(y - CY) < 2.6 && x > 6) || (Math.abs(x - CX) < 2.6 && y > 8 && y < 72);
  const road = (x, y) => plaza(x, y) || street(x, y);
  const M = newMap('dt0', W, H, (x, y) => {
    if (road(x, y)) return 3;
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge < 7 + fbm(x / 9, y / 9, 41) * 4) return 2;
    return fbm(x / 14, y / 14, 43) > 0.63 ? 1 : 0;
  }, road);
  // 商铺：[物件, 中心列, 底排, NPC 名, NPC 图, 脚本名, 室内图, 室内地图编号, 室内名]
  // 门口（底排下一格）是传送点，走上去进屋；NPC 在屋里柜台前。有室内图才开门，没有就站门口
  const SHOPS = [
    ['ob_smithy', 29, 25, '铁匠·巴隆', 'n_smith', 'dd_weapon', 'in_smithy', 'dtw', '铁匠铺'],
    ['ob_armory', 51, 25, '甲胄师·赛拉', 'n_armorer', 'dd_armor', 'in_armory', 'dta', '甲胄铺'],
    ['ob_apothecary', 19, 36, '药师·老林', 'n_alchemist', 'dd_potion', 'in_apothecary', 'dtp', '药铺'],
    ['ob_store', 61, 36, '杂货商·福德', 'n_merchant', 'dd_store', 'in_store', 'dts', '杂货铺'],
    ['ob_warehouse', 29, 61, '仓库管理员·莫恩', 'n_keeper', 'dd_storage', 'in_warehouse', 'dtk', '仓库'],
  ];
  for (const [ob, bx, by, name, look, script, inImg, room, roomName] of SHOPS) {
    if (!place(M, ob, bx, by, true)) console.log('放不下', ob);
    if (existsSync(join(RAW, inImg + '.png'))) {
      rooms.push({ id: room, name: roomName, img: inImg, door: [bx, by + 1], out: [bx, by + 3] });
      npcs.push({ map: room, x: 10, y: 9, name, look, script });
    } else npcs.push({ map: 'dt0', x: bx, y: by + 2, name, look, script });
  }
  place(M, 'ob_house1', 51, 61, true); place(M, 'ob_house2', 16, 22, true); place(M, 'ob_house2', 64, 22, true);
  place(M, 'ob_house2', 16, 60, true); place(M, 'ob_house1', 64, 60, true); place(M, 'ob_house2', 22, 70, true); place(M, 'ob_house2', 58, 70, true);
  place(M, 'ob_fountain', CX, CY - 4, true);
  place(M, 'ob_well', 47, 33, true); place(M, 'ob_stall', 32, 47, true); place(M, 'ob_stall', 48, 47, true);
  place(M, 'ob_barrels', 35, 26, true); place(M, 'ob_barrels', 66, 37, true); place(M, 'ob_cart', 24, 62, true);
  for (const x of [30, 50]) for (const y of [CY - 3, CY + 3]) place(M, 'ob_lamp', x, y, true);
  for (const y of [14, 22, 58, 66]) { place(M, 'ob_lamp', CX - 3, y, true); place(M, 'ob_lamp', CX + 3, y, true); }
  place(M, 'ob_banner', 72, CY - 3, true); place(M, 'ob_banner', 72, CY + 3, true);
  for (const [x, y] of [[44, 66], [12, 30], [68, 30]]) place(M, 'ob_fence', x, y);
  // 室外也有 NPC（和原版一样：同一种店屋里一个、街上一个）：广场两个摊位的摊贩、仓库门外的保管员
  npcs.push({ map: 'dt0', x: 32, y: 49, name: '药贩·小禾', look: 'n_alchemist', script: 'dd_potion' });
  npcs.push({ map: 'dt0', x: 48, y: 49, name: '兵器贩·铁头', look: 'n_smith', script: 'dd_weapon' });
  npcs.push({ map: 'dt0', x: 33, y: 64, name: '保管员·阿杜', look: 'n_keeper', script: 'dd_storage' });
  // 东门守卫和城里的向导
  npcs.push({ map: 'dt0', x: 70, y: CY - 3, name: '城门卫兵', look: 'n_guard', script: 'dd_guard', plain: true });
  npcs.push({ map: 'dt0', x: CX + 4, y: CY + 2, name: '向导·艾琳', look: 'n_guide', script: 'dd_guide' });
  // 外圈树林
  seed = 20261109;
  for (let y = 2; y < H - 1; y++) for (let x = 2; x < W - 2; x++) {
    const t = M.cellT(x, y); const r = rnd();
    if (t === 2 && r < 0.09) place(M, ['ob_tree1', 'ob_tree2', 'ob_tree2', 'ob_tree3'][Math.floor(rnd() * 4)], x, y);
    else if (t !== 3 && r < 0.006) place(M, ['ob_bush', 'ob_rock2', 'ob_bush'][Math.floor(rnd() * 3)], x, y);
  }
  // NPC 站的格子、门口不能被挡
  for (const n of npcs) if (n.map === 'dt0') M.block[n.y * W + n.x] = 0;
  for (const r of rooms) { M.block[r.door[1] * W + r.door[0]] = 0; M.block[r.out[1] * W + r.out[0]] = 0; }
  border(M); all.push(M);
}

// ===== 室内：20×20 格（960×640 像素）=====
for (const r of rooms) {
  const RW = 20; const RH = 20; const img = await sharp(join(RAW, r.img + '.png')).resize(RW * 48, RH * 32, { fit: 'cover' }).removeAlpha().raw().toBuffer();
  const bngIdx = [];
  for (let ty = 0; ty < RH / 2; ty++) { bngIdx[ty] = []; for (let tx = 0; tx < RW / 2; tx++) {
    const out = Buffer.alloc(TW * TH * 3); for (let y = 0; y < TH; y++) img.copy(out, y * TW * 3, ((ty * TH + y) * RW * 48 + tx * TW) * 3, ((ty * TH + y) * RW * 48 + tx * TW + TW) * 3);
    bngIdx[ty][tx] = tileImgs.length; tileImgs.push(out);
  } }
  const R = { id: r.id, W: RW, H: RH, bngIdx, objAt: new Int16Array(RW * RH).fill(-1), block: new Uint8Array(RW * RH) };
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const side = 2 + Math.max(0, Math.round((8 - y) * 0.35));   // 两侧墙越往上越往里收
    if (y < 8 || y >= RH - 1 || x < side || x >= RW - side) R.block[y * RW + x] = 1;
  }
  for (const x of [9, 10, 11]) R.block[(RH - 1) * RW + x] = 0;
  r.exit = [[9, RH - 2], [10, RH - 2], [11, RH - 2]]; r.arrive = [10, RH - 4];
  all.push(R);
}

// —— 地面图集（JPG，不透明）
{
  const cols = 20; const rows = Math.ceil(tileImgs.length / cols); const json = { image: 'tiles.jpg', frames: {} };
  const comps = tileImgs.map((buf, i) => { const x = (i % cols) * TW; const y = Math.floor(i / cols) * TH; json.frames[i] = [x, y, TW, TH, 0, 0]; return { input: buf, raw: { width: TW, height: TH, channels: 3 }, left: x, top: y }; });
  mkdirSync(DATA, { recursive: true });
  await sharp({ create: { width: cols * TW, height: rows * TH, channels: 3, background: '#000' } }).composite(comps).jpeg({ quality: 86 }).toFile(join(DATA, 'tiles.jpg'));
  writeFileSync(join(DATA, 'tiles.json'), JSON.stringify(json));
  console.log('地面图块', tileImgs.length);
}
// —— 物件图集
{
  let x = 0, y = 0, rowH = 0; const AW = 2048; const json = { image: 'objects.png', frames: {} }; const comps = [];
  stripImgs.forEach((s, i) => { if (x + 48 > AW) { x = 0; y += rowH; rowH = 0; } json.frames[i] = [x, y, 48, s.h, 0, 0]; comps.push({ input: s.buf, left: x, top: y }); x += 48; rowH = Math.max(rowH, s.h); });
  await sharp({ create: { width: AW, height: y + rowH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png({ compressionLevel: 9 }).toFile(join(DATA, 'objects.png'));
  writeFileSync(join(DATA, 'objects.json'), JSON.stringify(json));
  console.log('物件列', stripImgs.length);
}
for (const M of all) { writeMap(M); await writeMini(M); }
writeFileSync(join(ROOT, 'tools/town-npcs.json'), JSON.stringify({ npcs, rooms }, null, 1));
console.log('主城 NPC', npcs.length, '室内', rooms.map((r) => r.id).join(' '));
