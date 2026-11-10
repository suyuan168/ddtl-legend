import {intersectsDisc} from './drops.js';
import {translated} from './language.js';
import {sceneLayers} from './render.js';

export function tipsEnabled(){return localStorage.getItem('chill-game-tips')!=='off';}

function drawText(ctx,layer,text){
  const lines=[];
  ctx.save();
  ctx.translate(layer.x,layer.y);
  ctx.scale(.01,-.01);
  ctx.textAlign='center';ctx.textBaseline='middle';
  const [r,g,b,a]=layer.color;
  ctx.fillStyle='rgba('+[r*255,g*255,b*255,a].join(',')+')';
  for(const para of text.split(/<br\s*\/?>|\\n|\n/i)){
    const size=layer.font*100*Number(para.match(/<size=(\d+)%>/i)?.[1]??100)/100;
    const font=layer.weight+' '+size+'px ChillGothic,"PingFang SC",sans-serif';
    ctx.font=font;
    const sentence=para.replace(/<[^>]+>/g,'');
    const parts=sentence.match(/[\u3000-\u9fff]|[^\s\u3000-\u9fff]+|\s+/gu)||[];
    let line='';
    for(const part of parts){
      if(line.trim()&&ctx.measureText(line+part).width>layer.size[0]*100){
        lines.push({line:line.trimEnd(),font,size});line='';
      }
      line+=line?part:part.trimStart();
    }
    lines.push({line:line.trimEnd(),font,size});
  }
  const height=lines.reduce((n,l)=>n+l.size*1.12,0);
  let y=(layer.pivot[1]-.5)*layer.size[1]*100-height/2;
  for(const row of lines){
    ctx.font=row.font;ctx.fillText(row.line,(.5-layer.pivot[0])*layer.size[0]*100,y+row.size*.56);y+=row.size*1.12;
  }
  ctx.restore();
}

export class LobbyZones{
  constructor(data,renderer,locale,uiSound){
    this.uiSound=uiSound;this.closet=data.zones.find(z=>z.id===6);
    this.zones=data.zones;this.limit=data.tipRadiusSquared;this.renderer=renderer;this.locale=locale;
    this.outlines=new Map(this.zones.filter(z=>z.outline).map(z=>[z.entity,sceneLayers([z.outline])[0]]));
    this.reset();
  }
  reset(){this.inside=new Set();this.closetOpen=false;}
  async load(){
    const art=this.zones.flatMap(z=>[...z.layers.filter(l=>l.sprite).map(l=>({id:l.sprite})),...(z.outline?[z.outline]:[])]);
    await this.renderer.prepare({draw:art});
  }
  enter(field,action){
    if(this.closet){
      const near=Math.hypot(this.closet.x-field.x,this.closet.y-field.y)<=this.uiSound.settings.closetDistance;
      if(near&&!this.closetOpen)this.uiSound.cue(32);
      this.closetOpen=near;
    }
    const next=new Set();
    for(const zone of this.zones)if(intersectsDisc(zone.shape,field.x,field.y,field.view.playerRadius)){
      next.add(zone.entity);
      if(!this.inside.has(zone.entity))action(zone.id);
    }
    this.inside=next;
  }
  nearby(zone,field){return tipsEnabled()&&(zone.x-field.x)**2+(zone.y-field.y)**2<=this.limit;}
  addOutlines(sorted,field){
    for(const z of this.zones)if(this.outlines.has(z.entity)&&this.nearby(z,field))sorted.push(this.outlines.get(z.entity));
  }
  draw(ctx,field,visible){
    for(const z of this.zones){
      if(z.x<visible.left-5||z.x>visible.right+5||z.y<visible.bottom-6||z.y>visible.top+2)continue;
      const near=this.nearby(z,field);
      ctx.save();ctx.translate(z.x,z.y);
      for(const l of z.layers){
        if(l.group==='Tip'&&!near)continue;
        if(l.locale)drawText(ctx,l,translated(this.locale,l.locale));
        else this.renderer.layer(ctx,{...l,id:l.sprite,m:[1,0,0,1,l.x,l.y],flip:[false,false],path:'/Lobby/'+l.group});
      }
      ctx.restore();
    }
  }
}
