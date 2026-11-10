import {
  constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const usage = '用法：node tools/import-game-content.mjs "/path/to/existing-web-port"\n来源目录应包含网页移植工程的 assets/ 和 data/assets.json。';
const words = text => text.trim().split(/\s+/);

// These are the exported datasets consumed by the game, the library and the local QA tools.
const tables = words(`Achievement AllowWords ControlKey DeniedWords EmojiAsset Entity EntityAsset FloatingTextView
  GameItem GameKey GameMap GameMode GradeAsset Item ItemAsset ItemBox Movement PaintAsset Product Record Reward
  Schedule Skill SkillAsset Sound Stat Team Weapon WeaponAsset Zone`);
const scenes = words(`level0 level1 level2 level3 globalgamemanagers.assets resources.assets sharedassets0.assets
  sharedassets2.assets sharedassets3.assets CAB-9af87c37da7e1a51ca3d15ef8d965243`);
const views = words(`actor battle-bindings bomb-entities bomb-radii bot-tree bot-waypoints buff-effects bush-leaves
  bushes camera chat chat-words combat-evidence daily-result-motion death-particles dummy-feedback emoji-element
  entity-depth equipment explosion-particles gacha-views laser-particle loading lobby lobby-zones map-pad-motion
  missile-outline missiles muzzle-particles original-level1 original-level2 paint-gauge player-hit player-labels
  preview-registration product-version projectiles result-gauge-poses startup-splash time-gauges title ui ui-audio
  ultimate-views vent-motion weapon-motion weapon-parameters M_2 M_3 M_4 M_5 motion-Hammer_Attack motion-preview
  motion-title motion-Bomb_5_Explosion`);
for (const facing of ['Front', 'Back']) {
  for (const pose of words('Idle Walk Boost Boost_ON Dead_Left Dead_Right')) views.push(`motion-${facing}_${pose}`);
}
for (let bomb = 1; bomb <= 5; bomb++) {
  for (const pose of ['Idle', 'Set', 'Throw']) views.push(`motion-Bomb_${bomb}_${pose}`);
}

const extensions = new Map(Object.entries({
  AnimationClip: ['.json.gz'], AnimatorController: ['.json.gz'], AnimatorOverrideController: ['.json.gz'],
  AudioClip: ['.wav'], Font: ['.ttf', '.otf'], Material: ['.json.gz'], Mesh: ['.obj'], Sprite: ['.png'],
  SpriteAtlas: ['.json.gz'], TextAsset: ['.bytes'], Texture2D: ['.png'],
}));
function assetPath(file) {
  // Exporter paths are URL paths as well as filenames. Reject Windows device names, encoded paths and URL suffixes.
  if (typeof file !== 'string') throw new Error('资源索引包含无效的 file 字段');
  const parts = file.split('/');
  const [, group, name] = parts;
  if (parts.length !== 3 || parts[0] !== 'assets' || !extensions.get(group)?.some(ext => name.endsWith(ext)) ||
      !/^[\p{L}\p{N}_][\p{L}\p{N} ()_.-]*$/u.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)\./i.test(name)) {
    throw new Error('资源索引包含不支持的文件路径');
  }
  return file;
}

function requireDirectory(path) {
  if (!lstatSync(path).isDirectory()) throw new Error(`需要实际目录 ${path}`);
}
function requireFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || !stat.size) throw new Error(`需要非空的普通文件 ${path}`);
}
function parseFile(path) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!data || typeof data !== 'object' || !Object.keys(data).length) throw new Error('需要非空对象或数组');
    return data;
  } catch {
    throw new Error(`需要有效且非空的 JSON 数据 ${path}`);
  }
}

function validateDatabase(path, values) {
  const db = readFileSync(path);
  if (db.length < 100 || db.toString('latin1', 0, 16) !== 'SQLite format 3\0') throw new Error('数值数据库格式异常');
  const pageSize = db.readUInt16BE(16) === 1 ? 65536 : db.readUInt16BE(16);
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0 || db.readUInt32BE(28) * pageSize !== db.length) {
    throw new Error('数值数据库文件长度与页数不符');
  }

  // node:sqlite became available without a flag in 22.13; early Node 22 still supports file-level validation.
  let sqlite;
  try { sqlite = createRequire(import.meta.url)('node:sqlite'); }
  catch (error) { if (error.code === 'ERR_UNKNOWN_BUILTIN_MODULE') return; throw error; }
  const connection = new sqlite.DatabaseSync(path, { readOnly: true });
  try {
    connection.exec('PRAGMA trusted_schema=OFF');
    const entries = connection.prepare("SELECT name, type FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all();
    if (entries.length !== tables.length || entries.some(row => row.type !== 'table' || !tables.includes(row.name))) {
      throw new Error('数值数据库表名与游戏数值表不符');
    }
    if (connection.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('数值数据库校验失败');
    for (const table of tables) {
      if (connection.prepare(`SELECT count(*) AS rows FROM "${table}"`).get().rows !== values[table].length) {
        throw new Error(`数值数据库行数与游戏数值表不符 ${table}`);
      }
    }
  } finally { connection.close(); }
}

function stageContent(source, stage) {
  const files = new Set();
  const checked = new Set();
  function copy(relative) {
    if (files.has(relative)) return;
    const parts = relative.split('/');
    let parent = source;
    for (const part of parts.slice(0, -1)) {
      parent = join(parent, part);
      if (!checked.has(parent)) {
        requireDirectory(parent);
        checked.add(parent);
      }
    }
    const from = join(source, relative), to = join(stage, relative);
    requireFile(from);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to, constants.COPYFILE_FICLONE);
    files.add(relative);
  }
  function json(relative) {
    copy(relative);
    return parseFile(join(stage, relative));
  }

  const catalog = json('data/assets.json');
  if (!Array.isArray(catalog)) throw new Error('data/assets.json 应为资源列表');
  const names = new Map();
  const ids = new Set();
  for (const asset of catalog) {
    if (!asset || typeof asset.id !== 'string' || !asset.id || ids.has(asset.id) ||
        typeof asset.type !== 'string' || typeof asset.name !== 'string' || !Array.isArray(asset.originalPaths)) {
      throw new Error('data/assets.json 含有无效或重复的资源记录');
    }
    ids.add(asset.id);
    // Exporter diagnostics can contain absolute paths on the original author's machine.
    delete asset.issue;
    if (asset.file == null || asset.file === '') continue;
    const file = assetPath(asset.file);
    const key = file.normalize('NFC').toLowerCase();
    if (names.has(key) && names.get(key) !== file) throw new Error(`文件名在跨平台导入时冲突 ${file}`);
    names.set(key, file);
    copy(file);
  }
  if (!names.size) throw new Error('资源索引没有可导入的文件');
  writeFileSync(join(stage, 'data/assets.json'), JSON.stringify(catalog) + '\n');

  const values = json('data/tables.json'), schema = json('data/schema.json');
  for (const table of tables) {
    if (!Array.isArray(values[table]) || !values[table].length || schema[table]?.rows !== values[table].length) {
      throw new Error(`数值表缺失或行数与 schema 不符 ${table}`);
    }
  }
  const requiredViews = new Set(views);
  for (const map of values.GameMap.filter(row => row.ModeType === 'PaintBattle')) {
    if (!/^M_\d+$/.test(map.MapData)) throw new Error('GameMap 包含无效的地图文件名');
    requiredViews.add(map.MapData);
  }
  for (const view of requiredViews) json(`data/views/${view}.json`);
  for (const scene of scenes) json(`data/scenes/${scene}.json`);
  json('data/localization.json');
  json('data/demo-profile.json');
  const trig = 'data/views/fp-sincos-delta.gz';
  copy(trig);
  // The combat simulation indexes a pair of signed deltas for every fixed-point angle in [0, 0x6487f).
  if (gunzipSync(readFileSync(join(stage, trig)), { maxOutputLength: 2 * 0x6487f }).length !== 2 * 0x6487f) {
    throw new Error(`${trig} 查找表长度异常`);
  }
  const database = 'data/chillcat.sqlite';
  copy(database);
  validateDatabase(join(stage, database), values);
  if (existsSync(join(source, 'assets/title-first-frame.webp'))) copy('assets/title-first-frame.webp');
  // Publish the catalog only after its target files are in place.
  files.delete('data/assets.json');
  files.add('data/assets.json');
  return { files, assets: names.size };
}

function install(stage, files, backup) {
  const changes = [];
  const installed = [];
  const parents = new Set();
  for (const relative of files) {
    const path = join(root, relative);
    let parent = root;
    for (const part of relative.split('/').slice(0, -1)) {
      parent = join(parent, part);
      if (parents.has(parent)) continue;
      const meta = lstatSync(parent, { throwIfNoEntry: false });
      if (meta && !meta.isDirectory()) throw new Error(`目标路径不是实际目录 ${parent}`);
      parents.add(parent);
    }
    const existing = lstatSync(path, { throwIfNoEntry: false });
    if (existing && !existing.isFile()) throw new Error(`目标路径不是普通文件 ${path}`);
    if (existing) {
      if (readFileSync(path).equals(readFileSync(join(stage, relative)))) continue;
      const saved = join(backup, relative);
      mkdirSync(dirname(saved), { recursive: true });
      copyFileSync(path, saved, constants.COPYFILE_FICLONE);
    }
    changes.push({ relative, path, existing: Boolean(existing) });
  }
  try {
    for (const change of changes) {
      mkdirSync(dirname(change.path), { recursive: true });
      renameSync(join(stage, change.relative), change.path);
      installed.push(change);
    }
  } catch (error) {
    const failures = [];
    for (const change of installed.reverse()) {
      try {
        if (change.existing) renameSync(join(backup, change.relative), change.path);
        else rmSync(change.path);
      } catch { failures.push(change.relative); }
    }
    if (failures.length) {
      const failure = new Error(`恢复 ${failures.length} 个文件失败，原始备份保留在 ${backup}`);
      failure.keepBackup = true;
      throw failure;
    }
    throw error;
  }
  return changes.length;
}

function run(sourcePath) {
  const source = realpathSync(resolve(sourcePath));
  if (source === root) throw new Error('请选择另一个已有网页游戏工程作为来源');
  const lock = join(root, '.game-content-import.lock');
  try {
    writeFileSync(lock, String(process.pid) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`存在导入锁 ${lock}。请等另一导入进程结束；若它被强制终止，确认退出后删除锁并重试。`);
  }
  let work;
  try {
    work = mkdtempSync(join(root, '.game-content-import-'));
    const stage = join(work, 'new');
    const { files, assets } = stageContent(source, stage);
    const changed = install(stage, files, join(work, 'previous'));
    console.log(`已校验 ${assets} 个索引资产文件。共 ${files.size} 个内容文件，更新 ${changed} 个。`);
  } catch (error) {
    if (error.keepBackup) work = undefined;
    throw error;
  } finally {
    try { if (work) rmSync(work, { recursive: true, force: true }); }
    finally { rmSync(lock); }
  }
}

const args = process.argv.slice(2);
if (args.length === 1 && ['-h', '--help'].includes(args[0])) console.log(usage);
else if (args.length !== 1 || !args[0]) { console.error(usage); process.exitCode = 2; }
else {
  try { run(args[0]); }
  catch (error) { console.error(`导入失败：${error.message}`); process.exitCode = 1; }
}
