// DailyBonusResult_ON moves RectTransform local anchors, applies alpha and enables Continue at 2.75s.
export function playDailyResult(panel,tree,clip,amount,sound){
  const root=panel.querySelector('[data-unity="DailyBonusResultview"]'),paths=new Map();
  function visit(node,path){
    paths.set(path,{node,el:root.querySelector('[data-go="'+node.id+'"]')});
    node.children.forEach(c=>visit(c,path?path+'/'+c.name:c.name));
  }
  visit(tree,'');
  const tracks=clip.tracks.map(track=>({...track,...paths.get(track.path)}));
  const count=paths.get('PresentBox/Item/Count').el.querySelector('span');
  const start=performance.now();let index=0,countAt=null,lastFrame=-1;
  const sounds={PlayBoxShakeSound:'sfx_outgame_box_shake',PlayBoxOpenSound:'sfx_outgame_box_open_2'};
  function update(now){
    if(!root.isConnected)return;
    const t=Math.max(0,(now-start)/1000),frame=Math.min(Math.floor(t*clip.rate),Math.round(clip.duration*clip.rate));
    if(frame!==lastFrame){
      for(const {el,node,attribute,values} of tracks){
        if(!el)continue;
        const v=values[frame];
        if(attribute==='m_IsActive')el.hidden=!v;
        else if(attribute==='m_Interactable')el.disabled=v<.5;
        else if(attribute==='m_Alpha')el.style.opacity=v;
        else if(attribute==='m_Color.a')el.firstElementChild.style.opacity=v;
        else if(attribute==='m_AnchoredPosition.y')el.style.translate='0px '+(node.pos[1]-v)+'px';
        else if(attribute==='Scalex')el.style.setProperty('--box-x',v);
        else if(attribute==='Scaley')el.style.scale='var(--box-x) '+v;
      }
      lastFrame=frame;
    }
    while(index<clip.events.length&&clip.events[index][0]<=t){
      const [at,name]=clip.events[index++];
      if(name==='RewardCountUpEvent')countAt=at;else if(sounds[name])sound(sounds[name]);
    }
    if(countAt!==null){
      const u=Math.min(1,t-countAt);
      count.textContent=String(Math.round(amount*(1-(1-u)**2)));
    }
    if(t<Math.max(clip.duration,(countAt??0)+1))requestAnimationFrame(update);
  }
  update(start);
}
