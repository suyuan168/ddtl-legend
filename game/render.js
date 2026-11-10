// Unity coordinates point up. Keep source transforms, pivots, atlas trim and sprite tint.
export class Renderer {
  constructor(assets){this.assets=assets;this.byName=new Map();this.images=new Map();this.variants=new Map();for(const a of assets)if(a.type==='Sprite'&&a.file)this.byName.set(a.name,a);this.byId=new Map(assets.map(a=>[a.id,a]));}
  load(a){if(!a?.file)return Promise.resolve(null);if(!this.images.has(a.file)){const im=new Image();im.src=a.file;this.images.set(a.file,{im,ready:im.decode()});}return this.images.get(a.file).ready;}
  async prepare(view){await Promise.all([...new Set(view.draw.map(s=>s.id))].map(id=>this.load(this.byId.get(id))));}
  tint(a,col){const im=this.images.get(a.file)?.im;if(!im?.naturalWidth)return null;if(col.slice(0,3).every(v=>v>=.999))return im;
    const key=a.file+col.slice(0,3).map(v=>Math.round(v*255)).join('-');if(this.variants.has(key))return this.variants.get(key);
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
    const pixels=g.getImageData(0,0,c.width,c.height);for(let i=0;i<pixels.data.length;i+=4){for(let j=0;j<3;j++)pixels.data[i+j]*=col[j];}g.putImageData(pixels,0,0);this.variants.set(key,c);return c;}
  paintBrush(asset,color){
    const key='brush/'+asset.id+'/'+color;
    if(!this.variants.has(key)){
      const image=this.images.get(asset.file).im,canvas=document.createElement('canvas');
      canvas.width=image.width;canvas.height=image.height;
      const g=canvas.getContext('2d');g.drawImage(image,0,0);
      g.globalCompositeOperation='source-in';g.fillStyle=color;g.fillRect(0,0,canvas.width,canvas.height);
      this.variants.set(key,canvas);
    }
    return this.variants.get(key);
  }
  layer(ctx,s){const a=this.byId.get(s.id);if(!a?.file||!s.color[3])return;const im=this.tint(a,s.color);if(!im)return;
    ctx.save();ctx.transform(...s.m);ctx.scale(s.flip[0]?-1:1,s.flip[1]?1:-1);ctx.globalAlpha*=s.color[3];
    const [w,h]=s.size, [px,py]=s.pivot;let x=-w*px,y=-h*(1-py);
    if(s.mode===0&&a.rect){const [rw,rh]=a.rect;const [ox,oy]=a.offset||[0,0];ctx.drawImage(im,x+w*ox/rw,y+h*(rh-oy-im.height)/rh,w*im.width/rw,h*im.height/rh);}
    else if(s.mode===1&&a.border?.some(Boolean)){const [l,b,r,t]=a.border;const ratio=s.borderScale??(s.path.startsWith('/TitleView')?1:1/a.ppu);
      const xx=[0,l,im.width-r,im.width], yy=[0,t,im.height-b,im.height], xs=[0,Math.min(w/2,l*ratio),w-Math.min(w/2,r*ratio),w],ys=[0,Math.min(h/2,t*ratio),h-Math.min(h/2,b*ratio),h];
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(xx[i+1]>xx[i]&&yy[j+1]>yy[j]&&xs[i+1]>xs[i]&&ys[j+1]>ys[j])ctx.drawImage(im,xx[i],yy[j],xx[i+1]-xx[i],yy[j+1]-yy[j],x+xs[i],y+ys[j],xs[i+1]-xs[i],ys[j+1]-ys[j]);}
    else if(s.mode===2&&a.ppu){
      ctx.save();ctx.translate(x,y);ctx.scale(1/a.ppu,1/a.ppu);
      // Unity's continuous sprite tiles start at the lower-left; canvas rows start at the top.
      const pattern=ctx.createPattern(im,'repeat');
      pattern.setTransform(new DOMMatrix().translate(0,(h*a.ppu)%im.height));
      ctx.fillStyle=pattern;ctx.fillRect(0,0,w*a.ppu,h*a.ppu);ctx.restore();
    }
    else ctx.drawImage(im,x,y,w,h);ctx.restore();}
  // Bake static scene geometry once. The dynamic player and ink use world coordinates.
  bake(view,box,scale,context){const c=document.createElement('canvas');c.width=Math.ceil(box.w*scale);c.height=Math.ceil(box.h*scale);const g=context?context(c):c.getContext('2d');g.setTransform(scale,0,0,-scale,-box.x*scale,(box.y+box.h)*scale);for(const layer of view.draw)this.layer(g,layer);return {c,box};}
}

// Cache world-space sprite extents so the camera can draw visible art at screen resolution.
export function sceneLayers(draw){
  return draw.map(part=>{
    const [a,b,c,d,e,f]=part.m,[w,h]=part.size,[px,py]=part.pivot;
    const sx=part.flip[0]?-1:1,sy=part.flip[1]?-1:1;
    const cx=(.5-px)*w*sx,cy=(.5-py)*h*sy;
    const x=a*cx+c*cy+e,y=b*cx+d*cy+f,rx=(Math.abs(a)*w+Math.abs(c)*h)/2,ry=(Math.abs(b)*w+Math.abs(d)*h)/2;
    return {part,layer:part.order[0],order:part.order[1],y:part.groupY??(part.sortPivot?f:y),left:x-rx,right:x+rx,bottom:y-ry,top:y+ry};
  });
}
export function inCamera(layer,cam){
  return layer.right>=cam.left&&layer.left<=cam.right&&layer.top>=cam.bottom&&layer.bottom<=cam.top;
}
