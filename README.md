# 打到天亮

3 对 3 的浏览器喷墨对战游戏。玩家在训练场选择武器，加入匹配或与好友组队，向地面涂色争夺领地。客户端使用 Phaser，服务端用 Colyseus 同步房间和战斗状态。

## 本地运行

安装 Node.js 22.16 或更高版本，在项目根目录执行以下命令。首次使用需要准备配套的网页移植资源目录，里面应有 `assets/` 和 `data/`。

```sh
npm ci
npm run import:content -- "/path/to/existing-web-port"
npm start
```

打开 [本机游戏](http://127.0.0.1:18846/)，点击「开始游戏」进入训练场。进入匹配入口可选择快速配对、创建房间或使用邀请码加入。静态资源、HTTP API 和 WebSocket 共用服务端口。可通过 `CHILLCAT_PORT` 更换端口。

普通启动使用内存房间。需要保存金币和战绩时，可配置 `CHILLCAT_PG`（PostgreSQL 连接串）。多进程房间协调使用 `CHILLCAT_REDIS`（Redis 连接地址或本机套接字）。macOS 已安装 PostgreSQL 和 Redis 命令行工具时，可使用根目录的 `启动网页游戏.command` 启动带本地持久化的服务。

## 开发与资源

| 路径 | 用途 |
| --- | --- |
| `index.html`、`game/entry.js` | 标题、设置和启动流程 |
| `game/` | 浏览器场景、输入、渲染、战斗规则与联机客户端 |
| `server/` | 匹配、房间、战斗模拟和战绩存储 |
| `assets/brand/`、`tools/brand/` | 新标题美术、可编辑字标和字体许可 |
| `data/`、`assets/` | 配套游戏数值、场景、动作、图像和声音 |
| `library.html` | 可搜索的本地素材与数据表 |

日出标志、标题和启动界面为本项目制作。现有训练场和战斗使用来自 ChillCat Windows 客户端的移植数据与素材。替换图片时同时核对画布、枢轴、武器挂点和队伍着色，替换声音时核对触发时机、音量和循环点。Phaser 和 Colyseus 的许可随附于 `game/vendor/`，字标字体的许可见 `tools/brand/OFL.txt`。

## 回归验证

```sh
npm run verify:combat
npm run verify:equipment
npm run verify:shield
```

请先准备游戏内容。装备和护盾验收需要 Chrome 或 Chromium，可设置 `CHROME_PATH` 或运行 `npx playwright-core install chromium`。浏览器验收使用独立的本机服务，运行结果写入 `verification/`。

原 RPG 版本保存在 [archive/rpg-before-3v3-20261111 分支](https://github.com/suyuan168/ddtl-legend/tree/archive/rpg-before-3v3-20261111)。
