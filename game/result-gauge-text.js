// Both score groups carry PLocaleText, including the dynamically written percentage labels.
const scoreLabels=new Set(['112','819','537','583','649','489','561','305','282','834']);
const teamLabels=new Set(['583','649']);
const measure=document.createElement('canvas').getContext('2d');
export function localizeResultScore(node,element){
  if(!scoreLabels.has(node.id)||!/^zh/.test(document.documentElement.lang))return;
  const label=element.querySelector('.unity-label'),value=label.textContent;
  const font=document.documentElement.lang==='zh-tw'?'ChillTC':'ChillSC';
  const apply=()=>{
    const width=element.clientWidth,height=element.clientHeight;
    if(!width||!height)return;
    const face={point:284,ascent:329.44,descent:-81.792};
    let size=node.text.size;
    if(size!==node.text.min){
      measure.font=size+'px '+font;
      size=Math.max(node.text.min,Math.min(size,width/measure.measureText(value).width*size,height*face.point/(face.ascent-face.descent)));
    }
    // Line box and baseline use the same ascender/descender as the TMP SDF asset.
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),text=document.createElementNS(ns,'text');
    svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible';
    text.setAttribute('x',String(width/2));text.setAttribute('y',String((height+(face.ascent+face.descent)*size/face.point)/2));
    text.setAttribute('text-anchor','middle');text.style.fontFamily=font;text.style.fontSize=size+'px';
    text.setAttribute('fill','white');text.textContent=value;
    if(!teamLabels.has(node.id)){
      text.setAttribute('stroke','black');text.setAttribute('stroke-width',String(2*.14*16*size/face.point));text.setAttribute('paint-order','stroke');
    }
    svg.append(text);element.querySelector('svg')?.remove();label.style.visibility='hidden';element.append(svg);
  };
  if(document.fonts.check('20px '+font))apply();else document.fonts.load('20px '+font).then(apply);
}
