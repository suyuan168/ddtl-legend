import {linearSpriteContext} from './bush-hologram.js';
import {translated} from './language.js';
import {skillLoadout} from './loadout.js';
import {drawTree,fitStage} from './unity-ui.js';
import equipmentUi from './equipment-ui-data.js';

function fitCjkLabel(node, el) {
  const label=el.querySelector(':scope > .unity-label');
  if(!label||!node.text?.face||!document.documentElement.lang.startsWith('zh')||!/[\u3000-\u9fff]/.test(label.textContent))return;
  const content=document.createElement('span');
  content.textContent=label.textContent;
  Object.assign(content.style,{alignSelf:'stretch',overflowWrap:'anywhere',wordBreak:'normal'});
  label.replaceChildren(content);
  const fit=()=>{
    if(!el.isConnected)return;
    for(let size=node.text.size;size>=node.text.min;size--){
      label.style.fontSize=size+'px';
      if(content.offsetHeight<=label.clientHeight&&content.scrollWidth<=label.clientWidth)break;
    }
  };
  fit();
  document.fonts.ready.then(fit);
}

// Unity's VerticalLayoutGroup asks TMP for each child's preferred height before
// ContentSizeFitter sizes the tooltip. Its serialized height is the Korean editor preview.
function sizeWeaponTooltip(tooltip,labels) {
  const probe=document.createElement('div');
  Object.assign(probe.style,{position:'absolute',visibility:'hidden',pointerEvents:'none',
    whiteSpace:'pre-line',overflowWrap:'break-word'});
  document.body.append(probe);
  const group=tooltip.layout,pad=group.Padding;
  const pending=[];
  let height=pad.m_Top+pad.m_Bottom+group.Spacing*(labels.length-1);
  for(const label of labels){
    const cjk=document.documentElement.lang.startsWith('zh')&&/[\u3000-\u9fff]/.test(label.value);
    const font=cjk?(document.documentElement.lang==='zh-tw'?'ChillTC':'ChillSC'):'ChillGothic';
    const leading=cjk?equipmentUi.face.lineHeight:equipmentUi.gothicLineHeight;
    const size=label.text.size,margin=label.text.margin;
    Object.assign(probe.style,{width:(label.delta[0]-margin[0]-margin[2])+'px',
      fontFamily:font+', sans-serif',fontSize:size+'px',lineHeight:String(leading)});
    probe.textContent=label.value.replace(/<br\s*\/?\s*>/gi,'\n');
    const fontSpec=size+'px '+font;
    if(!document.fonts.check(fontSpec,probe.textContent))pending.push(document.fonts.load(fontSpec,probe.textContent));
    const lines=Math.max(1,Math.round(probe.offsetHeight/(size*leading)));
    label.delta[1]=lines*size*leading+margin[1]+margin[3];
    label.text.min=size;
    height+=label.delta[1];
  }
  probe.remove();
  tooltip.delta[1]=height;
  group.ChildForceExpandHeight=0;
  return pending;
}

function walk(n,fn){fn(n);n.children.forEach(ch=>walk(ch,fn));}
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).concat(1);}
function replaceSprite(node,id){node.image={...node.image,sprite:id};}
export function spriteLayer(renderer,entry,id=entry.sprite){
  const a=renderer.byId.get(id)||renderer.byName.get(id);if(!a)return null;
  return {path:entry.path,id:a.id,m:[...entry.m],size:a.rect.map(v=>v/a.ppu),pivot:a.pivot,flip:entry.flip,color:entry.color,mode:0,order:entry.order};
}
export async function character(renderer,equipment,tables,selection,frame=null,pose='preview',teamTint=null,materialAlpha=1){
  const template=pose==='preview'?equipment.preview:equipment.avatar;
  const original=new Map(template.map(p=>[p.path.split('/').slice(2).join('/'),p]));
  const source=frame?frame.map(([path,m,sprite,order])=>({...original.get(path),path:'/'+path,m,sprite,order})):template;
  const back=pose.startsWith('Back'),skin=tables.ItemAsset.find(s=>s.Id===(selection.Skin||'30001'))?.Sprites.split('|')||[];
  // CostumeSelectView.SetPreview calls SetColor(Team.GetById(1).TeamColor[0])
  // on the equipped prefab. Its eye and board are separate renderers on the preview rig.
  const costumeTint=pose==='preview'?tables.Team.find(row=>row.Id==='1').TeamColor.split('|')[0]:teamTint;
  const layers=[],masks=[],headParts=new Set();
  const headPath='/Entity/Root/HeadRoot/Head';
  const head=source.find(p=>p.path===headPath);
  const add=(part,p)=>{
    if(part&&(p.path===headPath||p.path.startsWith(headPath+'/')))headParts.add(part);
    return part;
  };
  for(const p of source){
    const slot=['Head','Body'].find(slot=>p.path.endsWith('/'+slot+'DecoPivot'));
    if(slot){
      // Insert at the parent's position in the rig so an equal-order scarf stays behind the head.
      const item=tables.ItemAsset.find(row=>row.Id===selection[slot]);
      for(const piece of equipment[item?.PrefabName]||[]){
        if(!piece.sprite||!piece.path.includes(back?'Back':'Front'))continue;
        const layer=spriteLayer(renderer,piece);if(!layer)continue;
        const [a,b,c,d,e,f]=p.m,[g,h,i,j,k,l]=layer.m;
        layer.m=[a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];
        if(costumeTint&&piece.teamTint)layer.color=rgb(costumeTint);
        layers.push(add(layer,p));
      }
      continue;
    }
    if(!p.sprite||!p.enabled)continue;
    if(p.path.endsWith('/HeadColor')||p.path.endsWith('/BodyColor')){
      const mask=source.find(o=>o.path===p.path.slice(0,p.path.lastIndexOf('/')));
      const id=skin[p.path.endsWith('/HeadColor')?0:1];if(id&&mask)masks.push([add(spriteLayer(renderer,p,id),p),add(spriteLayer(renderer,mask),mask)]);
     } else {
      const layer=spriteLayer(renderer,p);
      if(layer&&teamTint&&/\/(EyeColor|SkateColor)$/.test(p.path))layer.color=rgb(teamTint);
      layers.push(add(layer,p));
    }
  }
  const box={x:-2,y:-1.5,w:4,h:4},scale=pose==='preview'?168:80,draw=layers.filter(Boolean);
  await renderer.prepare({draw:draw.concat(masks.flat().filter(Boolean))});
  draw.sort((a,b)=>a.order-b.order);
  function bake(adjust=part=>part){
    const output=renderer.bake({draw:[]},box,scale,materialAlpha<1?linearSpriteContext:null),g=output.c.getContext('2d');
    g.globalAlpha=materialAlpha;
    for(const part of draw){
      renderer.layer(g,adjust(part));
      const pair=masks.find(pair=>pair[1]?.path===part.path);
      if(pair?.every(Boolean)){
        const masked=renderer.bake({draw:[adjust(pair[0])]},box,scale),mg=masked.c.getContext('2d');
        mg.globalCompositeOperation='destination-in';mg.setTransform(1,0,0,1,0,0);
        mg.drawImage(renderer.bake({draw:[adjust(pair[1])]},box,scale).c,0,0);
        g.save();g.setTransform(1,0,0,1,0,0);g.drawImage(masked.c,0,0);g.restore();
      }
    }
    return output;
  }
  const output=bake();
  if(head)output.withHeadTransform=transform=>bake(part=>headParts.has(part)
    ? {...part,m:transform(part.m,head.m)} : part);
  return output;
}
export function bombLayers(renderer,equipment,id){
  return (equipment['Bomb_'+id]||[]).filter(p=>p.enabled).map(p=>spriteLayer(renderer,p)).filter(Boolean).sort((a,b)=>a.order-b.order);
}
export async function equipmentClip(renderer,source,clip){
  const originals=new Map(source.map(row=>[row.path.split('/').slice(2).join('/'),row]));
  const frames=clip.frames.map(frame=>frame.flatMap(([path,m,id,order])=>{
    const entry=originals.get(path);
    if(!entry||!id)return [];
    const part=spriteLayer(renderer,{...entry,m,order},id);
    return part?[part]:[];
  }).sort((a,b)=>a.order-b.order));
  await renderer.prepare({draw:frames.flat()});
  return {frames,duration:clip.duration,loop:clip.loop};
}

export class EquipmentPanel{
  constructor(config){Object.assign(this,config);this.dialog=document.querySelector('#equipment');this.host=this.dialog.querySelector('.unity-stage');
    const css=document.createElement('link');
    css.rel='stylesheet';css.href=new URL('./equipment-cards.css',import.meta.url).href;this.dialog.append(css);
    const c=equipmentUi.curves;
    for(const [name,value] of Object.entries({'hover-time':c.hoverMs+'ms','hover-scale':c.hover,
      'press-time':c.pressMs+'ms','press-scale':c.press}))this.host.style.setProperty('--'+name,value);
    this.dialog.addEventListener('close',()=>this.host.replaceChildren());}
  open(mode,current){
    this.mode=mode;this.selection={...current};this.slot='Head';this.tip=null;
    if(!this.dialog.open){this.dialog.showModal();this.uiSound.open(mode==='weapon'?'WeaponSelectView':'CostumeSelectView');}this.draw();
  }
  notice(key){
    let message=this.host.querySelector('[role=status]');
    if(!message){message=document.createElement('div');message.className='skill-message';message.setAttribute('role','status');this.host.append(message);}
    this.uiSound.cue(9);message.textContent=this.text(key);
  }
  get text(){return key=>translated(this.locale,key,key);}
  resize(){
    const {clientWidth,clientHeight}=this.host;
    fitStage(this.host,this.dialog.getBoundingClientRect(),true);
    if(this.host.clientWidth!==clientWidth||this.host.clientHeight!==clientHeight)this.draw();
  }
  draw(){
    const oldScroll=this.host.querySelector('[data-go="1246"]')?.scrollTop||0;
    this.host.replaceChildren();fitStage(this.host,this.dialog.getBoundingClientRect(),true);
    const s=this.selection,t=this.tables;
    const root=structuredClone(this.layout[this.mode==='weapon'?'WeaponSelectView':'CostumeSelectView']);root.alpha=1;
    const nodes={};walk(root,n=>{
      nodes[n.id]=n;
      if(n.text&&equipmentUi.text[n.id])Object.assign(n.text,equipmentUi.text[n.id],{face:equipmentUi.face});
    });
    const choose=(n,label,action)=>{n.label=label;n.action=action;};
    const close=()=>this.dialog.close();choose(nodes[this.mode==='weapon'?'1103':'979'],'Close',close);
    choose(nodes[this.mode==='weapon'?'794':'1168'],'Confirm',()=>{
      if(this.mode==='weapon'){
        const selected=skillLoadout(t,t.Weapon.find(w=>w.Id===s.weapon),s);
        if(!selected.bomb||!selected.ultimate){
          this.notice('TM_ChangeWeapon_NecessaryChoose');return;
        }
      }
      if(this.mode!=='catalog'){this.uiSound.cue(this.mode==='weapon'?34:31);this.onConfirm({...s});}close();
    });
    if(this.mode==='weapon'){
      const weapon=t.Weapon.find(v=>v.Id===s.weapon),allowed=weapon.SkillList.split('|'),recs=weapon.RecommendSkill.split('|');
      const assets=t.WeaponAsset,skills=t.SkillAsset,selected=assets.find(v=>v.Id===s.weapon);
      function bindRows(container,rows,category) {
        const template=container.children[0];
        container.children=rows.map(row=>{
          const n=structuredClone(template),isWeapon=category==='weapon',active=s[category]===row.Id;
          const rec=!isWeapon&&recs.includes(row.Id),enabled=isWeapon||allowed.includes(row.Id);
          walk(n,ch=>{switch(ch.name){case 'SelectBG':case 'SelectCheck':ch.active=active;break;
            case 'Recommend':ch.active=rec;break;case 'Dimd':ch.active=!enabled;break;
            case 'Icon':replaceSprite(ch,isWeapon?row.ColorIcon:row.Icon);break;}});
          n.children.find(ch=>ch.text).value=this.text(row.Name);
          n.pressId=template.id;n.id='choice-'+category+'-'+row.Id;
          choose(n,this.text(row.Name),()=>{this.tip=row;if(enabled){
            s[category]=row.Id;if(isWeapon){const valid=t.Weapon.find(w=>w.Id===row.Id).SkillList.split('|');
              for(const key of ['bomb','ultimate'])if(!valid.includes(s[key]))s[key]='';}}
            this.draw();if(!enabled)this.notice('TM_ChangeWeapon_CantChoose');});return n;
        });
      }
      bindRows.call(this,nodes['1971'],assets.filter(a=>t.Weapon.some(w=>w.Id===a.Id&&w.WeaponType==='Normal')),'weapon');
      bindRows.call(this,nodes['1108'],skills.filter(a=>+a.Id<1000),'bomb');
      bindRows.call(this,nodes['837'],skills.filter(a=>+a.Id>=1000),'ultimate');
      // Both backplates and both round skill slots share the transformed preview.
      walk(nodes['1139'],n=>{if(n.image?.mode===1)n.image.singleSurface=true;});
      replaceSprite(nodes['1766'],selected.ColorIcon);nodes['655'].value=this.text(selected.Name);
      for(const [id,key] of [['1936','bomb'],['193','ultimate']]){const info=skills.find(v=>v.Id===s[key]);nodes[id].active=!!info;if(info)replaceSprite(nodes[id],info.Icon);}
      nodes['1963'].active=!!this.tip;if(this.tip){
        nodes['1074'].value=this.text(this.tip.Name);nodes['675'].value=this.text(this.tip.Desc);
        const pending=sizeWeaponTooltip(nodes['1963'],[nodes['1074'],nodes['675']]),tip=this.tip;
        if(pending.length)Promise.all(pending).then(()=>{
          if(this.dialog.open&&this.mode==='weapon'&&this.tip===tip)this.draw();
        }).catch(()=>{}); // The browser fallback font remains usable if an original font cannot load.
      }
    }else{
      const slots=['Head','Body','Skin'];
      nodes['1841'].children.forEach((n,i)=>{const active=this.slot===slots[i];choose(n,slots[i],()=>{if(this.slot!==slots[i])this.uiSound.cue(8);this.slot=slots[i];this.tip=null;this.draw();this.host.querySelector('[data-go="1246"]').scrollTop=0;});
        for(const ch of n.children)if(['Icon_ON','ON','Icon_OFF','OFF'].includes(ch.name)){ch.active=ch.name.endsWith('ON')===active;ch.alpha=1;}});
      const rows=t.ItemAsset.filter(i=>i.CostumeType===this.slot&&i.Icon&&i.IsHide!=='True'&&(this.mode==='catalog'||this.previewInventory||this.owned.has(i.Id)));
      const grades=new Map(t.Item.map(row=>[row.Id,t.GradeAsset.find(g=>g.Enum===row.Grade)]));
      rows.sort((a,b)=>Number(grades.get(b.Id)?.Index||0)-Number(grades.get(a.Id)?.Index||0)||+a.Id-Number(b.Id));
      rows.unshift({Id:'',Icon:'Icon_Costume_10000',Name:'Unequip'});
      const container=nodes['376'],template=container.children[0];nodes['1246'].scroll=true;
      container.max=[1,1];container.min=[0,1];container.delta=[0,Math.ceil(rows.length/4)*180+20];
      container.children=rows.map(row=>{const n=structuredClone(template),chosen=(s[this.slot]||'')===row.Id,grade=grades.get(row.Id);n.pressId=template.id;n.id='costume-'+(row.Id||'none');
        for(const ch of n.children){if(ch.name==='Icon')replaceSprite(ch,row.Icon);
          if(ch.name==='SelectBg'||ch.name==='SelectCheck')ch.active=chosen;
          if(ch.name==='GradeBg')ch.image.color=rgb(grade?.TagColor||'#555264');}
        choose(n,this.text(row.Name),()=>{this.uiSound.cue(30);s[this.slot]=row.Id;this.tip=null;this.draw();});return n;});
      nodes['62'].active=false;
    }
    drawTree(this.host,root,{renderer:this.renderer,locale:this.locale,onElement:(n,el)=>{
      this.uiSound.bind(this.mode==='weapon'?'WeaponSelectView':'CostumeSelectView',n.pressId||n.id,el);
      if(n.id.startsWith('choice-')||n.id.startsWith('costume-')){
        el.classList.add('equipment-card');
        const border=el.querySelector(':scope > [data-unity="SelectBG"],:scope > [data-unity="SelectBg"]');
        if(border)border.animate([{scale:'1'},{scale:String(equipmentUi.curves.select)}],
          {duration:equipmentUi.curves.selectMs,iterations:Infinity,easing:'cubic-bezier(.333333,.666667,.666667,1)'});
      }
      if(n.text)fitCjkLabel(n,el);
      if(n.id==='1246')el.scrollTop=oldScroll;
      if(n.id==='1096'){
        const motion=this.motions.preview,frames=new Map(),view=this;
        let prior=-1,canvas;
        async function animate(now){
          if(!el.isConnected)return;
          const index=Math.floor((now/1000%motion.duration)/motion.duration*motion.frames.length);
          if(index!==prior){
            prior=index;
            if(!frames.has(index))frames.set(index,character(view.renderer,view.equipment,t,s,motion.frames[index]));
            const {c,box}=await frames.get(index);if(!el.isConnected)return;
            const stage=view.host.getBoundingClientRect(),pivot=el.getBoundingClientRect(),factor=view.host.clientWidth/stage.width;
            const unit=pivot.width*factor,cal=view.previewRegistration,scale=unit*cal.scale;
            const [ox,oy]=cal.screenOffsetInPivotUnits;
            const x=(pivot.left+pivot.width/2-stage.left)*factor+ox*unit;
            const y=(pivot.top+pivot.height/2-stage.top)*factor+oy*unit;
            Object.assign(c.style,{position:'absolute',pointerEvents:'none',left:(x+box.x*scale)+'px',top:(y-(box.y+box.h)*scale)+'px',width:box.w*scale+'px',height:box.h*scale+'px'});
            canvas?.remove();canvas=c;view.host.append(c);
          }
          requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
      }
    }});
  }
}
