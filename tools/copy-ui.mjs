// 把验过的界面图从 art/raw 放进 frontend/assets/ui：背景、展台转 JPG，其余 PNG（去掉透明边，最长边 ≤ 600）。
// 用法：node copy-ui.mjs 名字1 名字2 …（不写就用默认清单）
import sharp from 'sharp';
import { existsSync } from 'node:fs';
const RAW = '../art/raw/'; const OUT = '../frontend/assets/ui/';
const JPG = new Set(['bg_title', 'ui_sel_bg', 'ui_stage']);
const list = process.argv.slice(2).length ? process.argv.slice(2) : ['bg_title', 'ui_sel_bg', 'ui_stage', 'ui_panel_stone', 'ui_btn_stone', 'ui_btn_stone_on', 'ui_icon_warrior', 'ui_icon_mage', 'ui_icon_spirit', 'ui_icon_male', 'ui_icon_female', 'btn_start', 'btn_create', 'btn_delete', 'btn_exit'];
for (const k of list) {
  if (!existsSync(RAW + k + '.png')) { console.log('缺', k); continue; }
  if (JPG.has(k)) await sharp(RAW + k + '.png').flatten({ background: '#000' }).jpeg({ quality: 84 }).toFile(OUT + k + '.jpg');
  else await sharp(RAW + k + '.png').trim({ threshold: 6 }).resize(600, 600, { fit: 'inside', withoutEnlargement: true }).png().toFile(OUT + k + '.png');
  console.log('放入', k);
}
