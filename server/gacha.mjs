import {randomInt} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {accountPool,identity} from './services.mjs';

const tables=JSON.parse(readFileSync(new URL('../data/tables.json',import.meta.url)));
const product=tables.Product.find(p=>p.Enum==='CostumeGatcha');
const boxItem=tables.Item.find(i=>i.Id===product.RewardItemId);
const box=tables.ItemBox.find(b=>b.Id===boxItem.BoxID);
export const drawCost=Number(product.CostItemValue);
if(product.CostItemId!=='1'||product.RewardItemValue!=='1'||box.PickType!=='GradeThenItem')throw Error('Unexpected costume product');
const grades=box.Grades.split('|'),gradeWeights=box.GradePercentage.split('|').map(Number);
const weights=box.ItemPercentage.split('|').map(Number);
const pools=grades.map(()=>[]);
for(const [i,id] of box.Items.split('|').entries()){
 const grade=grades.indexOf(tables.Item.find(item=>item.Id===id).Grade);
 pools[grade].push({id,weight:weights[i]});
}
function weighted(weights,roll){
 let ticket=roll(weights.reduce((a,b)=>a+b,0));
 for(let i=0;i<weights.length;i++){if(ticket<weights[i])return i;ticket-=weights[i];}
 throw Error('Invalid random ticket');
}
// The shipped client calls the store service. This local service uses the two weighted tables.
export function pickCostume(roll=randomInt){
 const pool=pools[weighted(gradeWeights,roll)];
 return pool[weighted(pool.map(i=>i.weight),roll)].id;
}
export async function initializeGacha(){
 if(!accountPool)return;
 await accountPool.query(`
  CREATE TABLE IF NOT EXISTS chillcat_gacha_receipt(
   account_id uuid NOT NULL REFERENCES chillcat_account,request_id uuid NOT NULL,costume_id text NOT NULL,
   balance_after bigint NOT NULL,is_new boolean NOT NULL,PRIMARY KEY(account_id,request_id));
  CREATE TABLE IF NOT EXISTS chillcat_costume(
   account_id uuid NOT NULL REFERENCES chillcat_account,costume_id text NOT NULL,
   amount integer NOT NULL,PRIMARY KEY(account_id,costume_id));`);
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function ownedCostumes(account){
 if(!account||!accountPool)return new Set();
 const rows=await accountPool.query('SELECT costume_id FROM chillcat_costume WHERE account_id=$1',[account]);
 return new Set(rows.rows.map(row=>row.costume_id));
}
export async function purchase(account,requestId){
 if(!uuid.test(requestId))return {status:400,error:'Invalid purchase ID'};
 if(!accountPool)return {status:409,error:'TM_Gatcha_Fail_NotEnough_Resource',balance:0};
 const conn=await accountPool.connect();
 try{
  await conn.query('BEGIN');
  const wallet=await conn.query('SELECT coins FROM chillcat_account WHERE id=$1 FOR UPDATE',[account]);
  const receipt=await conn.query('SELECT costume_id,balance_after,is_new FROM chillcat_gacha_receipt WHERE account_id=$1 AND request_id=$2',[account,requestId]);
  let row=receipt.rows[0];
  if(!row){
   const balance=Number(wallet.rows[0].coins);
   if(balance<drawCost){
    await conn.query('ROLLBACK');return {status:409,error:'TM_Gatcha_Fail_NotEnough_Resource',balance};
   }
   const id=pickCostume(),remaining=balance-drawCost;
   const grant=await conn.query('INSERT INTO chillcat_costume VALUES($1,$2,1) ON CONFLICT(account_id,costume_id) DO UPDATE SET amount=chillcat_costume.amount+1 RETURNING amount',[account,id]);
   const isNew=grant.rows[0].amount===1;
   await conn.query('UPDATE chillcat_account SET coins=$2 WHERE id=$1',[account,remaining]);
   await conn.query('INSERT INTO chillcat_gacha_receipt VALUES($1,$2,$3,$4,$5)',[account,requestId,id,remaining,isNew]);
   row={costume_id:id,balance_after:remaining,is_new:isNew};
  }
  await conn.query('COMMIT');return {status:200,id:row.costume_id,balance:Number(row.balance_after),isNew:row.is_new};
 }catch(e){await conn.query('ROLLBACK');throw e;}finally{conn.release();}
}
export function registerGacha(app){
 async function authenticate(req,res,next){
  const token=req.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if(!token)return res.sendStatus(401);
  req.gachaAccount=await identity(token);next();
 }
 app.get('/api/gacha',authenticate,async(req,res)=>{
  const account=req.gachaAccount;
  if(!account)return res.json({balance:0,cost:drawCost,owned:[]});
  const result=await accountPool.query('SELECT a.coins,c.costume_id FROM chillcat_account a LEFT JOIN chillcat_costume c ON c.account_id=a.id WHERE a.id=$1',[account]);
  res.json({balance:Number(result.rows[0].coins),cost:drawCost,owned:result.rows.map(r=>r.costume_id).filter(Boolean)});
 });
 app.post('/api/gacha/:request',authenticate,async(req,res)=>{
  const {status,...result}=await purchase(req.gachaAccount,req.params.request);
  res.status(status).json(result);
 });
}
