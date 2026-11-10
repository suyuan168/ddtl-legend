import {FRAME_SECONDS} from './combat-clock.js';

export const net={chat:[],yardPeers:new Map(),room:null,last:null,marks:[],skillEvents:[],paintMatch:null,paintCursor:0,pending:false,sendAt:0,lastInput:null,notice:'',reset:false};
export function credential(){
  let token=localStorage.getItem('chill-account');
  if(!/^[a-f0-9]{64}$/.test(token||'')){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('chill-account',token);}
  return token;
}
export function playerName(){
  let name=localStorage.getItem('chill-display-name');
  if(!name){const digits=crypto.getRandomValues(new Uint32Array(1))[0];name=String(10000000+digits%90000000);localStorage.setItem('chill-display-name',name);}
  return name;
}
export async function connect(kind,code,mapId,weapon,outfit,onLeave){
 if(net.pending||net.room)return;net.pending=true;
 try{
   const client=new Colyseus.Client(location.origin),opts={mapId,weapon,outfit,name:playerName(),credential:credential()};
   const room=kind==='create'?await client.create('chillcat',opts):kind==='match'?await client.joinOrCreate('chillcat_match',opts):await client.joinById(code.trim().toUpperCase(),opts);
   room.reconnection.minUptime=0;
   Object.assign(net,{room,quick:kind==='match',started:performance.now(),last:null,marks:[],skillEvents:[],notice:'',paintMatch:null,paintCursor:0,reset:true,lastInput:null});
   function beginPaint(matchId){
     Object.assign(net,{paintMatch:matchId,paintCursor:0,marks:[],reset:true});
   }
   net.chat=[];net.yardPeers.clear();net.yardSent=null;net.yardAt=0;
   room.onMessage('yardPose',p=>{if(room===net.room)net.yardPeers.set(p.id,p);});
   room.onMessage('chat',m=>{if(room===net.room){if(m.pose)net.yardPeers.set(m.id,m.pose);net.chat.push(m);}});
   room.onMessage('board',board=>{if(room===net.room)beginPaint(board.matchId);});
   room.onMessage('skillEvents',ev=>{if(room===net.room)net.skillEvents.push(...ev);});
   room.onMessage('paint',batch=>{
     if(room!==net.room||batch.matchId!==net.paintMatch)return;
     if(batch.start>net.paintCursor){
       net.paintMatch=null;room.send('sync');return;
     }
     // A snapshot can already include some or all of the next live broadcast.
     for(let i=net.paintCursor-batch.start;i<batch.marks.length;i++){
       net.marks.push(batch.marks[i]);net.paintCursor++;
     }
   });
   room.onMessage('reset',msg=>{if(room===net.room)beginPaint(msg.matchId);});
   room.onDrop(()=>{net.notice='连接中断，正在重连';});room.onReconnect(()=>{if(room===net.room){net.notice='';net.lastInput=null;}});
   room.onLeave(()=>{if(room!==net.room)return;Object.assign(net,{room:null,last:null,marks:[],skillEvents:[],paintMatch:null,paintCursor:0,notice:'已离开房间'});onLeave();});
   return await new Promise((resolve,reject)=>{
     const timeout=setTimeout(()=>{room.leave();reject(Error('房间同步超时'));},10000);
     const update=state=>{if(!state?.mapId)return;
       const next=state.toJSON();next.players=Object.values(next.players||{});
       for(const id of net.yardPeers.keys())if(!next.players.some(p=>p.id===id))net.yardPeers.delete(id);
       net.last=next;clearTimeout(timeout);resolve(next);
     };
     room.onStateChange(update);update(room.state);room.send('sync');
   });
 }finally{net.pending=false;}
}
export function sendInput(input){
  if(!net.room?.connection.isOpen)return;
  const now=performance.now(),elapsed=now-net.sendAt,last=net.lastInput;
  const sameControls=last&&last.dx===input.dx&&last.dy===input.dy&&last.alt===input.alt&&
    last.boost===input.boost&&last.fire===input.fire;
  if(sameControls&&elapsed<200){
    if(last.angle===input.angle&&last.distance===input.distance)return;
    if(elapsed<1000*FRAME_SECONDS-1)return;
  }
  net.room.send('input',input);
  net.lastInput=input;net.sendAt=now;
}
export async function disconnect(){const room=net.room;Object.assign(net,{room:null,last:null,marks:[],skillEvents:[],paintMatch:null,paintCursor:0});if(room)await room.leave();}

export function sendYardPose(x,y,angle,moving){
  if(net.last?.phase!=='waiting'||!net.room?.connection.isOpen)return;
  const now=performance.now(),prior=net.yardSent;
  if(now-net.yardAt<100||now-net.yardAt<1000&&prior&&prior.x===x&&prior.y===y&&prior.angle===angle&&prior.moving===moving)return;
  net.yardAt=now;net.yardSent={x,y,angle,moving};net.room.send('yardPose',net.yardSent);
}
