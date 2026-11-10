import {translated} from './language.js';
import {drawTree,fitStage,fitPreferredHeight} from './unity-ui.js';
import {chatText} from './chat-text.js';

export class YardChat{
  constructor(view,renderer,locale,send){
    Object.assign(this,{view,renderer,locale,send});
    this.host=document.getElementById('chat-input');
    this.world=document.getElementById('chat-bubbles');
    this.bubbles=new Map();
  }
  resize(){
    const box=document.querySelector('#stage canvas').getBoundingClientRect();
    fitStage(this.host,box,true);fitStage(this.world,box,true);
  }
  get active(){return !this.host.hidden;}
  open(){
    if(this.active)return;
    this.host.hidden=false;this.resize();this.host.replaceChildren();
    drawTree(this.host,this.view.ChatView,{renderer:this.renderer,locale:this.locale,
      customize:n=>n.id==='314'?{...n,action:()=>this.submit(),label:translated(this.locale,'Send')}:n.id==='516'?{...n,active:false}:n,
      onElement:(n,el)=>{
        if(n.id!=='1981')return;
        el.replaceChildren();
        const input=document.createElement('input');input.className='chat-entry';input.autocomplete='off';
        input.placeholder=translated(this.locale,'EnterChat');input.setAttribute('aria-label',input.placeholder);
        input.maxLength=this.view.maxLength;input.style.fontSize=n.text.size+'px';el.append(input);this.input=input;
        input.addEventListener('compositionstart',()=>{this.composing=true;});
        input.addEventListener('compositionend',()=>{this.composing=false;});
        input.onkeydown=e=>{
          e.stopPropagation();
          if(e.isComposing||this.composing||e.keyCode===229)return;
          if(e.key==='Enter'){e.preventDefault();if(!e.repeat)this.submit();}
          if(e.key==='Escape'){e.preventDefault();this.close();}
        };
      }});
    this.input.focus({preventScroll:true});
  }
  submit(){
    if(!this.active||this.composing)return;
    const message=chatText(this.input.value);
    this.close();if(message)this.send(message);
  }
  close(){this.composing=false;this.host.hidden=true;this.host.replaceChildren();this.input=null;}
  reset(){this.close();this.bubbles.clear();this.world.replaceChildren();}
  message(id,text){
    const value=chatText(text);if(!value)return;
    this.bubbles.get(id)?.el.remove();const el=document.createElement('div');el.className='entity-chat';el.dataset.speaker=id;
    const tree=structuredClone(this.view.EntityChatView),root=tree.children[0],label=root.children.find(c=>c.text);
    const measure=document.createElement('canvas').getContext('2d');
    measure.font=label.text.size+'px ChillGothic, ChillSC, sans-serif';
    let line='',lines=[];
    for(const symbol of value){if(symbol==='\n'||line&&measure.measureText(line+symbol).width>label.delta[0]){
        lines.push(line);line='';
      }
      if(symbol!=='\n')line+=symbol;
    }
    lines.push(line);label.delta[1]=Math.ceil(label.text.size*1.2*lines.length);label.value=value;
    fitPreferredHeight(tree);
    // EntityChatView's own pivot is at the position driven by EntityCanvas.
    tree.min=tree.max=[0,1];tree.pos=[0,0];this.world.append(el);
    drawTree(el,tree,{renderer:this.renderer,locale:this.locale,parentSize:[0,0]});
    this.bubbles.set(id,{el,until:performance.now()+this.view.duration*1000});
  }
  draw(actors,cameraX,cameraY,scale,width,height){
    if(!this.bubbles.size)return;
    const now=performance.now(),unit=scale*this.view.scale;
    for(const [id,b] of this.bubbles){
      const actor=actors.find(p=>p.id===id);
      if(now>=b.until||!actor){b.el.remove();this.bubbles.delete(id);continue;}
      const x=width/2+(actor.x-cameraX)*scale+this.view.anchor[0]*unit;
      const y=height/2-(actor.y-cameraY)*scale-this.view.anchor[1]*unit;
      b.el.style.transform='translate('+x+'px,'+y+'px) scale('+unit+')';
    }
  }
}
