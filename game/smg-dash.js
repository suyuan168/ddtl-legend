import {wallContact} from './wall-contact.js';
import {hasMoveInput} from './board-controls.js';

// W_1.AltAttack (4578680) takes the current move direction or the last one.
// DashComponent.UpdateDash (4534ff0) caps travel at ValueA and aborts on a wall.
export class SmgDash {
  constructor(field){this.field=field;this.direction=null;this.lastDirection=null;this.started=false;}
  step(dt,input,pressed){
    this.started=false;
    const f=this.field;
    if(hasMoveInput(input.dx,input.dy)){
      const length=Math.hypot(input.dx,input.dy);
      this.lastDirection=[input.dx/length,input.dy/length];
    }
    if(!this.direction&&pressed&&this.lastDirection){
      this.direction=[...this.lastDirection];this.angle=Math.atan2(this.direction[1],this.direction[0]);this.started=true;this.age=0;this.left=f.w.ValueA;
    }
    if(!this.direction)return false;
    const direction=this.direction;
    this.age+=dt;
    if(this.age>0x1999/65536||this.left<=0){this.direction=null;return false;}
    // DashComponent.UpdateDash uses the final MoveSpeed (including terrain and hit effects).
    const distance=Math.min(this.left,dt*7*f.groundMoveSpeed);
    if(distance<=0)return true;
    const [vx,vy]=direction,dx=vx*distance,dy=vy*distance;
    const hit=wallContact(f.view.physics,f.x,f.y,dx,dy,0,s=>s[7]);
    const travel=hit?distance*hit.t-.5:distance;
    const x=f.x+vx*travel,y=f.y+vy*travel;
    if(x>=f.left&&x<=f.left+f.width&&y>=f.bottom&&y<=f.bottom+f.height&&!f.blocked(x,y,0,0x199a/65536)){
      f.x=x;f.y=y;f.splat(x,y,f.w.PaintSize);
    }else{this.direction=null;return true;}
    this.left-=distance;
    if(hit||this.left<=0)this.direction=null;
    return true;
  }
}
