// EntityMaterialState.Bush writes bit 0x80. The three BushStencilOccluder sprites
// only draw where that bit is clear. Other scenery keeps its normal draw order.
export function visibleInBush(actor,viewer){
  return actor.bush<0||!viewer||actor.team===viewer.team||actor.bush===viewer.bush;
}
// Unity's PlayerSettings.m_ActiveColorSpace is Linear. Canvas implementations
// predating linear-sRGB contexts still retain the material alpha and stencil.
export function linearSpriteContext(canvas){
  try{return canvas.getContext('2d',{colorSpace:'srgb-linear',colorType:'float16'});}
  catch{return canvas.getContext('2d');}
}
const frameRadii=new WeakMap();
export function weaponSpriteRadius(frame,anchor){
  if(!frame||+frame.id>=1000||frame.glow||frame.effects.length)return Infinity;
  if(!frameRadii.has(frame.layers)){
    let extent=0;
    for(const part of frame.layers){
      const [a,b,c,d,x,y]=part.m,[w,h]=part.size;
      extent=Math.max(extent,Math.hypot(x,y)+w*Math.hypot(a,b)+h*Math.hypot(c,d));
    }
    frameRadii.set(frame.layers,extent);
  }
  return Math.hypot(...anchor)+frameRadii.get(frame.layers);
}
export class BushHologram{
  begin(ctx){
    this.target=ctx;this.hasMask=false;this.pending=false;
  }
  buffer(name){
    const {width,height}=this.target.canvas;
    if(!this[name]){const c=document.createElement('canvas');this[name]=name==='linear'?linearSpriteContext(c):c.getContext('2d');}
    const g=this[name];
    if(g.canvas.width!==width||g.canvas.height!==height){g.canvas.width=width;g.canvas.height=height;}
    return g;
  }
  blend(draw,x,y,worldRadius){
    const ctx=this.target,g=this.buffer('linear'),m=ctx.getTransform();
    // All body poses are baked into a 4x4 world rect. Weapon VFX can extend
    // past their holder. Use the viewport for those uncropped drawing commands.
    const center=m.transformPoint({x,y}),r=worldRadius*Math.max(Math.abs(m.a),Math.abs(m.d));
    const left=Math.max(0,Math.floor(center.x-r)),top=Math.max(0,Math.floor(center.y-r));
    const right=Math.min(ctx.canvas.width,Math.ceil(center.x+r));
    const bottom=Math.min(ctx.canvas.height,Math.ceil(center.y+r));
    const w=right-left,h=bottom-top;if(w<=0||h<=0)return;
    g.save();g.resetTransform();g.beginPath();g.rect(left,top,w,h);g.clip();
    g.drawImage(ctx.canvas,left,top,w,h,left,top,w,h);g.setTransform(m);draw(g);g.restore();
    ctx.save();ctx.resetTransform();ctx.drawImage(g.canvas,left,top,w,h,left,top,w,h);ctx.restore();
  }
  stencil(draw){
    const g=this.buffer('mask');
    if(!this.hasMask){g.resetTransform();g.clearRect(0,0,g.canvas.width,g.canvas.height);}
    g.save();g.setTransform(this.target.getTransform());draw(g);g.restore();this.hasMask=true;
  }
  vegetation(draw){
    if(!this.hasMask){draw(this.target);return;}
    const g=this.buffer('grass');
    if(!this.pending){
      g.resetTransform();g.clearRect(0,0,g.canvas.width,g.canvas.height);
      g.setTransform(this.target.getTransform());this.pending=true;
    }
    draw(g);
  }
  flush(){
    if(!this.pending)return;
    const g=this.grass,ctx=this.target;
    g.save();g.resetTransform();g.globalCompositeOperation='destination-out';g.drawImage(this.mask.canvas,0,0);g.restore();
    ctx.save();ctx.resetTransform();ctx.drawImage(g.canvas,0,0);ctx.restore();this.pending=false;
  }
}
