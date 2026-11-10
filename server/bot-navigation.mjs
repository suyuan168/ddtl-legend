import {readFileSync} from 'node:fs';
import {intersectsDisc} from '../game/drops.js';

const Q=65536;
const sq=r=>Math.floor((r*r+32768)/Q);
function squared(a,b){
  return sq(Math.round((a.x-b.x)*Q))+sq(Math.round((a.y-b.y)*Q));
}
// FPVector2.Distance -> FPMath.SqrtRaw. The integer expression for the lookup
// value was checked against all 65,537 entries of the original FPSqrt.bytes.
function distance(a,b){
  const value=squared(a,b);
  const shift=value<=Q?0:(Math.floor(Math.log2(value))&~1)-14;
  const lookup=Math.round(Math.sqrt(Math.floor(value/2**shift))*16384);
  return Math.floor(lookup*2**(shift/2)/64);
}
const maps=JSON.parse(readFileSync(new URL('../data/views/bot-waypoints.json',import.meta.url),'utf8'));
for(const map of Object.values(maps)){
  map.nodes=map.nodes.map(([rx,ry,neighbors],index)=>({index,x:rx/Q,y:ry/Q,neighbors}));
  for(const node of map.nodes)node.weights=node.neighbors.map(i=>distance(node,map.nodes[i]));
}

export function botNodes(field){return maps[field.map.MapData]?.nodes??[];}
export function nearestBotNode(field,point){
  const nodes=botNodes(field);
  let best=-1,min=Infinity;
  for(const node of nodes){
    const d=squared(node,point);
    if(d<min){min=d;best=node.index;}
  }
  return best;
}

// TryFindNextPathNode uses A* with comparison by (f-score, original node index).
// Keep the first equal-cost predecessor as TryVisitNode does.
export function botPath(nodes,start,goal){
  if(!nodes[start]||!nodes[goal])return [];
  if(start===goal)return [start];
  const previous=new Int32Array(nodes.length).fill(-1),cost=new Float64Array(nodes.length).fill(Infinity);
  const score=new Float64Array(nodes.length).fill(Infinity),closed=new Uint8Array(nodes.length),open=new Set([start]);
  cost[start]=0;score[start]=distance(nodes[start],nodes[goal]);
  while(open.size){
    let index=-1,min=Infinity;
    for(const i of open)if(score[i]<min||score[i]===min&&i<index){index=i;min=score[i];}
    if(index===goal){
      const path=[];
      for(let i=index;i>=0;i=previous[i])path.push(i);
      return path.reverse();
    }
    open.delete(index);closed[index]=1;
    const n=nodes[index];
    for(let j=0;j<n.neighbors.length;j++){
      const i=n.neighbors[j],candidate=cost[index]+n.weights[j];
      if(closed[i]||candidate>=cost[i])continue;
      cost[i]=candidate;score[i]=candidate+distance(nodes[i],nodes[goal]);
      previous[i]=index;open.add(i);
    }
  }
  return [];
}
export function canBotReach(field,from,to){
  if(squared(from,to)<0x290)return true;
  if(to.x<field.left||to.x>field.left+field.width||to.y<field.bottom||to.y>field.bottom+field.height)return false;
  const map=maps[field.map.MapData];
  if(!map)return true;
  if(map.blockingDecos.some(i=>intersectsDisc(field.view.decoShapes[i],to.x,to.y,0x199a/Q)))return false;
  return botPath(map.nodes,nearestBotNode(field,from),nearestBotNode(field,to)).length>0;
}
function reached(current,next,point){
  if(squared(next,point)<=0x4000)return true;
  if(current===next)return false;
  const dx=Math.round((next.x-current.x)*Q),dy=Math.round((next.y-current.y)*Q);
  const len=sq(dx)+sq(dy);
  const dot=Math.floor((Math.round((point.x-current.x)*Q)*dx+32768)/Q)+
            Math.floor((Math.round((point.y-current.y)*Q)*dy+32768)/Q);
  return len>=0x290&&dot>=len;
}
export function botMoveDirection(field,state,destination,dt){
  if(squared(field,destination)<0x290){state.nav=null;return null;}
  const nodes=botNodes(field);
  let aim=destination;
  if(nodes.length){
    const goal=nearestBotNode(field,destination),nav=state.nav??={current:-1,goal:-1,next:-1,time:0};
    nav.time-=dt;
    const passed=nav.next>=0&&reached(nodes[nav.current],nodes[nav.next],field);
    if(passed)nav.current=nav.next;
    if(passed||nav.next<0||nav.goal!==goal||nav.time<=0){
      if(nav.current<0)nav.current=nearestBotNode(field,field);
      const path=botPath(nodes,nav.current,goal);
      if(!path.length){state.nav=null;return null;}
      nav.goal=goal;nav.next=path[1]??goal;nav.time=0x3333/Q;
    }
    if(nav.current!==goal)aim=nodes[nav.next];
  }
  const dx=aim.x-field.x,dy=aim.y-field.y,length=Math.hypot(dx,dy);
  return length>0?{dx:dx/length,dy:dy/length}:null;
}
