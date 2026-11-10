// Base/Character_1.overrideController uses the original four non-looping Base clips.
export const deathClips=['Front_Dead_Left','Front_Dead_Right','Back_Dead_Left','Back_Dead_Right'];
export class DeathView {
  constructor(){this.clocks=new Map();}
  sample(actor,now,clip){
    let start=this.clocks.get(actor.id);
    const authoritative=now-actor.deathAge;
    if(start===undefined||Math.abs(start-authoritative)>.25)start=authoritative;
    this.clocks.set(actor.id,start);
    return Math.min(clip.frames.length-1,Math.floor(Math.max(0,now-start)*60));
  }
  async load(renderer,particles){
    this.particles=particles;
    await renderer.prepare({draw:particles.layers});
  }
  drawHit(ctx,weaponView,pose,age,team){
    const [x,y,angle]=this.particles.anchors[pose];
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    for(const part of this.particles.layers)weaponView.drawFlash(ctx,part,age,team);
    ctx.restore();
  }
  reset(owner){this.clocks.delete(owner);}
}
