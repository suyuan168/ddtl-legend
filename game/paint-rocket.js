// E_5_View.OnUpdateView. Positive horizontal throws spin clockwise in Unity world space.
// The drawing faces left at rest. On the ground its local +X axis points away from its destination.
export function rocketRotation(effect){
  if(effect.flying)return (Math.cos(effect.angle)<-1e-8?1:-1)*2*Math.PI*(effect.phaseTime||0);
  const target=effect.target;
  return Math.PI+(target?Math.atan2(target.y-effect.y,target.x-effect.x):effect.angle);
}
