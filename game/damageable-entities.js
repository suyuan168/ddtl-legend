// SK_1..SK_5 assign EntityComponent, Table Entity stats and the thrower's TeamComponent.
// Keep weapon and skill contact queries separate from TargetableComponent lock-on queries.
export function deployedWeapons(field){
  return field.skills.objects.filter(o=>o.stats?.Hp>0&&o.life>0);
}

// Return blasts to the caller so hit processing, sound and paint remain attributed to the
// deploying player even when the attack occurs between two different players' ticks.
export function damageDeployable(field,o,damage){
  if(!(damage>0)||!(o.stats?.Hp>0)||o.life<=0||!field.skills.objects.includes(o))return [];
  // SK_1/2/4/5 add InvincibleComponent for the initial throw. E_6's subsequent
  // hops add MovementComponent only, so the soda can still be hit while rebounding.
  if(o.id!=='3'&&!o.jumpSpeed&&(o.travel>0||o.drop>0))return [];
  o.hp=Math.max(0,(o.hp??o.stats.Hp)-damage);
  const died=o.hp===0;
  if(died){
    o.life=0;
    field.skills.objects.splice(field.skills.objects.indexOf(o),1);
  }
  // EntityComponent.TakeDamage dispatches OnAttacked before OnDied. E_6 overrides
  // both, and its death callback explicitly invokes OnAttacked a second time.
  let count=o.id==='5'?1+Number(died):0;
  if(o.id==='1'&&died)count=1;
  const blasts=[];
  for(let i=0;i<count;i++){
    const e=o.stats;
    field.splat(o.x,o.y,e.PaintSize);
    blasts.push({
      event:{type:'explode',id:o.id,x:o.x,y:o.y,team:field.team},
      hit:{x:o.x,y:o.y,damage:e.Atk,radius:e.AtkRange,floor:e.ExplodeDamageFloor,inner:e.ExplodeRange}
    });
  }
  return blasts;
}
