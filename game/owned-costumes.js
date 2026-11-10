export const defaultOutfit={Head:'',Body:'',Skin:'30001'};
// PlayerView.SetCostumeByID falls back to 30001 when no skin is equipped.
export function equippedCostumes(value,owned,assets){
 const outfit={...defaultOutfit};
 for(const slot of Object.keys(outfit)){
  const id=value?.[slot];
  if(owned.has(id)&&assets.some(a=>a.Id===id&&a.CostumeType===slot&&a.IsHide!=='True'))outfit[slot]=id;
 }
 return outfit;
}
