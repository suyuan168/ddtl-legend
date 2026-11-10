import {ResultAudio} from './result-audio.js';
import {localizeResultScore} from './result-gauge-text.js';
import {playDailyResult} from './daily-result.js';
import {translated} from './language.js';
import {drawTree,fitPreferredHeight} from './unity-ui.js';

const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).concat(1);
const nodes=node=>[node,...node.children.flatMap(nodes)];
// GameManager.CalculatePercentages, RVA 0x453a900. Preserve the outcome at rounding boundaries.
export function territoryPercent(own,other){
  if(own===other)return 50;
  const rounded=Math.floor((Math.floor((own+other)/2)+100*own)/(own+other));
  return own>other?Math.max(51,rounded):Math.min(49,rounded);
}
// Apply the original outcome's settled result clip. The gauge border, both fills and
// the winner's percentage change together. The detail page uses its own horizontal gauge.
function applyGaugePose(root,pose){
  function visit(node,path){
    const state=pose[path];
    if(state){
      for(const key of ['pos','pivot','delta','scale'])if(state[key])Object.assign(node[key],state[key]);
      if(state.sprite)node.image.sprite=state.sprite;
    }
    for(const child of node.children)visit(child,path?path+'/'+child.name:child.name);
  }
  visit(root,'');
}
export class Results{
  constructor(host,layout,renderer,tables,locale,leave,sound){Object.assign(this,{host,layout,renderer,tables,locale,leave,sound});this.audio=new ResultAudio(sound);}
  clear(){this.audio.clear();this.panel?.remove();this.panel=null;this.reflow=null;this.page=0;this.last='';}
  resize(){
    if(!this.panel)return;
    this.host.append(this.panel);
    this.reflow?.([this.panel.clientWidth,this.panel.clientHeight]);
  }
  show(scores,players,me,online){
    const current=players.find(p=>p.id===me);if(!current)return;
    if(!this.panel){this.panel=document.createElement('div');this.panel.className='result-layer';this.host.append(this.panel);this.page=0;}
    this.lastArgs=[scores,players,me,online];
    const key=[this.page,scores,players.map(p=>[p.id,p.reward,p.dailyRewardId,p.dailyCoins,p.balance,p.paintPoints,p.kills,p.deaths])].join('/');
    if(key===this.last)return;this.last=key;
    const own=current.team,opp=3-own,pct=territoryPercent(scores[own-1],scores[opp-1]),win=pct>50,draw=pct===50;
    this.audio.show(this.page,pct,current.reward);
    const teams=[own,opp].map(team=>players.filter(p=>p.team===team));
    const cols=[own,opp].map(team=>rgb(this.tables.Team[team-1].TeamColor.split('|')[1]));
    const result=translated(this.locale,draw?'Draw':win?'Win':'Lose'),next=()=>{
      if(this.page===3||(this.page===2&&!current.dailyRewardId)||this.page===1&&!online){this.clear();this.leave();return;}
      this.page++;this.show(...this.lastArgs);
    };
    const tree=structuredClone(this.layout[['GameResultView','GameResultDetailView','GameResultRewardView','DailyBonusResultview'][this.page]]);
    const byId=new Map(nodes(tree).map(n=>[n.id,n]));
    const bind=(id,props)=>Object.assign(byId.get(String(id)),props);
    tree.alpha=1;
    if(this.page<2){
      const detail=this.page===1;
      bind(detail?489:112,{value:result});bind(detail?561:819,{value:pct+'%'});bind(detail?305:537,{value:(100-pct)+'%'});
      for(const [i,id] of (detail?[662,225]:[296,734]).entries())byId.get(String(id)).image.color=cols[i];
      if(detail){
        teams.forEach((members,i)=>{
          bind(i?834:282,{value:String(members.reduce((sum,p)=>sum+p.paintPoints,0))});
          const group=byId.get(i?'359':'667');
          group.children=members.map((player,index)=>{
            const row=structuredClone(group.children[index%group.children.length]);
            const parts=new Map(nodes(row).map(n=>[n.name,n]));
            parts.get('NameTxt').value=player.name;
            parts.get('Profile').image.sprite='Profile_1';
            parts.get('WeaponIcon').image.sprite=this.tables.WeaponAsset.find(w=>w.Id===player.weapon)?.Icon;
            parts.get('PlayerSelect').active=player.id===me;parts.get('MVP').active=!!player.mvp;
            for(const [name,value] of [['PointCount',player.paintPoints],['KillCount',player.kills],['DeathCount',player.deaths]]){
              parts.get(name).children.find(n=>n.text).value=String(value);
            }
            return row;
          });
          byId.get(i?'566':'20').image.color=cols[i];
        });
      }else{
        applyGaugePose(tree,this.layout.resultGaugePoses[draw?'draw':win?'win':'lose']);
        bind(324,{active:win});bind(739,{active:!win&&!draw});
        bind(689,{active:win});bind(787,{active:!win&&!draw});bind(430,{active:false});bind(841,{active:false});bind(352,{active:true});bind(75,{active:true});
        for(const [id,i] of [[126,0],[528,0],[616,0],[394,0],[229,1],[785,1],[702,1],[23,1]])byId.get(String(id)).image.color=cols[i];
      }
    }else if(this.page===2){
      for(const id of [131,253])byId.get(String(id)).image.sprite=this.tables.ItemAsset.find(i=>i.Id==='1').Icon;
      bind(143,{value:current.reward?String(current.reward):'…'});bind(594,{value:current.reward?String(current.balance-(current.dailyCoins||0)):'…'});bind(16,{active:false});
    }
    if(this.page===3){
      const reward=this.tables.Reward.find(r=>r.Id===String(current.dailyRewardId));
      byId.get('535').image.sprite=this.tables.ItemAsset.find(i=>i.Id===reward.Items.split('|')[0]).Icon;
      bind(732,{value:'0'});
    }
    const btn=byId.get(['721','103','104','348'][this.page]);btn.action=next;
    btn.label=translated(this.locale,this.page===0||this.page===3?'Continue':'GoToNext');
    fitPreferredHeight(tree);this.panel.replaceChildren();
    this.reflow=drawTree(this.panel,tree,{renderer:this.renderer,locale:this.locale,resizable:true,onElement:(n,el)=>{
      if(this.page<2&&n.text)localizeResultScore(n,el);
      if(n.id==='104'&&online&&!current.reward)el.disabled=true;
      if(n.name==='Team1Color')el.style.clipPath='inset(0 '+(100-pct)+'% 0 0)';
      if(n.name==='Team2Color')el.style.clipPath='inset(0 0 0 '+pct+'%)';
    }});
    if(this.page===3)playDailyResult(this.panel,tree,this.layout.dailyResultMotion,current.dailyCoins,this.sound);
  }
}
