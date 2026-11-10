import {tipsEnabled} from './lobby-zones.js';
import {openGacha} from './gacha.js';
import {dailyBonusMenu} from './daily-bonus.js';
import {language,languages,setLanguage,translated} from './language.js';
import {drawTree,fitPreferredHeight,fitStage} from './unity-ui.js';

const button=(label,action)=>({label,action});
function lookup(n,map){map.set(n.id,n);for(const c of n.children)lookup(c,map);}
export class SceneMenus{
  constructor(renderer,locale,views,actions){
    Object.assign(this,{renderer,locale,views,actions});
    this.dialog=document.querySelector('#original-dialog');
    this.waitHost=document.querySelector('#waiting-ui');
    this.popHost=this.dialog.querySelector('.unity-stage');
    this.close=()=>this.dialog.close();
  }
  render(view,host,bindings={},onElement){
    const root=structuredClone(this.views[view]),nodes=new Map();
    lookup(root,nodes);root.alpha=1;
    for(const [id,spec] of Object.entries(bindings)){
      const node=nodes.get(id);
      if(node)Object.assign(node,spec);
    }
    for(const n of nodes.values())if(n.externalUrl){
      Object.assign(n,button(new URL(n.externalUrl).hostname,()=>window.open(n.externalUrl,'_blank','noopener,noreferrer')));
    }
    fitPreferredHeight(root);host.replaceChildren();this.resize();
    drawTree(host,root,{renderer:this.renderer,locale:this.locale,onElement:(node,el)=>{this.actions.uiSound.bind(view,node.id,el);onElement?.(node,el);},parentSize:[host.clientWidth||1920,host.clientHeight||1080]});
  }
  resize(reflow=false){
    const bounds=document.querySelector('#stage canvas')?.getBoundingClientRect()||document.body.getBoundingClientRect();
    const w=this.popHost.clientWidth,h=this.popHost.clientHeight;
    const view=this.popHost.dataset.view;
    const full=['MatchingView','JoinRoomView','OptionView'].includes(view);
    for(const el of [this.waitHost,this.popHost])fitStage(el,bounds,el===this.waitHost||(el===this.popHost&&full));
    if(!reflow||!this.dialog.open||!full||(w===this.popHost.clientWidth&&h===this.popHost.clientHeight))return;
    if(view==='MatchingView')this.match();
    if(view==='OptionView')this.settings(!!this.popHost.querySelector('[data-go="336"]'));
    if(view==='JoinRoomView'){
      const input=this.popHost.querySelector('input'),code=input?.value??'',start=input?.selectionStart,end=input?.selectionEnd;
      this.join();const next=this.popHost.querySelector('input');next.value=code;next.setSelectionRange(start,end);
    }
  }
  popup(name,spec,onElement){
    if(!this.dialog.open||this.popHost.dataset.view!==name)this.actions.uiSound.open(name);
    if(!this.dialog.open)this.dialog.showModal();
    this.popHost.dataset.view=name;
    this.render(name,this.popHost,spec,onElement);
  }
  gacha(){return openGacha(this);}
  quit(){
    this.popup('GameQuitView',{382:button('Close',this.close),101:button('Quit Game',()=>{this.close();this.actions.quit();}),289:button('Cancel',this.close)});
  }
  settings(expanded=false){
    const volumes=this.actions.volume;
    const bindings={138:button(translated(this.locale,'Lobby_Zone_GameTip'),()=>{
        localStorage.setItem('chill-game-tips',tipsEnabled()?'off':'on');this.settings();
      }),131:{active:tipsEnabled()},383:button('Close',this.close),193:button('Quit Game',()=>this.quit()),371:{active:false},144:{active:false},236:{scroll:true},
      287:button(translated(this.locale,'Language_Title'),()=>this.settings(!expanded)),
      317:{value:this.locale.Language[language]},336:{active:expanded},211:{scroll:true},323:{value:innerWidth+' × '+innerHeight}};
    const oldScroll=this.popHost.querySelector('[data-go="236"]')?.scrollTop||0;
    const nodes=new Map(),sliders=new Map();lookup(this.views.OptionView,nodes);
    for(const [key,less,more,value,slider] of [
      ['master',380,109,169,219],['music',243,361,301,324],['sfx',82,52,362,87]]){
      const update=d=>{this.actions.setVolume(key,volumes[key]+d);this.settings();};
      bindings[less]=button(key+' −',()=>update(-1));bindings[more]=button(key+' +',()=>update(1));
      bindings[value]={value:String(Math.trunc(volumes[key]))};
      const track=nodes.get(String(slider));
      const fill=track.children.find(c=>c.name==='Fill Area').children[0];
      const handle=track.children.find(c=>c.name==='Handle Slide Area').children[0];
      const ratio=volumes[key]/100;
      // Slider.UpdateVisuals drives both RectTransforms, including the full cross axis.
      bindings[fill.id]={min:[0,0],max:[ratio,1]};
      bindings[handle.id]={min:[ratio,0],max:[ratio,1]};
      sliders.set(String(slider),{key,value,fill,handle});
    }
    if(expanded){
      bindings[313]={children:languages.map(code=>{
        const option=structuredClone(nodes.get('62'));
        option.id='language-'+code;
        Object.assign(option,button(this.locale.Language[code],()=>{
          setLanguage(code);this.waitState='';this.actions.languageChanged();this.settings();
        }));
        option.children.find(n=>n.id==='272').value=this.locale.Language[code];
        option.children.find(n=>n.id==='320').active=language===code;
        return option;
      })};
    }
    this.popup('OptionView',bindings,(n,el)=>{
      if(n.id==='236'){el.dataset.scroll='';el.scrollTop=oldScroll;}
      if(expanded&&n.id==='226')el.style.zIndex='1';
      if(expanded&&n.id==='211')el.dataset.scroll='';
      const slider=sliders.get(n.id);
      if(!slider)return;
      const {key,value,fill,handle}=slider;
      const bar=el.querySelector('[data-go="'+fill.id+'"]');
      const thumb=el.querySelector('[data-go="'+handle.id+'"]');
      const track=thumb.parentElement;
      el.setAttribute('role','slider');el.setAttribute('aria-label',key);el.tabIndex=0;
      el.setAttribute('aria-valuemin','0');el.setAttribute('aria-valuemax','100');
      el.setAttribute('aria-valuenow',String(volumes[key]));
      el.style.pointerEvents='auto';el.style.touchAction='none';
      const change=amount=>{
        this.actions.setVolume(key,amount);
        const ratio=volumes[key]/100;
        el.setAttribute('aria-valuenow',String(volumes[key]));
        this.popHost.querySelector('[data-go="'+value+'"] > span').textContent=Math.trunc(volumes[key]);
        bar.style.width=(ratio*bar.parentElement.clientWidth+fill.delta[0])+'px';
        thumb.style.left=(ratio*track.clientWidth+handle.pos[0]-handle.pivot[0]*handle.delta[0])+'px';
      };
      let grabOffset=0;
      const drag=e=>{
        const {left,width}=track.getBoundingClientRect();
        if(width)change(100*(e.clientX-grabOffset-left)/width);
      };
      el.onpointerdown=e=>{
        if(e.button!==0)return;
        const rect=thumb.getBoundingClientRect();
        grabOffset=e.clientX>=rect.left&&e.clientX<=rect.right?e.clientX-(rect.left+rect.width/2):0;
        el.setPointerCapture(e.pointerId);drag(e);
      };
      el.onpointermove=e=>{if(el.hasPointerCapture(e.pointerId))drag(e);};
      el.onkeydown=e=>{
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
        e.preventDefault();change(volumes[key]+(e.key==='ArrowLeft'?-10:10));
      };
    });
    if(expanded){
      // The native blocker passes the main button and panel through, and closes on any other click.
      const root=this.popHost.querySelector('[data-go="368"]');
      root.style.pointerEvents='auto';
      root.addEventListener('click',e=>{
        if(e.target.closest('[data-go="273"]'))return;
        e.stopPropagation();this.settings();
      },true);
      // SelectLanguageViewModel passes its CustomDropDown RectTransform to CenterScrollOnAsync.
      const viewport=this.popHost.querySelector('[data-go="236"]');
      const dropdown=this.popHost.querySelector('[data-go="273"]').getBoundingClientRect();
      const bounds=viewport.getBoundingClientRect();
      if(bounds.height)viewport.scrollTop+=(dropdown.top+dropdown.height/2-bounds.top-bounds.height/2)*viewport.clientHeight/bounds.height;
    }
  }
  match(){
    const enter=kind=>this.enter(kind,'');
    const daily=dailyBonusMenu(this,this.actions.tables);
    this.popup('MatchingView',{1817:button('Close',this.close),1655:button('Quick Match',()=>enter('match')),
      1745:button('Create Room',()=>enter('create')),1918:button('Join Room',()=>this.join()),...daily.bindings});
    daily.mount();
  }
  join(){
    let input;
    const join=()=>{const code=input.value.trim();if(code)this.enter('join',code);};
    this.popup('JoinRoomView',{802:button('Close',()=>this.match()),1309:button('Join',join),1097:{active:false},1697:{active:false}},(n,el)=>{
      if(n.id!=='1865')return;
      input=document.createElement('input');input.className='unity-input';input.maxLength=6;input.setAttribute('aria-label','Room code');
      input.autocomplete='off';input.style.outline='none';input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();join();}};el.append(input);
    });input.focus();
  }
  async enter(kind,code){
    try{await this.actions.enter(kind,code);}catch(error){
      let status=this.popHost.querySelector('[role=status]');
      if(!status){status=document.createElement('p');status.className='unity-status';status.setAttribute('role','status');this.popHost.append(status);}
      status.textContent=error.message;
    }
  }
  waiting(room,snap,quick,started){
    const visible=!!room&&snap?.phase==='waiting';
    this.waitHost.hidden=!visible;
    if(!visible){this.waitState='';return;}
    const elapsed=Math.floor((performance.now()-started)/1000);
    const clockText=translated(this.locale,'MatchTimeText').replace('{0}',elapsed);
    const key=[room.roomId,snap.host,...snap.players.map(p=>[p.id,p.name,p.connected])].join('/');
    if(this.waitState===key){
      if(this.waitClock&&this.waitClock.textContent!==clockText)this.waitClock.textContent=clockText;
      return;
    }
    this.waitState=key;
    const nodes=new Map();lookup(this.views.MatchingSimpleView,nodes);
    const rows=snap.players.map(player=>{
      const row=structuredClone(nodes.get('1044')),parts=new Map();lookup(row,parts);
      row.id='member-'+player.id;row.active=true;
      parts.get('1647').value=player.name||'—';
      parts.get('1105').active=player.id===snap.host;
      parts.get('1700').image.sprite='Profile_1';
      return row;
    });
    this.render('MatchingSimpleView',this.waitHost,{281:{value:translated(this.locale,quick?'OnGoingMatchTitle':'RoomMaking')},
      155:{active:quick,value:translated(this.locale,'OnGoingMatchBounce').replace(/<[^>]+>/g,'')},
      870:{active:!quick,value:room.roomId},842:{active:quick,value:clockText},1153:{value:snap.players.length+' / 6'},
      232:{children:rows},112:{active:false},1721:button('Copy room code',()=>navigator.clipboard?.writeText(room.roomId)),
      1868:button('Leave room',this.actions.leave)});
    this.waitClock=this.waitHost.querySelector('[data-go="842"] > span');
  }
}
