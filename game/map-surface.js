import {particleCurve} from './weapon-view.js';

// PaintView.RestoreSpawnAreaPaint fills the ZN_7 collider before the stripe sprite is drawn.
export function drawSpawnPaint(ctx,field,part,color){
  const zone=field.view.triggerZones.find(z=>z.id==='7'&&z.team===part.teamTint&&Math.hypot(z.shape[1]-part.m[4],z.shape[2]-part.m[5])<1/256);
  if(!zone)return;
  const [kind,x,y,c,s,w,h]=zone.shape;
  ctx.save();ctx.transform(c,s,-s,c,x,y);ctx.fillStyle=color;
  if(kind===4)ctx.fillRect(-w,-h,w*2,h*2);
  else if(kind===1){ctx.beginPath();ctx.arc(0,0,w,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}

export function drawPadLine(ctx,renderer,part,clip,time){
  const keys=clip.tracks[part.path.split('/').pop()];
  const alpha=particleCurve(keys,Math.max(0,time)%clip.duration,part.color[3]);
  renderer.layer(ctx,{...part,color:[...part.color.slice(0,3),alpha]});
}
