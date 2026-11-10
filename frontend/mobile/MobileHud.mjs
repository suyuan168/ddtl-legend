// 触屏操作 + 画布界面（替代原版 DOM HUD，手机横屏用）。
// 左下摇杆：拖动走路，推到外圈跑；右下：攻击（自动锁定最近的怪）、4 个技能、药水、拾取；
// 点地图上的怪 → 锁定攻击，点 NPC → 对话。界面全部画在 canvas 上，风格：暗木铁框 + 金边。
import { SCREEN_WIDTH as W, SCREEN_HEIGHT as H } from '../core/config.mjs';
import { getLib } from '../image/Images.mjs';

const DIR8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // 0 上 … 7 左上
const STICK_R = 62;
const PASSIVE = new Set([3, 4, 7, 12]);   // 被动技能，不能放到技能栏
const SKILL_KEYS = [1, 2, 3, 4, 5];
const GOLD = '#c8a24a'; const GOLD_HI = '#f2d68a'; const IRON = '#3a3530'; const PANEL = 'rgba(18,14,10,0.78)';

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function frame(ctx, x, y, w, h, r = 6) {
    rr(ctx, x, y, w, h, r); ctx.fillStyle = PANEL; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = IRON; ctx.stroke();
    rr(ctx, x + 2, y + 2, w - 4, h - 4, r - 1); ctx.lineWidth = 1; ctx.strokeStyle = GOLD; ctx.stroke();
}
function bar(ctx, x, y, w, h, k, c1, c2, text) {
    rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = '#0c0a08'; ctx.fill();
    if (k > 0) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); rr(ctx, x + 1, y + 1, Math.max(h, (w - 2) * Math.min(1, k)), h - 2, (h - 2) / 2); ctx.fillStyle = g; ctx.fill(); }
    rr(ctx, x, y, w, h, h / 2); ctx.strokeStyle = 'rgba(200,162,74,.7)'; ctx.lineWidth = 1; ctx.stroke();
    if (text) { ctx.font = 'bold 11px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(text, x + w / 2, y + h / 2 + 0.5); ctx.fillStyle = '#fff'; ctx.fillText(text, x + w / 2, y + h / 2 + 0.5); }
}
function roundBtn(ctx, x, y, r, label, opt = {}) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, opt.hi || '#5a4636'); g.addColorStop(1, opt.lo || '#1c1510');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.globalAlpha = opt.alpha ?? 0.92; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ctx.strokeStyle = IRON; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = opt.pressed ? GOLD_HI : GOLD; ctx.stroke();
    if (label) { ctx.font = `bold ${opt.size || 14}px "DDSerif","Microsoft YaHei",serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(label, x, y + 1); ctx.fillStyle = opt.color || GOLD_HI; ctx.fillText(label, x, y + 1); }
}

// 界面贴图（GPT 原创）：frontend/assets/ui/*.png，缺图时用代码画的兜底
// 按需加载的界面图（GPT 原创）：没到之前返回 null，画面用代码兜底
const LAZY = {};
function ui(k) { if (!(k in LAZY)) { LAZY[k] = null; const im = new Image(); im.onload = () => { LAZY[k] = im; }; im.src = 'assets/ui/' + k + '.png'; } return LAZY[k]; }
function pic(ctx, k, x, y, w, h) { const im = ui(k); if (!im) return false; ctx.drawImage(im, x, y, w, h); return true; }
const BTN_ART = { attack: 'hb_attack', lock: 'hud_btn_lock', pickup: 'hud_btn_pick' };
const UI = {};
for (const k of ['hud_orb_frame', 'hud_orb_red', 'hud_orb_blue', 'hud_panel', 'hud_btn']) {
    const im = new Image(); im.onload = () => { UI[k] = im; }; im.src = 'assets/ui/' + k + '.png';
}
let UIMETA = {};   // 球框空洞的圆心和半径（tools/fix-ui.mjs 量出来的）
fetch('assets/ui/ui.json').then((r) => r.json()).then((j) => { UIMETA = j; }).catch(() => {});
// 血魔球：液面按比例从下往上，表面微微晃动；外面套金属球框
// 一个球分左右两半：左半血（红）、右半蓝（蓝），两边液面各自升降，中间一道竖隔
function splitOrb(ctx, cx, cy, r, hpK, mpK, now) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#0a0606'; ctx.fill(); ctx.restore();
    liquid(ctx, cx, cy, r, hpK, 'red', now, -1);
    liquid(ctx, cx, cy, r, mpK, 'blue', now, 1);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(20,14,8,.9)'; ctx.fillRect(cx - 1.5, cy - r, 3, r * 2); ctx.fillStyle = 'rgba(200,162,74,.6)'; ctx.fillRect(cx - 0.5, cy - r, 1, r * 2);
    const hl = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, 1, cx - r * 0.3, cy - r * 0.4, r * 0.7); hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    const F = UIMETA.frame;
    if (UI.hud_orb_frame && F) { const s = (r + 3) / F.r; ctx.drawImage(UI.hud_orb_frame, cx - F.cx * s, cy - F.cy * s, F.w * s, F.h * s); }
    else { ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = IRON; ctx.stroke(); }
}
// 半边液体：side -1 只画左半，1 只画右半
function liquid(ctx, cx, cy, r, k, kind, now, side) {
    k = Math.max(0, Math.min(1, k));
    const top = cy + r - 2 * r * k; const wob = Math.sin(now / 380 + (kind === 'red' ? 0 : 2)) * 2.2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); ctx.rect(side < 0 ? cx - r : cx, cy - r, r, r * 2); ctx.clip();
    ctx.beginPath(); ctx.moveTo(cx - r, cy + r + 2);
    for (let x = -r; x <= r; x += 4) ctx.lineTo(cx + x, top + Math.sin(x / 9 + now / 300) * 1.6 + wob * (x / r));
    ctx.lineTo(cx + r, cy + r + 2); ctx.closePath(); ctx.clip();
    const tex = UI[kind === 'red' ? 'hud_orb_red' : 'hud_orb_blue'];
    if (tex) ctx.drawImage(tex, cx - r, cy - r, r * 2, r * 2);
    else { const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); if (kind === 'red') { g.addColorStop(0, '#ff7a5a'); g.addColorStop(0.5, '#b8160e'); g.addColorStop(1, '#3a0404'); } else { g.addColorStop(0, '#7ab0ff'); g.addColorStop(0.5, '#1a46c8'); g.addColorStop(1, '#040c3a'); } ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }
    // 液面亮线 + 往上冒的小气泡，看得出“还剩多少药”
    if (k > 0.02 && k < 0.99) { ctx.strokeStyle = kind === 'red' ? 'rgba(255,190,170,.75)' : 'rgba(190,215,255,.75)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let x = -r; x <= r; x += 4) { const yy = top + Math.sin(x / 9 + now / 300) * 1.6 + wob * (x / r); if (x === -r) ctx.moveTo(cx + x, yy); else ctx.lineTo(cx + x, yy); } ctx.stroke(); }
    ctx.fillStyle = kind === 'red' ? 'rgba(255,200,180,.5)' : 'rgba(200,225,255,.5)';
    for (let i = 0; i < 5; i++) { const t = ((now / 1600 + i * 0.37 + (kind === 'red' ? 0 : 0.5)) % 1); const bx = cx + side * r * (0.25 + 0.5 * ((i * 0.618) % 1)); const by = cy + r - t * (cy + r - top); if (by > top + 3) { ctx.beginPath(); ctx.arc(bx, by, 1.2 + (i % 2), 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
}
function orb(ctx, cx, cy, r, k, kind, now) {
    k = Math.max(0, Math.min(1, k));
    const top = cy + r - 2 * r * k; const wob = Math.sin(now / 380 + (kind === 'red' ? 0 : 2)) * 2.2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#0a0606'; ctx.fill(); ctx.clip();
    // 液体只画在液面以下（液面是一条轻微起伏的线）
    ctx.beginPath(); ctx.moveTo(cx - r, cy + r + 2);
    for (let x = -r; x <= r; x += 4) ctx.lineTo(cx + x, top + Math.sin(x / 9 + now / 300) * 1.6 + wob * (x / r));
    ctx.lineTo(cx + r, cy + r + 2); ctx.closePath(); ctx.clip();
    const tex = UI[kind === 'red' ? 'hud_orb_red' : 'hud_orb_blue'];
    if (tex) ctx.drawImage(tex, cx - r, cy - r, r * 2, r * 2);
    else { const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); if (kind === 'red') { g.addColorStop(0, '#ff7a5a'); g.addColorStop(0.5, '#b8160e'); g.addColorStop(1, '#3a0404'); } else { g.addColorStop(0, '#7ab0ff'); g.addColorStop(0.5, '#1a46c8'); g.addColorStop(1, '#040c3a'); } ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }
    ctx.restore();
    // 玻璃高光
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const hl = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, 1, cx - r * 0.3, cy - r * 0.4, r * 0.7); hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    const F = UIMETA.frame;
    if (UI.hud_orb_frame && F) { const s = (r + 3) / F.r; ctx.drawImage(UI.hud_orb_frame, cx - F.cx * s, cy - F.cy * s, F.w * s, F.h * s); }
    else { ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = IRON; ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = GOLD; ctx.stroke(); }
}

export class MobileHud {
    constructor(scene) {
        this.scene = scene;
        this.stick = null;          // { id, ox, oy, x, y }
        this.pressed = new Map();   // pointerId → 按钮 id
        this.buttons = [];
        this._layout();
        this._down = (e) => this._onDown(e);
        this._move = (e) => this._onMove(e);
        this._up = (e) => this._onUp(e);
        window.addEventListener('pointerdown', this._down, true);
        window.addEventListener('pointermove', this._move, true);
        window.addEventListener('pointerup', this._up, true);
        window.addEventListener('pointercancel', this._up, true);
        // JootM2 原版底板（血蓝球、聊天、药水格、功能按钮）照常显示；这里只加触屏操作
    }

    destroy() {
        if (this.overlay) this.overlay.remove();
        window.removeEventListener('pointerdown', this._down, true);
        window.removeEventListener('pointermove', this._move, true);
        window.removeEventListener('pointerup', this._up, true);
        window.removeEventListener('pointercancel', this._up, true);
    }

    // 布局参照手机传奇类常见排法：右下大攻击键 + 一圈技能，旁边锁定目标；右侧中部背包、角色
    _layout() {
        // 排法照用户样图：右下大攻击键 + 技能弧；右侧一列功能键（背包/角色/技能/组队/行会）；右上小地图下面设置键；
        // 底部聊天框左边两个小键（往上翻、聊天）。摇杆不固定：在左半屏按下就在按下的地方出现
        const ax = W - 92; const ay = H - 112;
        const arc = (deg, r = 122) => [ax + Math.cos(deg * Math.PI / 180) * r, ay + Math.sin(deg * Math.PI / 180) * r];
        const L = this.scene._hudLayout || { CX: W / 2 - 255, CY: H - 258, KC: 0.62 };
        this.buttons = [
            { id: 'attack', x: ax, y: ay, r: 52, label: '攻击', size: 18 },
            { id: 'sk1', x: arc(180)[0], y: arc(180)[1], r: 30, label: '1' },
            { id: 'sk2', x: arc(220)[0], y: arc(220)[1], r: 30, label: '2' },
            { id: 'sk3', x: arc(258)[0], y: arc(258)[1], r: 30, label: '3' },
            { id: 'sk4', x: arc(146, 118)[0], y: arc(146, 118)[1], r: 26, label: '4' },
            { id: 'sk5', x: arc(292, 118)[0], y: arc(292, 118)[1], r: 26, label: '5' },
            { id: 'lock', x: ax - 196, y: ay - 150, r: 22, label: '锁', color: '#ffe27a' },
            { id: 'pickup', x: ax - 196, y: ay - 92, r: 22, label: '拾', color: '#ffe27a' },
            { id: 'bag', x: W - 40, y: 196, r: 26, label: '背包', art: 'hb_bag', tag: true },
            { id: 'role', x: W - 40, y: 256, r: 26, label: '角色', art: 'hb_role', tag: true },
            { id: 'magwin', x: W - 40, y: 316, r: 26, label: '技能', art: 'hb_skill', tag: true },
            { id: 'team', x: W - 108, y: 196, r: 24, label: '组队', art: 'hb_team', tag: true },
            { id: 'guild', x: W - 108, y: 256, r: 24, label: '行会', art: 'hb_guild', tag: true },
            { id: 'set', x: W - 20, y: 150, r: 16, label: '', art: 'hb_set' },
            { id: 'chatup', x: L.CX - 20, y: L.CY + 120 * L.KC, r: 17, label: '', art: 'hb_up' },
            { id: 'chat', x: L.CX - 20, y: L.CY + 200 * L.KC, r: 17, label: '', art: 'hb_chat' },
        ];
    }

    // 屏幕坐标 → 画布逻辑坐标（舞台被整体缩放）
    _xy(e) {
        const c = document.getElementById('screen'); const r = c.getBoundingClientRect();
        return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
    }
    _btnAt(x, y) { return this.buttons.find((b) => Math.hypot(x - b.x, y - b.y) <= b.r + 6); }

    _onDown(e) {
        const s = this.scene; if (!s.self) return;
        // 原版窗口（背包、NPC 对话等 DOM 窗）上的点击交给它们自己处理
        if (e.target && e.target.closest && e.target.closest('input,textarea,button,.dwin')) return;
        // 底栏网页层里能点的东西（药水格、聊天记录等）自己处理，不当成点地图
        if (e.target && e.target.id !== 'screen' && e.target.closest && e.target.closest('#gui')) return;
        const { x, y } = this._xy(e);
        if (x < 0 || y < 0 || x > W || y > H) return;
        e.preventDefault(); e.stopPropagation();
        // 技能栏设置面板打开时：点技能放到对应键，点别处关闭
        if (this.picker) { this._pickerTap(x, y); return; }
        if (this.storage) { this._storageTap(x, y); return; }
        const b = this._btnAt(x, y);
        // 技能键：松手时才放技能；按住 0.45 秒以上 = 打开技能栏设置
        if (b && b.id.startsWith('sk')) { this.pressed.set(e.pointerId, b.id); this.skDown = { id: b.id, at: Date.now(), pid: e.pointerId }; return; }
        if (b) { this.pressed.set(e.pointerId, b.id); this._press(b.id); return; }
        const sl = (this.slots || []).find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
        if (sl) { this.scene._useQuickSlot(sl.i); return; }
        const L = this.scene._hudLayout; const inUi = L && ((x < L.OW && y > L.OY + 40) || (x > L.CX && x < L.CX + L.CW && y > L.CY));
        if (inUi) return;   // 血球、药水格、聊天框归底栏自己处理
        // 左半屏：先记下按下点，拖动超过 12 像素才变成摇杆；没拖就当点地图（选怪、和 NPC 说话）
        if (x < W * 0.45 && y > 110 && !this.stick) { this.stick = { id: e.pointerId, ox: x, oy: y, x, y, pending: true }; return; }
        this._tapWorld(x, y);
    }
    _onMove(e) {
        if (!this.stick || e.pointerId !== this.stick.id) return;
        e.preventDefault();
        const { x, y } = this._xy(e); this.stick.x = x; this.stick.y = y;
        if (this.stick.pending) { if (Math.hypot(x - this.stick.ox, y - this.stick.oy) < 12) return; this.stick.pending = false; this.scene.chaseTargetId = null; }
        this._applyStick();
    }
    _onUp(e) {
        if (this.stick && e.pointerId === this.stick.id) { const st = this.stick; this.stick = null; this.scene._holding = false; if (st.pending) this._tapWorld(st.ox, st.oy); }
        this.pressed.delete(e.pointerId);
        if (this.skDown && this.skDown.pid === e.pointerId) {
            const sd = this.skDown; this.skDown = null;
            if (Date.now() - sd.at >= 450) this.picker = { key: Number(sd.id.slice(2)) };
            else this._press(sd.id);
        }
    }

    // —— 技能栏：可自己设置；新学会的主动技能自动放进空键
    _boundMap() { const out = {}; for (const [mid, sk] of Object.entries(this.scene.self.skills || {})) if (sk && sk.key) out[sk.key] = { mid: Number(mid), sk }; return out; }
    _activeSkills() { return Object.entries(this.scene.self.skills || {}).filter(([mid]) => !PASSIVE.has(Number(mid))).map(([mid, sk]) => ({ mid: Number(mid), sk })); }
    _setKey(mid, key) {
        const skills = this.scene.self.skills || {};
        for (const sk of Object.values(skills)) if (sk && sk.key === key) sk.key = 0;   // 这个键原来的技能让位
        if (skills[mid]) skills[mid].key = key;
        this.scene.conn.send('magicKeyChange', { magicId: mid, key });
    }
    _autoBind() {
        const bound = this._boundMap(); this._autoTried = this._autoTried || new Set();
        for (const { mid, sk } of this._activeSkills()) {
            if (sk.key || this._autoTried.has(mid)) continue;
            const free = SKILL_KEYS.find((k) => !bound[k]); if (!free) return;
            this._autoTried.add(mid); this._setKey(mid, free); bound[free] = { mid, sk };
        }
    }
    // 左上头像：圆框里放本职业立绘的头部，右边名字、等级和职业
    _head(ctx, p) {
        // hud_head 是 600×199：左边圆框（圆心约 97,104，半径约 56），右边名牌
        const fw = 330; const k = fw / 600; const fh = 199 * k; const x = 4, y = 2;
        const cx = x + 97 * k, cy = y + 104 * k, r = 54 * k;
        const cls = ['cls_warrior2', 'cls_mage2', 'cls_spirit2'][p.job || 0];
        const face = ui(cls);
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#120c08'; ctx.fill(); ctx.clip();
        if (face) { const sw = face.width * 0.46; ctx.drawImage(face, face.width * 0.27, face.height * 0.03, sw, sw, cx - r, cy - r, r * 2, r * 2); }
        ctx.restore();
        if (!pic(ctx, 'hud_head', x, y, fw, fh)) { frame(ctx, x + 70, y + 14, 210, 52, 8); }
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const tx = x + 182 * k;
        ctx.font = 'bold 16px "DDSerif","Microsoft YaHei",serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(p.name || '', tx, y + 96 * k); ctx.fillStyle = '#f6e7c0'; ctx.fillText(p.name || '', tx, y + 96 * k);
        const t = 'Lv.' + (p.level || 1) + ' ' + (['武者', '术士', '灵师'][p.job || 0] || '');
        ctx.font = '14px "DDSerif","Microsoft YaHei",serif'; ctx.strokeText(t, tx, y + 128 * k); ctx.fillStyle = GOLD_HI; ctx.fillText(t, tx, y + 128 * k);
    }
    // 最底一条经验条：Exp 百分比（当前/升级所需）
    _expBar(ctx, p) {
        const L = this.scene._hudLayout || { EXP_H: 16 }; const h = L.EXP_H; const y = H - h;
        const k = Math.max(0, Math.min(1, (p.exp || 0) / (p.maxExp || 1e9)));
        ctx.fillStyle = '#0b0805'; ctx.fillRect(0, y, W, h);
        const g = ctx.createLinearGradient(0, y, 0, H); g.addColorStop(0, '#9ff07a'); g.addColorStop(0.5, '#3fae2c'); g.addColorStop(1, '#1d6a14');
        ctx.fillStyle = g; ctx.fillRect(4, y + 3, (W - 8) * k, h - 6);
        if (!pic(ctx, 'hud_expbar', -6, y - 3, W + 12, h + 6)) { ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.strokeRect(1.5, y + 1.5, W - 3, h - 3); }
        const txt = 'Exp ' + (k * 100).toFixed(2) + '% (' + (p.exp || 0) + ' / ' + (p.maxExp || 0) + ')';
        ctx.font = 'bold 11px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(txt, W / 2, y + h / 2 + 0.5); ctx.fillStyle = '#fff'; ctx.fillText(txt, W / 2, y + h / 2 + 0.5);
    }
    // —— 仓库：左边仓库、右边背包，点一件就存进去 / 取出来
    openStorage(items) { this.storage = { items }; }
    _storageRect() { const w = 760; const h = 380; return { x: W / 2 - w / 2, y: Math.max(20, H / 2 - h / 2 - 30), w, h }; }
    _storageCells(R) {
        const out = []; const cs = 50; const cols = 6;
        const bag = this.scene.self.items || [];
        const put = (list, x0, kind) => list.forEach((it, i) => out.push({ it, kind, x: x0 + (i % cols) * (cs + 4), y: R.y + 56 + Math.floor(i / cols) * (cs + 4), w: cs, h: cs }));
        put(this.storage.items.slice(0, 36), R.x + 24, 'take'); put((Array.isArray(bag) ? bag : Object.values(bag)).filter(Boolean).slice(0, 36), R.x + R.w / 2 + 14, 'store');
        return out;
    }
    _storageTap(x, y) {
        const R = this._storageRect();
        if (x < R.x || x > R.x + R.w || y < R.y || y > R.y + R.h || (x > R.x + R.w - 44 && y < R.y + 40)) { this.storage = null; return; }
        const c = this._storageCells(R).find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h); if (!c) return;
        const s = this.scene;
        s.conn.send(c.kind === 'take' ? 'storageTake' : 'storageStore', { makeIndex: c.it.makeIndex });
        setTimeout(() => s.conn.send('storageOpen', {}), 150);   // 服务端存取后不推仓库列表，再要一次
    }
    _renderStorage(ctx) {
        const R = this._storageRect();
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
        if (!pic(ctx, 'hud_frame_panel', R.x - 8, R.y - 8, R.w + 16, R.h + 16)) frame(ctx, R.x, R.y, R.w, R.h, 10);
        ctx.textBaseline = 'middle'; ctx.font = 'bold 16px "DDSerif","Microsoft YaHei",serif'; ctx.fillStyle = GOLD_HI;
        ctx.textAlign = 'left'; ctx.fillText('仓库（' + this.storage.items.length + '/45）  点物品取出', R.x + 24, R.y + 30);
        ctx.fillText('背包  点物品存入', R.x + R.w / 2 + 14, R.y + 30);
        ctx.textAlign = 'center'; ctx.fillText('✕', R.x + R.w - 24, R.y + 22);
        ctx.fillStyle = 'rgba(200,162,74,.5)'; ctx.fillRect(R.x + R.w / 2, R.y + 50, 1, R.h - 70);
        for (const c of this._storageCells(R)) {
            if (!pic(ctx, 'hud_slot', c.x - 2, c.y - 2, c.w + 4, c.h + 4)) { rr(ctx, c.x, c.y, c.w, c.h, 4); ctx.fillStyle = 'rgba(10,8,6,.62)'; ctx.fill(); }
            const tex = c.it.looks != null ? this._itemTex(c.it.looks) : null;
            if (tex) ctx.drawImage(tex.canvas, c.x + 6, c.y + 4, c.w - 12, c.h - 12);
            ctx.font = '10px "DDSerif","Microsoft YaHei",serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; const nm = (c.it.name || '').slice(0, 4);
            ctx.strokeText(nm, c.x + c.w / 2, c.y + c.h - 6); ctx.fillStyle = '#f0e2c0'; ctx.fillText(nm, c.x + c.w / 2, c.y + c.h - 6);
        }
    }
    _pickerRect() { const list = this._activeSkills(); const w = 360; const h = 70 + Math.max(1, list.length) * 40; return { x: W / 2 - w / 2, y: Math.max(40, H / 2 - h / 2 - 40), w, h, list }; }
    _pickerTap(x, y) {
        const R = this._pickerRect();
        if (x < R.x || x > R.x + R.w || y < R.y || y > R.y + R.h) { this.picker = null; return; }
        const i = Math.floor((y - R.y - 50) / 40);
        if (i >= 0 && i < R.list.length) { this._setKey(R.list[i].mid, this.picker.key); this.picker = null; }
    }
    _renderPicker(ctx) {
        const R = this._pickerRect();
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
        frame(ctx, R.x, R.y, R.w, R.h, 10);
        ctx.font = 'bold 15px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = GOLD_HI;
        ctx.fillText('设置技能键 ' + this.picker.key + '（点选要放上去的技能）', R.x + R.w / 2, R.y + 24);
        if (!R.list.length) { ctx.font = '13px "DDSerif","Microsoft YaHei",serif'; ctx.fillStyle = '#c8c0b0'; ctx.fillText('还没有学会主动技能，打怪掉技能书学习', R.x + R.w / 2, R.y + 70); return; }
        R.list.forEach(({ sk }, i) => {
            const y = R.y + 50 + i * 40; rr(ctx, R.x + 14, y, R.w - 28, 34, 5); ctx.fillStyle = sk.key === this.picker.key ? 'rgba(200,162,74,.35)' : 'rgba(255,255,255,.06)'; ctx.fill();
            ctx.textAlign = 'left'; ctx.font = 'bold 14px "DDSerif","Microsoft YaHei",serif'; ctx.fillStyle = '#f0e2c0'; ctx.fillText(sk.name || '技能', R.x + 28, y + 17);
            ctx.textAlign = 'right'; ctx.font = '12px "DDSerif","Microsoft YaHei",serif'; ctx.fillStyle = '#c8c0b0'; ctx.fillText((sk.level || 0) + '级' + (sk.key ? '  当前在键 ' + sk.key : ''), R.x + R.w - 28, y + 17);
        });
    }

    _applyStick() {
        const s = this.scene; const st = this.stick;
        const dx = st.x - st.ox; const dy = st.y - st.oy; const d = Math.hypot(dx, dy);
        if (d < 12) { s._holding = false; return; }
        // 屏幕上 1 格是 48×32，把方向换回格子空间再分 8 份
        const a = Math.atan2(dy * 1.5, dx); const k = Math.round(((a + Math.PI / 2) / (Math.PI / 4) + 8)) % 8;
        if (!s._holding || s._mouseDir !== k) s._lastMoveAt = Math.min(s._lastMoveAt, Date.now() - 1e4);
        s._holding = true; s._mouseDir = k; s._mouseRun = d > STICK_R * 0.8;
        s.chaseTargetId = null;
    }

    _nearest(type, max = 9) {
        const s = this.scene; let best = null; let bd = 1e9;
        for (const e of s.entities.values()) {
            if (e.type !== type || e.id === s.self.id || (e.hp != null && e.hp <= 0) || e.alive === false) continue;
            const d = Math.max(Math.abs(e.x - s.self.x), Math.abs(e.y - s.self.y));
            if (d < bd && d <= max) { bd = d; best = e; }
        }
        return best;
    }

    _press(id) {
        const s = this.scene;
        if (id === 'attack') {
            let t = s.chaseTargetId != null ? s.entities.get(s.chaseTargetId) : null;
            if (!t || t.hp <= 0) t = this._nearest('monster');
            if (t) { s.castTarget = t.id; s.chaseTargetId = t.id; s.magicTarget = t; if (Math.max(Math.abs(t.x - s.self.x), Math.abs(t.y - s.self.y)) <= 1) s._tryAttack(t.id); }
            else s._dirAttack(s.self.dir || 4);
        } else if (id.startsWith('sk')) {
            const t = s.chaseTargetId != null ? s.entities.get(s.chaseTargetId) : this._nearest('monster');
            if (t) { s.magicTarget = t; s.castTarget = t.id; }
            s._castFromSlot(Number(id.slice(2)));
        } else if (id === 'potion') s._useQuickSlot(0);
        else if (id === 'pickup') this._pickup();
        else if (id === 'lock') { const t = this._nearest('monster'); if (t) { s.castTarget = t.id; s.chaseTargetId = t.id; s.magicTarget = t; } }
        else if (id === 'bag') { if (s._toggleBag) s._toggleBag(); }
        else if (id === 'role') { s.statePage = 0; if (s._toggleStateWin) s._toggleStateWin(); }
        else if (id === 'magwin') { if (s._openSkillSetup) s._openSkillSetup(); }
        else if (id === 'team') s._log('编组功能未开放。');
        else if (id === 'guild') s._log('行会功能未开放。');
        else if (id === 'set') { if (s._toggleSound) s._toggleSound(); }
        else if (id === 'chat') { if (s._openChatInput) s._openChatInput(); }
        else if (id === 'chatup') { if (s._scrollChat) s._scrollChat(-3); }
    }

    _pickup() {
        const s = this.scene; let best = null; let bd = 1e9;
        for (const g of s.groundItems.values()) { const d = Math.max(Math.abs(g.x - s.self.x), Math.abs(g.y - s.self.y)); if (d < bd) { bd = d; best = g; } }
        if (!best) return;
        if (bd === 0) { s.conn.send('pickup', { itemId: best.id }); return; }
        this.pickTarget = best.id; // 走过去再捡
    }

    _tapWorld(x, y) {
        const s = this.scene;
        const m = s._actorAtScreen(x, y, 'monster') || s._actorAtScreen(x, y, 'player');
        if (m && m.id !== s.self.id && m.hp > 0) { s.castTarget = m.id; s.chaseTargetId = m.id; s.magicTarget = m; return; }
        const npc = s._actorAtScreen(x, y, 'npc');
        if (npc) { s.conn.send('npcTalk', { npcId: npc.id }); return; }
        s._lastMouse = { mx: x, my: y };
    }

    // 每帧：走去捡东西
    tick(now) {
        const s = this.scene; if (!this.pickTarget || !s.self) return;
        const g = s.groundItems.get(this.pickTarget); if (!g) { this.pickTarget = null; return; }
        if (g.x === s.self.x && g.y === s.self.y) { s.conn.send('pickup', { itemId: g.id }); this.pickTarget = null; return; }
        if (!s._isIdle() || now - s._lastMoveAt < 600) return;
        const dir = s._dirTo(g.x, g.y); if (dir >= 0) { s.conn.send('move', { dir, run: false }); s._lastMoveAt = now; }
    }

    render(ctx0) {
        // 触屏按钮画在自己的一层画布上，叠在 JootM2 底板（网页层）上面，不然会被底板挡住
        if (!this.overlay || !this.overlay.isConnected) { const gui = document.getElementById('gui'); this.overlay = document.createElement('canvas'); this.overlay.width = W; this.overlay.height = H; this.overlay.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none;z-index:50;'; gui.appendChild(this.overlay); }
        const ctx = this.overlay.getContext('2d'); ctx.clearRect(0, 0, W, H); void ctx0;
        const s = this.scene; const p = s.self; if (!p) return;
        if (s._hudLayout && this._laidFor !== s._hudLayout) { this._laidFor = s._hudLayout; this._layout(); }
        const now = Date.now();
        this.tick(now);
        ctx.save();
        // —— 左上：头像框 + 名字、等级职业（样图里的战力、VIP 不做）
        this._head(ctx, p);
        // —— 右上：小地图（地图名在上，坐标在下）
        this._miniMap(ctx, W - 168, 8, 160, 120);
        // —— 最底：经验条
        this._expBar(ctx, p);
        // —— 摇杆：只在按住时出现在按下的位置
        const st = this.stick;
        if (st && !st.pending) {
        const bx = st.ox; const by = st.oy;
        ctx.globalAlpha = 0.95;
        if (!pic(ctx, 'hud_joy_base', bx - STICK_R - 8, by - STICK_R - 8, (STICK_R + 8) * 2, (STICK_R + 8) * 2)) {
            ctx.beginPath(); ctx.arc(bx, by, STICK_R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,16,12,.5)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = IRON; ctx.stroke();
            ctx.beginPath(); ctx.arc(bx, by, STICK_R - 4, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = GOLD; ctx.stroke();
        }
        let kx = bx, ky = by; if (st) { const dx = st.x - st.ox; const dy = st.y - st.oy; const d = Math.hypot(dx, dy) || 1; const m = Math.min(d, STICK_R); kx = bx + dx / d * m; ky = by + dy / d * m; }
        if (!pic(ctx, 'hud_joy_knob', kx - 32, ky - 32, 64, 64)) roundBtn(ctx, kx, ky, 28, '', { hi: '#7a6450', lo: '#2a2018' });
        ctx.globalAlpha = 1;
        }
        // —— 按钮（技能键显示所放技能的名字，没放的显示编号，长按可设置）
        this._autoBind();
        const bound = this._boundMap();
        for (const b of this.buttons) {
            const pressed = [...this.pressed.values()].includes(b.id);
            let alpha = 0.92;
            let art = b.art || BTN_ART[b.id]; let icon = null;
            if (b.id.startsWith('sk')) { const bd = bound[Number(b.id.slice(2))]; b.label = bd ? (bd.sk.name || '技能').slice(0, 4) : String(b.id.slice(2)); b.size = bd ? 11 : 14; if (!bd) alpha = 0.45; icon = bd ? 'sk_' + bd.mid : null; art = 'hud_btn_round'; }

            if (b.id === 'pickup' && !s.groundItems.size) alpha = 0.5;
            if (b.id === 'lock' && s.chaseTargetId != null) alpha = 1;
            const rr2 = b.r * (pressed ? 0.94 : 1);
            // 技能键：图标铺满圆里，外面套金属圈；其他按钮整张图（图里已带字的不再写字）
            if (icon && ui(icon)) {
                ctx.globalAlpha = alpha; ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, rr2 * 0.98, 0, Math.PI * 2); ctx.clip(); pic(ctx, icon, b.x - rr2 * 1.02, b.y - rr2 * 1.02, rr2 * 2.04, rr2 * 2.04); ctx.restore(); ctx.globalAlpha = 1;
                const sname = b.label; ctx.font = 'bold 10px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(sname, b.x, b.y + rr2 + 8); ctx.fillStyle = GOLD_HI; ctx.fillText(sname, b.x, b.y + rr2 + 8);
            } else if (art && ui(art)) {
                ctx.globalAlpha = alpha; pic(ctx, art, b.x - rr2 * 1.12, b.y - rr2 * 1.12, rr2 * 2.24, rr2 * 2.24); ctx.globalAlpha = 1;
                if (art === 'hud_btn_round') { ctx.font = `bold ${b.size || 13}px "DDSerif","Microsoft YaHei",serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(b.label, b.x, b.y + 1); ctx.fillStyle = b.color || GOLD_HI; ctx.fillText(b.label, b.x, b.y + 1); }
            } else roundBtn(ctx, b.x, b.y, rr2, b.tag ? '' : b.label, { size: b.size, color: b.color, alpha, pressed });
            if (b.tag) { ctx.font = 'bold 12px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(b.label, b.x, b.y + rr2 + 7); ctx.fillStyle = '#ffe6a6'; ctx.fillText(b.label, b.x, b.y + rr2 + 7); }
            if (pressed) { ctx.beginPath(); ctx.arc(b.x, b.y, rr2 + 2, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,230,160,.8)'; ctx.stroke(); }
        }
        if (this.skDown && Date.now() - this.skDown.at > 250) { const b = this.buttons.find((q) => q.id === this.skDown.id); const k = Math.min(1, (Date.now() - this.skDown.at) / 450); ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.lineWidth = 3; ctx.strokeStyle = GOLD_HI; ctx.stroke(); }
        if (this.picker) this._renderPicker(ctx);
        if (this.storage) this._renderStorage(ctx);
        ctx.restore();
    }

    // 任务追踪：先放本图的打怪目标，等任务系统接上再换
    _questLines(p) {
        const lv = p.level || 1;
        if (this.scene.mapActor && /^dt/.test(this.scene.mapActor.mapId || '')) return [['天亮城（安全区）', '#9be29b'], ['东门出城去晨雾林，或找向导', '#ffe27a'], ['广场四周有商铺、南边是仓库', '#c8c0b0']];
        if (lv < 3) return [['晨雾林：击败角兽', '#9be29b'], ['升到 3 级（' + lv + '/3）', '#ffe27a'], ['拾取掉落的金币和药水', '#c8c0b0']];
        if (lv < 6) return [['晨雾林：清剿矿坑尸鬼', '#9be29b'], ['升到 6 级（' + lv + '/6）', '#ffe27a'], ['西边残柱一带', '#c8c0b0']];
        return [['晨雾林：讨伐洞穴甲虫', '#9be29b'], ['升到 10 级（' + lv + '/10）', '#ffe27a'], ['北边林子深处', '#c8c0b0']];
    }

    _statusBar(ctx, p, now) {
        const y = H - 22;
        if (!pic(ctx, 'hud_statusbar', -6, y - 4, W + 12, 28)) {
            const g = ctx.createLinearGradient(0, y, 0, H); g.addColorStop(0, 'rgba(24,18,12,.95)'); g.addColorStop(1, 'rgba(8,6,4,.98)');
            ctx.fillStyle = g; ctx.fillRect(0, y, W, 22); ctx.fillStyle = GOLD; ctx.fillRect(0, y, W, 1);
        }
        const d = new Date(now); const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        ctx.font = '12px "DDSerif","Microsoft YaHei",serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#e8dcc0';
        ctx.fillText(hh, 14, y + 11); ctx.fillText((p.level || 1) + '级', 80, y + 11);
        const ex = (p.exp || 0) / (p.maxExp || 1e9);
        ctx.fillText('经验', 140, y + 11); bar(ctx, 172, y + 6, 220, 10, ex, '#ffd86a', '#a8741a'); ctx.fillStyle = '#ffe27a'; ctx.fillText((ex * 100).toFixed(1) + '%', 400, y + 11);
        ctx.textAlign = 'right'; ctx.fillStyle = '#ffb0a8'; ctx.fillText('生命 ' + (p.hp || 0) + '/' + (p.maxHp || 0), W - 290, y + 11);
        ctx.fillStyle = '#c8dcff'; ctx.fillText('魔法 ' + (p.mp || 0) + '/' + (p.maxMp || 0), W - 190, y + 11);
        ctx.fillStyle = '#ffe27a'; ctx.fillText('金币 ' + (p.gold || 0), W - 90, y + 11);
        ctx.fillStyle = '#e8dcc0'; ctx.fillText('攻击 ' + (p.dc || '-'), W - 14, y + 11);
    }

    _quickSlots(ctx, p) {
        const n = 6; const sw = 52; const sh = 46; const gap = 4; const x0 = 456; const y0 = H - 22 - 72 - sh - 6;
        this.slots = [];
        for (let i = 0; i < n; i++) {
            const x = x0 + i * (sw + gap);
            if (!pic(ctx, 'hud_slot', x - 2, y0 - 2, sw + 4, sh + 4)) { rr(ctx, x, y0, sw, sh, 4); ctx.fillStyle = 'rgba(10,8,6,.62)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,162,74,.75)'; ctx.lineWidth = 1; ctx.stroke(); }
            const mi = (p.quickSlots || [])[i] || 0; const it = mi > 0 ? this._bagItem(mi) : null;
            ctx.font = '12px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (it) {
                const tex = it.looks != null ? this._itemTex(it.looks) : null;
                if (tex) ctx.drawImage(tex.canvas, x + sw / 2 - 19, y0 + 2, 38, 38);
                else { ctx.fillStyle = /魔法/.test(it.name || '') ? '#8ab0ff' : '#ff8a7a'; ctx.fillText((it.name || '药').replace(/\(.*\)/, '').slice(0, 3), x + sw / 2, y0 + sh / 2 - 4); }
                ctx.font = 'bold 11px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'right'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; const n = String(this._count(it.name)); ctx.strokeText(n, x + sw - 3, y0 + sh - 7); ctx.fillStyle = '#fff'; ctx.fillText(n, x + sw - 3, y0 + sh - 7);
            }
            else { ctx.fillStyle = 'rgba(200,180,140,.35)'; ctx.fillText(String(i + 1), x + sw / 2, y0 + sh / 2); }
            this.slots.push({ x, y: y0, w: sw, h: sh, i });
        }
    }
    _itemTex(looks) {
        this._itex = this._itex || new Map(); if (this._itex.has(looks)) return this._itex.get(looks);
        this._itex.set(looks, null); const lib = getLib('items'); if (lib) lib.getTexture(looks).then((t) => this._itex.set(looks, t)).catch(() => {});
        return null;
    }
    _bagItem(mi) { const bag = this.scene.self.items || this.scene.bag || []; return (Array.isArray(bag) ? bag : Object.values(bag)).find((x) => x && x.makeIndex === mi) || { name: '药水' }; }
    _count(name) { const bag = this.scene.self.items || this.scene.bag || []; const arr = Array.isArray(bag) ? bag : Object.values(bag); return arr.filter((x) => x && x.name === name).length || 1; }

    _chat(ctx) {
        const s = this.scene; const x = 456; const w = 330; const h = 70; const y = H - 22 - h - 2;
        if (!pic(ctx, 'hud_frame_chat', x - 4, y - 4, w + 8, h + 8)) { rr(ctx, x, y, w, h, 4); ctx.fillStyle = 'rgba(8,6,4,.62)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,162,74,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
        const lines = (s.chatLines || []).slice(-4);
        ctx.font = '12px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        lines.forEach((ln, i) => {
            const t = typeof ln === 'string' ? ln : ln.text || '';
            ctx.fillStyle = 'rgba(200,162,74,.85)'; rr(ctx, x + 6, y + 8 + i * 16, 30, 13, 3); ctx.fill();
            ctx.fillStyle = '#1a1208'; ctx.font = '10px "DDSerif","Microsoft YaHei",serif'; ctx.fillText('系统', x + 10, y + 15 + i * 16);
            ctx.font = '12px "DDSerif","Microsoft YaHei",serif'; ctx.fillStyle = (ln && ln.fg && ln.fg !== '#008000') ? ln.fg : '#9be29b'; ctx.fillText(t.slice(0, 22), x + 42, y + 15 + i * 16);
        });
    }

    // 小地图：用生成地图时缩小画好的整图（每格 6×4 像素），以自己为中心裁一块；顶上地图名，底下坐标
    _miniMap(ctx, x, y, w, h) {
        const s = this.scene; const m = s.mapActor && s.mapActor.map; if (!m) return;
        const id = s.mapActor.mapId;
        if (this._mmId !== id) { this._mmId = id; this._mmImg = null; const im = new Image(); im.onload = () => { if (this._mmId === id) this._mmImg = im; }; im.src = '/resources/Data/minimap_' + id + '.jpg'; }
        const p = s.self; const CW = 6; const CH = 4; const hh = 20;
        // 外框
        const mmArt = !!ui('hud_frame_minimap');
        if (!mmArt) { rr(ctx, x - 3, y - 3, w + 6, h + hh * 2 + 6, 8); ctx.fillStyle = '#16110b'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = IRON; ctx.stroke(); rr(ctx, x - 1, y - 1, w + 2, h + hh * 2 + 2, 7); ctx.lineWidth = 1.5; ctx.strokeStyle = GOLD; ctx.stroke(); }
        else { ctx.fillStyle = 'rgba(10,8,6,.85)'; ctx.fillRect(x, y + hh, w, h + hh); }
        // 地图名
        const name = (s.snapshot && s.snapshot.map && (s.snapshot.map.title || s.snapshot.map.name)) || '';
        ctx.font = 'bold 13px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = GOLD_HI; ctx.fillText(name, x + w / 2, y + hh / 2 + 1);
        const my = y + hh;
        ctx.save(); rr(ctx, x + 2, my, w - 4, h, 4); ctx.clip();
        const vw = (w - 4) / CW; const vh = h / CH; // 能看到多少格
        const fx = this._viewX != null ? s._viewX : p.x; const fy = s._viewY != null ? s._viewY : p.y;
        const sx0 = Math.max(0, Math.min(m.width - vw, (s._viewX ?? p.x) - vw / 2)); const sy0 = Math.max(0, Math.min(m.height - vh, (s._viewY ?? p.y) - vh / 2));
        if (this._mmImg) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this._mmImg, sx0 * CW, sy0 * CH, vw * CW, vh * CH, x + 2, my, w - 4, h); }
        else { ctx.fillStyle = '#2a3018'; ctx.fillRect(x + 2, my, w - 4, h); }
        // 怪、NPC、其他玩家
        for (const e of s.entities.values()) {
            if (e.id === p.id) continue;
            const ex = x + 2 + (e.x - sx0) * CW + CW / 2; const ey = my + (e.y - sy0) * CH + CH / 2;
            ctx.beginPath(); ctx.arc(ex, ey, e.type === 'monster' ? 2.2 : 3, 0, Math.PI * 2);
            ctx.fillStyle = e.type === 'monster' ? '#ff4a3a' : e.type === 'npc' ? '#5ae87a' : '#5ab0ff'; ctx.fill();
            ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke();
        }
        // 自己：带朝向的金色箭头
        const px = x + 2 + ((s._viewX ?? p.x) - sx0) * CW + CW / 2; const py = my + ((s._viewY ?? p.y) - sy0) * CH + CH / 2;
        const ang = [-90, -45, 0, 45, 90, 135, 180, -135][p.dir || 0] * Math.PI / 180;
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath();
        ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#3a2000'; ctx.stroke(); ctx.restore();
        ctx.restore();
        // GPT 小地图框盖在最上面，再写地图名（框顶部有名牌）
        if (mmArt) { pic(ctx, ui('hud_minimap2') ? 'hud_minimap2' : 'hud_frame_minimap', x - 10, y - 8, w + 20, h + hh * 2 + 16); ctx.font = 'bold 13px "DDSerif","Microsoft YaHei",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(name, x + w / 2, y + hh / 2 + 1); ctx.fillStyle = GOLD_HI; ctx.fillText(name, x + w / 2, y + hh / 2 + 1); }
        // 坐标
        ctx.font = '12px "DDSerif","Microsoft YaHei",serif'; ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'center';
        ctx.fillText(p.x + ' , ' + p.y, x + w / 2, my + h + hh / 2);
    }
}
