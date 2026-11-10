import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {launchBrowser} from './verify-browser.mjs';

const browser=await launchBrowser({
  args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']
});
const page=await browser.newPage({viewport:{width:1100,height:680}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto((process.env.CHILLCAT_URL||'http://127.0.0.1:18846')+'/?view=yard&weapon=4&bomb=4&ultimate=1001');
  await page.waitForSelector('body[data-screen=lobby]');
  await page.evaluate(async()=>{
    const {LocalField}=await import('/game/simulation.js'),{WeaponAlt}=await import('/game/weapon-alt.js');
    const {WeaponView}=await import('/game/weapon-view.js'),{Renderer}=await import('/game/render.js');
    const q=window.shieldTest={phase:'approach',clock:0,contacts:[],views:[],damage:[],layers:{},text:[],shots:0};
    const step=LocalField.prototype.step,block=WeaponAlt.prototype.block,viewBlock=WeaponView.prototype.block;
    const sample=WeaponView.prototype.sample,layer=Renderer.prototype.layer,fillText=CanvasRenderingContext2D.prototype.fillText;
    function readPixels(ctx){
      const w=ctx.canvas.width,h=ctx.canvas.height;
      return ctx.getImageData(Math.round(w/2)-150,Math.round(h/2)-170,300,300).data;
    }
    function changed(before,after){
      let count=0;
      for(let i=0;i<before.length;i+=4)if([0,1,2].some(k=>Math.abs(before[i+k]-after[i+k])>7))count++;
      return count;
    }
    LocalField.prototype.step=function(dt,input){
      q.initial??={pos:[this.x,this.y],hp:this.hp,shield:this.altWeapon.shieldHp,id:this.weapon.Id};
      q.field=this;q.clock+=dt;
      const hp=this.hp,ret=step.apply(this,arguments);
      if(hp>this.hp)q.damage.push({phase:q.phase,time:q.clock,from:hp,to:this.hp,held:input.alt,angle:input.angle});
      if(this.shots.some(s=>s.team!=null&&s.team!==this.team))q.shots++;
      return ret;
    };
    WeaponAlt.prototype.block=function(shot,x,y){
      const before=this.shieldHp,result=block.apply(this,arguments);
      if(this.shield||result)q.contacts.push({phase:q.phase,result,held:this.held,aim:this.shieldAngle,bulletAngle:shot.angle,
        time:q.clock,damage:shot.damage,team:shot.team,before,after:this.shieldHp,ownerHP:this.field.hp,impact:[x,y]});
      return result;
    };
    if(viewBlock)WeaponView.prototype.block=function(event,now){
      q.views.push({...event,time:now});return viewBlock.apply(this,arguments);
    };
    WeaponView.prototype.sample=function(actor,now){
      const frame=sample.apply(this,arguments);
      if(actor.id==='local'&&frame?.id==='4'){q.kick=frame.shieldKick;q.flash=frame.shieldFlash;}
      return frame;
    };
    Renderer.prototype.layer=function(ctx,part){
      const shield=part.path?.includes('/Umbrella_2/')&&q.field?.altWeapon.shield;
      const key=q.phase+'/'+part.path+'/'+part.id+'/'+(q.flash>.1?'flash':'rest');
      if(!shield||q.layers[key])return layer.apply(this,arguments);
      const before=readPixels(ctx),result=layer.apply(this,arguments),delta=changed(before,readPixels(ctx));
      if(delta)q.layers[key]={phase:q.phase,path:part.path,sprite:part.id,pixels:delta,flash:q.flash,kick:q.kick,color:part.color,time:q.clock};
      return result;
    };
    CanvasRenderingContext2D.prototype.fillText=function(text){
      if(text!=='Block'||q.text.length>=80)return fillText.apply(this,arguments);
      const before=readPixels(this),ret=fillText.apply(this,arguments);
      const delta=changed(before,readPixels(this));
      if(delta)q.text.push({phase:q.phase,pixels:delta,alpha:this.globalAlpha,time:q.clock});
      return ret;
    };
  });
  await page.waitForFunction(()=>shieldTest.field?.weapon.Id==='4');
  async function walk(axis,coord,key,sign){
    await page.keyboard.down(key);
    try{await page.waitForFunction(([axis,coord,sign])=>(shieldTest.field[axis]-coord)*sign>=-.03,[axis,coord,sign],{polling:'raf',timeout:13000});}
    finally{await page.keyboard.up(key);}
  }
  await walk('y',-4,'KeyW',1);await walk('x',25,'KeyD',1);await walk('y',-24.16,'KeyS',-1);
  await page.mouse.move(946,340);await page.mouse.down({button:'right'});
  await page.waitForFunction(()=>shieldTest.field.altWeapon.shield);
  await page.evaluate(()=>{shieldTest.phase='front';});
  await page.keyboard.down('KeyD');
  try{await page.waitForFunction(()=>shieldTest.contacts.filter(c=>c.phase==='front'&&c.result).length>=2,null,{polling:'raf',timeout:10000});}
  finally{await page.keyboard.up('KeyD');}
  await page.waitForFunction(()=>shieldTest.contacts.filter(c=>c.phase==='front'&&c.result).length>=2&&shieldTest.text.length&&shieldTest.views.length,null,{timeout:8000});
  await page.screenshot({path:'verification/yard-shield-front.png'});
  await page.evaluate(()=>{shieldTest.phase='turn';});
  await page.mouse.move(145,340);
  await page.waitForFunction(()=>Math.cos(shieldTest.field.altWeapon.shieldAngle)<-.99);
  await page.evaluate(()=>{shieldTest.phase='back';});
  await page.waitForFunction(()=>shieldTest.damage.some(d=>d.phase==='back')&&Object.values(shieldTest.layers).some(v=>v.phase==='back'),null,{timeout:4000});
  await page.screenshot({path:'verification/yard-shield-back.png'});
  const report=await page.evaluate(()=>{const {field,...rest}=shieldTest;return {...rest,layers:Object.values(rest.layers),position:[field.x,field.y]};});
  await page.mouse.up({button:'right'});
  assert.deepEqual(report.initial.pos,[0,-9]);assert.equal(report.initial.hp,20);assert.equal(report.initial.shield,30);
  const front=report.contacts.filter(c=>c.phase==='front'),back=report.contacts.filter(c=>c.phase==='back');
  assert(front.length>=2&&front.every(c=>c.held&&c.result&&Math.cos(c.aim)>.99&&c.damage===c.before-c.after&&c.ownerHP===20));
  assert(back.length>0&&back.every(c=>c.held&&!c.result&&Math.cos(c.aim)<-.99&&c.before===c.after));
  assert(report.damage.every(d=>['turn','back'].includes(d.phase)&&Math.cos(d.angle)<-.99&&d.held&&d.from-d.to===2));
  assert(report.text.some(e=>e.phase==='front'&&e.pixels>10));assert(report.shots>0);
  assert(report.layers.some(l=>l.phase==='front'&&l.path.endsWith('/BgColor')&&l.flash>.1&&l.kick>0&&l.pixels>5));
  for(const phase of ['front','back'])assert(report.layers.filter(l=>l.phase===phase&&l.pixels>5).length>=2);
  assert.deepEqual(errors,[]);
  await writeFile('verification/yard-shield.json',JSON.stringify({procedure:'Ordinary Yard spawn, keyboard movement to the ZN_17 shooting lane, same right-button hold facing the dummy and away. Hooks only observe runtime calls and final Canvas pixels.',...report,errors},null,2)+'\n');
  console.log('Real dummy block:',front.length,'frontal contacts,',back.length,'rear contacts;',report.text.length,'painted Block frames.');
}catch(e){
  console.error(await page.evaluate(()=>{const {field,...rest}=window.shieldTest??{};return {...rest,text:rest.text?.slice(0,3),pos:[field?.x,field?.y]};}).catch(()=>null),errors);
  throw e;
}finally{await browser.close();}
