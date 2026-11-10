// W_5_View.UpdateWeaponView plays this local-space particle group during a roll.
// PlayIdleAnimation stops emission; the particles already born finish their lifetimes.
const between=([a,b])=>a+Math.random()*(b-a);
export class RollerParticles{
  constructor(layers){this.layers=layers;this.live=[];this.start=null;this.age=-1;}
  sample(now,rolling){
    if(!rolling)this.start=null;
    if(rolling){
      if(this.start===null){this.start=now;this.age=-1;}
      const age=now-this.start;
      for(const l of this.layers){
        const spawn=(offset,count)=>{
          if(offset<=this.age||offset>age)return;
          for(let i=0;i<count;i++)this.live.push({l,at:this.start+offset,life:between(l.life),
            w:between(l.width),h:between(l.height),ox:(Math.random()-.5)*l.box[0],oy:(Math.random()-.5)*l.box[1]});
        };
        for(const [t,n] of l.bursts)for(let i=Math.max(0,Math.floor((this.age-t)/l.period)+1);i*l.period+t<=age;i++)spawn(i*l.period+t,n);
        if(l.rate)for(let i=Math.max(1,Math.floor(this.age*l.rate)+1);i/l.rate<=age;i++)spawn(i/l.rate,1);
      }
      this.age=age;
    }
    this.live=this.live.filter(p=>now-p.at<p.life);
    return this;
  }
  draw(ctx,renderer,team,now,curve){
    for(const p of this.live){
      const l=p.l,age=now-p.at,t=age/p.life,image=renderer.tint(renderer.byId.get(l.id),l.tint?team:[1,1,1,1]);
      if(!image)continue;
      const idx=Math.min(l.cols*l.rows-1,Math.floor(curve(l.frames,t,0)*l.cols*l.rows));
      const sw=image.width/l.cols,sh=image.height/l.rows,w=p.w*curve(l.sx,t,1),h=p.h*curve(l.sy,t,curve(l.sx,t,1));
      ctx.save();ctx.translate(...l.xy);ctx.rotate(l.angle);ctx.scale(...l.mirror);
      ctx.translate(p.ox+l.velocity[0]*age,p.oy+l.velocity[1]*age);ctx.scale(1,-1);
      ctx.globalAlpha*=curve(l.alpha,t,1);
      ctx.drawImage(image,idx%l.cols*sw,Math.floor(idx/l.cols)*sh,sw,sh,w*(l.pivot[0]-.5),-h*(l.pivot[1]+.5),w,h);ctx.restore();
    }
  }
}
