// Unity Image.FillMethod.Radial360, origin Top, clockwise, on a world-space Canvas.
export class WorldTimeGauge{
  constructor(layout,renderer){this.layout=layout;this.renderer=renderer;}
  draw(ctx,kind,x,y,ratio){
    if(!(ratio>0)||(!kind.startsWith('bomb')&&ratio>=1))return;
    const {offset,empty,fill}=this.layout[kind];
    const image=layer=>this.renderer.images.get(this.renderer.byId.get(layer.id).file).im;
    ctx.save();ctx.translate(x+offset[0],y+offset[1]);ctx.scale(1,-1);
    ctx.drawImage(image(empty),-empty.size/2,-empty.size/2,empty.size,empty.size);
    if(ratio<1){
      ctx.beginPath();ctx.moveTo(0,0);
      ctx.arc(0,0,fill.size,-Math.PI/2,-Math.PI/2+2*Math.PI*ratio);
      ctx.closePath();ctx.clip();
    }
    ctx.drawImage(image(fill),-fill.size/2,-fill.size/2,fill.size,fill.size);ctx.restore();
  }
}
