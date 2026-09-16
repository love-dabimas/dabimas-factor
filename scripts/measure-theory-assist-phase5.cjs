// サーバーと codex-powershell.ps1 dump-dom <URL> 375 844 300000 9224 を起動後に実行。
// デバッグ指定時はChromeをCDP計測用に維持する。CPU4倍で完了まで待つ。
const fs=require('node:fs');
(async()=>{
 const targets=await (await fetch('http://127.0.0.1:9224/json')).json();
 const target=targets.find(t=>t.url.includes('/scripts/fixtures/theory-assist-phase5.html'));
 if(!target) throw new Error('計測ページを起動してください');
 const ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let seq=0;
 const pending=new Map();
 const errors=[];
 ws.addEventListener('message',e=>{
   const msg=JSON.parse(e.data);
   if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
   if(pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);}
 });
 const send=(method,params={})=>new Promise(r=>{const id=++seq;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
 await send('Emulation.setCPUThrottlingRate',{rate:4});
 await send('Runtime.enable');
 await send('Network.setBypassServiceWorker',{bypass:true});
 await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Page.reload',{ignoreCache:true});
 await send('Runtime.evaluate',{expression:'window.startHeavy = true'});
 const timer=setInterval(async()=>{
   const response=await send('Runtime.evaluate',{expression:'window.startHeavy = true; document.querySelector("#result")?.textContent',returnByValue:true});
   const value=response.result?.result?.value;
   if(value?.startsWith('PASS phase5b') || value?.startsWith('FAIL')){
     clearInterval(timer);
     clearTimeout(timeout);
     const output=value+'\nRuntime exceptions: '+JSON.stringify(errors);
     fs.mkdirSync('tmp',{recursive:true});
     fs.writeFileSync('tmp/phase5-metrics.txt',output);
     console.log(output);
     if(value.startsWith('FAIL') || errors.length) process.exitCode=1;
     ws.close();
   }
 },1000);
 const timeout=setTimeout(()=>{
   console.error('計測が180秒以内に完了しませんでした');
   process.exitCode=1;
   clearInterval(timer);
   ws.close();
 },180000);
})().catch(e=>{console.error(e);process.exitCode=1});
