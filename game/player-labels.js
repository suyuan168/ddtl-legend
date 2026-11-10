// E_1's world-space EntityCanvas uses an upward-growing VerticalLayoutGroup.
export class PlayerLabels {
  constructor(data,renderer){this.data=data;this.renderer=renderer;this.ratios=new Map();}
  async load(){const d=this.data;await this.renderer.prepare({draw:[d.back,d.empty,d.fill]});}
  reset(){this.ratios.clear();}
  draw(ctx,id,name,color,hp,maxHp,dt){
    const d=this.data,visible=hp!=null&&maxHp>0&&hp<maxHp;
    ctx.save();ctx.scale(...d.canvas);
    if(name){
      const y=d.baseY+d.nameHalf+d.nameOffsetY+(visible?d.healthRow+d.spacing:0);
      ctx.save();ctx.translate(0,y);ctx.scale(1,-1);ctx.font=d.fontSize+'px ChillGothic, sans-serif';
      ctx.textBaseline='middle';ctx.textAlign='center';
      ctx.fillStyle='rgba('+d.outlineColor.map((v,k)=>k===3?v:Math.round(v*255)).join(',')+')';
      // Unity UI Outline emits four diagonal copies of the glyph mesh.
      for(const dx of [-d.outline[0],d.outline[0]]){
        for(const dy of [-d.outline[1],d.outline[1]])ctx.fillText(name,dx,dy);
      }
      ctx.fillStyle=color;ctx.fillText(name,0,0);ctx.restore();
    }
    if(visible){
      const prior=this.ratios.get(id)??1,target=Math.max(0,Math.trunc(hp*65536/maxHp)/65536);
      const value=prior+(target-prior)*Math.min(1,Math.max(0,dt*d.smoothSpeed));
      this.ratios.set(id,value);
      ctx.translate(0,d.baseY+d.healthRow*.5);ctx.scale(...d.barScale);
      const layer=(part,x,w,h)=>{
        if(w<=0)return;
        this.renderer.layer(ctx,{...part,path:'/HpBarGroupView',borderScale:1,mode:1,flip:[false,false],
          pivot:[.5,.5],m:[1,0,0,1,x,0],size:[w,h]});
      };
      layer(d.back,0,...d.bgSize);layer(d.empty,0,d.barWidth,d.barHeight);
      layer(d.fill,(value-1)*d.barWidth/2,value*d.barWidth,d.barHeight);
    }else this.ratios.delete(id);
    ctx.restore();
  }
}
