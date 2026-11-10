// Fx_Lazer_Loop is toggled by the Attack clip, independently of the damage pulses.
export class LaserCharge {
  constructor(spec){
    this.spec=spec;
    this.particles=[];
    const between=([min,max])=>min+Math.random()*(max-min);
    for(const layer of spec.layers){
      const times=Array.from({length:layer.burst},()=>0);
      for(let n=1;n/layer.rate<spec.off-spec.on;n++)times.push(n/layer.rate);
      for(const birth of times){
        const direction=Math.random()*2*Math.PI;
        this.particles.push({layer,birth:birth+spec.on,life:between(layer.life),size:between(layer.size),
          rotation:between(layer.rotation),speed:between(layer.speed),radius:Math.sqrt(Math.random())*layer.shapeRadius,
          dx:Math.cos(direction),dy:Math.sin(direction)});
      }
    }
  }
  draw(ctx,renderer,age,team,aim,flip,curve){
    if(age<this.spec.on||age>=this.spec.off)return;
    for(const p of this.particles){
      const elapsed=age-p.birth,t=elapsed/p.life;
      if(t<0||t>=1)continue;
      const l=p.layer,image=renderer.tint(renderer.byId.get(l.id),team);
      if(!image)continue;
      const frame=Math.max(0,Math.min(l.cols*l.rows-1,Math.floor(l.cols*l.rows*curve(l.frames,t,0))));
      const w=image.width/l.cols,h=image.height/l.rows,size=p.size*curve(l.scale,t,1);
      const radius=p.radius+elapsed*p.speed;
      ctx.save();ctx.translate(this.spec.anchor[0]+p.dx*radius,this.spec.anchor[1]+p.dy*radius);
      // These renderers use camera-facing billboards, while their emitter sits on the muzzle.
      ctx.scale(1,flip);ctx.rotate(-aim-Math.PI);ctx.rotate(-p.rotation);ctx.scale(1,-1);
      if(l.additive)ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha*=l.alpha*curve(l.opacity,t,1);
      ctx.drawImage(image,(frame%l.cols)*w,Math.floor(frame/l.cols)*h,w,h,-size/2,-size/2,size,size);
      ctx.restore();
    }
  }
}
