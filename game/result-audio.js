// The overview counters use the two GameResultView gauge tweens. The remaining
// one-shots follow the animation events on the original overview, detail and reward clips.
export class ResultAudio{
  constructor(play){this.play=play;}
  clear(){cancelAnimationFrame(this.frame);this.page=null;}
  show(page,pct,reward){
    this.reward=reward;
    if(this.page===page)return;
    this.clear();this.page=page;
    if(page===3)return; // DailyBonusResult_ON supplies its own animation events.
    const start=performance.now(),play=this.play;
    let previous=0,eventIndex=0,gaugeStarted=false;
    if(page===2)play('sfx_result_gold_popup');
    const events=page===0?[[1.2666667,()=>{if(pct!==50)play('sfx_result_paint');}],
      [1.8166667,()=>play(pct===50?'sfx_result_draw':pct>50?'sfx_result_win':'sfx_result_fail')]]:
      page===1?[1/6,.25,5/12,.5].map(t=>[t,()=>play('sfx_result_ui')]):[];
    const update=now=>{
      const t=(now-start)/1000;
      while(eventIndex<events.length&&events[eventIndex][0]<=t)events[eventIndex++][1]();
      if(page===0){
        const midway=Math.min(pct,100-pct)*.7;
        const count=t<1.2666667?Math.round(midway*Math.min(1,t/.5)):
          Math.round(midway+(Math.max(pct,100-pct)-midway)*Math.min(1,(t-1.2666667)/.05));
        if(count>previous){
          if(!gaugeStarted){gaugeStarted=true;play('sfx_result_gauge');}
          play('sfx_result_count');
        }
        previous=count;
      }else if(page===2&&t>=7/12){
        // A reward can arrive after the result panel opens on a slow connection.
        if(this.reward>0&&this.countStart==null)this.countStart=now;
        const u=Math.min(1,(now-(this.countStart??now))/1000);
        const count=Math.round((this.reward||0)*(1-(1-u)**2));
        if(count>previous)play('sfx_result_count_gold');
        previous=count;
      }
      if(page===0?t<1.817:page===1?t<.51:!this.reward||previous<this.reward)this.frame=requestAnimationFrame(update);
    };
    this.countStart=null;this.frame=requestAnimationFrame(update);
  }
}
