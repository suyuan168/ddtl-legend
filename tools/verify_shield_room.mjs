import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {launchBrowser} from './verify-browser.mjs';
import {defineRoom,defineServer} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import express from 'express';
import WebSocket from 'ws';

process.env.CHILLCAT_PG='';process.env.CHILLCAT_REDIS='';globalThis.WebSocket=WebSocket;
const {PaintRoom}=await import('../server/room.mjs'),{Client}=await import('@colyseus/sdk');
let base;
const peers=[],peerLogs=[],pages=[],errors=[],shieldEvents=[],shieldTransitions=[];
let room,defenderId;
class ObservedRoom extends PaintRoom{
  async onCreate(opts){await super.onCreate(opts);room=this;}
  broadcast(name,msg,...rest){
    if(name==='skillEvents')for(const event of msg)if(event.type==='shield-block')shieldEvents.push({...event,clock:this.roundClock});
    return super.broadcast(name,msg,...rest);
  }
  advance(dt){
    const p=this.members?.get(defenderId),before=p?.game.altWeapon.shield;
    const result=super.advance(dt);
    if(p&&before!==p.game.altWeapon.shield)shieldTransitions.push({clock:this.roundClock,hp:p.hp,shield:p.game.altWeapon.shield,charges:p.game.altWeapon.charges});
    return result;
  }
}
const server=defineServer({transport:new WebSocketTransport(),rooms:{chillcat_match:defineRoom(ObservedRoom)},
  express:app=>{
    for(const dir of ['assets','game','data'])app.use('/'+dir,express.static(resolve(dir)));
    app.get('/api/gacha',(_,res)=>res.json({balance:0,owned:[],available:false}));
    app.get('/api/daily-rewards',(_,res)=>res.json({received:[]}));
    app.get('/',(_,res)=>res.sendFile(resolve('index.html')));
  }});
const browser=await launchBrowser({args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
async function until(test,reason,ms=10000){const end=Date.now()+ms;do{if(await test())return;await sleep(12);}while(Date.now()<end);throw Error(reason);}
async function joinBrowser(weapon){
  const page=await browser.newPage({viewport:{width:960,height:540}});pages.push(page);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?view=yard&weapon='+weapon);
  await page.waitForSelector('body[data-screen=lobby]');
  const id=await page.evaluate(async id=>{
    const {connect,net}=await import('/game/rooms.js'),{WeaponView}=await import('/game/weapon-view.js'),{DummyFeedback}=await import('/game/dummy-feedback.js');
    const qa=window.shieldQA={events:[],views:[],blockLabels:0,picture:null};
    const block=WeaponView.prototype.block,draw=WeaponView.prototype.draw,feedback=DummyFeedback.prototype.draw;
    if(typeof block!=='function')throw Error('WeaponView.block renderer is missing');
    WeaponView.prototype.block=function(event,now){
      qa.events.push({owner:event.owner,x:event.x,y:event.y});return block.call(this,event,now);
    };
    WeaponView.prototype.draw=function(ctx,frame,actor,aim,front,back,team,mask){
      if(mask||frame?.id!=='4'||!actor.shield||front===back)return draw.apply(this,arguments);
      const renderer=this.renderer,layer=renderer.layer,observed=[];
      renderer.layer=function(canvas,part,...args){
        const isGlass=part.path?.endsWith('/Umbrella_2/BgColor');
        if(isGlass){
          const drawImage=canvas.drawImage;
          canvas.drawImage=function(...data){observed.push({rgba:part.color,transform:part.m});return drawImage.apply(this,data);};
          try{return layer.call(this,canvas,part,...args);}finally{canvas.drawImage=drawImage;}
        }
        return layer.call(this,canvas,part,...args);
      };
      try{
        const result=draw.apply(this,arguments);
        if(observed.length&&qa.views.length<600)qa.views.push({owner:actor.id,flash:frame.shieldFlash??0,kick:frame.shieldKick??0,...observed[0]});
        return result;
      }finally{renderer.layer=layer;}
    };
    DummyFeedback.prototype.draw=function(ctx,...args){
      const fill=ctx.fillText;
      ctx.fillText=function(text,...rest){
        if(text==='Block'&&ctx.globalAlpha>0&&ctx.getTransform().a!==0)qa.blockLabels++;
        return fill.call(this,text,...rest);
      };
      try{
        const result=feedback.call(this,ctx,...args);
        if(!qa.picture&&qa.blockLabels&&qa.views.some(v=>v.flash>0))qa.picture=ctx.canvas.toDataURL();
        return result;
      }finally{ctx.fillText=fill;}
    };
    await connect('match','','3',id,{},()=>{});
    return net.room.sessionId;
  },weapon);
  return {id,page};
}
try{
  await server.listen(0,'127.0.0.1');
  base='http://127.0.0.1:'+server.transport.server.address().port;
  const rifle=await joinBrowser('2'),guard=await joinBrowser('4');defenderId=guard.id;
  for(let i=0;i<4;i++){
    const c=await new Client(base).joinOrCreate('chillcat_match',{credential:randomBytes(32).toString('hex'),weapon:'1',mapId:'3'});
    peers.push(c);const log={blockEvents:0,sawShield:false,sawBroken:false,sawRecovered:false};peerLogs.push(log);
    c.onMessage('skillEvents',batch=>{log.blockEvents+=batch.filter(e=>e.type==='shield-block'&&e.owner===guard.id).length;});
    c.onMessage('*',()=>{});
    c.onStateChange(state=>{
      const p=state.players.get(guard.id);if(!p)return;
      if(p.shield){log.sawShield=true;if(log.sawBroken)log.sawRecovered=true;}
      if(log.sawShield&&!p.shield&&p.charges===0)log.sawBroken=true;
    });
  }
  await Promise.all(pages.map(p=>p.waitForSelector('body[data-screen=field]')));
  const source=room.members.get(rifle.id),victim=room.members.get(guard.id),state=victim.game.altWeapon;
  assert.equal(source.weapon,'2');assert.equal(victim.weapon,'4');assert.notEqual(source.team,victim.team);
  Object.assign(source.game,{x:-2.5,y:12});Object.assign(victim.game,{x:0,y:12});
  await until(()=>!source.game.zones.protected&&!victim.game.zones.protected,'spawn immunity persisted');await sleep(350);
  await guard.page.mouse.move(200,270);await guard.page.mouse.down({button:'right'});
  await until(()=>state.shield&&Math.cos(state.shieldAngle)<-.99,'right-click did not raise left-facing shield');
  await rifle.page.mouse.move(760,270);const initialHp=victim.hp;
  await rifle.page.mouse.down();await until(()=>state.shieldHp<30,'first frontal rifle shot did not drain shield');await rifle.page.mouse.up();
  await sleep(500);const frontShield=state.shieldHp;
  assert.equal(frontShield,27);assert.equal(victim.hp,initialHp);
  for(const page of pages)await page.waitForFunction(()=>shieldQA.blockLabels>0&&shieldQA.views.some(v=>v.flash>0)&&!!shieldQA.picture);
  // Keep the shield button held and move the defending player's crosshair across the body.
  await guard.page.mouse.move(760,270);await until(()=>state.shield&&Math.cos(state.shieldAngle)>.99,'defender did not turn');
  const count=shieldEvents.length;
  await rifle.page.mouse.down();await until(()=>victim.hp<initialHp,'rear shot incorrectly blocked');await rifle.page.mouse.up();await sleep(400);
  assert.equal(victim.hp,initialHp-3);assert.equal(state.shieldHp,frontShield);assert.equal(shieldEvents.length,count);
  const rearHp=victim.hp;
  await guard.page.mouse.move(200,270);await until(()=>state.shield&&Math.cos(state.shieldAngle)<-.99,'shield orientation did not reset');
  await rifle.page.mouse.down();await until(()=>state.charges===0,'shield did not break under sustained rifle fire');await rifle.page.mouse.up();
  const breakTick=shieldTransitions.find(t=>!t.shield&&t.charges===0);assert(breakTick);assert.equal(breakTick.hp,rearHp);
  assert.equal(shieldEvents.length,10);assert(shieldEvents.every(e=>e.owner===guard.id));
  await until(()=>room.roundClock-breakTick.clock>=6.85,'cooldown stalled');
  assert.equal(state.shield,false);assert.equal(state.charges,0);
  await until(()=>state.shield&&state.charges===1,'shield did not recover with right button held');
  const reopened=shieldTransitions.find(t=>t.shield&&t.clock>breakTick.clock);
  const recovery=reopened.clock-breakTick.clock;assert(Math.abs(recovery-7)<.1,'cooldown '+recovery);
  assert.equal(state.shieldHp,30);
  // Clients receive snapshots less frequently than the server simulates ticks.
  // Keep holding through the first snapshot which shows the restored shield.
  await until(()=>peerLogs.every(peer=>peer.sawRecovered),'shield recovery was not replicated');
  await rifle.page.mouse.down();await until(()=>state.shieldHp<30,'recovered shield did not block');await rifle.page.mouse.up();
  await guard.page.mouse.up({button:'right'});await until(()=>!state.shield,'releasing right click left shield active');await sleep(450);
  const views=[];
  for(const [index,p] of pages.entries()){
    const result=await p.evaluate(()=>({events:shieldQA.events,samples:shieldQA.views,labels:shieldQA.blockLabels,picture:shieldQA.picture}));
    const normal=result.samples.find(x=>x.flash===0),lit=result.samples.filter(x=>x.flash>0);
    assert(normal);assert(lit.length);assert(lit.some(x=>x.kick!==0));
    assert(lit.some(x=>JSON.stringify(x.rgba)!==JSON.stringify(normal.rgba)),'shield never rendered a color change');
    assert.equal(result.events.length,11);assert(result.events.every(e=>e.owner===guard.id));assert(result.labels>0);
    const file='verification/shield-block-'+(index===0?'shooter':'defender')+'.png';
    await writeFile(file,Buffer.from(result.picture.split(',')[1],'base64'));
    views.push({role:index===0?'rifle':'shotgun',events:result.events.length,actualBlockTextDraws:result.labels,brightest:Math.max(...lit.map(r=>r.flash)),baselineColor:normal.rgba,brightenedColor:lit.reduce((a,b)=>a.flash>b.flash?a:b).rgba,screenshot:file});
  }
  for(const log of peerLogs)assert.deepEqual(log,{blockEvents:11,sawShield:true,sawBroken:true,sawRecovered:true});
  assert.deepEqual(errors,[]);
  const report={fixture:'Loopback ephemeral port, two isolated Chrome clients, four SDK peers, M_3. Only positions initialized. Real mouse buttons, aim and elapsed simulation time. Both production renderers observed.',front:{initialHp,finalHp:initialHp,shield:frontShield},rear:{before:initialHp,after:rearHp,shieldBefore:frontShield,shieldAfter:frontShield},break:{blockedRounds:10,clock:breakTick.clock,hp:breakTick.hp},recovered:{clock:reopened.clock,seconds:recovery,hp:30,blockedNextShot:true},views,peerLogs,errors};
  await writeFile('verification/shield-block-room.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error(e);process.exitCode=1;}finally{
  await Promise.allSettled(pages.map(p=>p.evaluate(async()=>{const {disconnect}=await import('/game/rooms.js');await disconnect();})));
  await browser.close();await Promise.allSettled(peers.map(c=>c.leave()));await server.gracefullyShutdown(false);
}
