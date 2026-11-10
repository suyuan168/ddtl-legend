export async function drawWordmark(){
  const fontUrl=new URL('./wordmark-font.ttf',import.meta.url);
  const font=new FontFace('Dawn Wordmark','url('+fontUrl.href+')',{weight:'900'});
  document.fonts.add(await font.load());
  const sun=new Image();
  sun.src=new URL('./dawn-mark.png',import.meta.url).href;
  await sun.decode();
  const canvas=document.createElement('canvas');
  canvas.width=838;
  canvas.height=688;
  const ink=canvas.getContext('2d');
  ink.drawImage(sun,427,-10,383,383);
  ink.translate(84,115);
  ink.rotate(-.085);
  ink.transform(1,0,-.10,1,0,0);
  ink.font='900 260px "Dawn Wordmark"';
  ink.lineJoin='round';
  const words=[['打到',-1,236],['天亮',185,458]];
  for(const [text,x,y] of words){
    ink.strokeStyle='#1a1827';
    ink.lineWidth=29;
    ink.strokeText(text,x+4,y+17);
    ink.fillStyle='#1a1827';
    ink.fillText(text,x+4,y+17);
  }
  for(const [text,x,y] of words){
    ink.lineWidth=13;
    ink.strokeStyle='#dc491e';
    ink.strokeText(text,x,y+6);
    ink.fillStyle='#dc491e';
    ink.fillText(text,x,y+6);
    const face=ink.createLinearGradient(0,y-190,0,y);
    face.addColorStop(0,text==='打到'?'#fff8dc':'#fff1a0');
    face.addColorStop(1,text==='打到'?'#ffeaab':'#ffba24');
    ink.fillStyle=face;
    ink.fillText(text,x,y);
  }
  return canvas;
}
