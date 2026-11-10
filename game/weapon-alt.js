import {wallContact} from './wall-contact.js';
import {SmgDash} from './smg-dash.js';
import {hasMoveInput} from './board-controls.js';

const Q = 65536;
const passTime = 0x3333 / Q;
const all = () => true;

// MapManager.CanWallPass checks MapDeco flags in the entire forward cast,
// then finds a clear landing just beyond a passable wall's far face.
function passDestination(field, decos, ux, uy) {
  const reach = 4.5, back = 0x199a / Q;
  const endX = field.x + reach * ux, endY = field.y + reach * uy;
  const exits = [];
  for (const shape of decos) {
    const hit = wallContact([shape], field.x - back*ux, field.y - back*uy,
      (reach+back)*ux, (reach+back)*uy, 0, all);
    if (!hit) continue;
    if (!shape[10]) return null;
    const reverse = wallContact([shape], endX, endY, -reach*ux, -reach*uy, 0, all);
    if (reverse && reverse.t > 0) exits.push(reach*(1-reverse.t));
  }
  exits.sort((a,b) => a-b);
  for (const exit of exits) {
    for (const radii of [1, 2]) {
      const distance = exit + radii*field.view.playerRadius;
      const x = field.x + distance*ux, y = field.y + distance*uy;
      if (field.blocked(x, y, 0, Math.max(0,field.view.playerRadius - 1/Q))) continue;
      const probe = 0x4cce / Q;
      if ([[probe,0],[-probe,0],[0,probe],[0,-probe]].every(([dx,dy]) =>
        wallContact(field.view.physics,x,y,dx,dy,0,s => s[7]))) continue;
      return {x,y};
    }
  }
  return null;
}

export class WeaponAlt {
  constructor(field) {
    this.field = field;
    this.charges = field.w.WeaponActiveCount;
    this.recharge = 0;
    this.shield = false;
    this.shieldHp = field.w.ValueA;
    this.shieldAngle = 0;
    this.passing = false;
    this.immunity = 0;
    this.held = false;
    this.moveX = 0;
    this.moveY = 0;
    this.dash = new SmgDash(field);
    if (field.weapon.Id === '2') {
      const keys = new Set((field.view.decoShapes || []).map(s => s.join(',')));
      this.decos = field.view.physics.filter(s => keys.has(s.slice(0,7).join(',')));
    }
  }
  get speedFactor() { return this.shield ? 1 - 39324 / Q : 1; }
  get invincible() { return this.immunity > 0; }
  get timeLeft() { return this.charges < this.field.w.WeaponActiveCount ? Math.max(0,this.field.w.WeaponActiveDuration-this.recharge) : 0; }

  spend() {
    if (this.charges === this.field.w.WeaponActiveCount) this.recharge = 0;
    this.charges--;
  }

  step(dt, input) {
    const f = this.field, w = f.w, id = f.weapon.Id;
    if (this.charges < w.WeaponActiveCount && w.WeaponActiveDuration > 0) {
      this.recharge += dt;
      while (this.recharge >= w.WeaponActiveDuration && this.charges < w.WeaponActiveCount) {
        this.recharge -= w.WeaponActiveDuration;
        this.charges++;
      }
    }
    this.immunity = Math.max(0, this.immunity-dt);
    if (hasMoveInput(input.dx,input.dy)) {
      const length = Math.hypot(input.dx,input.dy);
      this.moveX = input.dx/length;
      this.moveY = input.dy/length;
    }
    const held = !!input.alt, pressed = held && !this.held;
    this.held = held;
    if (id === '1') {
      const forced = this.dash.step(dt,input,pressed && this.charges > 0);
      if (this.dash.started) this.spend();
      return forced;
    }
    if (id === '4') {
      if (!held) this.shield = false;
      if (held && this.charges > 0) {
        this.shield = true;
        this.shieldAngle = input.angle;
        f.boosting = false;
        f.boostTimer = 0;
      }
      if (!this.shield) this.shieldHp = Math.min(w.ValueA, this.shieldHp + w.ValueD*dt);
    }
    if (id !== '2') return false;
    if (!this.passing && pressed && this.charges > 0 && (this.moveX || this.moveY)) {
      const destination = passDestination(f, this.decos, this.moveX, this.moveY);
      if (destination) {
        this.spend();
        this.destination = destination;
        this.passing = true;
        this.passRemaining = this.immunity = passTime;
        f.boosting = false;
        f.boostTimer = 0;
      }
    }
    if (!this.passing) return false;
    const dx = this.destination.x-f.x, dy = this.destination.y-f.y;
    if (this.passRemaining <= dt || Math.hypot(dx,dy) <= 0.5) {
      f.x = this.destination.x;
      f.y = this.destination.y;
      this.passing = false;
      f.splat(f.x, f.y, w.ValueA);
    } else {
      f.x += dx*dt/this.passRemaining;
      f.y += dy*dt/this.passRemaining;
      this.passRemaining -= dt;
    }
    return true;
  }

  // BulletComponent.TriggerEnter delivers the impact to the shield first.
  block(shot, impactX, impactY) {
    if (!this.shield || shot.blockable === false || !(shot.damage > 0)) return false;
    const f = this.field, w = f.w;
    const ux = Math.cos(this.shieldAngle), uy = Math.sin(this.shieldAngle);
    const alignment = -Math.cos(shot.angle)*ux - Math.sin(shot.angle)*uy;
    if (alignment < Math.cos(w.ValueB*0.5*(0x478/Q))) return false;
    const rx = impactX - f.x - ux*w.ValueC, ry = impactY - f.y - uy*w.ValueC;
    if (rx*rx + ry*ry > w.ValueC*w.ValueC) return false;
    this.shieldHp -= shot.damage;
    const event={type:'shield-block',x:f.x,y:f.y,team:f.team};
    if(f.onShieldBlock)f.onShieldBlock(event);
    else f.skills?.events.push({...event,owner:'local'});
    if (this.shieldHp <= 0) {
      this.spend();
      this.shield = false;
      this.shieldHp = w.ValueA;
    }
    return true;
  }
}
