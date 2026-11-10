// ZN_4_View switches the lid Animator on cooldown transitions and only shows a partial gauge.
export class VentView{
  constructor(motion,renderer,sound){this.motion=motion;this.renderer=renderer;this.sound=sound;}
  bind(field,draw){
    const lids=draw.filter(p=>p.path.includes('/Entity/Vent/')&&p.path.endsWith('/Manhole/Manhole'));
    this.entries=field.vents.entries.map(vent=>{
      const lid=lids.find(p=>Math.hypot(p.m[4]-vent.x,p.m[5]-vent.y)<.001);
      if(!lid)throw Error('Missing vent lid for '+field.map.Id+'/'+vent.entity);
      return {vent,lid};
    });
    return new Set(lids);
  }
  sprite(base,id){
    const asset=this.renderer.byId.get(id);
    return {...base,id,pivot:asset.pivot,size:asset.rect.map(v=>v/asset.ppu)};
  }
  collect(ctx,field,sorted,seconds,roomTimes,gauge){
    const clips=this.motion;
    for(const [i,state] of this.entries.entries()){
      const {vent,lid}=state,left=roomTimes?.[i]??vent.left,open=left<=0,total=field.vents.duration;
      if(state.open!==open){
        if(state.open!==undefined){
          this.sound(open?'sfx_ingame_move_location_1':'sfx_ingame_move_location_2',vent);
        }
        state.since=seconds;state.open=open;
      }
      const transition=clips[open?'Vent_Open':'Vent_Close'],age=Math.max(0,seconds-state.since);
      const clip=age<transition.duration?transition:clips[open?'Vent_Open_Idle':'Vent_Close_Idle'];
      const t=clip===transition?age:(age-transition.duration)%clip.duration;
      const [id,m,alpha]=clip.frames[Math.min(clip.frames.length-1,Math.floor(t*clip.rate))];
      sorted.push({layer:lid.order[0],order:lid.order[1],y:vent.y,draw:()=>{
        ctx.save();ctx.transform(...lid.m);this.renderer.layer(ctx,{...this.sprite(lid,id),m});ctx.restore();
      }});
      if(alpha){
        const light=clips.light;
        sorted.push({layer:lid.order[0],order:light.order,y:vent.y,draw:()=>{
          ctx.save();ctx.transform(...lid.m);
          this.renderer.layer(ctx,{...this.sprite(lid,light.id),color:[...light.color.slice(0,3),alpha],m:[1,0,0,1,...light.position]});ctx.restore();
        }});
      }
      if(left>0&&left<total&&gauge)sorted.push({layer:lid.order[0],order:3,y:vent.y,draw:()=>gauge.draw(ctx,'vent',vent.x,vent.y,left/total)});
    }
  }
}
