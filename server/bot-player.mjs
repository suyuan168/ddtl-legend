import {quantumRandom} from '../game/quantum-random.js';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {muzzlePosition} from '../game/damage.js';
import {wallContact} from '../game/wall-contact.js';
import {botMoveDirection} from './bot-navigation.mjs';

const tree=JSON.parse(readFileSync(new URL('../data/views/bot-tree.json',import.meta.url),'utf8'));
const states=new WeakMap();
const FAILED=0, SUCCEEDED=1, RUNNING=2;
const chunkSize=8; // MapManager.SpawnMap -> InitializeGrid, 0x4543d40
const hitTime=0x199a/65536;
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const success=condition=>condition?SUCCEEDED:FAILED;

const roomStreams=new WeakMap();
export function botRandomStream(seed){
  return quantumRandom(seed).fraction;
}
export function randomFor(room){
  if(room.botRandom)return room.botRandom;
  if(room.matchRandom)return room.matchRandom.fraction;
  if(!roomStreams.has(room))roomStreams.set(room,botRandomStream(room.botSeed??randomBytes(4).readInt32LE()));
  return roomStreams.get(room);
}

function stateFor(field){
  if(!states.has(field)) states.set(field,{
    running:[],lines:new Map(),paintTime:0,target:null,destination:null,area:null,
    charging:false,hitTime:0,attacker:null,escape:null,nav:null
  });
  return states.get(field);
}

export function noteBotHit(victim,attacker){
  const state=stateFor(victim.game);
  state.hitTime=hitTime;
  state.attacker=attacker;
}

function cellIndex(f,x,y){
  const col=Math.floor((x-f.left)/f.cell),row=Math.floor((y-f.bottom)/f.cell);
  return col>=0&&row>=0&&col<f.columns&&row<f.rows?row*f.columns+col:-1;
}

function center(f,col,row){
  return {x:f.left+(col+.5)*f.cell,y:f.bottom+(row+.5)*f.cell};
}

function ownPaint(f){
  const i=cellIndex(f,f.x,f.y);
  return i>=0&&!f.paintMask[i]&&(f.teamGrid??f.grid)[i]===f.team;
}

// TryFindPaintArea (454c270) ranks chunks by paintable cell count, then distance.
// TryFindRechargePosition (454d0f0) instead searches concentric square chunk rings.
function findArea(f,recharge){
  if(recharge&&ownPaint(f))return {destination:{x:f.x,y:f.y}};
  const grid=f.teamGrid??f.grid;
  const hereX=Math.floor((f.x-f.left)/f.cell/chunkSize),hereY=Math.floor((f.y-f.bottom)/f.cell/chunkSize);
  let best=null;
  for(let row=0;row<f.rows;row+=chunkSize){
    for(let col=0;col<f.columns;col+=chunkSize){
      const width=Math.min(chunkSize,f.columns-col),height=Math.min(chunkSize,f.rows-row);
      const ring=Math.max(Math.abs(col/chunkSize-hereX),Math.abs(row/chunkSize-hereY));
      if(recharge&&best&&ring>best.ring)continue;
      let score=0,min=Infinity,dest;
      for(let j=0;j<height;j++){
        for(let i=0;i<width;i++){
          const idx=(row+j)*f.columns+col+i;
          if(f.paintMask[idx]||((grid[idx]===f.team)!==recharge))continue;
          score++;
          const pos=center(f,col+i,row+j);
          const dist=(pos.x-f.x)**2+(pos.y-f.y)**2;
          if(dist<min){min=dist;dest=pos;}
        }
      }
      if(!score)continue;
      const area=center(f,col+Math.floor(width/2),row+Math.floor(height/2));
      const d=length(area,f);
      if(recharge?(!best||ring<best.ring||min<best.min):
        (!best||score>best.score||score===best.score&&d<best.d)){
        best={area,destination:dest,score,d,ring,min};
      }
    }
  }
  return best;
}

function clearLine(f,target){
  // 45203b0: cast from origin to muzzle, then from muzzle along the original aim.
  const d=length(f,target);
  if(d<0x290/65536)return true;
  const dx=(target.x-f.x)/d,dy=(target.y-f.y)/d;
  const muzzle=muzzlePosition(f.x,f.y,Math.atan2(dy,dx),f.parametersForWeapon.muzzlePos,d);
  const rest=d-length(f,muzzle);
  const blocks=shape=>shape[8];
  return rest>0&&!wallContact(f.view.physics,f.x,f.y,muzzle.x-f.x,muzzle.y-f.y,0,blocks)
    &&!wallContact(f.view.physics,muzzle.x,muzzle.y,rest*dx,rest*dy,0,blocks);
}

function cachedLine(ctx,node,target){
  const {f,s,dt}=ctx,cache=s.lines.get(node);
  // Native caches the result by behaviour node, without a target identity key.
  if(cache&&(cache.remaining-=dt)>0)return cache.clear;
  const clear=clearLine(f,target);
  s.lines.set(node,{clear,remaining:hitTime});
  return clear;
}

function minimumDistance(f){
  const muzzle=f.parametersForWeapon.muzzlePos;
  return 1+Math.hypot(muzzle?.x??0,muzzle?.y??0);
}

function reachableCell(f,pos){
  const i=cellIndex(f,pos.x,pos.y);
  return i>=0&&!f.blocked(pos.x,pos.y,0,0x199a/65536);
}

function visible(ctx,other){
  const {f,p,range}=ctx;
  return other&&other!==p&&other.team!==p.team&&other.hp>0&&length(f,other.game)<=range
    &&(other.game.zones.bush<0||other.game.zones.bush===f.zones.bush);
}

function aim(ctx,pos,cap=Infinity){
  const {f,input}=ctx,dx=pos.x-f.x,dy=pos.y-f.y;
  input.angle=Math.atan2(dy,dx);
  input.distance=Math.min(cap,Math.hypot(dx,dy));
}

function walk(ctx,pos){
  const {f,s,dt,input}=ctx;
  const dir=botMoveDirection(f,s,pos,dt);
  if(!dir)return false;
  input.dx=dir.dx;input.dy=dir.dy;input.boost=ownPaint(f);
  return true;
}

function enough(ctx){return ctx.f.ink>=ctx.f.w.PaintCost;}
function half(ctx){return ctx.f.ink>=ctx.f.inkCapacity/2;}
function canAttack(ctx,pos,node){
  const {f,s}=ctx;
  if(!pos||!enough(ctx)||(s.charging&&!half(ctx)))return false;
  const d=length(f,pos);
  if(d<minimumDistance(f)||d>f.w.AtkRange){s.lines.delete(node);return false;}
  return cachedLine(ctx,node,pos);
}

function approach(ctx,node){
  const {f,s}=ctx;
  if(!visible(ctx,s.target)||s.charging&&!half(ctx)){
    s.target=null;s.lines.delete(node);return FAILED;
  }
  const target=s.target.game,d=length(f,target);
  aim(ctx,target);
  const minimum=minimumDistance(f);
  if(d<minimum){
    let dx=f.x-target.x,dy=f.y-target.y;
    if(dx*dx+dy*dy<0x290/65536){dx=-Math.cos(f.aim);dy=-Math.sin(f.aim);}
    const len=Math.hypot(dx,dy);
    const dist=minimum-d+.5;
    for(const [x,y] of [[dx,dy],[-dy,dx],[dy,-dx]]){
      const pos={x:f.x+dist*x/len,y:f.y+dist*y/len};
      if(reachableCell(f,pos)){walk(ctx,pos);break;}
    }
    return RUNNING;
  }
  const close=f.w.AtkRange>1?f.w.AtkRange*.75:1;
  if(d>close)s.lines.delete(node);
  else if(cachedLine(ctx,node,target)){s.nav=null;return SUCCEEDED;}
  walk(ctx,target);
  return RUNNING;
}

function flee(ctx,node){
  const {s,f,random,dt}=ctx;
  const source=s.attacker?.game;
  if(s.hitTime>0&&source&&canAttack(ctx,source,node)){s.escape=null;return FAILED;}
  if(!s.escape){
    if(s.hitTime<=0||!source)return FAILED;
    let dx=f.x-source.x,dy=f.y-source.y;
    if(dx*dx+dy*dy<0x290/65536){dx=Math.cos(f.aim);dy=Math.sin(f.aim);}
    const magnitude=Math.hypot(dx,dy);dx/=magnitude;dy/=magnitude;
    let pos={x:f.x+dx*3,y:f.y+dy*3};
    if(!reachableCell(f,pos)){
      // TryFindRunAwayPosition: 24 samples, dot>=1/4; rank by dot+distance²/radius².
      pos=null;let best=-Infinity;
      for(let i=0;i<24;i++){
        const x=(2*random()-1)*3,y=(2*random()-1)*3,r=Math.hypot(x,y);
        if(r*r<0x290/65536||r>3)continue;
        const dot=(dx*x+dy*y)/r,candidate={x:f.x+x,y:f.y+y},score=dot+r*r/9;
        if(dot>=.25&&score>best&&reachableCell(f,candidate)){pos=candidate;best=score;}
      }
    }
    if(!pos)return FAILED;
    s.escape={pos,remaining:1};s.nav=null;
  }
  const {pos}=s.escape;
  if((s.escape.remaining-=dt)<=0||length(f,pos)<=.5){s.escape=null;return SUCCEEDED;}
  aim(ctx,pos);
  if(!walk(ctx,pos)){s.escape=null;return FAILED;}
  return RUNNING;
}

function leaf(ctx,node,name){
  const {f,s,input,room,dt,random}=ctx;
  switch(name){
    case 'Is Under Attack': return success(s.hitTime>0);
    case 'Has Target':
      if(!visible(ctx,s.target)||!room.members.has(s.target.id))s.target=null;
      return success(s.target);
    case 'Search Target': {
      let distance=ctx.range;
      s.target=null;
      for(const other of room.members.values()){
        if(!visible(ctx,other))continue;
        const d=length(f,other.game);
        if(d<distance){distance=d;s.target=other;}
      }
      return success(s.target);
    }
    case 'Can Attack': return success(canAttack(ctx,s.target?.game,node));
    case 'Attack Target':
      if(!s.target||s.charging&&!half(ctx))return FAILED;
      aim(ctx,s.target.game);input.fire=true;return SUCCEEDED;
    case 'Move To Target': return approach(ctx,node);
    case 'Run Away': return flee(ctx,node);
    case 'Has Enough Paint': return success(enough(ctx)&&(!s.charging||half(ctx)));
    case 'Has Paint Target': return success(s.area);
    case 'Find Recharge Position':
    case 'Find Paint Position': {
      const recharge=name==='Find Recharge Position';
      const found=findArea(f,recharge);
      s.destination=found?.destination;
      s.area=recharge?null:found?.area;
      if(found)s.nav=null;
      return success(found);
    }
    case 'Move To Position':
      if(!s.destination)return FAILED;
      aim(ctx,s.destination);
      if(length(f,s.destination)>Math.max(.5,f.player.MoveSpeed*dt)&&walk(ctx,s.destination))return RUNNING;
      return SUCCEEDED;
    case 'Recharge Paint':
      s.target=null;s.area=null;s.destination=null;
      if(s.hitTime>0||half(ctx)||!ownPaint(f)){
        s.charging=false;
        return success(half(ctx)&&s.hitTime<=0);
      }
      s.charging=true;input.boost=true;return RUNNING;
    case 'Paint Position': {
      if(!s.area||s.charging&&!half(ctx))return FAILED;
      aim(ctx,s.area);
      s.paintTime+=dt;
      if(s.paintTime>=1.5||!enough(ctx)){
        s.paintTime=0;s.area=null;s.destination=null;return SUCCEEDED;
      }
      const span=6*f.cell;
      aim(ctx,{x:s.area.x+(random()-.5)*span,y:s.area.y+(random()-.5)*span},f.w.AtkRange);
      input.fire=true;return RUNNING;
    }
    default: throw new Error('Unmapped Common Player node '+name);
  }
}

function tick(ctx,index){
  const {name,children,memory}=tree[index];
  if(!children.length)return leaf(ctx,index,name);
  if(name==='Inverter'){
    const result=tick(ctx,children[0]);
    return result===RUNNING?RUNNING:1-result;
  }
  const slot=memory<0?index:memory;
  const stop=name==='Selector'?SUCCEEDED:FAILED;
  for(let i=ctx.s.running[slot]??0;i<children.length;i++){
    const result=tick(ctx,children[i]);
    if(result===RUNNING){ctx.s.running[slot]=i;return RUNNING;}
    if(result===stop){ctx.s.running[slot]=0;return stop;}
  }
  ctx.s.running[slot]=0;
  return 1-stop;
}

export function updateBotInput(p,room,dt){
  const f=p.game;
  if(f.ventTransfer)states.delete(f);
  const s=stateFor(f);
  const input={dx:0,dy:0,angle:f.aim,distance:0,fire:false,alt:false,boost:false};
  const range=f.w.SearchRange||f.player.SearchRange||f.w.AtkRange*2;
  tick({p,f,s,room,dt,range,input,random:randomFor(room)},0);
  s.hitTime=Math.max(0,s.hitTime-dt);
  p.input=input;
  p.inputAt=Date.now();
  return input;
}
