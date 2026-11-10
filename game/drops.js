import {fixedSqrtRaw} from './damage.js';

const Q=65536;
const DROP_RADIUS_RAW=45875;
const product=(a,b)=>Math.floor((a*b+Q/2)/Q);

// GameItemSystem.IsValidGameItemPosition checks the map decorations. Each
// decoration on the four battle maps is a box; BoxCircle.Check is RVA 443a880.
export function blocksDrop(shape,x,y){
  const [kind,cx,cy,c,s,w,h]=shape;
  if(kind!==4)return intersectsDisc(shape,x,y,DROP_RADIUS_RAW/Q);
  const dx=Math.round((x-cx)*Q),dy=Math.round((y-cy)*Q);
  const width=Math.round(w*Q),height=Math.round(h*Q);
  const diagonal=fixedSqrtRaw(product(width,width)+product(height,height));
  const bound=diagonal+DROP_RADIUS_RAW;
  if(product(dx,dx)+product(dy,dy)>=product(bound,bound))return false;
  const cos=Math.round(c*Q),sin=Math.round(s*Q);
  const gx=Math.max(0,Math.abs(product(dx,cos)+product(dy,sin))-width);
  const gy=Math.max(0,Math.abs(product(dy,cos)-product(dx,sin))-height);
  return product(gx,gx)+product(gy,gy)<=Math.floor(DROP_RADIUS_RAW**2/Q);
}

export function intersectsDisc(shape,x,y,radius){
  const [kind,cx,cy,c,s,w,h]=shape,dx=x-cx,dy=y-cy;
  if(kind===1)return dx*dx+dy*dy<=(w+radius)**2;
  let extentX=w,extentY=h;
  if(kind===32){
    extentX=Math.max(0,(w-h)/2);extentY=Math.max(0,(h-w)/2);radius+=Math.min(w,h)/2;
  }
  const gapX=Math.max(0,Math.abs(dx*c+dy*s)-extentX);
  const gapY=Math.max(0,Math.abs(dy*c-dx*s)-extentY);
  return gapX*gapX+gapY*gapY<=radius*radius;
}

// ZN_7 starts its exit timer only after the player's first trip out of their own base.
// ZN_12 is enter-driven. Standing on a pad after its effect expires cannot restart it.
export class MapZones {
  constructor(field){
    const value=(id,key)=>{
      const row=field.tables.Zone.find(zone=>zone.Id===id);
      const v=Number(row.Values.split('|')[row.Types.split('|').indexOf(key)]);
      return Math.trunc(v*65536)/65536;
    };
    this.boostAmount=value('12','ValueA');this.boostDuration=value('12','ValueB');
    this.spawnDuration=value('7','ValueA');this.insidePads=new Set();
    this.speedTime=0;this.exitTime=0;this.startedInSpawn=false;this.leftSpawn=false;this.bush=-1;
  }
  get hidden(){return this.bush!==-1;}
  get protected(){return this.startedInSpawn||this.exitTime>0;}
  get speedBonus(){return this.speedTime>0?this.boostAmount:0;}
  step(dt,field){
    this.speedTime=Math.max(0,this.speedTime-dt);this.exitTime=Math.max(0,this.exitTime-dt);
    let insideSpawn=false,bush=-1;
    const pads=new Set();
    for(const zone of field.view.triggerZones||[]){
      if(!intersectsDisc(zone.shape,field.x,field.y,field.view.playerRadius))continue;
      if(zone.id==='7'&&zone.team===field.team)insideSpawn=true;
      if(zone.id==='14')bush=zone.entity;
      if(zone.id==='12'){
        pads.add(zone.entity);
        if(!this.insidePads.has(zone.entity)&&!this.speedTime)this.speedTime=this.boostDuration;
      }
    }
    if(this.startedInSpawn&&!insideSpawn){this.leftSpawn=true;this.exitTime=this.spawnDuration;}
    this.startedInSpawn=insideSpawn&&!this.leftSpawn;
    this.bush=bush;this.insidePads=pads;
  }
}

export class MapDrops {
  constructor(field){
    const mode=field.tables.GameMode.find(row=>row.Enum===field.map.ModeType);
    this.interval=Number(mode?.ItemDropIntervalTime)||0;
    this.batch=Number(mode?.ItemDropCount)||0;
    this.timer=this.interval;this.pending=0;this.next=0;this.items=[];this.events=[];
    const weights=(field.map.Percentage||'').split('|').map(Number);
    this.itemIds=(field.map.GameItemID||'').split('|').map(name=>field.tables.GameItem.find(item=>item.Enum===name)?.Id);
    let total=0;
    this.weightEnds=weights.map(weight=>(total+=weight));
    this.totalWeight=total;
  }
  chooseItem(field){
    // RandomExtension.GetRandomSingleIdx (452c7f0) uses an unbiased integer roll.
    if(this.itemIds.length&&this.totalWeight>0){
      const roll=field.rng.nextInt(0,this.totalWeight);
      const index=this.weightEnds.findIndex(end=>roll<end);
      if(this.itemIds[index])return this.itemIds[index];
    }
    return String(field.rng.nextInt(1,1+field.tables.GameItem.length));
  }
  step(dt,field){
    this.events.length=0;
    if(!this.interval)return;
    const delta=Math.round(dt*Q)/Q;
    for(const item of this.items){
      if(item.y<=item.landY)continue;
      item.y=Math.max(item.landY,item.y-Math.round(item.speed*delta*Q)/Q);
      if(item.y===item.landY)this.events.push({type:'drop-impact',x:item.x,y:item.landY});
    }
    this.timer-=delta;
    if(this.timer<=0){
      this.pending+=this.batch;this.timer=this.interval;
      if(this.next<0)this.next=0;
      // StartItemDrop emits one UFO event for the entire batch. Its GameScene root is at zero.
      this.events.push({type:'drop-ship',x:0,y:0});
    }
    if(!this.pending||(this.next-=delta)>0)return;
    this.pending--;this.next=this.pending?1:0;
    const id=this.chooseItem(field);
    for(let i=0;i<10;i++){
      // Each rejected candidate consumes both draws before taking another pair.
      const x=field.left+Math.round((field.rng.nextUInt32()>>>16)*field.width)/Q;
      const y=field.bottom+Math.round((field.rng.nextUInt32()>>>16)*field.height)/Q;
      // 4569f10 checks Has<MapDecoComponent> using a 0.7-world-unit query.
      // This also encompasses CanMoveTo's smaller (0x199a/Q) MapDeco query.
      if(field.view.decoShapes.some(shape=>blocksDrop(shape,x,y)))continue;
      const {values,radius}=field.itemTypes.get(id);
      this.items.push({id,x,y:field.bottom+field.height+5,landY:y,radius,speed:values.MoveSpeed});
      break;
    }
  }
  collect(field){
    this.items=this.items.filter(item=>{
      // 456a170 checks !Has<MovementComponent> before delivering the pickup.
      if(item.y>item.landY||Math.hypot(item.x-field.x,item.y-field.y)>item.radius+field.view.playerRadius)return true;
      field.applyItem(item);return false;
    });
  }
}
