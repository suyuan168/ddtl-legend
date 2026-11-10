import {KillFeed} from './kill-feed.js';
import {AimReticle} from './weapon-aim.js';
import {UltimateReadyFx} from './ultimate-view.js';
import {playerName} from './rooms.js';
import {translated} from './language.js';
import {drawTree,fitStage} from './unity-ui.js';

function cooldownControl(group){
  const overlay=group.querySelector('[data-unity="CoolTime"]');
  overlay.hidden=true;
  return {icon:group.querySelector('[data-unity="Skill"]'),overlay,
    fill:overlay.querySelector('[data-unity="Gauge"]'),seconds:overlay.querySelector('.unity-label'),
    stacks:[...group.querySelectorAll('[data-go^="weapon-charge-"] [data-unity="Gauge"]')]};
}

// ControlDisplayViewModel.Tick and CoolDownAndCountView.SetValue use the next
// stack for partial progress. The large timer only appears when no use remains.
function updateCooldown(control,count,capacity,remaining,duration,canUse){
  control.icon.style.opacity=canUse?'.8':'.2';
  const waiting=duration>0?Math.max(0,Math.min(1,remaining/duration)):0;
  control.overlay.hidden=!(waiting>0&&(capacity<2||count===0));
  if(!control.overlay.hidden){
    control.fill.style.clipPath='inset('+(waiting*100)+'% 0 0 0)';
    control.seconds.textContent=String(Math.trunc(remaining));
  }
  control.stacks.forEach((fill,index)=>{
    const fraction=index<count?1:index===count?1-waiting:0;
    fill.style.clipPath='inset('+((1-fraction)*100)+'% 0 0 0)';
  });
}

export class BattleUI{
  constructor(renderer,layout,tables,locale,lobby,ultimateViews,onReady){Object.assign(this,{renderer,layout,tables,locale,lobby,ultimateViews,onReady});this.host=document.querySelector('#battle-ui');this.killFeed=new KillFeed(renderer,tables.Team);}
  resize(){fitStage(this.host,document.querySelector('#stage canvas')?.getBoundingClientRect()||document.body.getBoundingClientRect(),true);}
  show(s,showTimer){
    this.host.replaceChildren();this.host.hidden=false;this.resize();
    const gun=this.tables.WeaponAsset.find(row=>row.Id===s.weapon),skill=id=>this.tables.SkillAsset.find(v=>v.Id===id)?.Icon;
    const keyIcon=action=>this.tables.ControlKey.find(k=>k.Enum===this.tables.GameKey.find(g=>g.Enum===action)?.DefaultKey)?.Icon;
    const icons=showTimer?{'567':keyIcon('Emoji'),'212':keyIcon('Ult'),'745':keyIcon('Bomb'),'219':keyIcon('Boost'),'369':keyIcon('AltAttack'),'320':gun.Icon,'243':gun.ActiveIcon,'50':skill(s.bomb),'584':skill(s.ultimate)}:{
      '1199':keyIcon('Emoji'),'690':keyIcon('Chat'),'982':keyIcon('Ult'),'1781':keyIcon('Bomb'),'998':keyIcon('Boost'),'587':keyIcon('AltAttack'),
      '719':gun.Icon,'940':gun.ActiveIcon,'397':skill(s.bomb),'1167':skill(s.ultimate)};
    // These groups are driven by touch input, active skill cooldowns and the in-game chat.
    const inactive=new Set(showTimer?['827','771','694','205']:['1729','33','1951']);
    const weapon=this.tables.Weapon.find(w=>w.Id===s.weapon);
    const stackCount=Number(weapon.StatValues.split('|')[weapon.Types.split('|').indexOf('WeaponActiveCount')]);
    const stackGroup=showTimer?'405':'511';
    const options={renderer:this.renderer,locale:this.locale,customize:n=>{
      if(n.id===stackGroup){
        const template=n.children[0];
        return {...n,active:stackCount>1,children:Array.from({length:stackCount},(_,index)=>({...template,id:'weapon-charge-'+index}))};
      }
      if(['Fx_UI_SpecialWeapon_Back','Fx_UI_SpecialWeapon_Front','FillRainBow'].includes(n.name))return {...n,active:true};
      if(inactive.has(n.id))return {...n,active:false};
      if(n.id in icons)return {...n,active:!!icons[n.id],image:{...n.image,sprite:icons[n.id]}};
      if(n.name==='Skill'&&n.alpha!=null)return {...n,alpha:.8};
      if(showTimer&&n.id==='244')return {...n,min:[0,0],max:[1,1],text:{...n.text,min:38},value:'03:00'};
      return n;
    }};
    drawTree(this.host,showTimer?this.layout.ControlDisplayView:this.lobby,options);
    this.readyFx=new UltimateReadyFx(this.host,this.renderer,this.ultimateViews);this.readyFx.update(false,0);
    drawTree(this.host,this.layout.GameMessageView,{...options,customize:n=>n.text?{...n,value:''}:n});
    this.specialTip=this.host.querySelector('[data-unity="GameMessageView"]');
    this.specialTip.hidden=true;this.specialTipId=null;this.previousReady=undefined;
    if(showTimer)drawTree(this.host,this.layout.PlayTimeView,options);
    else drawTree(this.host,this.layout.ProfileView,{...options,customize:n=>n.id==='887'?{...n,value:playerName()}:n});
    if(showTimer){
      const draw=(tree,changes)=>drawTree(this.host,{...tree,alpha:1},{...options,customize:n=>({...n,...changes[n.id]})});
      draw(this.layout.FeverTimeView,{});draw(this.layout.CountDownView,{837:{active:false}});
      this.fever=this.host.querySelector('[data-unity="FeverTimeView"]');this.fever.hidden=true;
      this.countdown=this.host.querySelector('[data-unity="CountDownView"]');this.countdown.hidden=true;
    }
    const stat=name=>Number(weapon.StatValues.split('|')[weapon.Types.split('|').indexOf(name)]);
    this.weaponCapacity=stackCount;this.weaponTime=stat('WeaponActiveDuration');
    this.minWeaponInk=weapon.Id==='3'?stat('PaintCost'):0;
    this.directions=this.host.querySelector('[data-unity="DirectionKeyGroup"]');
    this.directions.hidden=true;
    this.gauge=null;
    this.paletteIndex=showTimer?1:0;
    {
      this.gauge=document.createElement('div');
      Object.assign(this.gauge.style,{position:'absolute',transformOrigin:'0 0',pointerEvents:'none'});
      this.host.append(this.gauge);
      const bomb=this.tables.Skill.find(row=>row.Id===s.bomb);
      const stat=name=>bomb?Number(bomb.Values.split('|')[bomb.Types.split('|').indexOf(name)]):0;
      this.bombCost=stat('PaintSkillCost');this.bombTime=stat('ValueB');this.bombCapacity=stat('ValueC');
      drawTree(this.gauge,this.layout.PaintGaugeView,{renderer:this.renderer,locale:this.locale,parentSize:this.layout.entityCanvas.size,
        customize:n=>{
          if(n.name==='Fill_Rainbow'||n.name==='Charging')return {...n,active:true};
          if(n.id==='1097')return {...n,max:[1,1]};
          if(n.id==='1971')return {...n,min:[0,1],max:[1,1]};
          if(n.id==='1586'&&!this.bombCost)return {...n,active:false};
          return n;
        }});
      this.fill=this.gauge.querySelector('[data-go="1097"]');this.handle=this.gauge.querySelector('[data-go="1971"]');
      this.rainbow=this.gauge.querySelector('[data-unity="Fill_Rainbow"]');this.rainbow.hidden=true;
      this.charging=this.gauge.querySelector('[data-unity="Charging"]');this.charging.hidden=true;
      const image=this.rainbow.querySelector('.unity-graphic'),mask=this.renderer.byId.get('resources.assets/774');
      Object.assign(image.style,{maskImage:'url("'+mask.file+'")',maskSize:'100% 100%'});
      this.bombLine=this.gauge.querySelector('[data-go="1105"]');this.gaugeTeam=0;
    }
    this.skillFill=this.host.querySelector(showTimer?'[data-go="125"]':'[data-go="228"]');
    const control=this.host.querySelector('[data-unity="ControlDisplayView"]');
    this.weaponControl=cooldownControl(control.querySelector('[data-unity="WeaponActive"]'));
    this.bombControl=cooldownControl(control.querySelector('[data-unity="Bomb"]'));
    this.host.removeAttribute('data-armed');this.host.removeAttribute('data-skate');
    this.clock=this.host.querySelector('[data-go="244"] span');
    this.reticle=new AimReticle(this.layout.AimPointView,drawTree,this.renderer,this.host);
    this.cross=this.reticle.node;
    if(showTimer)this.host.append(this.killFeed.group);
  }
  paintGauge(x,y,scale,ink,max,team,paintPack=false,charging=false){
    if(!this.gauge)return;
    const unit=scale*this.layout.entityCanvas.scale,[w,h]=this.layout.entityCanvas.size,[px,py]=this.layout.entityCanvas.pivot;
    this.gauge.style.transform='translate('+(x-w*px*unit)+'px,'+(y-h*(1-py)*unit)+'px) scale('+unit+')';
    this.charging.hidden=!charging;
    if(paintPack){
      const now=performance.now()/1000,{duration,scale:span,colors}=this.layout.paintGaugeGradient;
      if(this.rainbow.hidden)this.rainbowSince=now;
      const rate=((now-this.rainbowSince)/duration)%1;
      // UIEffect's vertical gradient uses transformed UVs and a repeating ramp.
      const offset=(1-span)/2+2*span*rate;
      const stops=colors.map(([t,r,g,b])=>'rgb('+[r,g,b].join(',')+') '+((offset+t*span)*100)+'%');
      this.rainbow.firstElementChild.style.backgroundImage='repeating-linear-gradient(to top,'+stops.join(',')+')';
    }
    this.rainbow.hidden=!paintPack;
    const ratio=Math.max(0,Math.min(1,ink/max));
    this.fill.style.top=(1-ratio)*100+'%';this.fill.style.height=ratio*100+'%';
    this.handle.style.top='calc('+(1-ratio)*100+'% - 2px)';
    if(this.bombLine)this.bombLine.style.top='calc('+(1-this.bombCost/max)*100+'% - '+this.bombLine.offsetHeight/2+'px)';
    if(this.gaugeTeam!==team){this.gaugeTeam=team;
      const graphic=this.fill.querySelector('.unity-graphic');
      const asset=this.renderer.byId.get('resources.assets/774');
      const color=this.tables.Team[team-1].TeamColor.split('|')[this.paletteIndex];
      this.renderer.load(asset).then(()=>{if(this.gaugeTeam===team)graphic.style.backgroundImage='url('+this.renderer.tint(asset,[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).concat(1)).toDataURL()+')';});
    }
  }
  skillState(ratio,actor,dx,dy,ended=false){
    const special=!ended&&actor?.special?actor.ultimate:null;
    const ready=!ended&&!!actor&&!special&&ratio>=1;
    if(this.previousReady===false&&ready)this.onReady();
    this.previousReady=ready;this.readyFx.update(ready,performance.now()/1000);
    if(special!==this.specialTipId){
      this.specialTipId=special;this.specialTip.hidden=!special;
      if(special){
        const [before,after]=translated(this.locale,'W_'+special+'_AttackTip').split('<sprite=0>');
        const label=this.specialTip.querySelector('.unity-label');
        const row=document.createElement('span'),icon=new Image();
        icon.src=this.renderer.byName.get('TextSprite_0').file;icon.alt='';icon.style.cssText='width:1em;height:1em;vertical-align:-.16em';
        row.append(before,icon,after??'');label.replaceChildren(row);
      }
    }
    if(!actor)return;
    const stock=actor.charges??this.weaponCapacity;
    updateCooldown(this.weaponControl,stock,this.weaponCapacity,actor.weaponTimeLeft??0,this.weaponTime,stock>0&&actor.ink>=this.minWeaponInk);
    this.directions.hidden=!(actor.armed&&actor.bomb==='5');
    if(!this.directions.hidden){
      for(const [key,down] of [['Left',dx<0],['Right',dx>0],['Up',dy>0],['Down',dy<0]]){
        const line=this.directions.querySelector('[data-unity="IconGroup"] [data-unity="'+key+'"]');
        if(line)line.style.filter=down?'brightness(1.45)':'';
      }
    }
    const pct=Math.round(ratio*100);
    if(this.lastPercent!==pct||this.skillFill?.dataset.charge!==String(pct)){
      this.lastPercent=pct;
      if(this.skillFill){this.skillFill.dataset.charge=String(pct);this.skillFill.style.maskImage='conic-gradient(black '+pct+'%,transparent 0)';}
    }
    this.host.dataset.armed=String(!!actor.armed);this.host.dataset.skate=actor.submerged?'ink':actor.boost?'board':'off';
    updateCooldown(this.bombControl,actor.bombStock,this.bombCapacity,actor.bombRefill??0,this.bombTime,actor.bombStock>0&&actor.ink>=this.bombCost);
  }
  notice(text){
    this.message?.remove();clearTimeout(this.timeout);
    this.message=document.createElement('div');this.message.setAttribute('role','status');this.message.className='skill-message';this.message.textContent=text;
    this.host.append(this.message);this.timeout=setTimeout(()=>this.message.remove(),1450);
  }
  emojiWheel(origin,box){
    const menu=document.createElement('div');menu.style.cssText='position:absolute;inset:0;pointer-events:none';this.host.append(menu);
    const tree=structuredClone(this.layout.EmojiView),contents=tree.children[0],group=contents.children[0];
    const w=this.host.clientWidth,h=this.host.clientHeight;
    contents.pos=[(origin.x-box.left)*w/box.width-w/2,h/2-(origin.y-box.top)*h/box.height];
    const root=group.children.find(n=>n.name==='Root');
    const {start,step,radius}=root.radial;
    root.children=this.tables.EmojiAsset.map((asset,i)=>{
      const slot=structuredClone(this.layout.EmojiElement);
      slot.id='emoji-slot-'+asset.Id;
      slot.children.forEach(child=>{child.id=slot.id+'-'+child.name;});
      slot.angle=start+i*step;
      const rad=slot.angle*Math.PI/180;
      slot.min=slot.max=slot.pivot=[.5,.5];slot.pos=[radius*Math.cos(rad),radius*Math.sin(rad)];
      const icon=slot.children.find(n=>n.name==='Image');
      icon.angle=-slot.angle;icon.image.sprite=asset.Icon;
      return slot;
    });
    drawTree(menu,tree,{renderer:this.renderer,locale:this.locale,parentSize:[w,h]});
    menu.slots=root.children.map(n=>menu.querySelector('[data-go="'+n.id+'"]'));
    menu.titleNode=menu.querySelector('[data-unity="EmojiTitle"]');
    const ring=menu.querySelector('[data-go="'+root.id+'"]');
    menu.pick=(clientX,clientY)=>{
      // The wheel is painted in Unity canvas units. Read its displayed center on every pointer move,
      // including after a viewport resize or when the browser zoom differs from its backing texture.
      const box=ring.getBoundingClientRect(),host=this.host.getBoundingClientRect();
      const dx=(clientX-box.left-box.width/2)*this.host.clientWidth/host.width;
      const dy=(clientY-box.top-box.height/2)*this.host.clientHeight/host.height;
      if(Math.hypot(dx,dy)<=tree.cancelRadius)return 0;
      const degrees=Math.fround((Math.atan2(-dy,dx)*180/Math.PI+360)%360);
      let best=Infinity,chosen=0;
      // UpdateHoverByMouseDirection keeps the first child on an exact angular tie.
      for(let i=0;i<root.children.length;i++){
        const gap=Math.abs(degrees-(start+i*step)%360),difference=Math.min(gap,360-gap);
        if(difference<best){best=difference;chosen=Number(this.tables.EmojiAsset[i].Id);}
      }
      return chosen;
    };
    this.highlightEmoji(menu,0);
    return menu;
  }
  highlightEmoji(menu,pick){
    menu.slots.forEach((slot,i)=>{
      const id=Number(this.tables.EmojiAsset[i].Id);
      slot.dataset.emojiId=id;
      slot.querySelector('[data-unity="bg"]').hidden=id!==pick;
    });
    menu.titleNode.hidden=!pick;
    if(pick){
      const label=menu.titleNode.querySelector('span');
      label.textContent=translated(this.locale,this.tables.EmojiAsset.find(e=>Number(e.Id)===pick).Name);
      const width=Math.ceil(label.textContent.length*parseFloat(label.style.fontSize))+20;
      Object.assign(menu.titleNode.style,{width:width+'px',height:'50px',marginLeft:(-width/2)+'px',marginTop:'-25px'});
      for(const node of menu.titleNode.children)Object.assign(node.style,{inset:'0',width:'100%',height:'100%'});
    }
  }
  aim(x,y){
    if(!this.cross)return;const box=this.host.getBoundingClientRect();
    this.cross.hidden=false;this.cross.style.left=(x-box.left)*this.host.clientWidth/box.width+'px';this.cross.style.top=(y-box.top)*this.host.clientHeight/box.height+'px';
  }
  time(seconds,ended){
    this.countdown.hidden=ended||seconds>10||seconds<1;
    if(!this.countdown.hidden)this.countdown.querySelector('[data-unity="CountText"] span').textContent=String(seconds);
    if(this.clock){const text=Math.floor(seconds/60).toString().padStart(2,'0')+':'+(seconds%60).toString().padStart(2,'0');if(this.clock.textContent!==text)this.clock.textContent=text;}}
}
