import { randomInt, randomUUID } from 'node:crypto';
const FRIEND_CODE_CHARS = 'BCEFGHJKLMNPQRTUVXYZ23456789';

const local = new Map();
const TTL = 120000;
const renewScript = "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;return redis.call('PEXPIRE',KEYS[1],ARGV[2])";
const releaseScript = "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;return redis.call('DEL',KEYS[1])";
/** Codes share Colyseus roomId lookup but a separate namespace from party codes.
 * Redis NX is required across workers; owner-checked renewal/release fences reuse. */
export class FriendRoomCodeLease {
  constructor({ redis = null, random = randomInt, prefix = 'chillcat:friends-code:' } = {}) {
    Object.assign(this, { redis, random, prefix }); this.owner = randomUUID(); this.code = null;
  }
  async acquire() {
    if (this.code) return this.code;
    for (let attempt = 0; attempt < 128; attempt++) {
      const code = Array.from({ length: 5 }, () => FRIEND_CODE_CHARS[this.random(FRIEND_CODE_CHARS.length)]).join('');
      const claimed = this.redis ? await this.redis.set(this.prefix + code, this.owner, 'PX', TTL, 'NX') : !local.has(code);
      if (!claimed) continue;
      if (!this.redis) local.set(code, this.owner);
      return (this.code = code);
    }
    throw Error('好友房间码暂时无法分配，请稍后再试。');
  }
  async renew() {
    if (!this.code) return false;
    return this.redis ? !!await this.redis.eval(renewScript, 1, this.prefix + this.code, this.owner, TTL) : local.get(this.code) === this.owner;
  }
  async release() {
    const code = this.code; this.code = null; if (!code) return;
    if (this.redis) await this.redis.eval(releaseScript, 1, this.prefix + code, this.owner);
    else if (local.get(code) === this.owner) local.delete(code);
  }
}
