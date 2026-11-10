import {particleCurve} from './weapon-view.js';

// Range_Circle's tiled LineRenderer follows its 50 local-space vertices.
// Each dot samples the original 44×44 alpha texture at the prefab's UV scale.
export function drawUltimateRange(ctx,renderer,source,id,stats,x,y,angle,laserLocked){
  if(!stats||id==='1001'||(id==='1002'&&laserLocked))return;
  ctx.save();ctx.translate(x,y);
  if(id==='1002'){
    ctx.rotate(angle);
    ctx.fillStyle='rgba(255,0,0,0.5019608)';
    ctx.fillRect(0,-stats.ValueA/2,stats.AtkRange,stats.ValueA);
  }else if(id==='1003'||id==='1004'){
    drawRangeCircle(ctx,renderer,source.circle,stats.AtkRange);
  }
  ctx.restore();
}

export function drawRangeCircle(ctx,renderer,circle,radius){
    const vertices=circle.vertices,scale=2*radius;
    const im=renderer.tint(renderer.byId.get(circle.texture),circle.color);
    const period=1/circle.tile.x,height=circle.width/circle.tile.y;
    let next=period/2;
    for(let i=0;i<vertices.length;i++){
      const a=vertices[i],b=vertices[(i+1)%vertices.length];
      const dx=(b[0]-a[0])*scale,dy=(b[1]-a[1])*scale,len=Math.hypot(dx,dy);
      ctx.save();ctx.translate(a[0]*scale,a[1]*scale);ctx.rotate(Math.atan2(dy,dx));
      for(;next<len;next+=period)ctx.drawImage(im,next-period/2,-height/2,period,height);
      next-=len;ctx.restore();
    }
}

function sampleRange([min,max]){return min+(max-min)*Math.random();}

function gradientColor(gradient,phase){
  // Tint variants are cached; sample a bounded palette along the original gradient.
  const t=Math.round((gradient.random?Math.random():phase)*31)/31;
  const rgb=[1,2,3].map(c=>particleCurve(gradient.rgb.map(k=>[k[0],k[c]]),t,1));
  return [...rgb,particleCurve(gradient.alpha,t,1)];
}

function emitReadyParticle(p,birth){
  const angle=Math.random()*Math.PI*2;
  const inner=1-p.thickness,r=p.shapeRadius*Math.sqrt(inner*inner+(1-inner*inner)*Math.random());
  const w=sampleRange(p.size);
  return {birth,p,life:sampleRange(p.life),w,h:p.height?sampleRange(p.height):w,
    angle:sampleRange(p.angle),spin:sampleRange(p.spin),startFrame:sampleRange(p.startFrame),
    flipX:Math.random()<p.flip[0]?-1:1,flipY:Math.random()<p.flip[1]?-1:1,r,
    dx:Math.cos(angle),dy:Math.sin(angle),color:p.gradient?gradientColor(p.gradient,((birth-p.delay)/p.duration)%1):p.color};
}

function drawReadyParticle(ctx,renderer,instance,now){
  const {p,birth,life,color}=instance,age=now-birth,t=age/life;
  const scale=particleCurve(p.scale,t,1),w=instance.w*scale,h=instance.h*scale;
  const alpha=color[3]*particleCurve(p.alpha,t,1);
  if(w<=0||h<=0||alpha<=0)return;
  const image=renderer.tint(renderer.byId.get(p.id),color);
  const frames=p.cols*p.rows;
  const frame=Math.min(frames-1,Math.floor(((instance.startFrame+particleCurve(p.frames,t,0))%1)*frames));
  const sw=image.width/p.cols,sh=image.height/p.rows,offset=instance.r+age*p.speed;
  ctx.save();ctx.translate(p.xy[0]+offset*instance.dx,p.xy[1]+offset*instance.dy);
  ctx.rotate(instance.angle+age*instance.spin);
  // ParticleSystemRenderer.pivot shifts the billboard geometry; flip affects only its UVs.
  ctx.translate(w*p.pivot[0],-h*p.pivot[1]);ctx.scale(instance.flipX,instance.flipY);
  ctx.globalAlpha=Math.min(1,alpha);
  ctx.drawImage(image,frame%p.cols*sw,Math.floor(frame/p.cols)*sh,sw,sh,-w/2,-h/2,w,h);
  ctx.restore();
}

export class UltimateReadyFx{
  constructor(root,renderer,spec){
    this.renderer=renderer;this.spec=spec;
    this.layers=Object.entries(spec.ready).map(([name,particles])=>{
      const group=root.querySelector('[data-unity="Fx_UI_SpecialWeapon_'+name+'"]');
      // Unity draws these systems in declaration order with two different UI shaders.
      // Separate consecutive blend modes so translucent bolts cover the HUD with
      // their own source alpha, while additive glows blend against the actual scene.
      const passes=[];
      for(const p of particles){
        if(passes.at(-1)?.blend!==p.blend){
          const canvas=document.createElement('canvas');canvas.width=700;canvas.height=950;
          Object.assign(canvas.style,{position:'absolute',left:'-350px',top:'-600px',pointerEvents:'none',
            mixBlendMode:p.blend==='add'?'plus-lighter':'normal'});
          group.append(canvas);
          passes.push({blend:p.blend,ctx:canvas.getContext('2d'),particles:[]});
        }
        passes.at(-1).particles.push(p);
      }
      return {group,passes,particles,live:[]};
    });
    this.fill=root.querySelector('[data-unity="FillRainBow"]');
    const graphic=this.fill.firstElementChild;
    this.colors=spec.gradient.colors.map(c=>'rgb('+c.slice(0,3).map(v=>Math.round(v*255)).join(',')+')').join(',');
    Object.assign(graphic.style,{maskImage:'url('+renderer.byId.get('resources.assets/605').file+')',maskSize:'100% 100%',backgroundImage:'linear-gradient('+spec.gradient.angle+'deg,'+this.colors+')',backgroundSize:'100% 100%'});
  }
  update(on,now){
    if(on!==this.on){
      this.on=on;this.start=now;this.last=-1e-8;
      this.fill.hidden=!on;
      for(const l of this.layers){l.group.hidden=!on;l.live.length=0;}
    }
    if(!on)return;
    const age=now-this.start;
    this.fill.firstElementChild.style.backgroundImage='linear-gradient('+(this.spec.gradient.angle+360*age/this.spec.gradient.duration)+'deg,'+this.colors+')';
    for(const layer of this.layers){
      for(const p of layer.particles){
        const elapsed=age-p.delay,from=Math.max(this.last-p.delay,elapsed-Math.max(...p.life)-1e-8);
        if(elapsed<0)continue;
        const emit=t=>layer.live.push(emitReadyParticle(p,t+p.delay));
        for(const [at,count] of p.bursts){
          const first=Math.max(0,Math.floor((from-at)/p.duration)+1);
          const last=Math.min(p.loop?Infinity:0,Math.floor((elapsed-at)/p.duration));
          for(let n=first;n<=last;n++)for(let i=0;i<count;i++)emit(n*p.duration+at);
        }
        if(p.rate>0){
          const end=Math.floor((p.loop?elapsed:Math.min(p.duration,elapsed))*p.rate);
          for(let n=Math.max(1,Math.floor(from*p.rate)+1);n<=end;n++)emit(n/p.rate);
        }
      }
      layer.live=layer.live.filter(v=>age-v.birth<v.life);
      for(const pass of layer.passes){
        const {ctx}=pass;
        ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
        ctx.translate(350,600);ctx.globalCompositeOperation=pass.blend==='add'?'lighter':'source-over';
        for(const p of pass.particles)
          for(const instance of layer.live)if(instance.p===p)drawReadyParticle(ctx,this.renderer,instance,age);
      }
    }
    this.last=age;
  }
}

// W_1002_View caches AtkRange minus the muzzle-vector length in charge, then
// applies it to the Fx_SpecialWeapon_2 parent's X scale when firing.
export function drawSharkBeam(ctx,renderer,p,atlas,effect,team,muzzle){
  const ratio=(effect.phaseTime||0)/p.seconds;
  const alpha=particleCurve(p.opacity,ratio,0);
  if(alpha<=0)return;
  const image=renderer.tint(renderer.byId.get(atlas.id),team);
  const full=p.cols*p.rows,frame=Math.min(full-1,Math.floor(particleCurve(p.frames,ratio,0)*full));
  const width=Math.max(0,effect.range-Math.hypot(muzzle.x,muzzle.y))*p.spriteSize[0]*particleCurve(p.widthCurve,ratio,1);
  const height=p.heightScale*p.spriteSize[1]*particleCurve(p.heightCurve,ratio,1);
  const w=image.width/p.cols,h=image.height/p.rows,flip=Math.trunc(Math.cos(effect.angle)*65536)>0?-1:1;
  ctx.save();ctx.translate(effect.x,effect.y);ctx.rotate(effect.angle+Math.PI);ctx.scale(1,flip);
  ctx.translate(...p.xy);ctx.scale(1,-1);ctx.globalAlpha*=alpha;
  if(p.shader===10720)ctx.globalCompositeOperation='lighter';
  ctx.drawImage(image,(frame%p.cols)*w,Math.floor(frame/p.cols)*h,w,h,
    width*(p.pivot[0]-.5),height*(-p.pivot[1]-.5),width,height);ctx.restore();
}
