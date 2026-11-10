import {prepareGachaEffects,GachaEffects} from './gacha-effects.js';
import {credential} from './rooms.js';
import {translated} from './language.js';

let assets;
function resources(){
 return assets??=Promise.all(['views/gacha-views','tables'].map(p=>fetch('/data/'+p+'.json').then(r=>r.json())));
}
function sample(keys,t){
 if(t<=keys[0][0])return keys[0][1];
 for(let i=1;i<keys.length;i++){
  const a=keys[i-1],b=keys[i];if(t>b[0])continue;
  if(t===b[0])return b[1];
  if(a[3]===null||b[2]===null)return a[1];
  const d=b[0]-a[0],u=(t-a[0])/d;
  return (1+2*u)*(1-u)**2*a[1]+u*(1-u)**2*d*a[3]+u*u*(3-2*u)*b[1]+u*u*(u-1)*d*b[2];
 }
 return keys.at(-1)[1];
}
function player(host,tree){
 const nodes=new Map(),base=new Map();
 function visit(n){nodes.set(n.id,n);n.children.forEach(visit);}
 visit(tree);
 for(const e of host.querySelectorAll('[data-go]')){
  const n=nodes.get(e.dataset.go);base.set(n.id,{e,n,x:parseFloat(e.style.left),y:parseFloat(e.style.top),sx:n.scale[0],sy:n.scale[1],angle:n.angle});
 }
 return (clip,t)=>{
  const transformed=new Set();
  for(const [id,key,keys] of clip.tracks){
   const b=base.get(id);if(!b)continue;
   const {e,n}=b,v=sample(keys,t);
   switch(key){
    case 'm_Alpha':e.style.opacity=v;break;
    case 'm_Color.a':{const graphic=e.querySelector(':scope > .unity-graphic');if(graphic)graphic.style.opacity=v;break;}
    case 'm_AnchoredPosition.x':e.style.left=(b.x+v-n.pos[0])+'px';break;
    case 'm_AnchoredPosition.y':e.style.top=(b.y-v+n.pos[1])+'px';break;
    case 'm_IsActive':e.style.display=v>.5?'':'none';break;
    case 'm_BlocksRaycasts':case 'm_Interactable':e.inert=v<.5;break;
    case 'anglez':b.angle=v;transformed.add(b);break;
    case 'scalex':b.sx=v;transformed.add(b);break;
    case 'scaley':b.sy=v;transformed.add(b);break;
   }
  }
  for(const b of transformed)b.e.style.transform='rotate('+(-b.angle)+'deg) scale('+b.sx+','+b.sy+')';
 };
}
async function api(path,method){
 const response=await fetch('/api/gacha'+path,{method,headers:{authorization:'Bearer '+credential()},cache:'no-store'});
 const info=await response.json();
 return {...info,status:response.status};
}
export async function readOwned(){
 const wallet=await api('','GET');
 if(wallet.status!==200)throw Error('无法读取服饰库存');
 return new Set(wallet.owned);
}
export async function openGacha(menu){
 const [bundle,tables]=await resources();
 Object.assign(menu.views,{GatchaView:bundle.GatchaView,GatchaResultView:bundle.GatchaResultView});
 const wallet=await api('','GET'),animations=bundle.animations,host=menu.popHost;
 if(wallet.status!==200)throw Error('无法读取金币余额');
 const sound=e=>menu.actions.sound?.(tables.Sound.find(r=>r.Enum===e)?.SoundName);
 let phase='idle',ticket=null,frame=0;
 const error=key=>{
  menu.actions.uiSound.cue(9);
  let p=host.querySelector('[role=status]');
  if(!p){p=document.createElement('p');p.setAttribute('role','status');p.className='unity-status';host.append(p);}
  p.textContent=translated(menu.locale,key,key);
 };
 function reset(){if(phase==='playing'||phase==='buying')return;cancelAnimationFrame(frame);ticket=null;phase='idle';render();sound('Gatcha_Appear');}
 function close(){if(phase==='playing'||phase==='buying')return;menu.close();}
 async function draw(){
  if(phase!=='idle')return;
  const pending=sessionStorage.getItem('chill-gacha-request');
  if(!pending&&wallet.balance<wallet.cost){error('TM_Gatcha_Fail_NotEnough_Resource');return;}
  sound('Gatcha_Button');phase='buying';const request=pending||crypto.randomUUID();sessionStorage.setItem('chill-gacha-request',request);
  try{
   const result=await api('/'+request,'POST');
   if(result.status!==200){
    if(result.status===409){sessionStorage.removeItem('chill-gacha-request');wallet.balance=result.balance;}
    phase='idle';render();error(result.error);return;
   }
   sessionStorage.removeItem('chill-gacha-request');menu.actions.acquired?.(result.id);ticket=result;wallet.balance=result.balance;phase='playing';
   const item=tables.Item.find(i=>i.Id===result.id),grade=tables.GradeAsset.find(g=>g.Enum===item.Grade);
   await prepareGachaEffects(menu.renderer,bundle.particles[grade.Index]);
   render();
  }catch(e){phase='idle';error(e.message);}
 }
 function render(){
  const grade=ticket&&tables.GradeAsset.find(g=>g.Enum===tables.Item.find(i=>i.Id===ticket.id).Grade);
  const item=ticket&&tables.ItemAsset.find(i=>i.Id===ticket.id);
  const bindings={795:{action:draw,label:translated(menu.locale,'Gatcha_Draw')},426:{action:close,label:'Close'},
    1349:{active:wallet.balance<wallet.cost},173:{value:String(wallet.cost)},888:{value:String(wallet.balance)},
    1706:{action:reset,label:'Close result'},1094:{action:reset,label:'Continue'}};
  if(item){
   const icon=bundle.GatchaResultView.children.find(n=>n.id==='89').children.find(n=>n.id==='960');
   Object.assign(bindings,{960:{image:{...icon.image,sprite:item.Icon}},950:{value:translated(menu.locale,grade.TagName)},
    17:{value:translated(menu.locale,item.Name)},1439:{value:translated(menu.locale,item.Desc)},840:{active:ticket.isNew}});
   const tag=bundle.GatchaResultView.children.find(n=>n.id==='2031').children.find(n=>n.id==='85').children.find(n=>n.id==='1966');
   bindings[1966]={image:{...tag.image,color:[1,3,5].map(i=>parseInt(grade.TagColor.slice(i,i+2),16)/255).concat(1)}};
  }
  menu.popup('GatchaView',bindings);
  const apply=player(host,bundle.GatchaView);
  apply(animations.Gatcha_Idle,0);
  if(phase!=='playing')return;
  const motion=animations.Gatcha_Start,start=performance.now();let next=0,effect=null,effectStart=0;
  function tick(now){
   if(!menu.dialog.open||!host.querySelector('[data-go="1914"]'))return;
   const elapsed=(now-start)/1000,t=Math.min(motion.duration,elapsed);
   if(phase==='playing')apply(motion,t);
   while(next<motion.events.length&&motion.events[next][0]<=t){
    const name=motion.events[next++][1],m=name.match(/^PlayGatcha(.+)Sound$/);
    if(m)sound('Gatcha_'+m[1]);
    if(name==='PlayGatchaParticle'){
     const node=host.querySelector('[data-go="276"]');effect=new GachaEffects(node,menu.renderer,bundle.particles[grade.Index]);effectStart=motion.events[next-1][0];
     sound('Gatcha_Result_'+(grade.Enum==='Uncommon'?'Common':grade.Enum));
    }
   }
   if(t>=motion.duration&&phase==='playing'){apply(animations.Gatcha_Start_Idle,0);phase='result';}
   effect?.update(elapsed-effectStart);
   frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);
 }
 const guard=e=>{if(phase!=='idle'){e.preventDefault();if(phase==='result')reset();}};
 menu.dialog.addEventListener('cancel',guard);
 menu.dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);menu.dialog.removeEventListener('cancel',guard);},{once:true});
 render();
}
