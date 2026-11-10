import {particleCurve} from './weapon-view.js';

export class GiantSprinklerView{
  constructor(machine,renderer,parts,feedback){
    const mask=parts.find(p=>p.path.endsWith('/LiquidMask'));
    Object.assign(this,{machine,renderer,mask,parts,feedback});
    this.canvas=document.createElement('canvas');
    const sprite=renderer.byId.get(mask.id);
    [this.canvas.width,this.canvas.height]=sprite.rect;
    this.hits=machine.hitSerial;this.active=false;this.loops=[];
  }
  stop(){
    for(const loop of this.loops)loop.pause();
    this.loops.length=0;
  }
  sample(now,audioEnabled){
    const m=this.machine,{Hit,Shoot}=m.spec.motions;
    if(this.hits!==m.hitSerial){
      this.feedback.hit(m.hitX,m.hitY,m.team);
      if(audioEnabled){
        const point={x:m.hitX,y:m.hitY};
        this.feedback.play(103+Math.floor(Math.random()*2),point);
        this.feedback.play(47+Math.floor(Math.random()*3),point);
      }
      if(!m.active){this.clip=Hit;this.start=now;}
    }
    if(m.active!==this.active){
      this.clip=m.active?Shoot:null;this.start=now;
    }
    if(m.active&&audioEnabled){
      if(!this.loops.length)this.loops=[105,80].map(id=>this.feedback.loop(id,m)).filter(Boolean);
    }else this.stop();
    this.hits=m.hitSerial;this.active=m.active;
    const age=this.clip?.loop?(now-this.start)%this.clip.duration:now-this.start;
    this.scale=this.clip&&age<this.clip.duration?
      [particleCurve(this.clip.tracks.x,age,1),particleCurve(this.clip.tracks.y,age,1)]:[1,1];
  }
  floor(ctx,part,color){
    const [, , , ,x,y]=this.mask.m;
    ctx.save();ctx.translate(x,y);ctx.scale(...this.scale);ctx.translate(-x,-y);
    if(part!==this.mask)this.renderer.layer(ctx,part);
    else if(this.machine.charge>0)this.drawFill(ctx,color);
    ctx.restore();
  }
  drawFill(ctx,color){
    const {spec,charge,config}=this.machine,{canvas,mask}=this;
    const h=spec.fillRange[0]+(spec.fillRange[1]-spec.fillRange[0])*charge/(65536*config.PaintCapacity);
    const g=canvas.getContext('2d'),[mw,mh]=mask.size;
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);
    g.setTransform(canvas.width/mw,0,0,-canvas.height/mh,canvas.width/2,0);
    for(const kind of ['LiquidColor','Surface']){
      const part=spec[kind],[x,y]=part.offset;
      this.renderer.layer(g,{...part,m:[1,0,0,spec.fillScale,x,h+y*spec.fillScale],path:'/'+kind,
        flip:[false,false],color:kind==='LiquidColor'?color:part.color,mode:0});
    }
    g.globalCompositeOperation='destination-in';
    this.renderer.layer(g,{...mask,m:[1,0,0,1,0,0],color:[1,1,1,1]});
    g.globalCompositeOperation='source-over';
    ctx.save();ctx.transform(...mask.m);ctx.translate(...spec.maskAnchor);ctx.scale(1,-1);
    ctx.drawImage(canvas,-mw/2,0,mw,mh);ctx.restore();
  }
}
