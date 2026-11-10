// 全局常量（对应旧 ClMain.pas 常量 + Grobal2.pas）

// 横屏：高度固定 600，宽度跟屏幕比例（手机约 1200~1300），电脑窗口最少 800
const _vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
const _vh = typeof window !== 'undefined' ? window.innerHeight : 600;
export const SCREEN_HEIGHT = 600;
export const SCREEN_WIDTH = Math.max(800, Math.min(1400, Math.round(600 * _vw / _vh / 2) * 2));

export const UNIT_X = 48;   // 等距格子宽度（像素）
export const UNIT_Y = 32;   // 等距格子高度（像素）

export const MAPSURFACEWIDTH = SCREEN_WIDTH;    // 地图可视宽度（整屏）
export const MAPSURFACEHEIGHT = SCREEN_HEIGHT;  // 画布界面浮在地图上，不再留底栏

// 版本（对应 ClientVersion）
export const CLIENT_VERSION = 20030422;
