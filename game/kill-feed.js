// GameScene/KillLogView and its KillLogMessageView child use the match HUD canvas.
export class KillFeed {
  constructor(renderer,teams){
    this.teams=teams;
    this.arrow=renderer.byName.get('KillLog_Arrow').file;
    this.backdrop=renderer.byName.get('KillLog_BG').file;
    this.group=document.createElement('div');
    this.group.className='kill-feed';
    this.group.setAttribute('role','log');
  }
  clear(){this.group.replaceChildren();}
  add(event,palette){
    if(!this.group.isConnected)return;
    const row=document.createElement('div'),content=document.createElement('div');
    row.className='kill-feed-row';content.className='kill-feed-content';
    const bg=new Image(),arrow=new Image();
    bg.className='kill-feed-bg';bg.src=this.backdrop;bg.alt='';
    arrow.className='kill-feed-arrow';arrow.src=this.arrow;arrow.alt='→';
    const nickname=(text,team)=>{
      const el=document.createElement('span');
      el.textContent=text;
      el.style.color=this.teams.find(t=>Number(t.Id)===team)?.TeamColor.split('|')[palette]??'#fff';
      return el;
    };
    content.append(bg,nickname(event.attacker,event.attackerTeam),arrow,nickname(event.victim,event.victimTeam));
    row.append(content);this.group.append(row);
    const ease='cubic-bezier(.333333,.666667,.666667,1)';
    // Setup tweens the outer CanvasGroup independently of the animator on Root.
    row.animate([{opacity:0,easing:ease},{opacity:1,offset:200/3300},{opacity:1,offset:3000/3300,easing:ease},{opacity:0}],
      {duration:3300,fill:'both'}).onfinish=()=>row.remove();
  }
}
