// 触屏操作 + 画布界面（替代原版 DOM HUD，手机横屏用）。
// 左下摇杆：拖动走路，推到外圈跑；右下：攻击（自动锁定最近的怪）、4 个技能、药水、拾取；
// 点地图上的怪 → 锁定攻击，点 NPC → 对话。界面全部画在 canvas 上，风格：暗木铁框 + 金边。
import { SCREEN_WIDTH as W, SCREEN_HEIGHT as H } from '../core/config.mjs';

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
    if (text) { ctx.font = 'bold 11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(text, x + w / 2, y + h / 2 + 0.5); ctx.fillStyle = '#fff'; ctx.fillText(text, x + w / 2, y + h / 2 + 0.5); }
}
function roundBtn(ctx, x, y, r, label, opt = {}) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, opt.hi || '#5a4636'); g.addColorStop(1, opt.lo || '#1c1510');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.globalAlpha = opt.alpha ?? 0.92; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ctx.strokeStyle = IRON; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = opt.pressed ? GOLD_HI : GOLD; ctx.stroke();
    if (label) { ctx.font = `bold ${opt.size || 14}px "Microsoft YaHei",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(label, x, y + 1); ctx.fillStyle = opt.color || GOLD_HI; ctx.fillText(label, x, y + 1); }
}

// 界面贴图（GPT 原创）：frontend/assets/ui/*.png，缺图时用代码画的兜底
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
        if (scene.hudEl) scene.hudEl.style.display = 'none';   // 原版 DOM HUD 不用
    }

    destroy() {
        window.removeEventListener('pointerdown', this._down, true);
        window.removeEventListener('pointermove', this._move, true);
        window.removeEventListener('pointerup', this._up, true);
        window.removeEventListener('pointercancel', this._up, true);
    }

    // 布局参照手机传奇类常见排法：右下大攻击键 + 一圈技能，旁边锁定目标；右侧中部背包、角色
    _layout() {
        const ax = W - 92; const ay = H - 130;
        this.buttons = [
            { id: 'attack', x: ax, y: ay, r: 50, label: '攻击', size: 18 },
            { id: 'sk1', x: ax - 112, y: ay + 72, r: 30, label: '1' },
            { id: 'sk2', x: ax - 204, y: ay + 72, r: 30, label: '2' },
            { id: 'sk3', x: ax - 120, y: ay - 6, r: 30, label: '3' },
            { id: 'sk4', x: ax - 74, y: ay - 92, r: 30, label: '4' },
            { id: 'sk5', x: ax + 4, y: ay - 120, r: 30, label: '5' },
            { id: 'lock', x: ax - 222, y: ay - 2, r: 26, label: '锁', color: '#ffe27a' },
            { id: 'pickup', x: ax - 196, y: ay - 78, r: 24, label: '拾', color: '#ffe27a' },
            { id: 'bag', x: W - 130, y: 232, r: 28, label: '背包', size: 12 },
            { id: 'role', x: W - 56, y: 232, r: 28, label: '角色', size: 12 },
            { id: 'mode', x: 238, y: H - 44, r: 20, label: '和平', size: 11 },
            { id: 'rank', x: 420, y: H - 44, r: 20, label: '榜', size: 13 },
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
        const { x, y } = this._xy(e);
        if (x < 0 || y < 0 || x > W || y > H) return;
        e.preventDefault(); e.stopPropagation();
        // 技能栏设置面板打开时：点技能放到对应键，点别处关闭
        if (this.picker) { this._pickerTap(x, y); return; }
        const b = this._btnAt(x, y);
        // 技能键：松手时才放技能；按住 0.45 秒以上 = 打开技能栏设置
        if (b && b.id.startsWith('sk')) { this.pressed.set(e.pointerId, b.id); this.skDown = { id: b.id, at: Date.now(), pid: e.pointerId }; return; }
        if (b) { this.pressed.set(e.pointerId, b.id); this._press(b.id); return; }
        const sl = (this.slots || []).find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
        if (sl) { this.scene._useQuickSlot(sl.i); return; }
        if (x < 300 && y > H * 0.4 && !this.stick) { this.stick = { id: e.pointerId, ox: x, oy: y, x, y }; s.chaseTargetId = null; return; }
        this._tapWorld(x, y);
    }
    _onMove(e) {
        if (!this.stick || e.pointerId !== this.stick.id) return;
        e.preventDefault();
        const { x, y } = this._xy(e); this.stick.x = x; this.stick.y = y;
        this._applyStick();
    }
    _onUp(e) {
        if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.scene._holding = false; }
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
        ctx.font = 'bold 15px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = GOLD_HI;
        ctx.fillText('设置技能键 ' + this.picker.key + '（点选要放上去的技能）', R.x + R.w / 2, R.y + 24);
        if (!R.list.length) { ctx.font = '13px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#c8c0b0'; ctx.fillText('还没有学会主动技能，打怪掉技能书学习', R.x + R.w / 2, R.y + 70); return; }
        R.list.forEach(({ sk }, i) => {
            const y = R.y + 50 + i * 40; rr(ctx, R.x + 14, y, R.w - 28, 34, 5); ctx.fillStyle = sk.key === this.picker.key ? 'rgba(200,162,74,.35)' : 'rgba(255,255,255,.06)'; ctx.fill();
            ctx.textAlign = 'left'; ctx.font = 'bold 14px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#f0e2c0'; ctx.fillText(sk.name || '技能', R.x + 28, y + 17);
            ctx.textAlign = 'right'; ctx.font = '12px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#c8c0b0'; ctx.fillText((sk.level || 0) + '级' + (sk.key ? '  当前在键 ' + sk.key : ''), R.x + R.w - 28, y + 17);
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
        else if (id === 'role') { if (s._toggleStateWin) s._toggleStateWin(); }
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

    render(ctx) {
        const s = this.scene; const p = s.self; if (!p) return;
        const now = Date.now();
        this.tick(now);
        ctx.save();
        // —— 左上：角色名 + 任务追踪
        frame(ctx, 8, 8, 232, 96, 6);
        ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#f0e2c0'; ctx.fillText(p.name || '', 18, 24);
        ctx.fillStyle = GOLD_HI; ctx.textAlign = 'right'; ctx.fillText((['武者', '术士', '灵师'][p.job || 0] || '') + ' ' + (p.level || 1) + '级', 230, 24);
        ctx.fillStyle = 'rgba(200,162,74,.5)'; ctx.fillRect(16, 36, 216, 1);
        ctx.textAlign = 'left'; ctx.font = '12px "Microsoft YaHei",sans-serif';
        const tips = this._questLines(p);
        tips.forEach((t, i) => { ctx.fillStyle = t[1]; ctx.fillText(t[0], 18, 52 + i * 17); });
        // —— 右上：小地图（地图名在上，坐标在下）
        this._miniMap(ctx, W - 168, 8, 160, 120);
        // —— 底部：状态栏（时间、等级、经验）
        this._statusBar(ctx, p, now);
        // —— 血蓝合一的球 + 两侧小按钮
        const r = 54; const ocx = 330; const ocy = H - 26 - r;
        splitOrb(ctx, ocx, ocy, r, (p.hp || 0) / (p.maxHp || 1), (p.mp || 0) / (p.maxMp || 1), now);
        ctx.font = 'bold 11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
        for (const [x, t, c] of [[ocx - r * 0.45, String(p.hp || 0), '#ffd0c8'], [ocx + r * 0.45, String(p.mp || 0), '#c8dcff']]) { ctx.strokeText(t, x, ocy + 2); ctx.fillStyle = c; ctx.fillText(t, x, ocy + 2); }
        // —— 快捷格（药水等，点了就用）+ 下面聊天框
        this._quickSlots(ctx, p);
        this._chat(ctx);
        // —— 摇杆
        const st = this.stick; const bx = st ? st.ox : 150; const by = st ? st.oy : H - 175;
        ctx.globalAlpha = st ? 0.9 : 0.6;
        ctx.beginPath(); ctx.arc(bx, by, STICK_R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,16,12,.5)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = IRON; ctx.stroke();
        ctx.beginPath(); ctx.arc(bx, by, STICK_R - 4, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = GOLD; ctx.stroke();
        let kx = bx, ky = by; if (st) { const dx = st.x - st.ox; const dy = st.y - st.oy; const d = Math.hypot(dx, dy) || 1; const m = Math.min(d, STICK_R); kx = bx + dx / d * m; ky = by + dy / d * m; }
        roundBtn(ctx, kx, ky, 28, '', { hi: '#7a6450', lo: '#2a2018' });
        ctx.globalAlpha = 1;
        // —— 按钮（技能键显示所放技能的名字，没放的显示编号，长按可设置）
        this._autoBind();
        const bound = this._boundMap();
        for (const b of this.buttons) {
            const pressed = [...this.pressed.values()].includes(b.id);
            let alpha = 0.92;
            if (b.id.startsWith('sk')) { const bd = bound[Number(b.id.slice(2))]; b.label = bd ? (bd.sk.name || '技能').slice(0, 4) : String(b.id.slice(2)); b.size = bd ? 11 : 14; if (!bd) alpha = 0.45; }
            if (b.id === 'pickup' && !s.groundItems.size) alpha = 0.4;
            if (b.id === 'lock' && s.chaseTargetId != null) alpha = 1;
            roundBtn(ctx, b.x, b.y, b.r * (pressed ? 0.94 : 1), b.label, { size: b.size, color: b.color, alpha, pressed });
        }
        if (this.skDown && Date.now() - this.skDown.at > 250) { const b = this.buttons.find((q) => q.id === this.skDown.id); const k = Math.min(1, (Date.now() - this.skDown.at) / 450); ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.lineWidth = 3; ctx.strokeStyle = GOLD_HI; ctx.stroke(); }
        if (this.picker) this._renderPicker(ctx);
        ctx.restore();
    }

    // 任务追踪：先放本图的打怪目标，等任务系统接上再换
    _questLines(p) {
        const lv = p.level || 1;
        if (lv < 3) return [['晨雾林：击败角兽', '#9be29b'], ['升到 3 级（' + lv + '/3）', '#ffe27a'], ['拾取掉落的金币和药水', '#c8c0b0']];
        if (lv < 6) return [['晨雾林：清剿矿坑尸鬼', '#9be29b'], ['升到 6 级（' + lv + '/6）', '#ffe27a'], ['西边残柱一带', '#c8c0b0']];
        return [['晨雾林：讨伐洞穴甲虫', '#9be29b'], ['升到 10 级（' + lv + '/10）', '#ffe27a'], ['北边林子深处', '#c8c0b0']];
    }

    _statusBar(ctx, p, now) {
        const y = H - 22;
        const g = ctx.createLinearGradient(0, y, 0, H); g.addColorStop(0, 'rgba(24,18,12,.95)'); g.addColorStop(1, 'rgba(8,6,4,.98)');
        ctx.fillStyle = g; ctx.fillRect(0, y, W, 22); ctx.fillStyle = GOLD; ctx.fillRect(0, y, W, 1);
        const d = new Date(now); const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        ctx.font = '12px "Microsoft YaHei",sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#e8dcc0';
        ctx.fillText(hh, 14, y + 11); ctx.fillText((p.level || 1) + '级', 80, y + 11);
        const ex = (p.exp || 0) / (p.maxExp || 1e9);
        ctx.fillText('经验', 140, y + 11); bar(ctx, 172, y + 6, 220, 10, ex, '#ffd86a', '#a8741a'); ctx.fillStyle = '#ffe27a'; ctx.fillText((ex * 100).toFixed(1) + '%', 400, y + 11);
        ctx.textAlign = 'right'; ctx.fillStyle = '#c8dcff'; ctx.fillText('魔法 ' + (p.mp || 0), W - 200, y + 11);
        ctx.fillStyle = '#ffe27a'; ctx.fillText('金币 ' + (p.gold || 0), W - 90, y + 11);
        ctx.fillStyle = '#e8dcc0'; ctx.fillText('攻击 ' + (p.dc || '-'), W - 14, y + 11);
    }

    _quickSlots(ctx, p) {
        const n = 6; const sw = 52; const sh = 46; const gap = 4; const x0 = 456; const y0 = H - 22 - 72 - sh - 6;
        this.slots = [];
        for (let i = 0; i < n; i++) {
            const x = x0 + i * (sw + gap); rr(ctx, x, y0, sw, sh, 4); ctx.fillStyle = 'rgba(10,8,6,.62)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,162,74,.75)'; ctx.lineWidth = 1; ctx.stroke();
            const mi = (p.quickSlots || [])[i] || 0; const it = mi > 0 ? this._bagItem(mi) : null;
            ctx.font = '12px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (it) { ctx.fillStyle = /魔法/.test(it.name || '') ? '#8ab0ff' : '#ff8a7a'; ctx.fillText((it.name || '药').replace(/\(.*\)/, '').slice(0, 3), x + sw / 2, y0 + sh / 2 - 4); ctx.fillStyle = '#fff'; ctx.font = '11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'right'; ctx.fillText(String(this._count(it.name)), x + sw - 4, y0 + sh - 8); }
            else { ctx.fillStyle = 'rgba(200,180,140,.35)'; ctx.fillText(String(i + 1), x + sw / 2, y0 + sh / 2); }
            this.slots.push({ x, y: y0, w: sw, h: sh, i });
        }
    }
    _bagItem(mi) { const bag = this.scene.self.items || this.scene.bag || []; return (Array.isArray(bag) ? bag : Object.values(bag)).find((x) => x && x.makeIndex === mi) || { name: '药水' }; }
    _count(name) { const bag = this.scene.self.items || this.scene.bag || []; const arr = Array.isArray(bag) ? bag : Object.values(bag); return arr.filter((x) => x && x.name === name).length || 1; }

    _chat(ctx) {
        const s = this.scene; const x = 456; const w = 330; const h = 70; const y = H - 22 - h - 2;
        rr(ctx, x, y, w, h, 4); ctx.fillStyle = 'rgba(8,6,4,.62)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,162,74,.5)'; ctx.lineWidth = 1; ctx.stroke();
        const lines = (s.chatLines || []).slice(-4);
        ctx.font = '12px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        lines.forEach((ln, i) => {
            const t = typeof ln === 'string' ? ln : ln.text || '';
            ctx.fillStyle = 'rgba(200,162,74,.85)'; rr(ctx, x + 6, y + 8 + i * 16, 30, 13, 3); ctx.fill();
            ctx.fillStyle = '#1a1208'; ctx.font = '10px "Microsoft YaHei",sans-serif'; ctx.fillText('系统', x + 10, y + 15 + i * 16);
            ctx.font = '12px "Microsoft YaHei",sans-serif'; ctx.fillStyle = (ln && ln.fg && ln.fg !== '#008000') ? ln.fg : '#9be29b'; ctx.fillText(t.slice(0, 22), x + 42, y + 15 + i * 16);
        });
    }

    _miniMap(ctx, x, y, w, h) {
        const s = this.scene; const m = s.mapActor && s.mapActor.map; if (!m) return;
        frame(ctx, x, y, w, h + 20, 6);
        if (!this._mm || this._mmMap !== m) {
            const c = document.createElement('canvas'); c.width = m.width; c.height = m.height; const g = c.getContext('2d'); const img = g.createImageData(m.width, m.height);
            for (let gx = 0; gx < m.width; gx++) for (let gy = 0; gy < m.height; gy++) { const t = m.tiles[gx][gy]; const o = (gy * m.width + gx) * 4; const v = t.canStand ? (t.obj >= 0 ? 70 : 110) : 40; img.data[o] = v * 0.9; img.data[o + 1] = v; img.data[o + 2] = v * 0.7; img.data[o + 3] = 255; }
            g.putImageData(img, 0, 0); this._mm = c; this._mmMap = m;
        }
        const p = s.self; const sc = 2; const vw = (w - 8) / sc; const vh = (h - 8) / sc;
        const sx0 = Math.max(0, Math.min(m.width - vw, p.x - vw / 2)); const sy0 = Math.max(0, Math.min(m.height - vh, p.y - vh / 2));
        ctx.imageSmoothingEnabled = false; ctx.drawImage(this._mm, sx0, sy0, vw, vh, x + 4, y + 4, w - 8, h - 8);
        for (const e of s.entities.values()) {
            const ex = x + 4 + (e.x - sx0) * sc; const ey = y + 4 + (e.y - sy0) * sc; if (ex < x + 4 || ey < y + 4 || ex > x + w - 4 || ey > y + h - 4) continue;
            ctx.fillStyle = e.id === p.id ? '#ffe27a' : e.type === 'monster' ? '#ff5a4a' : e.type === 'npc' ? '#5ae87a' : '#7ab8ff';
            ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
        }
        ctx.font = '12px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f0e2c0';
        ctx.fillText((s.snapshot && s.snapshot.map && (s.snapshot.map.title || s.snapshot.map.name) || '') + '  ' + p.x + ',' + p.y, x + w / 2, y + h + 10);
    }
}
