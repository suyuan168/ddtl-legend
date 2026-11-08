// 生成第一张图（晨雾林 df1）的服务端数据：地图表、出生点、刷怪、新怪物、掉落。
// 原版的全量世界数据不再加载（只留在 git 历史里）；名字全部原创。文本按 GBK 写（服务端按 GBK 读）。
import iconv from 'iconv-lite';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(ROOT, 'gamedata/Mir200/Envir');
const gbk = (f, s) => writeFileSync(join(ENV, f), iconv.encode(s.replace(/\n/g, '\r\n'), 'gbk'));

gbk('MapInfo.txt', '; 打到天亮地图表\n[df1 晨雾林]\n');
gbk('StartPoint.txt', '; 出生点\ndf1 60 60\n');
gbk('MiniMap.txt', '');
gbk('Npcs.txt', '');
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
