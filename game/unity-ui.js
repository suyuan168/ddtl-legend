import {translated} from './language.js';
// Unity RectTransform coordinates are relative to the parent's lower left. DOM y points down.
function anchored(node, parent) {
  const size = node.delta.map((v,i) => v+(node.max[i]-node.min[i])*parent[i]);
  const low = size.map((v,i) => parent[i]*(node.min[i]+(node.max[i]-node.min[i])*node.pivot[i])+node.pos[i]-v*node.pivot[i]);
  return [low[0],parent[1]-low[1]-size[1],...size];
}
function arrange(group, children, w, h) {
  const p=group.Padding, space=group.Spacing, align=[(group.ChildAlignment%3)/2,Math.floor(group.ChildAlignment/3)/2];
  const extent=[w-p.m_Left-p.m_Right,h-p.m_Top-p.m_Bottom], origin=[p.m_Left,p.m_Top];
  if(group.kind==='GridLayoutGroup') {
    const {x:cw,y:ch}=group.CellSize, cols=Math.max(1,Math.floor((extent[0]+space.x+.001)/(cw+space.x)));
    const left=origin[0]+(extent[0]-Math.min(cols,children.length)*(cw+space.x)+space.x)*align[0];
    return children.map((_,i)=>[left+(i%cols)*(cw+space.x),origin[1]+Math.floor(i/cols)*(ch+space.y),cw,ch]);
  }
  const axis=group.kind==='HorizontalLayoutGroup'?0:1, cross=1-axis;
  const controlled=[group.ChildControlWidth,group.ChildControlHeight], expand=[group.ChildForceExpandWidth,group.ChildForceExpandHeight];
  const sizes=children.map(n=>n.delta.map((d,i)=> controlled[i]&&expand[i] ? (i===axis?(extent[i]-space*(children.length-1))/children.length:extent[i]) : d));
  const total=sizes.reduce((sum,dim)=>sum+dim[axis],space*Math.max(0,children.length-1));
  const free=Math.max(0,extent[axis]-total);
  // Unity can expand the child's layout cell while keeping its RectTransform at its original size.
  const extra=!controlled[axis]&&expand[axis]&&sizes.length?free/sizes.length:0;
  let cursor=origin[axis]+(extra?0:free*align[axis]);
  return sizes.map(dim=>{const pos=[0,0];pos[axis]=cursor+extra*align[axis];pos[cross]=origin[cross]+(extent[cross]-dim[cross])*align[cross];
    cursor+=dim[axis]+extra+space;return [...pos,...dim];});
}
const rgba=c=>'rgba('+c.slice(0,3).map(v=>Math.round(v*255)).join(',')+','+c[3]+')';
const tintCache=new Map();
const masks=new Map();
function spriteMask(el,spec,renderer,width,height){
  const a=renderer.byId.get(spec.sprite)||renderer.byName.get(spec.sprite);
  if(!a?.file||width<=0||height<=0)return;
  const w=Math.ceil(width),h=Math.ceil(height),key=[a.id,spec.mode,w,h].join(':');
  if(!masks.has(key))masks.set(key,renderer.load(a).then(()=>{
    const c=document.createElement('canvas');c.width=w;c.height=h;
    // A Unity Mask stencils children with the rendered Image, including its nine-sliced alpha.
    const ctx=c.getContext('2d',{willReadFrequently:true});
    renderer.layer(ctx,{id:a.id,color:[1,1,1,1],size:[w,h],pivot:[0,1],
      m:[1,0,0,-1,0,0],flip:[false,false],mode:spec.mode,borderScale:1});
    // UGUI writes stencil coverage, not backdrop opacity. A translucent sprite
    // can clip a list without dimming all the labels and controls inside it.
    const pixels=ctx.getImageData(0,0,w,h);
    for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]?255:0;
    ctx.putImageData(pixels,0,0);
    return c.toDataURL();
  }));
  masks.get(key).then(url=>{el.style.maskImage='url('+url+')';el.style.maskSize='100% 100%';el.style.maskRepeat='no-repeat';});
}
function sprite(el, spec, renderer, width, height) {
  if(!spec.enabled) return;
  const a=renderer.byId.get(spec.sprite)||renderer.byName.get(spec.sprite), col=spec.color;
  if(spec.singleSurface&&spec.mode===1&&a?.border?.some(Boolean)){
    // Rasterize in integral design pixels. Scaling/rotating nine separate CSS
    // border-image patches exposes their antialiased edges at fractional zoom.
    const canvas=document.createElement('canvas');
    canvas.className='unity-graphic';canvas.width=Math.max(1,Math.round(width));canvas.height=Math.max(1,Math.round(height));
    Object.assign(canvas.style,{width:'100%',height:'100%'});el.append(canvas);
    renderer.load(a).then(()=>{
      renderer.layer(canvas.getContext('2d'),{id:a.id,color:col,pivot:[0,1],size:[canvas.width,canvas.height],
        m:[1,0,0,-1,0,0],flip:[false,false],mode:1,borderScale:1});
    });
    return;
  }
  const graphic=document.createElement('div');graphic.className='unity-graphic';el.append(graphic);
  if(!a){graphic.style.background=rgba(col);return;}
  graphic.style.opacity=col[3];
  if(spec.mode===0 && a.rect && (a.width!==a.rect[0]||a.height!==a.rect[1])){
    const [rw,rh]=a.rect,[ox,oy]=a.offset||[0,0];
    Object.assign(graphic.style,{inset:'auto',left:100*ox/rw+'%',top:100*(rh-oy-a.height)/rh+'%',width:100*a.width/rw+'%',height:100*a.height/rh+'%'});
  }
  const apply=url=>{
    if(spec.mode===1 && a.border?.some(Boolean)){
      const [l,b,r,t]=a.border;
      Object.assign(graphic.style,{borderStyle:'solid',borderColor:'transparent',borderWidth:[t,r,b,l].map(v=>v+'px').join(' '),borderImageSource:'url("'+url+'")',borderImageSlice:[t,r,b,l].join(' ')+' fill'});
    } else if(spec.mode===2){
      Object.assign(graphic.style,{backgroundImage:'url("'+url+'")',backgroundSize:a.rect[0]+'px '+a.rect[1]+'px',backgroundRepeat:'repeat'});
    } else Object.assign(graphic.style,{backgroundImage:'url("'+url+'")',backgroundSize:spec.preserve?'contain':'100% 100%',backgroundPosition:'center',backgroundRepeat:'no-repeat'});
  };
  if(col.slice(0,3).every(v=>v>=.999)){apply(a.file);return;}
  const key=a.id+':'+col.slice(0,3).join(',');
  if(!tintCache.has(key))tintCache.set(key,renderer.load(a).then(()=>renderer.tint(a,col).toDataURL()));
  tintCache.get(key).then(apply);
}
const measure=document.createElement('canvas').getContext('2d');
function textElement(el, spec, value,w,h) {
  value=value.replace(/<br\s*\/?\s*>/gi,'\n');
  const span=document.createElement('span');span.className='unity-label';span.textContent=value;
  if(value.includes('\n'))span.style.whiteSpace='pre-line';
  const align=spec.align===1?'left':spec.align===4?'right':'center';
  let size=spec.size;
  const cjk=spec.face&&/^zh/.test(document.documentElement.lang)&&/[\u3000-\u9fff]/.test(value);
  const face=cjk?spec.face:null;
  const font=face?(document.documentElement.lang==='zh-tw'?'ChillTC':'ChillSC'):'ChillGothic, sans-serif';
  const leading=face?.lineHeight??1.08;
  const margin=spec.margin||[0,0,0,0];w-=margin[0]+margin[2];h-=margin[1]+margin[3];
  for(;size>spec.min;size--){
    measure.font=size+'px '+font;
    let lines=0,oversized=false;
    for(const line of value.split('\n')){lines++;let used=0;
      for(const word of line.trim().split(/\s+/)){const next=measure.measureText(word).width;if(next>w)oversized=true;
        const add=used?measure.measureText(' ').width:0;if(used&&used+next+add>w){used=next;lines++;}else used+=next+add;}}
    if(!oversized&&lines*size*leading<=h)break;
  }
  Object.assign(span.style,{fontSize:size+'px',color:rgba(spec.color),textAlign:align,alignItems:align==='center'?'center':align==='left'?'flex-start':'flex-end'});
  if(face)Object.assign(span.style,{fontFamily:font+', sans-serif',lineHeight:String(leading)});
  if(spec.vertical)Object.assign(span.style,{justifyContent:({256:'flex-start',1024:'flex-end'})[spec.vertical]||'center',
    inset:margin.map((_,i)=>margin[[1,2,3,0][i]]+'px').join(' ')});
  el.append(span);
}
// ContentSizeFitter takes preferred child sizes before the parent layout group arranges them.
export function fitPreferredHeight(node){
  node.children.forEach(fitPreferredHeight);
  const layout=node.layout;
  if(layout?.kind==='HorizontalLayoutGroup'&&node.fit?.[0]===2){
    const visible=node.children.filter(n=>n.active&&!n.ignoreLayout);
    node.delta[0]=layout.Padding.m_Left+layout.Padding.m_Right+visible.reduce((w,n)=>w+n.delta[0],0)+Math.max(0,visible.length-1)*layout.Spacing;
  }
  if(node.fit?.[1]!==2||layout?.kind!=='VerticalLayoutGroup')return;
  const children=node.children.filter(n=>n.active&&!n.ignoreLayout);
  node.delta[1]=layout.Padding.m_Top+layout.Padding.m_Bottom+children.reduce((h,n)=>h+n.delta[1],0)+Math.max(0,children.length-1)*layout.Spacing;
}
export function drawTree(host,source,{renderer,locale,customize,onElement,resizable=false,parentSize=[host.clientWidth||1920,host.clientHeight||1080]}){
  function visit(parent,src,psize,placement){
    const n=customize?.(src)??src;if(!n.active)return;
    const [x,y,w,h]=placement||anchored(n,psize);
    const el=document.createElement(n.action?'button':'div');el.className='unity-node';el.dataset.go=n.id;el.dataset.unity=n.name;
    Object.assign(el.style,{left:x+'px',top:y+'px',width:Math.max(0,w)+'px',height:Math.max(0,h)+'px',
      transformOrigin:(n.pivot[0]*100)+'% '+((1-n.pivot[1])*100)+'%',transform:'rotate('+(-n.angle)+'deg) scale('+n.scale.join(',')+')'});
    if(n.mask)el.style.overflow=n.scroll?'hidden auto':'hidden';
    if(n.maskImage!=null&&n.image?.enabled)spriteMask(el,n.image,renderer,w,h);
    if(n.alpha!=null)el.style.opacity=n.alpha;
    if(n.action){el.type='button';el.setAttribute('aria-label',n.label);el.onclick=n.action;}
    parent.append(el);
    if(n.image&&n.maskImage!==false)sprite(el,n.image,renderer,w,h);
    if(n.text)textElement(el,n.text,n.value??translated(locale,n.locale,n.text.value),w,h);
    const children=n.children.filter(child=>(customize?.(child)??child).active);
    const driven=children.filter(child=>!child.ignoreLayout);
    if(n.layout?.ReverseArrangement)driven.reverse();
    const placements=n.layout?arrange(n.layout,driven,w,h):[];
    const reflow=resizable?[]:null;
    children.forEach(child=>{
      const fn=visit(el,child,[w,h],placements[driven.indexOf(child)]);
      if(reflow)reflow.push(fn);
    });
    onElement?.(n,el);
    if(reflow)return (parent,nextPlacement)=>{
      const [x,y,w,h]=nextPlacement||anchored(n,parent);
      Object.assign(el.style,{left:x+'px',top:y+'px',width:Math.max(0,w)+'px',height:Math.max(0,h)+'px'});
      if(n.maskImage!=null&&n.image?.enabled)spriteMask(el,n.image,renderer,w,h);
      const slots=n.layout?arrange(n.layout,driven,w,h):[];
      children.forEach((child,i)=>reflow[i]?.([w,h],slots[driven.indexOf(child)]));
    };
  }
  return visit(host,source,parentSize);
}
export function fitStage(el,rect,expand=false){
  const scale=Math.min(rect.width/1920,rect.height/1080);
  const w=expand?rect.width/scale:1920,h=expand?rect.height/scale:1080;
  Object.assign(el.style,{width:w+'px',height:h+'px',transform:'scale('+scale+')',left:(rect.left+(rect.width-w*scale)/2)+'px',top:(rect.top+(rect.height-h*scale)/2)+'px'});
}
