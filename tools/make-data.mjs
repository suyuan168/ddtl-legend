// 生成服务端数据：地图表（主城天亮城 dt0 + 野外晨雾林 df1）、出生点、主城 NPC 和商店脚本、刷怪、新怪物、掉落。
// 先跑 make-map.mjs（它会写 tools/town-npcs.json 给这里用）。
// 原版的全量世界数据不再加载（只留在 git 历史里）；名字全部原创。文本按 GBK 写（服务端按 GBK 读）。
import iconv from 'iconv-lite';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(ROOT, 'gamedata/Mir200/Envir');
const gbk = (f, s) => writeFileSync(join(ENV, f), iconv.encode(s.replace(/\n/g, '\r\n'), 'gbk'));

// —— 地图表：主城和室内是安全区；天亮城东门 ↔ 晨雾林西头；商铺门口 ↔ 室内出口（走到这几格自动换图）
const { npcs: TOWN, rooms: ROOMS } = JSON.parse(readFileSync(join(ROOT, 'tools/town-npcs.json'), 'utf8'));
const gate = (a, xs, ys, b, bx, by) => xs.flatMap((x) => ys.map((y) => `${a} ${x},${y} -> ${b} ${bx},${by}`));
gbk('MapInfo.txt', ['; 打到天亮地图表（SAFE = 安全区）', '[dt0 天亮城] SAFE', '[df1 晨雾林]', ...ROOMS.map((r) => `[${r.id} ${r.name}] SAFE`),
  ...gate('dt0', [77, 78], [38, 39, 40, 41, 42], 'df1', 4, 60), ...gate('df1', [1, 2], [58, 59, 60, 61, 62], 'dt0', 74, 40),
  ...ROOMS.flatMap((r) => [`dt0 ${r.door[0]},${r.door[1]} -> ${r.id} ${r.arrive[0]},${r.arrive[1]}`, ...r.exit.map(([x, y]) => `${r.id} ${x},${y} -> dt0 ${r.out[0]},${r.out[1]}`)])].join('\n') + '\n');
gbk('StartPoint.txt', '; 出生点 / 复活点：天亮城广场\ndt0 40 46\n');

// —— 主城 NPC：外观 appr = 900 + 槽位（客户端 ddnpc 图库，用 pack-actor.mjs ddnpc 打包）；坐标由 make-map.mjs 算好
const LOOK = { n_smith: 0, n_armorer: 1, n_alchemist: 2, n_merchant: 3, n_keeper: 4, n_guide: 5, n_guard: 6 };
gbk('MerChant.txt', ['; 脚本 地图 x y 名字 朝向 外观', ...TOWN.filter((n) => !n.plain).map((n) => [n.script, n.map, n.x, n.y, n.name, 3, 900 + LOOK[n.look]].join(' '))].join('\n') + '\n');
gbk('Npcs.txt', ['; 名字 类型 地图 x y 朝向 外观', ...TOWN.filter((n) => n.plain).map((n) => [n.name, 0, n.map, n.x, n.y, 3, 900 + LOOK[n.look]].join(' '))].join('\n') + '\n');

// —— NPC 脚本（台词全部原创）。脚本里 \ 是换行；%100 = 按原价卖；+N = 收购这类物品（StdMode）
const BR = ' \\';
const wr = (dir, f, rows) => { const d = join(ENV, dir); mkdirSync(d, { recursive: true }); writeFileSync(join(d, f), iconv.encode(rows.join('\r\n') + '\r\n', 'gbk')); };
const shop = (intro, kinds, goods, what) => ['%100', ...kinds.map((k) => '+' + k), '[@main]', ...intro.map((l) => l + BR), BR,
  ` <买/@buy>${what}${BR}`, ` <卖/@sell>${what}${BR}`, ' <离开/@exit>',
  '[@buy]', '看看有什么合用的。' + BR + BR, ' <返回/@main>', '[@sell]', '把要卖的东西放上来，我给你估个价。' + BR + BR, ' <返回/@main>',
  '[goods]', ...goods.map((g) => g + ' 100 100')];
wr('Market_Def', 'dd_weapon.txt', shop(['炉子一直烧着，新打的兵器还热乎。', '出城之前，先挑一把顺手的。'], [5, 6],
  ['练习木剑', '护身匕首', '乌木杖', '青铜短剑', '精铁长剑', '猎刀', '青铜斧', '八荒', '半月', '海魂'], '兵器'));
wr('Market_Def', 'dd_armor.txt', shop(['衣甲、头盔、首饰都在这儿。', '晨雾林里的角兽皮厚，穿结实点再去。'], [10, 11, 15, 19, 20, 21, 22, 23, 24, 26],
  ['粗布衣(男)', '粗布衣(女)', '皮甲(男)', '皮甲(女)', '中型盔甲(男)', '中型盔甲(女)', '青铜盔', '魔法头盔', '古铜戒指', '六角戒指', '铁手镯', '小手镯', '皮制手套', '金项链', '传统项链'], '装备'));
wr('Market_Def', 'dd_potion.txt', shop(['受了伤别硬撑，回血药、回魔药都备着。'], [0],
  ['小回血药', '小回魔药', '中回血药', '中回魔药', '大回血药', '大回魔药'], '药水'));
wr('Market_Def', 'dd_store.txt', shop(['卷轴、火把、技能书，出门要用的杂货我这儿都有。'], [3, 4, 30],
  ['回城卷', '地牢逃脱卷', '随机传送卷', '修复油', '蜡烛', '火把', '铁骨剑意', '裂甲斩', '穿云刺', '炎弹', '震退焰环', '炎浪', '落雷', '回春符', '灵识', '蚀毒符', '灵焰符', '灵御符'], '杂货和技能书'));
wr('Market_Def', 'dd_storage.txt', ['[@main]', '东西放我这儿，丢不了。' + BR + BR, ' <存东西/@storage>' + BR, ' <取东西/@getback>' + BR, ' <离开/@exit>',
  '[@storage]', '把要存的东西交给我。' + BR + BR, ' <返回/@main>', '[@getback]', '要取哪一件？' + BR + BR, ' <返回/@main>']);
wr('Market_Def', 'dd_guide.txt', ['[@main]', '欢迎来到天亮城。' + BR, '广场上是商铺，东门出去就是晨雾林。' + BR + BR,
  ' <送我去晨雾林/@go_df1>' + BR, ' <城里有什么/@about>' + BR, ' <离开/@exit>',
  '[@go_df1]', '#ACT', 'mapmove df1 60 60',
  '[@about]', '北边是铁匠和甲胄师，西边药师，东边杂货商，' + BR, '南边的大石屋是仓库。' + BR, '死了会回到广场。' + BR + BR, ' <返回/@main>']);
wr('Npc_Def', '城门卫兵.txt', ['[@main]', '出了东门就是晨雾林，路上小心。' + BR, '打不过就回城，没人笑话你。' + BR + BR, ' <知道了/@exit>']);
gbk('MiniMap.txt', '');
gbk('MapQuest.txt', '');
// 地图 x y 怪名 范围 数量 刷新分钟
gbk('MonGen.txt', [
  '; 晨雾林：东边草地角兽，西边残柱尸鬼，北边林子甲虫',
  'df1 72 64 角兽 4 5 1', 'df1 50 54 矿坑尸鬼 4 4 1',
  'df1 88 60 角兽 16 14 1', 'df1 74 84 角兽 12 8 1',
  'df1 32 62 矿坑尸鬼 14 12 1', 'df1 40 88 矿坑尸鬼 12 8 1',
  'df1 60 26 洞穴甲虫 16 12 2', 'df1 26 28 洞穴甲虫 10 6 2',
].join('\n') + '\n');
// 新怪：Race 81 普通近战；RaceImg 14 用 MA14 动作表；Appr 900+ 走我们自己的 ddmon 图库
const MON = [
  '角兽,81,14,900,2,0,0,30,16,0,0,0,0,2,0,0,2,6,1500,1,0,2600',
  '矿坑尸鬼,81,14,901,4,1,0,55,40,0,0,0,2,5,0,0,4,7,1600,1,0,2500',
  '洞穴甲虫,81,14,902,7,0,0,95,75,0,2,1,3,7,0,0,5,8,1500,1,0,2400',
];
const csvF = join(ROOT, 'gamedata/mud2/DB/Monster.csv');
const lines = readFileSync(csvF, 'utf8').split(/\r?\n/).filter((l) => l && !/^(角兽|矿坑尸鬼|洞穴甲虫),/.test(l));
writeFileSync(csvF, [...lines, ...MON].join('\n') + '\n');
// 掉落（物品名暂用现有物品表，物品改名在下一步统一做）
mkdirSync(join(ENV, 'MonItems'), { recursive: true });
const drops = {
  角兽: ['1/1 金币 30', '1/3 小回血药', '1/40 粗布衣(男)', '1/60 练习木剑'],
  矿坑尸鬼: ['1/1 金币 45', '1/3 小回血药', '1/4 小回魔药', '1/50 青铜短剑'],
  洞穴甲虫: ['1/1 金币 60', '1/3 中回血药', '1/40 精铁长剑', '1/80 青铜盔'],
};
for (const [n, rows] of Object.entries(drops)) writeFileSync(join(ENV, 'MonItems', n + '.txt'), iconv.encode(rows.join('\r\n') + '\r\n', 'gbk'));
console.log('数据已生成');
