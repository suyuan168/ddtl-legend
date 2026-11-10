// 把验过的界面图从 art/raw 放进 frontend/assets/ui：背景、展台转 JPG，其余 PNG（去掉透明边，最长边 ≤ 600）。
// 用法：node copy-ui.mjs 名字1 名字2 …（不写就用默认清单）
import sharp from 'sharp';
import { existsSync } from 'node:fs';
const RAW = '../art/raw/'; const OUT = '../frontend/assets/ui/';
const JPG = new Set(['bg_title', 'ui_sel_bg', 'ui_stage', 'ui_sel_bg2']);
const list = process.argv.slice(2).length ? process.argv.slice(2) : ['bg_title', 'ui_sel_bg', 'ui_stage', 'ui_panel_stone', 'ui_btn_stone', 'ui_btn_stone_on', 'ui_icon_warrior', 'ui_icon_mage', 'ui_icon_spirit', 'ui_icon_male', 'ui_icon_female', 'btn_start', 'btn_create', 'btn_delete', 'btn_exit'];
for (const k of list) {
  if (!existsSync(RAW + k + '.png')) { console.log('缺', k); continue; }
  if (JPG.has(k)) await sharp(RAW + k + '.png').flatten({ background: '#000' }).jpeg({ quality: 84 }).toFile(OUT + k + '.jpg');
  else if (k === 'hud_frame_minimap' || /^cls_.*2$/.test(k)) {
    // 从边缘/中心往里灌：小地图框把中间的白底/棋盘格抠空；立绘把四周纯黑或纯白底抠掉
    const { data, info } = await sharp(RAW + k + '.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height; const seen = new Uint8Array(W * H); const st = [];
    const bg = (i) => { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3]; if (a < 20) return true; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return (mn > 190 && mx - mn < 28) || mx < 26; };
    if (k === 'hud_frame_minimap') st.push((H >> 1) * W + (W >> 1)); else { for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1); }
    while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (!bg(i)) continue; data[i * 4 + 3] = 0; const x = i % W, y = (i / W) | 0; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W); }
    await sharp(data, { raw: info }).trim({ threshold: 6 }).resize(600, 600, { fit: 'inside', withoutEnlargement: true }).png().toFile(OUT + k + '.png');
  }
  else if (/^(hud_btn_|sk_|hud_joy_)/.test(k)) {
    // 圆形件：裁成正方形，圆以外全部透明（去掉 GPT 留下的黑色方角）
    const S = k.startsWith('sk_') ? 160 : 220;
    const sq = await sharp(RAW + k + '.png').trim({ threshold: 6 }).resize(S, S, { fit: 'cover' }).png().toBuffer();
    const mask = Buffer.from(`<svg width="${S}" height="${S}"><circle cx="${S / 2}" cy="${S / 2}" r="${S / 2 - 1}" fill="#fff"/></svg>`);
    await sharp(sq).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(OUT + k + '.png');
  }
  else await sharp(RAW + k + '.png').trim({ threshold: 6 }).resize(600, 600, { fit: 'inside', withoutEnlargement: true }).png().toFile(OUT + k + '.png');
  console.log('放入', k);
}
