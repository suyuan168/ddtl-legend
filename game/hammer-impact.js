import {particleCurve} from './weapon-view.js';

// Smash_Splash has three independent ParticleSystemRenderers, with no parent SortingGroup.
export class HammerImpacts {
  constructor(){this.particles=[];}

  start(x,y,layers,tint){
    for(const layer of layers){
      this.particles.push({
        layer,tint,x:x+layer.offset[0],y:y+layer.offset[1],age:0,
        width:layer.minSize+Math.random()*(layer.size-layer.minSize),
        flip:Math.random()<layer.flipX?-1:1
      });
    }
  }

  clear(){this.particles.length=0;}

  collect(ctx,render,dt,floor,foreground){
    for(const particle of this.particles){
      const {layer,age}=particle;
      const queue=layer.layer===0?floor:foreground;
      queue.push({
        layer:layer.layer,order:layer.order,y:particle.y,
        draw:()=>this.draw(ctx,render,particle,age)
      });
      particle.age+=dt;
    }
    if(this.particles.length)this.particles=this.particles.filter(p=>p.age<p.layer.seconds);
  }

  draw(ctx,render,particle,age){
    const {layer,tint,x,y,flip}=particle;
    const t=age/layer.seconds,frames=layer.rows*layer.cols;
    const frame=Math.min(frames-1,Math.floor(particleCurve(layer.frames,t,t)*frames));
    const image=render.tint(render.byId.get(layer.id),tint);
    const sw=image.width/layer.cols,sh=image.height/layer.rows;
    const w=particle.width*particleCurve(layer.sizeCurve,t,1),h=w*layer.aspect;
    ctx.save();ctx.translate(x,y);ctx.scale(flip,-1);
    ctx.globalAlpha*=particleCurve(layer.alpha,t,1);
    ctx.globalCompositeOperation='lighter';
    ctx.drawImage(image,frame%layer.cols*sw,Math.floor(frame/layer.cols)*sh,sw,sh,-w/2,-h/2,w,h);
    ctx.restore();
  }
}
