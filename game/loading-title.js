const logoRoot='/TitleView/LogoRoot/Logo/';
const logoFile='assets/brand/dawn-logo.png';

// Loading and title gameplay use the same layer selection and the same wordmark.
export async function prepareTitle(renderer,view){
  const draw=view.draw.filter(part=>part.path!==logoRoot+'Light').map(part=>
    part.path===logoRoot+'Logo'?{...part,id:logoFile}:part);
  renderer.byId.set(logoFile,{file:logoFile});
  await renderer.prepare({draw});
  const layers=new Map(draw.map(part=>[part.path.slice('/TitleView/'.length),part]));
  return (canvas,frame)=>{
    const ctx=canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1,0,0,-1,canvas.width/2,canvas.height/2);
    ctx.clearRect(-canvas.width/2,-canvas.height/2,canvas.width,canvas.height);
    for(const [path,m] of frame){
      const part=layers.get(path);
      if(part)renderer.layer(ctx,{...part,m});
    }
    ctx.restore();
  };
}
