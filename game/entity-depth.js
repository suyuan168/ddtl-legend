// Renderer2D is configured with a world-Y transparency axis. E_1's body
// and the dynamically mounted weapon each have an independent SortingGroup.
export function weaponDepth(frame,aim,back,front,pivots){
  if(!frame)return null;
  const {id}=frame;
  if(id!=='1003'&&front===back)return null;
  const root=id==='1003'?(front===back?'Root_1':'Root_2'):'Root';
  const [x,y]=pivots[id][root];
  if(id==='1001'||id==='1003')return {order:front?1:-1,y:y*(frame.hammerScale||1)+(id==='1001'&&frame.name==='Attack'?1.7*Math.sin(aim):0)};
  const rotation=aim+Math.PI;
  return {order:front?0:-1,y:Math.sin(rotation)*x+Math.cos(rotation)*y*(Math.trunc(Math.cos(aim)*65536)>0?-1:1)};
}
export const compareDepth=(a,b)=>a.layer-b.layer||a.order-b.order||b.y-a.y;

export class DashParticles {
  constructor(){this.emitters=new Map();this.paths=new Map();}
  reset(){this.emitters.clear();this.paths.clear();}
  step(e,config,now){
    const id=e.owner||'local';
    let path=this.paths.get(id);
    if(e.first||!path){
      path={segments:[],end:now,next:now,angle:e.angle};
      this.paths.set(id,path);
      this.emitters.set(id,{x:e.fromX,y:e.fromY,previous:now,next:now,particles:[]});
    }
    const start=Math.max(path.end,now);
    path.end=start+e.duration;
    path.last=e.last;
    path.segments.push({...e,start,end:path.end});
    const emitter=this.emitters.get(id);
    if(!emitter)return;
    // Emit at the authoritative path positions even when an entire dash falls between room patches.
    for(path.next=Math.max(path.next,start);path.next<=path.end;path.next+=1/config.rate){
      const t=(path.next-start)/e.duration;
      emitter.particles.push({time:path.next,x:e.fromX+(e.x-e.fromX)*t,y:e.fromY+(e.y-e.fromY)*t});
    }
    emitter.next=path.next;emitter.x=e.x;emitter.y=e.y;emitter.previous=path.end;
  }
  sample(actor,now){
    const path=this.paths.get(actor.id);
    if(!path)return actor;
    if(now>path.end+.25){this.paths.delete(actor.id);return actor;}
    const s=path.segments.find(v=>v.end>=now)??path.segments.at(-1);
    const t=Math.max(0,Math.min(1,(now-s.start)/s.duration));
    const x=s.fromX+(s.x-s.fromX)*t,y=s.fromY+(s.y-s.fromY)*t;
    const travelling=now<=s.end||(!path.last&&now<s.end+.10);
    // The movement may have arrived before the position patch. Hold its confirmed endpoint
    // until the incoming snapshot reaches it, without rewinding across the dash.
    const behind=(actor.x-x)*Math.cos(path.angle)+(actor.y-y)*Math.sin(path.angle)<-.02;
    return {...actor,x:travelling||behind?x:actor.x,y:travelling||behind?y:actor.y,
      dashAim:travelling?path.angle:undefined,dashFx:true};
  }
  collect(actor,config,now,queue,render,ctx){
    if(!actor.dashFx){this.emitters.delete(actor.id);return;}
    let state=this.emitters.get(actor.id);
    if(!state){
      state={previous:now,x:actor.x,y:actor.y,next:now+1/config.rate,particles:[]};
      this.emitters.set(actor.id,state);
    }
    state.particles=state.particles.filter(p=>now-p.time<config.seconds);
    state.next=Math.max(state.next,now-config.seconds);
    while(state.previous<=now&&state.next<=now){
      const t=now>state.previous?(state.next-state.previous)/(now-state.previous):1;
      state.particles.push({x:state.x+(actor.x-state.x)*t,y:state.y+(actor.y-state.y)*t,time:state.next});
      state.next+=1/config.rate;
    }
    if(now>=state.previous)Object.assign(state,{previous:now,x:actor.x,y:actor.y});
    for(const p of state.particles){
      if(p.time>now)continue;
      const alpha=config.alpha[0][1]*(1-(now-p.time)/config.seconds);
      queue.push({layer:2,order:config.order,y:p.y,draw:()=>render.layer(ctx,{
        id:config.id,path:'/Fx_Dash',m:[1,0,0,1,p.x,p.y],size:[config.size,config.size],
        pivot:[.5,.5],flip:[false,false],color:[1,1,1,alpha],mode:0
      })});
    }
  }
}
