// RuntimePlayer::.cctor's ten array stores, resolved against the shipped metadata string table.
const names=['Aiden','Blake','Chloe','Dylan','Ethan','Harper','Logan','Mason','Nova','Quinn'];
const slots=['Head','Body','Skin'];

// RuntimePlayer.GetRandomIndex and its inlined call sites use signed 32-bit arithmetic.
function select(rows,slot,seed,salt){
  const n=(Math.imul(Math.imul(slot,31)+seed,31)+salt)|0;
  return rows[((n^(n>>16))&0x7fffffff)%rows.length];
}

export function botLoadout(tables,slot,seed){
  const skillTypes=new Map(tables.Skill.map(s=>[s.Id,s.SkillType]));
  const choices=(w,type)=>w.SkillList.split('|').filter(id=>skillTypes.get(id)===type);
  const weapons=tables.Weapon.filter(w=>w.WeaponType==='Normal'&&choices(w,'Bomb').length&&choices(w,'Ultra').length);
  const w=select(weapons,slot,seed,0x7bb18);
  const items=new Set(tables.Item.filter(i=>i.Type==='Costume'&&i.NoUse!=='True').map(i=>i.Id));
  const outfit=Object.fromEntries(slots.map((key,index)=>{
    const pool=tables.ItemAsset.filter(i=>i.CostumeType===key&&i.IsHide!=='True'&&items.has(i.Id));
    return [key,select(pool,slot,seed,0x7bc44+index)?.Id??(key==='Skin'?'30001':'')];
  }));
  return {name:select(names,slot,seed,0x7bab4),weapon:w.Id,outfit,kit:{
    bomb:select(choices(w,'Bomb'),slot,seed,0x7bb7c),ultimate:select(choices(w,'Ultra'),slot,seed,0x7bbe0)
  }};
}
