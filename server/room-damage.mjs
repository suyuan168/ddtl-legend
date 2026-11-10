import {noteBotHit} from './bot-player.mjs';
import {damageAt} from '../game/damage.js';
import {deployedWeapons,damageDeployable} from '../game/damageable-entities.js';

// A destroyed hostile deployable can generate its own team's attack.
export function applyRoomHit(room,source,firstHit,rollerCooldown=0){
  const queue=[{source,hit:firstHit,cooldown:rollerCooldown}];
  for(let i=0;i<queue.length;i++){
    const {source:owner,hit,cooldown}=queue[i];
    for(const victim of room.members.values()){
      if(victim.team===owner.team||victim.death)continue;
      const f=victim.game;
      for(const o of deployedWeapons(f)){
        if(cooldown&&owner.rollerCooldowns.has(o))continue;
        const damage=damageAt(hit,o,o.radius);
        if(!damage)continue;
        if(cooldown)owner.rollerCooldowns.set(o,cooldown);
        const previousMarks=f.paint.length;
        const blasts=damageDeployable(f,o,damage);
        if(!blasts.length)continue;
        for(const mark of f.paint.splice(previousMarks))room.recordMark(victim,mark);
        room.broadcast('skillEvents',blasts.map(b=>({...b.event,owner:victim.id})));
        for(const blast of blasts)queue.push({source:victim,hit:blast.hit,cooldown:0});
      }
      if(f.zones.protected||f.altWeapon.invincible||(cooldown&&owner.rollerCooldowns.has(victim.id)))continue;
      const damage=damageAt(hit,f,f.view.playerRadius);
      if(!damage)continue;
      if(cooldown)owner.rollerCooldowns.set(victim.id,cooldown);
      if(victim.bot&&!owner.mapActor)noteBotHit(victim,owner);
      room.broadcast('skillEvents',[{type:'player-hit-sound',owner:victim.id,x:f.x,y:f.y,textId:hit.critical?3:1}]);
      f.losePlayerHp(damage);victim.hp=f.hp;
      if(victim.hp<=0)room.defeated(owner,victim);
      else {
        const attacker=owner.mapActor?owner.game.sprinkler:owner.game;
        room.broadcast('skillEvents',[{type:'player-hit',owner:victim.id,team:owner.team,
          x:f.x,y:f.y,sign:f.x>attacker.x?1:-1}]);
      }
    }
  }
}
