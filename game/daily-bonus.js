import {translated} from './language.js';
import {credential} from './rooms.js';

export function dailyClockText(locale,milliseconds){
  const minutes=Math.max(0,Math.floor(milliseconds/60000));
  return translated(locale,'TimeString_HH_MM').replace('{0}',String(Math.floor(minutes/60)%24).padStart(2,'0'))
    .replace('{1}',String(minutes%60).padStart(2,'0'));
}

// Bind the four serialized slots to the DailyReward rows, as DailyRewardView.RefreshRewardStates does.
export function dailyBonusMenu(menu,tables){
  const rows=tables.Reward.filter(r=>r.Type==='DailyReward'),item=id=>tables.ItemAsset.find(r=>r.Id===id);
  const ids=['1474','1685','1363','1770'],marks=['1017','1842','1178','1828'];
  const bindings={293:{active:true},494:{value:dailyClockText(menu.locale,(24*60-1)*60000)}};
  let tip,selected;
  function toggle(row){
    if(!tip.hidden&&selected===row.Id){tip.hidden=true;return;}
    selected=row.Id;const asset=item(row.Items.split('|')[0]);
    tip.querySelector('[data-go="1268"] span').textContent=row.Counts.split('|')[0];
    tip.querySelector('[data-go="617"] span').textContent=translated(menu.locale,asset.Name);
    tip.querySelector('[data-go="1650"] span').textContent=translated(menu.locale,asset.Desc);
    const graphic=tip.querySelector('[data-go="1147"] .unity-graphic');
    graphic.style.backgroundImage='url('+menu.renderer.byName.get(asset.Icon).file+')';
    tip.hidden=false;
  }
  rows.forEach((row,i)=>{
    bindings[ids[i]]={action:()=>toggle(row),label:translated(menu.locale,'DailyBonus')+' '+(i+1)};
    bindings[marks[i]]={active:true};
  });
  return {bindings,mount(){
    const host=menu.popHost,view=host.querySelector('[data-unity=MatchingView]');
    tip=view.querySelector('[data-go="293"]');tip.hidden=true;
    const received=marks.map(id=>view.querySelector('[data-go="'+id+'"]'));
    received.forEach(mark=>{mark.hidden=true;});
    const time=view.querySelector('[data-go="494"] span');time.style.whiteSpace='nowrap';time.textContent='—';
    view.addEventListener('click',event=>{
      if(!event.target.closest('[data-unity^=DailyBonusElement]')&&!tip.contains(event.target))tip.hidden=true;
    });
    let resetAt=0,retry=0,fetching=false;const abort=new AbortController();
    const open=()=>view.isConnected&&menu.dialog.open;
    async function refresh(){
      fetching=true;
      try{
        const res=await fetch('/api/daily-rewards',{headers:{Authorization:'Bearer '+credential()},cache:'no-store',signal:abort.signal});
        if(!res.ok)throw Error('daily state '+res.status);
        const state=await res.json();
        if(!open())return;
        resetAt=performance.now()+state.nextReset-state.serverTime;
        received.forEach((mark,i)=>{mark.hidden=!state.received.includes(rows[i].Id);});
        time.textContent=dailyClockText(menu.locale,resetAt-performance.now());
      }catch{retry=performance.now()+5000;}finally{fetching=false;}
    }
    function tick(){
      if(!open()){clearInterval(timer);abort.abort();return;}
      const left=resetAt-performance.now();
      if(left>0)time.textContent=dailyClockText(menu.locale,left);
      else{
        if(resetAt){resetAt=0;time.textContent='—';received.forEach(mark=>{mark.hidden=true;});}
        if(!fetching&&performance.now()>=retry)refresh();
      }
    }
    const timer=setInterval(tick,250);tick();
  }};
}
