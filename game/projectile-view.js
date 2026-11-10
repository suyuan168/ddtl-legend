// BulletView.ApplyRootScaleXByMovementDistance. X gains a world-space delta on the
// original child transform, while its Y scale and sprite pivot remain unchanged.
export function projectileLayer(shot,part,view,color) {
  const m=[...part.m],distance=shot.travelled||0,range=distance+(shot.left||0);
  if(view.stretch&&range>0){
    const [delta,growUntil,shrinkFrom]=view.stretch;
    const grow=Math.min(1,distance/growUntil),shortRange=Math.min(1,range/1.5);
    const shrink=Math.max(0,Math.min(1,(1-distance/range)/(1-shrinkFrom)));
    m[0]+=delta*grow*shortRange*shrink;
  }
  return {...part,m,color:part.path===view.tintPath?color:part.color};
}
