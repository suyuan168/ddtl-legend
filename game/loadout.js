// WeaponSelectViewModel.HasRequiredSkillSelection (ac52e0) requires one of each type.
export function skillLoadout(tables, weapon, kit, repair=false){
  const allowed=weapon.SkillList.split('|');
  const choices={};
  for(const [index,[slot,type]] of [['bomb','Bomb'],['ultimate','Ultra']].entries()){
    const valid=id=>allowed.includes(id)&&tables.Skill.some(row=>row.Id===id&&row.SkillType===type);
    const preferred=weapon.RecommendSkill.split('|')[index];
    choices[slot]=valid(kit[slot])?kit[slot]:repair&&valid(preferred)?preferred:'';
  }
  return choices;
}
