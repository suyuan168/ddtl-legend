// Earliest contact of a swept disc with Quantum's oriented boxes, circles or capsules.
// In local space all three are rectangles with a circular Minkowski boundary.
export function wallContact(shapes,x,y,dx,dy,r,filter){
  const eps=1e-9;
  if(dx*dx+dy*dy<=eps*eps)return null;
  let first=null;
  for(const shape of shapes){
    if(!filter(shape))continue;
    const [kind,cx,cy,c,s,w,h]=shape;
    const px=(x-cx)*c+(y-cy)*s,py=(y-cy)*c-(x-cx)*s,vx=dx*c+dy*s,vy=dy*c-dx*s;
    let ax=w,ay=h,rad=r;
    if(kind===1){ax=ay=0;rad+=w;}
    else if(kind===32){ax=Math.max(0,(w-h)/2);ay=Math.max(0,(h-w)/2);rad+=Math.min(w,h)/2;}
    if(Math.abs(px)>ax+rad+Math.abs(vx)||Math.abs(py)>ay+rad+Math.abs(vy))continue;
    const add=(t,nx,ny)=>{
      if(t< -eps||t>1+eps||(first&&t>=first.t)||vx*nx+vy*ny>=-eps)return;
      first={t:Math.max(0,Math.min(t,1)),nx:c*nx-s*ny,ny:s*nx+c*ny};
    };
    const qx=px-Math.max(-ax,Math.min(ax,px)),qy=py-Math.max(-ay,Math.min(ay,py)),d=Math.hypot(qx,qy);
    if(d<=rad+eps){
      // ZN_7 is an enter trigger: a bomb thrown from inside the spawn zone can leave it.
      if(shape[9])continue;
      if(d>eps)add(0,qx/d,qy/d);
      else if(ax-Math.abs(px)<ay-Math.abs(py))add(0,Math.sign(px)||-Math.sign(vx),0);
      else add(0,0,Math.sign(py)||-Math.sign(vy));
      continue;
    }
    for(const sign of [-1,1]){
      if(vx*sign<0){const t=(sign*(ax+rad)-px)/vx;if(Math.abs(py+t*vy)<=ay+eps)add(t,sign,0);}
      if(vy*sign<0){const t=(sign*(ay+rad)-py)/vy;if(Math.abs(px+t*vx)<=ax+eps)add(t,0,sign);}
    }
    for(const i of [-1,1])for(const j of [-1,1]){
      const a=vx*vx+vy*vy,rx=px-i*ax,ry=py-j*ay,b=rx*vx+ry*vy,disc=b*b-a*(rx*rx+ry*ry-rad*rad);
      if(disc<0||!rad)continue;
      const t=(-b-Math.sqrt(disc))/a,nx=(rx+t*vx)/rad,ny=(ry+t*vy)/rad;
      if(nx*i>=-eps&&ny*j>=-eps)add(t,nx,ny);
    }
  }
  return first;
}
