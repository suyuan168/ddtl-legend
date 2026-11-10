import {spriteLayer} from './equipment.js';
import {sampleCurve,stats} from './simulation.js';

// Weapon_3/Range_Square is a second sorting group mounted directly on the gun,
// independent of its animated Root. Its original Square sprite faces local -X.
export class WeaponAim {
  constructor(renderer,equipment,tables,parameters){
    const row=tables.Weapon.find(row=>row.Id==='3');
    this.range=stats(row).AtkRange;
    this.curve=parameters[row.AO].rangeCurve;
    this.renderer=renderer;
    this.inner=spriteLayer(renderer,equipment.Weapon_3.find(entry=>entry.path.endsWith('/Range_Square/Inner')));
  }
  collect(actor,aim,gun,queue,ctx){
    if(actor.weapon!=='3'||!(actor.charge>0)||actor.special||actor.armed||actor.boost)return;
    const length=this.range*sampleCurve(this.curve,actor.charge);
    const [a,b,c,d,x,y]=this.inner.m,rotation=aim+Math.PI;
    const flip=Math.trunc(Math.cos(aim)*65536)>0?-1:1;
    const part={...this.inner,m:[a*length,b*length,c,d,x-a*length/2,y-b*length/2]};
    queue.push({layer:2,order:-1,y:actor.y+gun[1]+Math.sin(rotation)*x+Math.cos(rotation)*y*flip,draw:()=>{
      ctx.save();ctx.translate(actor.x+gun[0],actor.y+gun[1]);ctx.rotate(rotation);ctx.scale(1,flip);
      this.renderer.layer(ctx,part);ctx.restore();
    }});
  }
}

// Native AimPointView uses Contents as the punch target and keeps the dark
// PaintGauge disabled in Awake. Hit only animates Contents/Cross (Crosshair_2).
export class AimReticle {
  constructor(tree,drawTree,renderer,host){
    this.node=document.createElement('div');this.node.className='aim-cross';this.node.hidden=true;
    host.append(this.node);
    drawTree(this.node,tree,{renderer,parentSize:[120,120],customize:n=>{
      if(n.name==='PaintGauge')return {...n,active:false};
      if(n.name==='Cross')return {...n,image:{...n.image,color:[239/255,32/255,103/255,1]}};
      return n;
    }});
    this.contents=this.node.querySelector('[data-unity="Contents"]');
    this.mark=this.node.querySelector('[data-unity="Cross"]');
    this.mark.style.opacity=0;
  }
  shoot(){
    this.punch?.cancel();
    // DOTween.Punch(.4,.3,5,.5) calculates 2 segments with normalized
    // durations .1 and .2. Each segment is eased independently (OutQuad).
    this.punch=this.contents.animate([
      {scale:'1',offset:0,easing:'cubic-bezier(.333333,.666667,.666667,1)'},
      {scale:'1.4',offset:1/3,easing:'cubic-bezier(.333333,.666667,.666667,1)'},{scale:'1'}
    ],300);
  }
  hit(){
    this.hitColor?.cancel();this.hitScale?.cancel();
    // The unweighted flat tangents in AimPointView_Hit.anim are smoothstep.
    const ease='cubic-bezier(.333333,0,.666667,1)';
    this.hitColor=this.mark.animate([{opacity:1,offset:0},{opacity:1,offset:1/3,easing:ease},{opacity:0}],250);
    this.hitScale=this.mark.animate([{scale:'1.1',easing:ease},{scale:'1'}],50);
  }
}
