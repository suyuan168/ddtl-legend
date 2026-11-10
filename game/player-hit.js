import {particleCurve} from './weapon-view.js';
import {dummyAngle} from './dummy-feedback.js';

function localCurve(keys,time,fallback){
  if(!keys)return fallback;
  for(let i=1;i<keys.length;i++){
    if(time<keys[i][0]){
      if(keys[i-1][3]===null||keys[i][2]===null)return keys[i-1][1];
      break;
    }
  }
  return particleCurve(keys,time,fallback);
}

// Compose Head's new local Euler Z with its animated parent and scale, preserving its pivot.
export function rotateHead(m,head,tracks,time,angle){
  const local=localCurve(tracks.angle,time,0)*Math.PI/180;
  const sx=localCurve(tracks.x,time,1),sy=localCurve(tracks.y,time,1);
  const [a,b,c,d,x,y]=head,det=a*d-b*c;
  if(!sx||!sy||!det)return m;
  const cs=Math.cos(angle-local),sn=Math.sin(angle-local);
  const aa=a*cs+c*(sx/sy)*sn,bb=b*cs+d*(sx/sy)*sn;
  const cc=c*cs-a*(sy/sx)*sn,dd=d*cs-b*(sy/sx)*sn;
  const A=(aa*d-cc*b)/det,B=(bb*d-dd*b)/det,C=(cc*a-aa*c)/det,D=(dd*a-bb*c)/det;
  const [i,j,k,l,e,f]=m;
  return [A*i+C*j,B*i+D*j,A*k+C*l,B*k+D*l,x+A*(e-x)+C*(f-y),y+B*(e-x)+D*(f-y)];
}
export class PlayerHit {
  constructor(data,feedback){this.data=data;this.feedback=feedback;this.hits=new Map();}
  impact(event,color,now){
    this.feedback.impactParticles(event.x,event.y,color);
    this.hits.set(event.owner,{start:now,sign:event.sign});
  }
  render(art,pose,time,angle){
    if(angle==null||!art?.withHeadTransform)return art;
    return art.withHeadTransform((m,head)=>rotateHead(m,head,this.data.poses[pose],time,angle));
  }
  reset(owner){this.hits.delete(owner);}
  angle(owner,now){
    const hit=this.hits.get(owner);
    if(!hit)return null;
    const age=Math.max(0,now-hit.start);
    if(age>=2*this.feedback.data.halfTurnSeconds){this.reset(owner);return null;}
    return dummyAngle({hitAge:age,hitSign:hit.sign},this.feedback.data);
  }
}
