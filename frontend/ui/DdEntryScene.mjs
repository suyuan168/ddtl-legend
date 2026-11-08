// 打到天亮：入口场景（替代原版登录 + 选角两个界面，全部画在 canvas 上，触屏可用）。
// 标题画面 → 点“进入游戏”自动注册/登录（网页版账号存本机；微信版以后换 wx.login）
// → 有角色：角色卡 + 开始游戏；没有：选职业 + 起名 → 创建后直接进游戏。
import { Scene } from '../scene/Scene.mjs';
import { PlayScene } from '../scene/PlayScene.mjs';
import { SCREEN_WIDTH as W, SCREEN_HEIGHT as H } from '../core/config.mjs';

const GOLD = '#c8a24a'; const GOLD_HI = '#f2d68a'; const IRON = '#3a3530';
const JOBS = [
    { id: 0, name: '武者', img: 'cls_warrior', desc: ['重甲大剑，近身硬拼', '血厚防高，冲在最前'] },
    { id: 1, name: '术士', img: 'cls_mage', desc: ['远程法术，火冰雷电', '伤害最高，身板脆弱'] },
    { id: 2, name: '灵师', img: 'cls_spirit', desc: ['符咒召灵，治疗施毒', '能打能奶，组队核心'] },
];
const IMG = {};
for (const k of ['cls_warrior', 'cls_mage', 'cls_spirit', 'bg_title']) { const im = new Image(); im.onload = () => { IMG[k] = im; }; im.src = 'assets/ui/' + k + (k === 'bg_title' ? '.jpg' : '.png'); }
// 原创随机名：两个字拼起来
const NA = ['晨', '雾', '青', '岚', '沐', '霜', '尘', '星', '墨', '骁', '临', '寒', '炎', '风', '远', '归', '凌', '昭', '野', '川'];
const NB = ['风', '影', '歌', '岳', '行', '刃', '舟', '辰', '夜', '羽', '生', '白', '霆', '石', '漠', '溪', '烽', '弦', '原', '锋'];
const randName = () => NA[Math.floor(Math.random() * NA.length)] + NB[Math.floor(Math.random() * NB.length)] + (Math.random() < 0.5 ? NB[Math.floor(Math.random() * NB.length)] : '');

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function panel(ctx, x, y, w, h, sel) {
    rr(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(16,12,8,.82)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = IRON; ctx.stroke();
    rr(ctx, x + 3, y + 3, w - 6, h - 6, 8); ctx.lineWidth = sel ? 2.5 : 1.2; ctx.strokeStyle = sel ? GOLD_HI : GOLD; ctx.stroke();
}
function button(ctx, x, y, w, h, text, hot) {
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, hot ? '#8a6420' : '#5a4228'); g.addColorStop(1, hot ? '#3a2408' : '#24180c');
    rr(ctx, x, y, w, h, 8); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = IRON; ctx.stroke();
    rr(ctx, x + 2, y + 2, w - 4, h - 4, 7); ctx.lineWidth = 1.5; ctx.strokeStyle = GOLD_HI; ctx.stroke();
    ctx.font = 'bold 20px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(text, x + w / 2, y + h / 2 + 1); ctx.fillStyle = GOLD_HI; ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

export class DdEntryScene extends Scene {
    constructor(manager) {
        super(manager);
        this.state = 'title';   // title → select / create
        this.chars = []; this.job = 0; this.name = randName(); this.msg = ''; this.hits = []; this.busy = false;
    }

    onEnter() {
        const gui = this.manager.winManager && this.manager.winManager.container; if (gui) gui.innerHTML = '';
        this._down = (e) => this._onDown(e);
        window.addEventListener('pointerdown', this._down, true);
    }
    onExit() { window.removeEventListener('pointerdown', this._down, true); }

    // 本机账号（网页测试版）
    _account() {
        let a = null; try { a = JSON.parse(localStorage.getItem('dd_account') || 'null'); } catch (e) { a = null; }
        if (!a) { a = { u: 'p' + Math.random().toString(36).slice(2, 10), p: Math.random().toString(36).slice(2, 12), reg: false }; this._saveAcc(a); }
        return a;
    }
    _saveAcc(a) { try { localStorage.setItem('dd_account', JSON.stringify(a)); } catch (e) { /* 隐私模式存不了也能玩一局 */ } }

    _start() {
        if (this.busy) return; this.busy = true; this.msg = '正在连接…';
        const a = this._account();
        if (!a.reg) this.conn.send('register', { username: a.u, password: a.p });
        else this.conn.send('login', { username: a.u, password: a.p });
    }

    onMessage(type, msg) {
        const a = this._account();
        if (type === 'registerResult') { a.reg = true; this._saveAcc(a); this.conn.send('login', { username: a.u, password: a.p }); }
        else if (type === 'loginResult') {
            if (msg.ok) { this.msg = ''; this.conn.send('listCharacters'); }
            else { this.busy = false; this.msg = msg.error || '登录失败'; }
        } else if (type === 'characterList') {
            this.busy = false; this.chars = (msg.characters || []).filter(Boolean);
            if (this._enterAfterCreate && this.chars.find((c) => c.name === this._enterAfterCreate)) { const n = this._enterAfterCreate; this._enterAfterCreate = null; this._enter(n); return; }
            this.state = this.chars.length ? 'select' : 'create'; this.sel = 0;
        } else if (type === 'createCharacterResult') {
            if (msg.ok) { this._enterAfterCreate = this.name; this.conn.send('listCharacters'); }
            else { this.busy = false; this.msg = msg.error || '创建失败'; }
        } else if (type === 'enterGameResult') { if (!msg.ok) { this.busy = false; this.msg = msg.error || '进入失败'; } }
        else if (type === 'notice') this.conn.send('noticeOk', { name: this._entering });
        else if (type === 'enterGame') this.manager.switchTo(new PlayScene(this.manager, msg));
    }
    _enter(name) { this.busy = true; this._entering = name; this.msg = '进入游戏…'; this.conn.send('enterGame', { name }); }

    _xy(e) { const c = document.getElementById('screen'); const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
    _onDown(e) {
        const { x, y } = this._xy(e); if (x < 0 || y < 0 || x > W || y > H) return;
        e.preventDefault();
        const h = this.hits.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h); if (!h) return;
        const id = h.id;
        if (id === 'start') this._start();
        else if (id === 'play') this._enter(this.chars[this.sel].name);
        else if (id.startsWith('char:')) this.sel = Number(id.slice(5));
        else if (id === 'new') { this.state = 'create'; this.msg = ''; }
        else if (id === 'back') { this.state = this.chars.length ? 'select' : 'create'; }
        else if (id.startsWith('job:')) this.job = Number(id.slice(4));
        else if (id === 'rand') this.name = randName();
        else if (id === 'name') { const v = window.prompt('角色名（2~7 个字）', this.name); if (v && v.trim()) this.name = v.trim().slice(0, 7); }
        else if (id === 'create') {
            if (this.busy) return; if (this.name.length < 2) { this.msg = '名字至少 2 个字'; return; }
            this.busy = true; this.msg = '创建中…';
            this.conn.send('createCharacter', { name: this.name, job: this.job, sex: this.job === 1 ? 1 : 0, hair: 0 });
        }
    }

    render(ctx) {
        this.hits = [];
        const add = (id, x, y, w, h) => this.hits.push({ id, x, y, w, h });
        // 背景
        ctx.fillStyle = '#0a0806'; ctx.fillRect(0, 0, W, H);
        const bg = IMG.bg_title;
        if (bg) { const k = Math.max(W / bg.width, H / bg.height); ctx.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k); }
        else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a2418'); g.addColorStop(1, '#0a0806'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        if (this.state === 'title') this._title(ctx, add);
        else if (this.state === 'select') this._select(ctx, add);
        else this._create(ctx, add);
        if (this.msg) { ctx.font = '15px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(this.msg, W / 2, H - 28); ctx.fillStyle = '#ffe2a8'; ctx.fillText(this.msg, W / 2, H - 28); }
    }

    _logo(ctx, y, size) {
        ctx.save(); ctx.font = `bold ${size}px "STKaiti","KaiTi","Microsoft YaHei",serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2); g.addColorStop(0, '#fff2c0'); g.addColorStop(0.5, '#e8b44a'); g.addColorStop(1, '#8a5a14');
        ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 12; ctx.lineWidth = 6; ctx.strokeStyle = '#2a1404'; ctx.strokeText('打到天亮', W / 2, y); ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.fillText('打到天亮', W / 2, y); ctx.restore();
    }

    _title(ctx, add) {
        this._logo(ctx, H * 0.3, 84);
        ctx.font = '16px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8dcc0'; ctx.fillText('三职业 · 打怪爆装 · 多人同屏', W / 2, H * 0.3 + 62);
        const bw = 240; const bx = W / 2 - bw / 2; const by = H * 0.62; button(ctx, bx, by, bw, 58, this.busy ? '连接中…' : '进入游戏', true); add('start', bx, by, bw, 58);
        ctx.font = '12px "Microsoft YaHei",sans-serif'; ctx.fillStyle = 'rgba(232,220,192,.7)'; ctx.fillText('抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。', W / 2, H - 52);
    }

    _portrait(ctx, key, x, y, h) { const im = IMG[key]; if (!im) return; const w = im.width * h / im.height; ctx.drawImage(im, x - w / 2, y - h, w, h); }

    _select(ctx, add) {
        this._logo(ctx, 56, 44);
        const n = this.chars.length; const cw = 260; const gap = 30; const x0 = W / 2 - (n * cw + (n - 1) * gap) / 2;
        this.chars.forEach((c, i) => {
            const x = x0 + i * (cw + gap); const y = 104; const sel = i === this.sel;
            panel(ctx, x, y, cw, 340, sel); this._portrait(ctx, (JOBS[c.job] || JOBS[0]).img, x + cw / 2, y + 300, 280);
            ctx.font = 'bold 20px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = GOLD_HI; ctx.fillText(c.name, x + cw / 2, y + 26);
            ctx.font = '14px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#e8dcc0'; ctx.fillText((JOBS[c.job] || JOBS[0]).name + '  ' + (c.level || 1) + '级', x + cw / 2, y + 318);
            add('char:' + i, x, y, cw, 340);
        });
        const bw = 220; button(ctx, W / 2 - bw / 2, H - 120, bw, 52, '开始游戏', true); add('play', W / 2 - bw / 2, H - 120, bw, 52);
        if (n < 2) { button(ctx, W - 190, H - 116, 160, 44, '新建角色'); add('new', W - 190, H - 116, 160, 44); }
    }

    _create(ctx, add) {
        ctx.font = 'bold 26px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText('选择职业', W / 2, 40); ctx.fillStyle = GOLD_HI; ctx.fillText('选择职业', W / 2, 40);
        const cw = 250; const gap = 26; const x0 = W / 2 - (3 * cw + 2 * gap) / 2;
        JOBS.forEach((j, i) => {
            const x = x0 + i * (cw + gap); const y = 70; const sel = this.job === j.id;
            panel(ctx, x, y, cw, 360, sel);
            if (sel) { ctx.save(); rr(ctx, x + 3, y + 3, cw - 6, 354, 8); ctx.clip(); const g = ctx.createRadialGradient(x + cw / 2, y + 220, 10, x + cw / 2, y + 220, 200); g.addColorStop(0, 'rgba(242,214,138,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, cw, 360); ctx.restore(); }
            ctx.globalAlpha = sel ? 1 : 0.6; this._portrait(ctx, j.img, x + cw / 2, y + 290, 260); ctx.globalAlpha = 1;
            ctx.font = 'bold 22px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = sel ? GOLD_HI : '#d8c8a0'; ctx.fillText(j.name, x + cw / 2, y + 22);
            ctx.font = '13px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#e8dcc0'; j.desc.forEach((d, k) => ctx.fillText(d, x + cw / 2, y + 312 + k * 20));
            add('job:' + j.id, x, y, cw, 360);
        });
        // 名字
        const ny = 452; const nw = 280; const nx = W / 2 - nw / 2 - 50;
        rr(ctx, nx, ny, nw, 44, 6); ctx.fillStyle = 'rgba(10,8,6,.85)'; ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = 'bold 20px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff2d0'; ctx.fillText(this.name, nx + nw / 2, ny + 23); add('name', nx, ny, nw, 44);
        button(ctx, nx + nw + 12, ny, 88, 44, '随机'); add('rand', nx + nw + 12, ny, 88, 44);
        const bw = 220; button(ctx, W / 2 - bw / 2, ny + 58, bw, 50, this.busy ? '创建中…' : '创建角色', true); add('create', W / 2 - bw / 2, ny + 58, bw, 50);
        if (this.chars.length) { button(ctx, 30, H - 70, 120, 44, '返回'); add('back', 30, H - 70, 120, 44); }
    }
}
