// Local-space Shape and Emission modules below the original weapon's muzzleFlash.
// A particle's random quantities are sampled at birth, not on every draw.
const rnd=([a,b])=>a+(b-a)*Math.random(),D=Math.PI/180;
function tilt(v,[x,y,z]){
  const cx=Math.cos(x*D),sx=Math.sin(x*D),cy=Math.cos(y*D),sy=Math.sin(y*D),cz=Math.cos(z*D),sz=Math.sin(z*D);
  const a=v[0]*cz-v[1]*sz,b=v[0]*sz+v[1]*cz,c=b*cx-v[2]*sx,d=b*sx+v[2]*cx;
  return [a*cy+d*sy,c,d*cy-a*sy];
}
function spawn(l,born){
  const angle=Math.random()*l.arc*D,ux=Math.cos(angle),uy=Math.sin(angle);
  const r=l.radius*Math.sqrt(1-(1-(1-l.thickness)**2)*Math.random());
  const cone=l.cone*D;
  const start=l.shape===-1?[0,0,0]:l.shape===5?l.scale.map(w=>(Math.random()-.5)*w):[ux*r*l.scale[0],uy*r*l.scale[1],0];
  const direction=l.shape===10?[ux,uy,0]:l.shape===4?[ux*Math.sin(cone),uy*Math.sin(cone),Math.cos(cone)]:[0,0,1];
  const o=tilt(start,l.tilt),v=l.shape===-1?direction:tilt(direction,l.tilt),speed=rnd(l.speed),w=rnd(l.size);
  const [a,b,c,d]=l.axes;
  return {l,born,life:rnd(l.life),x:a*(o[0]+l.pos[0])+c*(o[1]+l.pos[1]),y:b*(o[0]+l.pos[0])+d*(o[1]+l.pos[1]),
    vx:(a*v[0]+c*v[1])*speed,vy:(b*v[0]+d*v[1])*speed,w,h:l.height?rnd(l.height):w,
    flipX:Math.random()<l.flip[0]?-1:1,flipY:Math.random()<l.flip[1]?-1:1,rot:rnd(l.rotation),spin:rnd(l.spin),row:l.singleRow?(l.rowMode===1?Math.floor(Math.random()*l.tiles[1]):l.row):0};
}
export class MuzzleParticles{
  constructor(){this.live=[];}
  trigger(layers,now){
    for(const l of layers||[])for(const [delay,count] of l.births)
      for(let n=0;n<count;n++)this.live.push(spawn(l,now+delay));
  }
  draw(ctx,renderer,now,team,curve){
    this.live=this.live.filter(p=>now-p.born<p.life);
    for(const p of this.live)if(now>=p.born)this.drawParticle(ctx,renderer,p,now-p.born,team,curve);
  }
  drawParticle(ctx,renderer,p,age,team,curve){
    const l=p.l,t=age/p.life,alpha=(l.tint?team[3]:l.color[3])*curve(l.alpha,t,1);
    if(alpha<=0)return;
    const im=renderer.tint(renderer.byId.get(l.id),l.tint?team:l.color);if(!im)return;
    const speed=Math.hypot(p.vx,p.vy),floor=Math.min(speed,l.limit??speed),k=l.damping?-60*Math.log1p(-l.damping):0;
    const travel=k&&speed?(floor*age+(speed-floor)*-Math.expm1(-k*age)/k)/speed:age;
    const [a,b,c,d,x,y]=l.axes,[cols,rows]=l.tiles,count=l.singleRow?cols:cols*rows;
    const cell=p.row*cols+Math.min(count-1,Math.max(0,Math.floor(curve(l.frames,t,0)*count)));
    const width=im.width/cols,height=im.height/rows,s=curve(l.sx,t,1);
    const w=p.w*s*Math.hypot(a,b),h=p.h*curve(l.sy,t,s)*Math.hypot(c,d)*(l.stretch||1);
    ctx.save();ctx.translate(x+p.x+p.vx*travel,y+p.y+p.vy*travel);
    ctx.rotate(l.stretch&&speed?Math.atan2(p.vy,p.vx)-Math.PI/2:(l.alignment===2?Math.atan2(b,a):0)-p.rot-p.spin*age);ctx.scale(p.flipX,-p.flipY);ctx.globalAlpha*=alpha;
    if(l.add)ctx.globalCompositeOperation='lighter';
    ctx.drawImage(im,cell%cols*width,Math.floor(cell/cols)*height,width,height,
      (l.pivot[0]-.5)*w,(-l.pivot[1]-.5)*h,w,h);ctx.restore();
  }
}
