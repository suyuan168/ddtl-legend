// GameVersionOverlay.Create installs a screen-space canvas after the first scene,
// uses the viewport height as its scale reference, and survives scene changes.
export function mountVersionOverlay(version){
  const ns='http://www.w3.org/2000/svg';
  const label=document.createElementNS(ns,'svg');
  label.id='game-version';label.setAttribute('viewBox','0 0 480 28');
  label.setAttribute('aria-label','Ver_'+version);label.setAttribute('role','img');
  const text=document.createElementNS(ns,'text');
  text.setAttribute('text-anchor','end');text.setAttribute('x','480');
  // Bottom-aligned TMP text uses the original font's descent of -21.975 at 75 points.
  text.setAttribute('y',String(28-16*21.975/75));text.textContent='Ver_'+version;label.append(text);
  const dialogs=[...document.querySelectorAll('dialog')];
  const stack=dialogs.filter(d=>d.open);
  function place(){
    const host=stack.at(-1)??document.body;
    if(label.parentNode!==host)host.append(label);
  }
  const observer=new MutationObserver(changes=>{
    for(const {target} of changes){
      const index=stack.indexOf(target);
      if(index>=0)stack.splice(index,1);
      if(target.open)stack.push(target);
    }
    place();
  });
  for(const dialog of dialogs)observer.observe(dialog,{attributes:true,attributeFilter:['open']});
  place();
}
