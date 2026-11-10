// These bindings come from each view's serialized BasePopupView and ButtonTween components.
export class UiSound{
  constructor(settings,table,play){
    this.settings=settings;
    this.play=play;
    this.name=new Map(table.map(row=>[+row.Id,row.SoundName]));
  }
  cue(id){if(this.name.has(id))this.play(this.name.get(id));}
  open(view){this.cue(this.settings[view]?.show);}
  bind(view,sourceId,element){
    if(this.settings[view]?.press.includes(sourceId))
      element.addEventListener('pointerdown',()=>this.cue(6));
  }
}
