export function mountHorizon(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(dpr * w);
    canvas.height = Math.round(dpr * h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 87129;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const portrait = w / h < .95;
    const horizon = h * (portrait ? .52 : .665);
    const sunX = w * (portrait ? .75 : .735);
    const sunY = horizon - h * .082;
    const radius = Math.min(w * .25, h * .215);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    for (const [stop,color] of [[0,'#25223f'],[.22,'#51405e'],[.43,'#ab6176'],[.60,'#f3906f'],[.71,'#ee9878'],[1,'#28233c']]) sky.addColorStop(stop,color);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,radius*2.7);
    glow.addColorStop(0,'rgba(255,203,120,.62)');
    glow.addColorStop(.44,'rgba(255,165,105,.30)');
    glow.addColorStop(1,'rgba(254,158,111,0)');
    ctx.fillStyle = glow; ctx.fillRect(0,0,w,h);
    for (let i=0; i<Math.ceil(w/13); i++) {
      const x=rand()*w, y=rand()*h*.43;
      ctx.fillStyle='rgba(255,227,191,'+(.15+rand()*.38)*(1-y/(h*.48))+')';
      ctx.beginPath(); ctx.arc(x,y,.35+rand()*.7,0,2*Math.PI); ctx.fill();
    }
    const sun = ctx.createLinearGradient(0,sunY-radius,0,sunY+radius);
    sun.addColorStop(0,'#fff4c1'); sun.addColorStop(.48,'#ffd17f'); sun.addColorStop(1,'#fc8f67');
    ctx.fillStyle=sun;
    ctx.beginPath(); ctx.arc(sunX,sunY,radius,0,2*Math.PI); ctx.fill();
    ctx.save(); ctx.clip();
    for (let i=0; i<5; i++) {
      const y=sunY+radius*(.12+i*.18);
      ctx.fillStyle='rgba(182,96,110,'+(.10+i*.045)+')';
      ctx.fillRect(sunX-radius,y,2*radius,radius*(.012+i*.007));
    }
    ctx.restore();
    function path(points,color) {
      ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
      for(const [x,y] of points.slice(1))ctx.lineTo(x,y);
      ctx.closePath(); ctx.fill();
    }
    for(let i=0; i<14; i++){
      const x=rand()*w,y=h*(.14+rand()*.43),length=(.035+rand()*.145)*w;
      path([[x,y],[x+length*.7,y-h*.003],[x+length,y],[x+length*.66,y+h*.002],[x-length*.1,y+h*.002]],'rgba(255,189,148,'+(.13+rand()*.12)+')');
    }
    function skyline(baseline,scale,color,light,lit) {
      const unit=Math.max(290,Math.min(w,h))*scale;
      const floor=baseline+unit*.12;
      ctx.fillStyle=color; ctx.fillRect(0,baseline,w,h-baseline);
      let x=-unit*.1;
      while(x<w){
        const width=(.03+rand()*.092)*unit, roof=baseline-(.016+rand()*.095)*unit;
        ctx.fillStyle=color; ctx.fillRect(x,roof,width,floor-roof);
        ctx.fillStyle=light; ctx.fillRect(x,roof,width,Math.max(.7,unit*.001));
        if(rand()>.72){
          const inset=width*.12,cut=unit*(.008+rand()*.012);
          ctx.fillStyle=color; ctx.fillRect(x+inset,roof-cut,width*.55,cut);
          ctx.fillStyle=light; ctx.fillRect(x+inset,roof-cut,width*.55,Math.max(.7,unit*.001));
        }
        if(rand()>.88){
          const antenna=x+width*.72, height=unit*(.015+rand()*.025);
          ctx.fillStyle=color; ctx.fillRect(antenna,roof-height,1.3,height);
        }
        if(lit) for(let k=0;k<4;k++){
          const wx=x+width*(.15+rand()*.67),wy=roof+unit*(.01+rand()*.028);
          if(rand()>.36){ctx.fillStyle=lit;ctx.fillRect(wx,wy,Math.max(1.5,unit*.005),Math.max(1,unit*.0025));}
        }
        x+=width+unit*.004;
      }
    }
    skyline(horizon+h*.05,.84,'#a76c7c','#d6938d',null);
    skyline(horizon+h*.14,1.14,'#805c75','#ab7986',null);
    const towerX=portrait?w*.89:w*.86, towerY=horizon+h*.035, towerW=Math.max(12,h*.045);
    path([[towerX-towerW,towerY+h*.24],[towerX-4,towerY],[towerX+4,towerY],[towerX+towerW,towerY+h*.24]],'#67536b');
    ctx.strokeStyle='#67536b'; ctx.lineWidth=Math.max(1,h*.002);
    ctx.beginPath(); ctx.moveTo(towerX,towerY); ctx.lineTo(towerX,towerY-h*.07); ctx.stroke();
    ctx.fillStyle='#ffd49b';ctx.fillRect(towerX-1,towerY-h*.07,2.5,2.5);
    ctx.fillStyle='#67536b';ctx.fillRect(towerX-h*.018,towerY+h*.014,h*.036,h*.007);
    skyline(horizon+h*.245,1.75,'#52445f','#8c6377','#bd8883');
    skyline(horizon+h*.345,2.04,'#312d47','#674d63','#a16d76');
    for(let i=0;i<4;i++){
      const x=sunX+radius*(.44+i*.15),y=sunY-radius*(.55+Math.sin(i*1.3)*.09);
      const b=h*(.004+i*.0006);
      ctx.strokeStyle='#795467';ctx.lineWidth=Math.max(.7,h*.0014);
      ctx.beginPath();ctx.moveTo(x-b*1.8,y-b*.25);ctx.quadraticCurveTo(x-b,y-b*.5,x,y+b*.4);
      ctx.quadraticCurveTo(x+b*.8,y-b*.75,x+b*1.8,y-b*.7);ctx.stroke();
    }
    const shade=ctx.createLinearGradient(0,0,w*.70,0);
    shade.addColorStop(0,'rgba(26,23,42,.27)');shade.addColorStop(1,'rgba(26,23,42,0)');
    ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  }
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  draw();
}
