// ControlSystem.ApplyInput rounds each 16.16 squared component before summing.
export function hasMoveInput(dx,dy){
  const x=Math.trunc(dx*65536),y=Math.trunc(dy*65536);
  return Math.round(x*x/65536)+Math.round(y*y/65536)>0x28f;
}

// ControlSystem.ApplyInput (455fb00) tests actual-or-pending before and
// after updating Space. Only the shotgun may interrupt the earlier state.
export function updateBoard(field, dt, input) {
  const usingSkill = field.skills.armed || field.skills.active;
  const wasBoarding = field.boosting || field.boostTimer > 0;
  const shieldInterrupt = !usingSkill && field.weapon.Id === '4' && input.alt && wasBoarding;
  if (usingSkill) {
    field.boostTimer = 0;
    field.boosting = false;
  } else if (!shieldInterrupt && !field.altWeapon.shield && !field.rolling && field.charge === 0) {
    if (!input.boost) {
      field.boostTimer = 0;
      field.boosting = false;
    } else if (!field.boosting) {
      if (field.boostTimer === 0) {
        field.boostTimer = 0x2b83 / 65536;
      } else if ((field.boostTimer -= dt) <= 0) {
        field.boostTimer = 0;
        field.boosting = true;
      }
    }
  }
  return shieldInterrupt || (!field.boosting && field.boostTimer === 0);
}
