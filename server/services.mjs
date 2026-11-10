import {awardDailyWin} from './daily-rewards.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {Redis} from 'ioredis';
import {RedisDriver} from '@colyseus/redis-driver';
import {RedisPresence} from '@colyseus/redis-presence';
const url=process.env.CHILLCAT_REDIS;
export const redis=url?new Redis(url,{maxRetriesPerRequest:1}):null;
export const cluster=url?{driver:new RedisDriver(url),presence:new RedisPresence(url)}:{};
const pool=process.env.CHILLCAT_PG?new Pool({connectionString:process.env.CHILLCAT_PG}):null;
export {pool as accountPool};
export const persistent=!!pool;
const rewards=JSON.parse(readFileSync(new URL('../data/tables.json',import.meta.url))).Reward;
const outcomeReward=new Map(rewards.filter(r=>r.Type==='GamePlay'&&r.Items==='1').map(r=>[r.Enum.split('_')[1],Number(r.Counts)]));
export async function initialize(){
  if(redis)await redis.ping();
  if(pool)await pool.query(`
    CREATE TABLE IF NOT EXISTS chillcat_account(id uuid PRIMARY KEY, credential text UNIQUE NOT NULL, joined_at timestamptz DEFAULT now());
    CREATE TABLE IF NOT EXISTS chillcat_match(id uuid PRIMARY KEY, map_id text NOT NULL, completed_at timestamptz DEFAULT now(), scores integer[] NOT NULL);
    CREATE TABLE IF NOT EXISTS chillcat_result(match_id uuid REFERENCES chillcat_match, account_id uuid REFERENCES chillcat_account, team smallint NOT NULL, outcome text NOT NULL, PRIMARY KEY(match_id,account_id));
    ALTER TABLE chillcat_account ADD COLUMN IF NOT EXISTS coins bigint NOT NULL DEFAULT 0;
    ALTER TABLE chillcat_result ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0;
    ALTER TABLE chillcat_result ADD COLUMN IF NOT EXISTS balance_after bigint;
    ALTER TABLE chillcat_result ADD COLUMN IF NOT EXISTS daily_coins integer NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS chillcat_daily_reward(
      account_id uuid NOT NULL REFERENCES chillcat_account, reward_day date NOT NULL,
      reward_id integer NOT NULL, match_id uuid NOT NULL REFERENCES chillcat_match, coins integer NOT NULL,
      PRIMARY KEY(account_id,reward_day,reward_id), UNIQUE(account_id,match_id));`);
}
export async function identity(token){
  if(!pool)return null;
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('无效的本地账号凭据');
  const hash=createHash('sha256').update(token).digest('hex');
  const r=await pool.query('INSERT INTO chillcat_account(id,credential) VALUES($1,$2) ON CONFLICT(credential) DO UPDATE SET credential=EXCLUDED.credential RETURNING id',[randomUUID(),hash]);
  return r.rows[0].id;
}
export async function settle(id,map,scores,players){
  if(!pool)return [];
  const conn=await pool.connect();
  try{
    await conn.query('BEGIN');
    const result=await conn.query('INSERT INTO chillcat_match(id,map_id,scores) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING completed_at',[id,map,scores]);
    if(result.rowCount){
      for(const {account,team} of [...players].filter(p=>p.account).sort((a,b)=>a.account.localeCompare(b.account))){
        const diff=scores[team-1]-scores[2-team],outcome=diff===0?'Draw':diff>0?'Win':'Lose';
        const amount=outcomeReward.get(outcome);
        await conn.query('SELECT id FROM chillcat_account WHERE id=$1 FOR UPDATE',[account]);
        const daily=outcome==='Win'?await awardDailyWin(conn,account,id,result.rows[0].completed_at):0;
        const wallet=await conn.query('UPDATE chillcat_account SET coins=coins+$2 WHERE id=$1 RETURNING coins',[account,amount+daily]);
        await conn.query('INSERT INTO chillcat_result(match_id,account_id,team,outcome,coins,daily_coins,balance_after) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [id,account,team,outcome==='Lose'?'loss':outcome.toLowerCase(),amount,daily,wallet.rows[0].coins]);
      }
    }
    const awarded=await conn.query(`SELECT r.account_id,r.coins,r.daily_coins,r.balance_after,d.reward_id AS daily_reward_id
      FROM chillcat_result r LEFT JOIN chillcat_daily_reward d USING(match_id,account_id) WHERE r.match_id=$1`,[id]);
    await conn.query('COMMIT');return awarded.rows;
  }catch(e){await conn.query('ROLLBACK');throw e;}finally{conn.release();}
}
export async function leaderboard(){
  if(!pool)return [];
  return (await pool.query("SELECT account_id AS id,count(*)::int AS games,count(*) FILTER(WHERE outcome='win')::int AS wins FROM chillcat_result GROUP BY account_id ORDER BY wins DESC,games DESC,id LIMIT 50")).rows;
}
