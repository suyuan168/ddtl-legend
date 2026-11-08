// 东方风界面出图队列（2026-11-08 用户定：界面/人物/技能要中国东方元素，线条圆润、不要尖刺）。
// 用法：在已注入 gpt-kit.js 的 ChatGPT 页面执行本文件，再执行 __queue2.push(...__ORI_UI) 或 __ORI_SK。
{
const OU = ' Style: refined Chinese oriental fantasy (xianxia) MMORPG interface art: dark lacquered rosewood and polished celadon jade with soft gold filigree, auspicious cloud (xiangyun) and gentle scroll motifs, ROUNDED soft corners and smooth flowing curves, absolutely NO sharp spikes, thorns or pointed blades on the frame, elegant and calm, finely painted with soft shading. ORIGINAL design. A STATIC single image (not animated).';
const T = ' Fully transparent background outside the object (no white, no checkerboard), front view, flat, single object only.';
const NT = ' No text, no letters, no logos.';
const BG = ' Opaque, fills the whole image edge to edge.';
const U = (n, d) => [n, 3, false, d + OU + NT + T];
const I = (n, d) => [n, 1, false, d + OU + NT + T];
const TX = (n, word, d) => [n, 3, false, d + ' with the Chinese text 「' + word + '」 (exactly these characters, nothing else) written in the center in elegant bold gold Chinese serif calligraphy, clearly legible.' + OU + T];
const BGI = (n, d) => [n, 2, false, d + OU + NT + BG];
window.__ORI_UI = [
  // —— 主界面底板（照 JootM2 原版 800×251 底板的分区，拆成几块拼）
  U('hud_base', 'A single long horizontal BOTTOM HUD PANEL plate (about 5 times wider than tall): a lacquered dark rosewood console with a jade inlay line along the top edge, gentle cloud carvings at both ends, the surface is plain and empty'),
  U('hud_orb_frame', 'A single round ORNAMENTAL FRAME for a health and mana globe: a thick circular ring of dark rosewood and gold with two soft stylized cloud scrolls curling around it, the round center is an empty fully transparent hole'),
  U('hud_frame_chat', 'A single empty wide CHAT and MESSAGE BOX frame (about 3.5 times wider than tall): thin rounded rosewood frame with small jade corner beads, the inside is a dark translucent ink-black panel (empty)'),
  U('hud_frame_minimap', 'A single empty square MINIMAP FRAME: rounded rosewood and gold square border with a small rounded empty name plate on top and soft cloud corners, the inside is a fully transparent square window'),
  U('hud_frame_panel', 'A single empty rectangular INFO PANEL frame (landscape, about 2.3 times wider than tall): thin rounded rosewood frame with jade corner beads, inside a dark translucent ink panel (empty)'),
  U('hud_slot', 'A single empty square ITEM SLOT socket with softly rounded corners: dark recessed lacquer square with a thin gold and jade bevel (empty center)'),
  U('hud_statusbar', 'A single very long thin horizontal STATUS BAR strip (about 25 times wider than tall): dark lacquered wood strip with a thin gold top line and tiny cloud ornaments at both ends (empty)'),
  U('hud_bar_frame', 'A single empty long thin horizontal PROGRESS BAR frame (about 7 times wider than tall): rounded dark lacquer groove with gold rim and jade end caps, the inside groove is empty and dark'),
  I('hud_btn_equip', 'A single round HUD BUTTON: jade ring with gold rim, the center shows a small Chinese lamellar armor vest icon'),
  I('hud_btn_bag', 'A single round HUD BUTTON: jade ring with gold rim, the center shows a small embroidered silk pouch icon'),
  I('hud_btn_skill', 'A single round HUD BUTTON: jade ring with gold rim, the center shows a small open bamboo scroll icon'),
  I('hud_btn_sound', 'A single round HUD BUTTON: jade ring with gold rim, the center shows a small bronze bell icon'),
  I('hud_btn_round', 'A single empty round HUD BUTTON: jade ring with a soft gold rim, the center is an empty dark lacquer disc'),
  I('hud_btn_attack', 'A single LARGE round ATTACK BUTTON: thick jade and gold ring with soft cloud scrolls, the center shows a Chinese straight sword (jian) with a red tassel, glowing faintly'),
  I('hud_btn_lock', 'A single round HUD BUTTON: jade ring with gold rim, the center shows a small target circle made of a curling cloud'),
  I('hud_btn_pick', 'A single round HUD BUTTON: jade ring with gold rim, the center shows a small open hand holding a gold ingot (yuanbao)'),
  U('hud_joy_base', 'A single round VIRTUAL JOYSTICK BASE: a wide flat translucent jade ring with a soft gold rim and four small cloud marks pointing up/down/left/right, the center is an empty darker recessed disc'),
  I('hud_joy_knob', 'A single round JOYSTICK KNOB: a polished round jade disc with a gold rim and a soft taiji-like swirl pattern'),
  // —— 窗口
  U('ui_dlg_npc', 'A single empty NPC DIALOGUE WINDOW frame, wide landscape (about 2.6 times wider than tall): rounded rosewood frame with jade corner medallions and a small cloud ornament at the top center, the inside is a large flat dark ink-brown panel, slightly translucent, completely empty'),
  U('ui_dlg_list', 'A single empty SHOP LIST WINDOW frame, portrait (about 1.25 times taller than wide): rounded rosewood frame with jade corner beads, a narrow empty title band across the top inside, below it a large flat dark panel, and a thin empty band at the bottom, all completely empty'),
  U('ui_dlg_sell', 'A single small empty SELL WINDOW frame, portrait (about 1.3 times taller than wide): rounded rosewood frame, a narrow empty title band at the top, and in the middle one empty square recessed item socket with rounded corners and a gold bevel'),
  U('ui_win_land', 'A single empty INVENTORY WINDOW frame, landscape (about 1.25 times wider than tall): rounded rosewood frame with jade corner medallions and a small cloud ornament at the top center, the inside is one large flat dark panel, completely empty'),
  U('ui_win_tall', 'A single empty CHARACTER WINDOW frame, tall portrait (about 1.55 times taller than wide): rounded rosewood frame with jade corner medallions, a narrow empty rounded name band at the top inside, the rest is one large flat dark panel, completely empty'),
  BGI('ui_state_doll', 'A dark ink-wash silk panel background for a character equipment screen, portrait (about 1.4 times taller than wide): in the center a faint gold-line outline of a standing figure wearing flowing Chinese robes and light armor, soft swirling clouds around'),
  I('ui_btn_close', 'A single small round CLOSE BUTTON: jade ring with a dark red lacquer center bearing a soft gold X cross with rounded ends'),
  U('ui_btn_plate', 'A single empty wide BUTTON plate (about 3 times wider than tall): rounded lacquered rosewood plate with jade end caps and a thin gold rim, empty center'),
  // —— 进游戏 / 选角
  U('ui_btn_stone', 'A single empty wide BUTTON plate (about 3 times wider than tall): rounded lacquered rosewood plate with jade end caps and a thin gold rim, empty center'),
  U('ui_btn_stone_on', 'A single empty wide BUTTON plate (about 3 times wider than tall), highlighted: rounded lacquered rosewood plate with glowing jade end caps and a bright warm gold rim with a soft golden glow, empty center'),
  U('ui_panel_stone', 'A single empty tall rectangular PANEL: rounded dark lacquered rosewood board with a soft gold border and small jade corner beads, the inner area is a plain dark surface (empty)'),
  U('ui_slot_stone', 'A single empty wide character SLOT panel (about 2.5 times wider than tall): rounded rosewood plate with a gold rim and three thin empty recessed label lines'),
  U('ui_icon_warrior', 'A single square ICON tile with rounded corners and a jade-and-gold frame, showing a Chinese guandao halberd crossed with a straight sword'),
  U('ui_icon_mage', 'A single square ICON tile with rounded corners and a jade-and-gold frame, showing a swirling orb of fire held above an open palm'),
  U('ui_icon_spirit', 'A single square ICON tile with rounded corners and a jade-and-gold frame, showing a yellow paper talisman and a small bronze bell'),
  U('ui_icon_male', 'A single square ICON tile with rounded corners and a jade-and-gold frame, showing the elegant profile of a young Chinese man with a topknot'),
  U('ui_icon_female', 'A single square ICON tile with rounded corners and a jade-and-gold frame, showing the elegant profile of a young Chinese woman with a hair bun and hairpin'),
  TX('btn_start', '开始游戏', 'A single wide rounded rosewood BUTTON with jade end caps'),
  TX('btn_create', '创建角色', 'A single wide rounded rosewood BUTTON with jade end caps'),
  TX('btn_delete', '删除角色', 'A single wide rounded rosewood BUTTON with jade end caps'),
  TX('btn_exit', '退出', 'A single wide rounded rosewood BUTTON with jade end caps'),
  TX('btn_submit', '提交', 'A single wide rounded rosewood BUTTON with jade end caps'),
  TX('btn_select', '选择', 'A single wide rounded rosewood BUTTON with jade end caps'),
  TX('btn_random', '随机', 'A single wide rounded rosewood BUTTON with jade end caps'),
  TX('btn_back', '返回', 'A single wide rounded rosewood BUTTON with jade end caps'),
  TX('btn_enter', '进入游戏', 'A single large wide rounded rosewood BUTTON with jade end caps and soft cloud scrolls'),
  TX('title_logo', '打到天亮', 'A single game TITLE LOGO: the characters are large bold flowing gold brush calligraphy with a soft dawn glow, framed by gentle auspicious clouds and a small rising sun behind'),
  BGI('bg_title', 'A single wide landscape 16:9 TITLE BACKGROUND: dawn breaking over misty Chinese mountains, an ancient walled city with curved-roof pavilions below, soft golden light rising through the clouds, painted scenery, no characters'),
  BGI('ui_sel_bg', 'A single wide landscape 16:9 BACKGROUND for a character selection screen: inside a quiet ancient Chinese hall at night, red lacquered pillars, paper lanterns glowing softly, carved wooden lattice windows, empty center (no characters)'),
  BGI('ui_sel_bg2', 'A single wide landscape 16:9 BACKGROUND for a character creation screen: a moonlit Chinese courtyard with a round moon gate, plum blossom branches and soft mist, empty center (no characters)'),
  BGI('ui_stage', 'A single tall portrait image of a round MOON GATE in a dark lacquered wall used as a character display stage: inside is soft darkness with a gentle circular pool of pale moonlight on the stone floor in the center, empty (no character)'),
];
}
'prompts ok ' + window.__ORI_UI.length;
// —— 三职业人物（5 个方向，左边三个方向由 pack-actor 镜像），动作和帧数照原来：站 4 帧、走 6 帧、攻击 6 帧、倒地 6 帧
{
const D = { s: 'facing DOWN toward the viewer (front view)', se: 'facing DOWN-RIGHT toward the bottom-right corner (3/4 front view)', e: 'facing RIGHT (pure side view, looking to the right)', ne: 'facing UP-RIGHT toward the top-right corner (3/4 back view)', n: 'facing UP away from the viewer (back view)' };
const DES = {
  hw: 'WARRIOR character in Chinese wuxia style: tall broad-shouldered young man, long black hair tied in a high ponytail with a red ribbon, dark lacquered lamellar armor with bronze plates over a crimson robe, rounded cloud-pattern shoulder guards, red waist sash, holding a large Chinese broadsword (dadao) with a red tassel',
  hm: 'MAGE character in Chinese xianxia style: slender young woman, long black hair held with jade hairpins, flowing layered robes of deep blue and white with silver cloud embroidery and wide sleeves, holding a slim wooden staff topped with a glowing blue jade orb',
  hs: 'TAOIST PRIEST character in Chinese xianxia style: young man with hair in a topknot under a small crown, grey-green and white Taoist robes with a black-and-white taiji emblem on the chest, holding a peach-wood sword in one hand and a glowing yellow paper talisman in the other',
};
const ATK = { hw: 'swinging the broadsword in a powerful diagonal slash, a short bright arc trail', hm: 'thrusting the staff forward with a burst of blue spell light at the jade orb', hs: 'flicking a glowing yellow talisman forward with a sweep of the peach-wood sword' };
const A = { stand: (p) => 'ANIMATED GIF (.gif, looping, 4 frames): idle stance with subtle breathing motion', walk: (p) => 'ANIMATED GIF (.gif, looping, 6 frames): walking cycle in place, legs and arms swinging, body does not move across the frame', atk: (p) => 'ANIMATED GIF (.gif, looping, 6 frames): ' + ATK[p], die: (p) => 'ANIMATED GIF (.gif, NOT looping, 6 frames): knocked down in battle, staggering and falling onto the ground, the last frame lying still on the ground' };
const ST = ' Camera: high isometric 45-degree overhead view like classic 2D PC MMORPGs (exactly the same camera for every image). Pre-rendered 3D look converted to finely detailed pixel art, realistic proportions (NOT chibi), elegant Chinese palette (crimson, jade, ink black, gold), soft shading. Fully transparent background (no white, no checkerboard), no ground shadow, no text, single subject only, whole body inside the frame, same size and scale in every frame.';
const mk = (p, a, d) => [p + '_' + a + '_' + d, 160, false, A[a](p) + ', ' + D[d] + '. Subject: the SAME ' + DES[p] + ' (identical design, colors and equipment in every image).' + ST];
window.__ORI_CH = [];
for (const p of ['hw', 'hm', 'hs']) for (const a of ['stand', 'walk', 'atk', 'die']) for (const d of ['s', 'se', 'e', 'ne', 'n']) window.__ORI_CH.push(mk(p, a, d));
const P = ' Refined painted style like high-end Chinese xianxia MMORPG character splash art: soft cinematic lighting, gentle mist and drifting clouds around the feet, rich color accents, crisp intricate detail on armor and silk, confident heroic stance, full body visible from head to feet, ORIGINAL design. A STATIC single image. Fully transparent background (no white, no checkerboard), no text, single character only.';
window.__ORI_CH.push(['cls_warrior2', 3, false, 'Full-body character art of a ' + DES.hw + '.' + P], ['cls_mage2', 3, false, 'Full-body character art of a ' + DES.hm + '.' + P], ['cls_spirit2', 3, false, 'Full-body character art of a ' + DES.hs + '.' + P]);
// —— 技能图标（圆形，玉环金边，不要尖刺）
const SI = ' A single ROUND SKILL ICON for a Chinese xianxia MMORPG: a round jade-and-gold ring frame with soft cloud scrolls (rounded, no spikes), inside a richly painted emblem with glowing effects, high detail, soft cinematic lighting. ORIGINAL design. A STATIC single image (not animated). Fully transparent background outside the round frame (no white, no checkerboard), no text.';
const SK = { 1: 'a blazing fireball flying forward', 2: 'a green glowing healing talisman paper with a lotus blossom', 3: 'a Chinese straight sword with a calm glowing blade aura', 5: 'a huge roaring fireball shaped like a fire phoenix head', 6: 'a talisman releasing green poison mist with a coiled snake silhouette', 7: 'a heavy broadsword strike cracking an armor plate', 8: 'a ring of fire bursting outward from an open palm', 9: 'a stream of flame spewing forward', 10: 'a straight bolt of white lightning piercing forward', 11: 'a lightning bolt striking down from dark clouds', 12: 'a sword thrust piercing straight through clouds', 13: 'a burning yellow talisman flying with blue spirit flame', 14: 'a translucent shield of swirling clouds around a talisman', 15: 'a golden armor glow around a floating talisman', 17: 'a skeletal spirit warrior rising from a glowing talisman circle', 18: 'a fading ghostly figure dissolving into mist', 21: 'a figure vanishing in a swirl of purple light', 22: 'a wall of fire rising from the ground', 23: 'a fiery explosion bursting from the ground', 24: 'a lightning storm radiating around a figure', 25: 'a crescent sword sweep with swirling wind', 26: 'a sword blade wreathed in roaring flames', 27: 'a charging shoulder rush with a bull-shaped golden energy', 29: 'several green healing talismans circling in a ring', 30: 'a summoned white-blue spirit qilin beast', 31: 'a shimmering blue magic shield bubble', 33: 'a burst of ice crystals spreading outward' };
window.__ORI_SK = Object.entries(SK).map(([id, d]) => ['sk_' + id, 1, false, 'Emblem: ' + d + '.' + SI]);
}
