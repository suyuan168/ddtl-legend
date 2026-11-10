const between=([a,b])=>a+Math.random()*(b-a);

export class BushLeaves{
  constructor(spec,renderer,sound){
    this.spec=spec;this.renderer=renderer;this.sound=sound;
    this.seen=new WeakMap();this.bursts=new Map();this.actors=new Map();
  }
  prepare(){return this.renderer.prepare({draw:[this.spec]});}
  burst(cell,start,side){
    const s=this.spec,[delay,facing]=s.clips[side];
    const particles=Array.from({length:s.count},()=>{
      const angle=Math.random()*s.arc,ux=Math.cos(angle),uy=Math.sin(angle);
      const radius=Math.sqrt(Math.random())*s.radius;
      return {x:ux*radius,y:uy*radius,vx:ux*s.speed,vy:uy*s.speed,life:between(s.life),
        size:between(s.size),rotation:between(s.rotation),spin:between(s.spin),row:Math.floor(Math.random()*s.sheet[1])};
    });
    this.bursts.set(cell,{start:start+delay,facing,particles});
  }
  collect(actors,cells,now,queue,ctx,enabled=true){
    if(cells!==this.cells){
      this.cells=cells;this.bursts.clear();this.actors.clear();this.zones=new Map();
      for(const cell of cells){
        if(!this.zones.has(cell.entity))this.zones.set(cell.entity,[]);
        this.zones.get(cell.entity).push(cell);
      }
    }
    if(!enabled)return;
    const s=this.spec,next=new Map();
    for(const actor of actors){
      if(actor.bush<0)continue;
      const old=this.actors.get(actor.id),same=old?.zone===actor.bush;
      let until=same?old.until:0;
      if(same&&(Math.abs(actor.x-old.x)>0x28f/65536||Math.abs(actor.y-old.y)>0x28f/65536)&&now>=until&&
        this.zones.get(actor.bush)?.some(c=>Math.hypot(c.x-actor.x,c.y-actor.y)<=s.radiusContact)){
        this.sound(s.sounds[Math.floor(Math.random()*s.sounds.length)],actor);
        until=now+s.soundCooldown;
      }
      next.set(actor.id,{x:actor.x,y:actor.y,zone:actor.bush,until});
    }
    this.actors=next;
    for(const cell of cells){
      if(cell.clip==='Idle'||this.seen.get(cell)===cell.time)continue;
      this.seen.set(cell,cell.time);this.burst(cell,cell.time,cell.clip);
    }
    for(const [cell,e] of this.bursts){
      const age=now-e.start;
      if(age<0)continue;
      if(cell.clip==='Idle'||!e.particles.some(p=>p.life>age)){this.bursts.delete(cell);continue;}
      queue.push({layer:s.layer,order:s.order,y:cell.y,draw:()=>this.draw(ctx,cell,e,age)});
    }
  }
  draw(ctx,cell,e,age){
    const s=this.spec,image=this.renderer.tint(this.renderer.byId.get(s.id),s.color);
    if(!image)return;
    const [cols,rows]=s.sheet,w=image.width/cols,h=image.height/rows;
    ctx.save();ctx.transform(cell.c,cell.s,-cell.s,cell.c,cell.x,cell.y);
    ctx.translate(...s.offset);ctx.scale(e.facing,1);
    for(const p of e.particles){
      if(age>=p.life)continue;
      ctx.save();ctx.globalAlpha*=s.color[3]*(1-age/p.life);
      ctx.translate(p.x+p.vx*age,p.y+p.vy*age);ctx.rotate(p.rotation+p.spin*age);ctx.scale(1,-1);
      ctx.drawImage(image,s.column*w,p.row*h,w,h,-p.size/2,-p.size/2,p.size,p.size);ctx.restore();
    }
    ctx.restore();
  }
}
