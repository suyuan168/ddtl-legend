import {particleCurve} from './weapon-view.js';

const choose=([min,max])=>min+(max-min)*Math.random();
function fromSystem(layer,time){
 const theta=Math.random()*Math.PI*2,z=Math.random()*2-1,rad=Math.sqrt(1-z*z);
 const vx=Math.cos(theta)*rad,vy=Math.sin(theta)*rad,velocity=choose(layer.speed);
 const color=[...layer.color],stops=layer.randomGradient;
 if(stops.length){
  // Bound the Canvas tint cache while sampling the recovered five-stop gradient.
  const shade=Math.round(Math.random()*63)/63;
  for(let c=0;c<3;c++)color[c]=particleCurve(stops.map(k=>[k[0],k[c+1]]),shade,1);
 }
 return {layer,time,life:choose(layer.life),size:choose(layer.size),angle:choose(layer.rotation),
  x:vx*layer.radius,y:vy*layer.radius,vx:vx*velocity,vy:vy*velocity,turn:0,
  color};
}
export async function prepareGachaEffects(renderer,layers){
 await Promise.all(layers.map(l=>renderer.load(renderer.byId.get(l.id))));
}
export class GachaEffects{
 constructor(parent,renderer,layers){
  this.renderer=renderer;this.canvas=document.createElement('canvas');
  this.canvas.width=this.canvas.height=1440;
  Object.assign(this.canvas.style,{position:'absolute',width:'1440px',height:'1440px',left:'50%',top:'50%',transform:'translate(-50%,-50%)',pointerEvents:'none',mixBlendMode:'screen'});
  this.canvas.dataset.gachaLight=layers[0].name;parent.append(this.canvas);
  this.layers=layers.map(l=>({l,next:0}));this.live=[];this.previous=0;
 }
 update(t){
  const canvas=this.canvas,g=canvas.getContext('2d');
  g.setTransform(1,0,0,-1,720,720);g.clearRect(-720,-720,1440,1440);g.globalCompositeOperation='lighter';
  for(const group of this.layers){
   const l=group.l;
   while(group.next<=t){
    for(const [delay,count] of l.bursts)for(let i=0;i<count;i++)this.live.push(fromSystem(l,group.next+delay));
    group.next=l.loop?group.next+l.duration:Infinity;
   }
  }
  this.live=this.live.filter(p=>t-p.time<p.life);
  const dt=Math.max(0,t-this.previous);this.previous=t;
  for(const p of this.live){
   const age=t-p.time;if(age<0)continue;
   const u=age/p.life,l=p.layer;
   const size=p.size*particleCurve(l.scale,u,1),alpha=p.color[3]*particleCurve(l.alpha,u,1);
   if(!(size>0&&alpha>0))continue;
   const a=this.renderer.byId.get(l.id);
   const im=this.renderer.tint(a,p.color);if(!im)continue;
   p.turn+=dt*particleCurve(l.rotationCurve,u,0);
   g.save();g.translate(p.x+age*p.vx,p.y+age*p.vy);g.rotate(p.angle+p.turn);g.scale(1,-1);
   g.globalAlpha=Math.min(1,alpha);g.drawImage(im,-size/2,-size/2,size,size);g.restore();
  }
 }
}
