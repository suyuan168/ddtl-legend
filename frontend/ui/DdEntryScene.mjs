// 打到天亮：入口场景（替代原版登录 + 选角，全部画在 canvas 上，触屏可用）。
// 界面素材都是 GPT 出的原创图（frontend/assets/ui/）：石厅背景、石框面板、展台、刻字按钮、职业/性别徽章、角色栏。
// 布局：标题画面 → 选角画面（左：新建角色面板；右：展台站着选中的角色；下：1 号 / 2 号角色栏 + 开始/创建/删除/退出）。
import { Scene } from '../scene/Scene.mjs';
import { PlayScene } from '../scene/PlayScene.mjs';
import { SCREEN_WIDTH as W, SCREEN_HEIGHT as H } from '../core/config.mjs';

const GOLD = '#c8a24a'; const GOLD_HI = '#f2d68a'; const IRON = '#3a3530';
const JOBS = [
    { id: 0, name: '武者', img: 'cls_warrior', icon: 'ui_icon_warrior', desc: '重甲大剑，近身硬拼，血厚防高' },
    { id: 1, name: '术士', img: 'cls_mage', icon: 'ui_icon_mage', desc: '远程法术，火冰雷电，伤害最高' },
    { id: 2, name: '灵师', img: 'cls_spirit', icon: 'ui_icon_spirit', desc: '符咒召灵，治疗施毒，组队核心' },
];
const IMG = {};
const KEYS = ['cls_warrior', 'cls_mage', 'cls_spirit', 'bg_title', 'ui_sel_bg', 'ui_stage', 'ui_panel_stone', 'ui_slot_stone', 'ui_btn_stone', 'ui_btn_stone_on',
    'ui_icon_warrior', 'ui_icon_mage', 'ui_icon_spirit', 'ui_icon_male', 'ui_icon_female', 'title_logo',
    'btn_start', 'btn_create', 'btn_delete', 'btn_exit', 'btn_submit', 'btn_select', 'btn_random', 'btn_back', 'btn_enter'];
for (const k of KEYS) { const im = new Image(); im.onload = () => { IMG[k] = im; }; im.src = 'assets/ui/' + k + (k === 'bg_title' || k === 'ui_sel_bg' || k === 'ui_stage' ? '.jpg' : '.png'); }
const NA = ['晨', '雾', '青', '岚', '沐', '霜', '尘', '星', '墨', '骁', '临', '寒', '炎', '风', '远', '归', '凌', '昭', '野', '川'];
const NB = ['风', '影', '歌', '岳', '行', '刃', '舟', '辰', '夜', '羽', '生', '白', '霆', '石', '漠', '溪', '烽', '弦', '原', '锋'];
const randName = () => NA[Math.floor(Math.random() * NA.length)] + NB[Math.floor(Math.random() * NB.length)] + (Math.random() < 0.5 ? NB[Math.floor(Math.random() * NB.length)] : '');

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function text(ctx, t, x, y, size, color = GOLD_HI, align = 'center', bold = true) { ctx.font = `${bold ? 'bold ' : ''}${size}px "Microsoft YaHei",sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y); }
// 画图：填满矩形（cover）或放进矩形（contain）
function draw(ctx, k, x, y, w, h, mode = 'stretch') {
    const im = IMG[k]; if (!im) return false;
    if (mode === 'stretch') { ctx.drawImage(im, x, y, w, h); return true; }
    const s = mode === 'cover' ? Math.max(w / im.width, h / im.height) : Math.min(w / im.width, h / im.height);
    ctx.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s); return true;
}
function panelFallback(ctx, x, y, w, h) { rr(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(40,34,28,.92)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = IRON; ctx.stroke(); rr(ctx, x + 3, y + 3, w - 6, h - 6, 8); ctx.lineWidth = 1.2; ctx.strokeStyle = GOLD; ctx.stroke(); }

export class DdEntryScene extends Scene {
    constructor(manager) {
        super(manager);
        this.state = 'title'; this.chars = []; this.sel = 0; this.creating = false;
        this.job = 0; this.sex = 0; this.name = randName(); this.msg = ''; this.hits = []; this.busy = false; this.pressed = null;
    }
    onEnter() {
        const gui = this.manager.winManager && this.manager.winManager.container; if (gui) gui.innerHTML = '';
        this._down = (e) => this._onDown(e); this._up = () => { this.pressed = null; };
        window.addEventListener('pointerdown', this._down, true); window.addEventListener('pointerup', this._up, true);
    }
    onExit() { window.removeEventListener('pointerdown', this._down, true); window.removeEventListener('pointerup', this._up, true); }

    _account() {
        let a = null; try { a = JSON.parse(localStorage.getItem('dd_account') || 'null'); } catch (e) { a = null; }
        if (!a) { a = { u: 'p' + Math.random().toString(36).slice(2, 10), p: Math.random().toString(36).slice(2, 12), reg: false }; this._saveAcc(a); }
        return a;
    }
    _saveAcc(a) { try { localStorage.setItem('dd_account', JSON.stringify(a)); } catch (e) { /* 隐私模式存不了 */ } }
    _start() {
        if (this.busy) return; this.busy = true; this.msg = '正在连接…';
        const a = this._account();
        if (!a.reg) this.conn.send('register', { username: a.u, password: a.p }); else this.conn.send('login', { username: a.u, password: a.p });
    }

    onMessage(type, msg) {
        const a = this._account();
        if (type === 'registerResult') { a.reg = true; this._saveAcc(a); this.conn.send('login', { username: a.u, password: a.p }); }
        else if (type === 'loginResult') { if (msg.ok) { this.msg = ''; this.conn.send('listCharacters'); } else { this.busy = false; this.msg = msg.error || '登录失败'; } }
        else if (type === 'characterList') {
            this.busy = false; this.chars = (msg.characters || []).filter(Boolean);
            if (this._enterAfterCreate && this.chars.find((c) => c.name === this._enterAfterCreate)) { const n = this._enterAfterCreate; this._enterAfterCreate = null; this._enter(n); return; }
            this.state = 'select'; this.creating = !this.chars.length; if (this.sel >= this.chars.length) this.sel = 0;
        } else if (type === 'createCharacterResult') {
            if (msg.ok) { this._enterAfterCreate = this.name; this.conn.send('listCharacters'); } else { this.busy = false; this.msg = msg.error || '创建失败'; }
        } else if (type === 'deleteCharacterResult') { this.msg = msg.ok === false ? (msg.error || '删除失败') : '已删除'; this.conn.send('listCharacters'); }
        else if (type === 'enterGameResult') { if (!msg.ok) { this.busy = false; this.msg = msg.error || '进入失败'; } }
        else if (type === 'notice') this.conn.send('noticeOk', { name: this._entering });
        else if (type === 'enterGame') this.manager.switchTo(new PlayScene(this.manager, msg));
    }
    _enter(name) { this.busy = true; this._entering = name; this.msg = '进入游戏…'; this.conn.send('enterGame', { name }); }

    _xy(e) { const c = document.getElementById('screen'); const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
    _onDown(e) {
        const { x, y } = this._xy(e); if (x < 0 || y < 0 || x > W || y > H) return;
        e.preventDefault();
        const h = this.hits.slice().reverse().find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h); if (!h) return;
        this.pressed = h.id; const id = h.id;
        if (id === 'enter') this._start();
        else if (id.startsWith('slot:')) { const i = Number(id.slice(5)); if (this.chars[i]) { this.sel = i; this.creating = false; } else this.creating = true; }
        else if (id === 'start') { if (this.chars[this.sel]) this._enter(this.chars[this.sel].name); else this.creating = true; }
        else if (id === 'create') { if (this.chars.length >= 2) this.msg = '最多两个角色'; else { this.creating = true; this.msg = ''; } }
        else if (id === 'delete') { const c = this.chars[this.sel]; if (c && window.confirm('确定删除角色「' + c.name + '」？删除后不能恢复。')) this.conn.send('deleteCharacter', { name: c.name }); }
        else if (id === 'exit') { this.state = 'title'; this.busy = false; this.msg = ''; }
        else if (id === 'cancel') { this.creating = false; }
        else if (id.startsWith('job:')) { this.job = Number(id.slice(4)); this.sex = this.job === 1 ? 1 : 0; }
        else if (id.startsWith('sex:')) this.sex = Number(id.slice(4));
        else if (id === 'rand') this.name = randName();
        else if (id === 'name') { const v = window.prompt('角色名（2~7 个字）', this.name); if (v && v.trim()) this.name = v.trim().slice(0, 7); }
        else if (id === 'submit') {
            if (this.busy) return; if (this.name.length < 2) { this.msg = '名字至少 2 个字'; return; }
            this.busy = true; this.msg = '创建中…';
            this.conn.send('createCharacter', { name: this.name, job: this.job, sex: this.sex, hair: 0 });
        }
    }

    // 刻字按钮（GPT 图）：缺图时用空白石按钮 + 程序写字
    _btn(ctx, add, id, key, label, x, y, w, h) {
        const k = this.pressed === id ? 0.95 : 1; const cx = x + w / 2; const cy = y + h / 2; const ww = w * k; const hh = h * k;
        if (!draw(ctx, key, cx - ww / 2, cy - hh / 2, ww, hh, 'contain')) {
            if (!draw(ctx, 'ui_btn_stone', cx - ww / 2, cy - hh / 2, ww, hh, 'contain')) panelFallback(ctx, cx - ww / 2, cy - hh / 2, ww, hh);
            text(ctx, label, cx, cy + 1, Math.round(h * 0.38));
        }
        add(id, x, y, w, h);
    }

    render(ctx) {
        this.hits = []; const add = (id, x, y, w, h) => this.hits.push({ id, x, y, w, h });
        ctx.fillStyle = '#0a0806'; ctx.fillRect(0, 0, W, H);
        if (this.state === 'title') this._title(ctx, add); else this._select(ctx, add);
        if (this.msg) text(ctx, this.msg, W / 2, H - 18, 14, '#ffe2a8', 'center', false);
    }

    _title(ctx, add) {
        if (!draw(ctx, 'bg_title', 0, 0, W, H, 'cover')) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a2418'); g.addColorStop(1, '#0a0806'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        if (!draw(ctx, 'title_logo', W / 2 - 280, 40, 560, 220, 'contain')) {
            ctx.save(); ctx.font = 'bold 84px "STKaiti","KaiTi",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const g = ctx.createLinearGradient(0, 130, 0, 210); g.addColorStop(0, '#fff2c0'); g.addColorStop(1, '#8a5a14'); ctx.lineWidth = 6; ctx.strokeStyle = '#2a1404'; ctx.strokeText('打到天亮', W / 2, 170); ctx.fillStyle = g; ctx.fillText('打到天亮', W / 2, 170); ctx.restore();
        }
        this._btn(ctx, add, 'enter', 'btn_enter', this.busy ? '连接中…' : '进入游戏', W / 2 - 150, H * 0.64, 300, 90);
        text(ctx, '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。', W / 2, H - 44, 12, 'rgba(232,220,192,.8)', 'center', false);
    }

    _select(ctx, add) {
        if (!draw(ctx, 'ui_sel_bg', 0, 0, W, H, 'cover')) draw(ctx, 'bg_title', 0, 0, W, H, 'cover');
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, W, H);
        const now = Date.now();
        // —— 右：展台 + 当前角色（选中的角色，或正在创建的职业）
        const sx = W / 2 - 40; const sw = W - sx - 60; const sy = 22; const sh = 382;
        if (!draw(ctx, 'ui_stage', sx, sy, sw, sh, 'stretch')) { panelFallback(ctx, sx, sy, sw, sh); ctx.fillStyle = '#050403'; ctx.fillRect(sx + 14, sy + 14, sw - 28, sh - 28); }
        const cur = this.creating ? { job: this.job, name: this.name, level: 1 } : this.chars[this.sel];
        if (cur) {
            const J = JOBS[cur.job] || JOBS[0]; const glow = 0.55 + 0.15 * Math.sin(now / 600);
            const g = ctx.createRadialGradient(sx + sw / 2, sy + sh - 70, 10, sx + sw / 2, sy + sh - 70, 170); g.addColorStop(0, `rgba(140,180,255,${glow * 0.45})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(sx, sy, sw, sh);
            const im = IMG[J.img]; if (im) { const bh = sh - 70 + Math.sin(now / 700) * 2; const bw = im.width * bh / im.height; ctx.drawImage(im, sx + sw / 2 - bw / 2, sy + sh - 30 - bh, bw, bh); }
            text(ctx, cur.name, sx + sw / 2, sy + 30, 20);
            text(ctx, J.name + (this.creating ? '' : '  ' + (cur.level || 1) + '级'), sx + sw / 2, sy + 56, 14, '#e8dcc0');
        } else text(ctx, '还没有角色，点「创建角色」', sx + sw / 2, sy + sh / 2, 16, '#e8dcc0');
        // —— 左：新建角色面板
        if (this.creating) this._createPanel(ctx, add, 60, 22, W / 2 - 140, 382);
        else { text(ctx, '选择角色', 60 + (W / 2 - 140) / 2, 210, 26); text(ctx, '点下面的角色栏切换，按「开始游戏」进入', 60 + (W / 2 - 140) / 2, 248, 13, '#e8dcc0', 'center', false); }
        // —— 下：两个角色栏 + 中间按钮
        const by = 418; const slw = 330; const slh = 150;
        for (let i = 0; i < 2; i++) {
            const x = i === 0 ? 24 : W - 24 - slw; const c = this.chars[i]; const on = c && i === this.sel && !this.creating;
            if (!draw(ctx, 'ui_slot_stone', x, by, slw, slh, 'stretch')) panelFallback(ctx, x, by, slw, slh);
            if (on) { rr(ctx, x + 6, by + 6, slw - 12, slh - 12, 8); ctx.lineWidth = 2.5; ctx.strokeStyle = GOLD_HI; ctx.stroke(); }
            text(ctx, 'No ' + (i + 1), x + 40, by + 34, 18);
            this._btn(ctx, add, 'slot:' + i, 'btn_select', '选择', x + slw - 150, by + 14, 130, 44);
            const rows = c ? [['名字', c.name], ['等级', String(c.level || 1)], ['职业', (JOBS[c.job] || JOBS[0]).name]] : [['名字', '（空）'], ['等级', ''], ['职业', '']];
            rows.forEach(([k, v], r) => { text(ctx, k, x + 40, by + 70 + r * 25, 14, '#d8c8a0', 'center', false); text(ctx, v, x + 82, by + 70 + r * 25, 15, '#fff2d0', 'left'); });
            add('slot:' + i, x, by, slw, slh);
        }
        const cx = W / 2; const bw = 210; const bh = 52;
        this._btn(ctx, add, 'start', 'btn_start', '开始游戏', cx - bw / 2, by - 4, bw, bh + 6);
        this._btn(ctx, add, 'create', 'btn_create', '创建角色', cx - bw - 6, by + 56, bw, bh);
        this._btn(ctx, add, 'delete', 'btn_delete', '删除角色', cx + 6, by + 56, bw, bh);
        this._btn(ctx, add, 'exit', 'btn_exit', '退出', cx - bw / 2, by + 112, bw, bh - 6);
    }

    _createPanel(ctx, add, x, y, w, h) {
        if (!draw(ctx, 'ui_panel_stone', x, y, w, h, 'stretch')) panelFallback(ctx, x, y, w, h);
        const cx = x + w / 2;
        text(ctx, '新建角色', cx, y + 40, 24);
        // 名字
        text(ctx, '名字', cx, y + 82, 15, '#d8c8a0', 'center', false);
        const nw = 230; rr(ctx, cx - nw / 2 - 40, y + 98, nw, 38, 5); ctx.fillStyle = 'rgba(8,6,4,.85)'; ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 1.2; ctx.stroke();
        text(ctx, this.name, cx - 40, y + 117, 18, '#fff2d0'); add('name', cx - nw / 2 - 40, y + 98, nw, 38);
        this._btn(ctx, add, 'rand', 'btn_random', '随机', cx + nw / 2 - 30, y + 94, 100, 46);
        // 职业
        text(ctx, '职业', cx, y + 162, 15, '#d8c8a0', 'center', false);
        const isz = 70; JOBS.forEach((j, i) => {
            const ix = cx - (3 * isz + 2 * 16) / 2 + i * (isz + 16); const iy = y + 178; const on = this.job === j.id;
            if (on) { ctx.save(); ctx.shadowColor = '#ffd86a'; ctx.shadowBlur = 18; rr(ctx, ix - 3, iy - 3, isz + 6, isz + 6, 8); ctx.strokeStyle = GOLD_HI; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
            ctx.globalAlpha = on ? 1 : 0.65;
            if (!draw(ctx, j.icon, ix, iy, isz, isz, 'contain')) { panelFallback(ctx, ix, iy, isz, isz); text(ctx, j.name[0], ix + isz / 2, iy + isz / 2, 26); }
            ctx.globalAlpha = 1; text(ctx, j.name, ix + isz / 2, iy + isz + 14, 14, on ? GOLD_HI : '#d8c8a0');
            add('job:' + j.id, ix, iy, isz, isz + 24);
        });
        text(ctx, JOBS[this.job].desc, cx, y + 290, 13, '#e8dcc0', 'center', false);
        // 性别
        const gsz = 50; [['ui_icon_male', '男', 0], ['ui_icon_female', '女', 1]].forEach(([k, l, v], i) => {
            const gx = cx - gsz - 40 + i * (gsz + 80); const gy = y + 300; const on = this.sex === v;
            ctx.globalAlpha = on ? 1 : 0.55; if (!draw(ctx, k, gx, gy, gsz, gsz, 'contain')) { panelFallback(ctx, gx, gy, gsz, gsz); text(ctx, l, gx + gsz / 2, gy + gsz / 2, 20); } ctx.globalAlpha = 1;
            if (on) { rr(ctx, gx - 2, gy - 2, gsz + 4, gsz + 4, 6); ctx.strokeStyle = GOLD_HI; ctx.lineWidth = 2; ctx.stroke(); }
            text(ctx, l, gx + gsz + 16, gy + gsz / 2, 15, on ? GOLD_HI : '#d8c8a0');
            add('sex:' + v, gx, gy, gsz + 30, gsz);
        });
        this._btn(ctx, add, 'submit', 'btn_submit', this.busy ? '创建中' : '提交', cx - 70, y + h - 58, 140, 48);
        if (this.chars.length) this._btn(ctx, add, 'cancel', 'btn_back', '返回', x + 16, y + h - 56, 100, 44);
    }
}
