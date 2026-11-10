import {particleCurve} from './weapon-view.js';

const mix=([a,b])=>a+(b-a)*Math.random();
const numberCurve=(keys,t)=>{
  for(let i=1;i<keys.length;i++){
    if(t<keys[i][0]&&(keys[i-1][3]===null||keys[i][2]===null))return keys[i-1][1];
    if(t<keys[i][0])break;
  }
  return particleCurve(keys,t,1);
};
export function dummyAngle(target,data){
  const t=target.hitAge/data.halfTurnSeconds;
  if(!(t>=0&&t<2))return 0;
  // DOTween Ease.OutQuad (6), followed by Ease.InOutQuad (7).
  const u=t-1;
  const bend=t<1?1-(1-t)**2:u<.5?1-2*u*u:2*(1-u)**2;
  return target.hitSign*data.hitDegrees*Math.PI/180*bend;
}

export class DummyFeedback {
  constructor(data,render,tables){
    this.data=data;this.render=render;this.table=tables.FloatingTextView;
    this.fx=[];this.labels=[];this.scenery=new Map();
  }
  bind(field){
    this.fx.length=0;this.labels.length=0;this.scenery.clear();
    for(const marker of field.view.draw.filter(p=>/\/Training\/Dummy[^/]*\/Targeting$/.test(p.path))){
      const target=field.targets.find(t=>!t.model&&Math.abs(t.x-marker.m[4])<.01&&Math.abs(t.y-marker.m[5])<.01);
      if(!target)continue;
      const prefix=marker.path.slice(0,-'/Targeting'.length);
      const body=field.view.draw.find(p=>p.path===prefix+'/Square');
      for(const part of field.view.draw.filter(p=>p.path.startsWith(prefix+'/'))){
        this.scenery.set(part,{target,pivot:body.m.slice(4),marker:part===marker});
      }
    }
  }
  layer(ctx,part,target,pivot,marker,locked){
    if(marker&&!locked.includes(target))return;
    const angle=!marker&&dummyAngle(target,this.data);
    if(!angle){this.render.layer(ctx,part);return;}
    ctx.save();ctx.translate(...pivot);ctx.rotate(angle);ctx.translate(-pivot[0],-pivot[1]);
    this.render.layer(ctx,part);ctx.restore();
  }
  sceneLayer(ctx,part,locks){
    const data=this.scenery.get(part);
    if(data)this.layer(ctx,part,data.target,data.pivot,data.marker,locks);
    else this.render.layer(ctx,part);
  }
  collect(target,parts,queue,ctx,locks){
    if(target.respawn)return;
    const pivot=parts.find(part=>part.path.endsWith('/Square')).m.slice(4);
    for(const part of parts){
      const marker=part.path.endsWith('/Targeting');
      if(marker&&!locks.includes(target))continue;
      queue.push({layer:part.sortLayer,order:part.order,y:target.y+part.m[5],draw:()=>{
        ctx.save();ctx.translate(target.x,target.y);
        this.layer(ctx,part,target,pivot,marker,locks);ctx.restore();
      }});
    }
  }
  impactParticles(x,y,color){
    const tint=[1,3,5].map(k=>parseInt(color.slice(k,k+2),16)/255).concat(1);
    for(const layer of this.data.layers){
      for(let i=0;i<layer.count;i++){
        const angle=Math.random()*Math.PI*2,r=layer.radius*Math.sqrt(Math.random());
        const speed=mix(layer.speed),cs=Math.cos(angle),sn=Math.sin(angle);
        this.fx.push({layer,age:0,x:x+r*cs,y:y+r*sn,
          vx:speed*cs,vy:speed*sn,life:mix(layer.life),size:mix(layer.size),rotation:mix(layer.rotation),tint});
      }
    }
  }
  impact(event,color){
    this.impactParticles(event.x,event.y,color);
    this.floating(event);
  }
  floating(event){
    const row=this.table.find(r=>r.Id===String(event.textId));
    const weight=Number(row.PosWeight);
    this.labels.push({age:0,x:event.targetX+this.data.offset.x+mix([-weight,weight]),
      y:event.targetY+this.data.offset.y+mix([-weight,weight]),row,value:event.damage});
  }
  draw(ctx,dt,uiScale){
    for(const p of this.fx){
      const {layer:l}=p,t=p.age/p.life;
      if(t>=1)continue;
      const image=this.render.tint(this.render.byId.get(l.id),p.tint);
      const idx=Math.max(0,Math.min(l.cols*l.rows-1,Math.floor(particleCurve(l.frames,t,t)*l.cols*l.rows)));
      const w=image.width/l.cols,h=image.height/l.rows;
      ctx.save();ctx.translate(p.x+p.vx*p.age,p.y+p.vy*p.age);ctx.rotate(p.rotation);ctx.scale(1,-1);
      ctx.globalAlpha=particleCurve(l.alpha,t,1);
      ctx.drawImage(image,idx%l.cols*w,Math.floor(idx/l.cols)*h,w,h,p.size*(l.pivot[0]-.5),-p.size*(l.pivot[1]+.5),p.size,p.size);
      ctx.restore();p.age+=dt;
    }
    this.fx=this.fx.filter(p=>p.age<p.life);
    for(const label of this.labels){
      const anim=this.data.floats[label.row.Animation],age=label.age;
      ctx.save();ctx.translate(label.x,label.y);ctx.scale(uiScale,-uiScale);
      ctx.translate(0,-numberCurve(anim.y,age));
      const scale=numberCurve(anim.scale,age);ctx.scale(scale,scale);
      ctx.globalAlpha=numberCurve(anim.alpha,age);ctx.fillStyle=label.row.ColorCode;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+this.data.fontSize+'px ChillGothic';
      ctx.fillText(label.row.Fix||String(Math.trunc(label.value)),0,0);ctx.restore();label.age+=dt;
    }
    this.labels=this.labels.filter(l=>l.age<this.data.floats[l.row.Animation].duration);
  }
}
