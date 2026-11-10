import {drawRangeCircle} from './ultimate-view.js';
// W_1003_View launches local artwork on alternating animation events. E_1001 spawns separately at the strike point.
export class MissileView {
  constructor(spec, outline, renderer, sampleBomb){
    this.spec=spec;this.outline=outline;this.renderer=renderer;this.sampleBomb=sampleBomb;
    this.flights=[];this.targetClocks=new Map();
  }
  target(ctx,id,now){
    if(!this.targetClocks.has(id))this.targetClocks.set(id,now);
    const m=this.spec.marker,asset=this.renderer.byId.get(m.id);
    const phase=((now-this.targetClocks.get(id))/m.duration)%2,t=phase>1?2-phase:phase;
    const scale=m.scale+(m.to-m.scale)*t*(2-t);
    this.renderer.layer(ctx,{id:m.id,m:[scale,0,0,scale,0,0],size:asset.rect.map(v=>v/asset.ppu),
      flip:[false,false],color:m.color,pivot:asset.pivot,mode:0});
  }
  launch(actor,gun,side,aim,at){
    const d=this.spec,flipped=Math.trunc(Math.cos(aim)*65536)>0;
    const turn=Math.random()*(side==='left'?d.leftAngle:d.rightAngle);
    const angle=(d.upDegrees+(flipped?-turn:turn))*Math.PI/180;
    const [x,y]=d.emitters[side];
    const flight={at,x:actor.x+gun[0]+(flipped?-x:x),y:actor.y+gun[1]+y,angle,side};
    this.flights.push(flight);return flight;
  }
  bomb(ctx,x,y,angle,scale,age){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
    for(const part of this.sampleBomb(age))this.renderer.layer(ctx,part);
    ctx.restore();
  }
  drawFlights(ctx,now){
    const d=this.spec;
    this.flights=this.flights.filter(p=>now-p.at<d.destroySeconds);
    for(const p of this.flights){
      const age=Math.max(0,now-p.at),t=Math.min(1,age/d.launchSeconds);
      const distance=d.launchDistance*t*(2-t);
      this.bomb(ctx,p.x+Math.cos(p.angle)*distance,p.y+Math.sin(p.angle)*distance,
        p.angle-d.spriteOffsetDegrees*Math.PI/180,d.scale,age);
    }
  }
  warning(ctx,o,radius,remainingProgress=o.phaseTime||0){
    const {inner,innerColor}=this.spec,progress=Math.max(0,Math.min(1,remainingProgress));
    ctx.save();ctx.translate(o.x,o.y);
    // EntityView.GetOrSpawnCircleRangeView -> Common/CircleRange. Dash size is in
    // world units; increasing attack radius increases the dash count, not its width.
    drawRangeCircle(ctx,this.renderer,this.outline,radius);
    const diameter=2*radius*progress;
    this.renderer.layer(ctx,{id:inner,m:[diameter,0,0,diameter,0,0],flip:[false,false],size:[1,1],pivot:[.5,.5],color:innerColor,mode:0});
    ctx.restore();
  }
  strike(ctx,o,radius){
    const d=this.spec,progress=Math.min(1,o.phaseTime||0);
    ctx.save();ctx.translate(o.x,o.y);
    if(progress>d.dropSeconds){
      const age=progress-d.dropSeconds;
      this.bomb(ctx,0,d.dropHeight*Math.max(0,1-age/d.dropSeconds),d.dropAngle,d.dropScale,age);
    }
    ctx.restore();
  }
}
