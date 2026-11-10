import {fork} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

export const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export const localEnv={
  ...process.env,CHILLCAT_HOST:'127.0.0.1',CHILLCAT_PORT:'0',
  CHILLCAT_PG:'',CHILLCAT_REDIS:'',CHILLCAT_TLS_CERT:'',CHILLCAT_TLS_KEY:'',CHILLCAT_PUBLIC_ADDRESS:'',
};

export async function startCombatService(seed){
  const child=fork('server/start.mjs',[],{cwd:projectRoot,env:localEnv,
    execArgv:seed?['--import','data:text/javascript,'+encodeURIComponent(seed)]:[],
    stdio:['ignore','pipe','pipe','ipc']});
  let log='';
  child.stdout.on('data',s=>{log=(log+s).slice(-5000);});
  child.stderr.on('data',s=>{log=(log+s).slice(-5000);});
  const closed=once(child,'exit');
  const timer=AbortSignal.timeout(15000);
  try{
    const ready=once(child,'message',{signal:timer}).then(([msg])=>msg);
    const message=await Promise.race([ready,closed.then(()=>{throw Error('Server stopped during startup: '+log);})]);
    if(message.type!=='listening'||!Number.isInteger(message.port)||message.port<=0)throw Error('Missing bound loopback port');
    const url='http://127.0.0.1:'+message.port;
    const response=await fetch(url+'/health',{signal:timer}),health=await response.json();
    if(!response.ok||health.game!=='chillcat'||health.persistent!==false||health.redis!==false)throw Error('Unexpected fixture health: '+JSON.stringify(health));
    return {url,health,async stop(){child.kill('SIGTERM');await closed;}};
  }catch(error){child.kill('SIGTERM');await closed;throw error;}
}
