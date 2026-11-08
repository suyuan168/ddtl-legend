// 我们自己的图库：PNG 图集 + JSON 帧表（替代原版 WIL）。
// 接口和 WIL 一样：getTexture(index) → { canvas, px, py, width, height }，上层动作表代码不用改。
// JSON 格式：{ image: "xxx.png", frames: { "帧号": [x, y, w, h, px, py], ... } }

function createCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('加载图集失败 ' + url));
        img.src = url;
    });
}

export class AtlasLib {
    constructor(jsonUrl) {
        this.jsonUrl = jsonUrl;
        this.frames = null;
        this.image = null;
        this.textures = new Map();
        this._loading = null;
    }

    load() {
        if (this._loading) return this._loading;
        this._loading = (async () => {
            const resp = await fetch(this.jsonUrl);
            if (!resp.ok) throw new Error('加载 ' + this.jsonUrl + ' 失败');
            const data = await resp.json();
            this.frames = data.frames || {};
            const base = this.jsonUrl.slice(0, this.jsonUrl.lastIndexOf('/') + 1);
            this.image = await loadImage(base + data.image);
        })();
        return this._loading;
    }

    async getTexture(index) {
        const hit = this.textures.get(index);
        if (hit) return hit;
        await this.load();
        const f = this.frames[index];
        if (!f) return null;
        const [x, y, w, h, px, py] = f;
        const canvas = createCanvas(w, h);
        canvas.getContext('2d').drawImage(this.image, x, y, w, h, 0, 0, w, h);
        const tex = { canvas, px, py, width: w, height: h };
        this.textures.set(index, tex);
        return tex;
    }
}
