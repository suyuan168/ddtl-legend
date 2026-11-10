import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {launchBrowser} from './verify-browser.mjs';

const url=process.env.CHILLCAT_URL||'http://127.0.0.1:18846';
const profile=JSON.parse(await readFile('data/demo-profile.json','utf8'));
const browser=await launchBrowser();
const errors=[],masks=[],interactions=[],labels=[],previewColors=[];
async function open(mode,language){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({language,outfit})=>{
    localStorage.setItem('chill-language',language);
    localStorage.setItem('chill-weapon','2');
    localStorage.setItem('chill-preview-kit',JSON.stringify({...outfit,bomb:'2',ultimate:'1002'}));
  },{language,outfit:profile.outfit});
  await page.goto(url+'/?inspect=1&view='+mode);
  await page.locator('.equipment-card').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  return page;
}
const node=(page,id)=>page.locator('#equipment [data-go="'+id+'"]').first();
async function mask(page,id){
  await page.waitForFunction(id=>document.querySelector('#equipment [data-go="'+id+'"]')?.style.maskImage.includes('data:'),id);
  const values=await node(page,id).evaluate(async el=>{
    const src=getComputedStyle(el).maskImage.match(/url\("(.*?)"\)/)[1];
    const im=await createImageBitmap(await(await fetch(src)).blob());
    const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
    const g=canvas.getContext('2d');g.drawImage(im,0,0);const data=g.getImageData(0,0,im.width,im.height).data,distinct=new Set();
    for(let i=3;i<data.length;i+=4)distinct.add(data[i]);
    return {center:data[4*(Math.floor(im.height/2)*im.width+Math.floor(im.width/2))+3],alpha:[...distinct].sort((a,b)=>a-b)};
  });
  assert.equal(values.center,255);assert.deepEqual(values.alpha,[0,255]);masks.push({id,...values});
}
async function gesture(page,id){
  const el=node(page,id);
  await page.mouse.move(0,0);await page.waitForTimeout(220);
  const base=await el.boundingBox();await el.hover();await page.waitForTimeout(190);const hover=await el.boundingBox();
  await page.mouse.down();await page.waitForTimeout(170);const press=await el.boundingBox();
  await page.mouse.up();await page.mouse.move(0,0);await page.waitForTimeout(180);
  const returned=await el.boundingBox();const ratio=b=>Number((b.width/base.width).toFixed(3));
  const result={id,hover:ratio(hover),pressed:ratio(press),returned:ratio(returned)};
  assert(Math.abs(result.hover-1.1)<.002,JSON.stringify(result));assert(Math.abs(result.pressed-.99)<.002,JSON.stringify(result));assert.equal(result.returned,1);
  interactions.push(result);
}
async function selected(page,id){
  const el=node(page,id);const border=el.locator(':scope>[data-unity="SelectBG"],:scope>[data-unity="SelectBg"]');
  assert.equal(await border.count(),1);assert.equal(await el.locator(':scope>[data-unity="SelectCheck"]').count(),1);
  const animation=await border.evaluate(e=>e.getAnimations()[0]?.effect.getTiming().duration);assert.equal(animation,800);
}
try{
  const weapon=await open('weapon','en');
  await gesture(weapon,'choice-weapon-5');await selected(weapon,'choice-weapon-5');
  assert.equal(await node(weapon,'choice-bomb-3').locator('[data-unity="SelectCheck"]').count(),0);
  await node(weapon,'choice-ultimate-1001').click();await selected(weapon,'choice-ultimate-1001');
  await node(weapon,'choice-weapon-4').hover();await weapon.waitForTimeout(200);
  for(const id of ['317','316','939'])await mask(weapon,id);
  await weapon.screenshot({path:'verification/equipment-weapon-en.png'});
  await weapon.close();
  const c=await open('costume','en');await mask(c,'1246');await gesture(c,'costume-10030');await selected(c,'costume-10030');
  for(const [slot,id] of [['Body','20004'],['Skin','30003'],['Head','10030']]){
    await c.getByRole('button',{name:slot,exact:true}).click();await selected(c,'costume-'+id);
  }
  await c.mouse.move(0,0);await c.waitForTimeout(250);
  await c.screenshot({path:'verification/equipment-costume-en.png'});
  const tables=JSON.parse(await readFile('data/tables.json','utf8'));
  const previewColor=tables.Team.find(row=>row.Id==='1').TeamColor.split('|')[0];
  const channels=previewColor.slice(1).match(/../g).map(pair=>parseInt(pair,16));
  for(const [id,hasTint] of [['10030',false],['10004',true],['10025',true]]){
    await node(c,'costume-'+id).click();
    const preview=c.locator('#equipment .unity-stage > canvas');
    await preview.waitFor();
    const pixels=await preview.evaluate((canvas,[r,g,b])=>{
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let count=0;
      for(let i=0;i<data.length;i+=4){
        if(data[i]===r&&data[i+1]===g&&data[i+2]===b&&data[i+3]===255)count++;
      }
      return count;
    },channels);
    assert(hasTint?pixels>500:pixels===0,JSON.stringify({id,previewColor,pixels}));
    previewColors.push({id,previewColor,pixels});
  }
  await c.getByRole('button',{name:'Close',exact:true}).click();
  // The Steam capture has a smaller owned inventory. Run the real owned-list renderer
  // once with only those identified item IDs, without granting any account items.
  await c.evaluate(async ids=>{
    const {EquipmentPanel}=await import('/game/equipment.js'),real=EquipmentPanel.prototype.open;
    EquipmentPanel.prototype.open=function(...args){
      this.owned=new Set(ids);this.previewInventory=false;
      EquipmentPanel.prototype.open=real;
      return real.apply(this,args);
    };
  },Object.values(profile.visibleItems).flat());
  await c.click('#controls');await c.click('[data-tab="costume"]');await selected(c,'costume-10030');
  await c.mouse.move(0,0);await c.waitForTimeout(350);
  await c.screenshot({path:'verification/equipment-costume-reference-inventory.png'});
  await c.close();
  const zh=await open('weapon','zh-cn');
  const choices=await zh.locator('#equipment [data-go^="choice-"]').evaluateAll(items=>items.map(el=>el.dataset.go));
  assert.equal(choices.length,14);
  for(const id of choices){
    await node(zh,id).click();await zh.evaluate(()=>document.fonts.ready);
    for(const label of ['1074','675']){
      const m=await node(zh,label).locator('.unity-label').evaluate(e=>{
        const child=e.firstElementChild;return {text:e.textContent,size:parseFloat(e.style.fontSize),face:e.style.fontFamily,
          width:e.clientWidth,height:e.clientHeight,textWidth:child.scrollWidth,textHeight:child.offsetHeight};});
      assert(m.face.includes('ChillSC'));assert(m.textWidth<=m.width&&m.textHeight<=m.height,JSON.stringify(m));labels.push({id,label,...m});
    }
  }
  await zh.setViewportSize({width:1280,height:800});await zh.mouse.move(0,0);await zh.waitForTimeout(200);
  await zh.screenshot({path:'verification/equipment-weapon-zh.png'});await zh.close();
  assert.deepEqual(errors,[]);
  await writeFile('verification/equipment-cards-browser.json',JSON.stringify({masks,interactions,selected:{weapon:true,bombCleared:true,ultimate:true,allCostumeTabs:true},labels,previewColors,
    referenceInventory:'Separate comparison screenshot runs the owned inventory filter with the user-visible demonstration IDs from data/demo-profile.json in this browser only.',errors},null,2)+'\n');
  console.log(JSON.stringify({masks,interactions,labels:labels.length}));
}finally{await browser.close();}
