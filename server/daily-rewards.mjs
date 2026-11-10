import {readFileSync} from 'node:fs';

const tables=JSON.parse(readFileSync(new URL('../data/tables.json',import.meta.url)));
export const dailyRewards=tables.Reward.filter(row=>row.Type==='DailyReward'&&row.Items==='1');
const schedule=tables.Schedule.find(row=>row.Enum==='DailyReward');
const day=24*60*60*1000;
const boundary=((Number(schedule.Hour)%24)*3600+Number(schedule.Minute)*60+Number(schedule.Second))*1000;

// Schedule.GetNextHourlyTriggerTime maps Hour=24 to UTC midnight.
export function rewardWindow(now){
  const start=Math.floor((now-boundary)/day)*day+boundary;
  return {day:new Date(start).toISOString().slice(0,10),nextReset:start+day};
}

export async function dailyStatus(pool,account,now=Date.now()){
  const {day,nextReset}=rewardWindow(now);
  const rows=account?(await pool.query('SELECT reward_id FROM chillcat_daily_reward WHERE account_id=$1 AND reward_day=$2 ORDER BY reward_id',[account,day])).rows:[];
  return {serverTime:now,nextReset,received:rows.map(r=>String(r.reward_id)),persistent:!!pool};
}

// settle() holds the account row lock throughout the match settlement transaction.
export async function awardDailyWin(conn,account,matchId,completedAt){
  const {day}=rewardWindow(completedAt.getTime());
  const result=await conn.query('SELECT reward_id FROM chillcat_daily_reward WHERE account_id=$1 AND reward_day=$2',[account,day]);
  const ids=new Set(result.rows.map(r=>String(r.reward_id)));
  const row=dailyRewards.find(reward=>!ids.has(reward.Id));
  if(!row)return 0;
  await conn.query('INSERT INTO chillcat_daily_reward(account_id,reward_day,reward_id,match_id,coins) VALUES($1,$2,$3,$4,$5)',
    [account,day,Number(row.Id),matchId,Number(row.Counts)]);
  return Number(row.Counts);
}
