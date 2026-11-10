import {defineServer,defineRoom} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createServer as httpsServer} from 'node:https';
import {readFileSync} from 'node:fs';
import {cluster,initialize,leaderboard,persistent} from './services.mjs';
import {identity,accountPool} from './services.mjs';
import {dailyStatus} from './daily-rewards.mjs';
import {PaintRoom} from './room.mjs';
import {initializeGacha,registerGacha} from './gacha.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.CHILLCAT_PORT||18846),host=process.env.CHILLCAT_HOST||'127.0.0.1';
await initialize();
await initializeGacha();
const tls=process.env.CHILLCAT_TLS_CERT?httpsServer({cert:readFileSync(process.env.CHILLCAT_TLS_CERT),key:readFileSync(process.env.CHILLCAT_TLS_KEY)}):null;
const server=defineServer({...cluster,publicAddress:process.env.CHILLCAT_PUBLIC_ADDRESS,transport:new WebSocketTransport({...(tls?{server:tls}:{}),maxPayload:8192,pingInterval:5000,pingMaxRetries:3}),
  rooms:{chillcat:defineRoom(PaintRoom),chillcat_match:defineRoom(PaintRoom).filterBy(['mapId'])},express:app=>{
    app.get('/api/daily-rewards',async(req,res)=>{
      res.set('Cache-Control','no-store');
      const token=/^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization')||'')?.[1];
      if(!token)return res.sendStatus(401);
      const account=await identity(token);
      res.json(await dailyStatus(accountPool,account));
    });
    app.get('/health',(_,res)=>res.json({game:'chillcat',rooms:true,persistent,redis:!!cluster.driver}));
    app.get('/api/leaderboard',async(_,res)=>res.json({persistent,players:await leaderboard()}));
    registerGacha(app);
    for(const dir of ['game','assets','data'])app.use('/'+dir,express.static(join(root,dir),{dotfiles:'deny'}));
    app.get('/',(_,res)=>res.sendFile(join(root,'index.html')));app.get('/library.html',(_,res)=>res.sendFile(join(root,'library.html')));}});
await server.listen(port,host);
const address=server.transport.server.address();
console.log(`打到天亮 · ${tls ? 'https' : 'http'}://${host}:${address.port}/`);
process.send?.({type:'listening',port:address.port});
