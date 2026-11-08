'use strict';
// Runs the actual exported RGE package in the supported native simulator.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {buildNativeProject}=require('../export/native_build');
const {registerSimulatorPackage,stopSimulatorHost}=require('../export/simulator_host');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'.visual-editor/artifacts/mol-rge');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 fs.mkdirSync(artifacts,{recursive:true});
 const build=process.argv.includes('--reuse-build')?JSON.parse(fs.readFileSync(path.join(root,'.visual-editor/mol-rge-build.json'))):buildNativeProject({projectRoot:path.join(root,'projects/MOL')});
 const url=await registerSimulatorPackage(build.zipPath,'MOL RGE Rebuild');
 const executable=process.env.MANUAL_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 if(!executable)throw Error('Set MANUAL_BROWSER to a Chromium executable.');
 const browser=spawn(executable,['--headless=new','--disable-gpu','--autoplay-policy=no-user-gesture-required','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+path.join(root,'.visual-editor/mol-rge-browser-'+process.pid),...(process.env.MANUAL_BROWSER_FLAGS?.split(/\s+/).filter(Boolean)||[]),'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let socket;const callbacks=new Map();let sequence=0,session;const errors=[];
 try{
  const address=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Browser startup timed out: '+log)),20000);browser.on('error',e=>{clearTimeout(timer);reject(e)});browser.stderr.on('data',chunk=>{log+=chunk;const found=/DevTools listening on (ws:\/\/\S+)/.exec(log);if(found){clearTimeout(timer);resolve(found[1])}})});
  socket=new WebSocket(address);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(callbacks.has(m.id)){const cb=callbacks.get(m.id);callbacks.delete(m.id);clearTimeout(cb.timer);m.error?cb.reject(Error(JSON.stringify(m.error))):cb.resolve(m.result)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
  const send=(method,params={},sid=session)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{callbacks.delete(id);reject(Error('Browser timeout: '+method))},30000);callbacks.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}))});
  const target=await send('Target.createTarget',{url:'about:blank'});session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url});
  const logs=()=>evaluate('document.getElementById("logs")?.textContent || ""');
  async function waitFor(test,message,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){if(await test())return;const log=await logs();if(/EXIT_BRIGHTSCRIPT_CRASH|compile error|runtime error/i.test(log)){fs.writeFileSync(path.join(artifacts,'runtime.log'),log);throw Error(message+'\n'+log.slice(-7000));}await pause(200)}const log=await logs();fs.writeFileSync(path.join(artifacts,'runtime.log'),log);throw Error(message+'\n'+log.slice(-7000));}
  const mode=async expected=>(await logs()).includes('MOL_RGE_MODE='+expected);
  const state=()=>evaluate('(()=>{const list=[...document.getElementById("logs").textContent.matchAll(/MOL_RGE_STATE (\\{[^\\r\\n]+\\})/g)];return list.length?JSON.parse(list.at(-1)[1]):null})()');
  async function press(key){await evaluate('brs.sendKeyPress('+JSON.stringify(key)+',100)');await pause(300);}
  async function capture(name){const result=await evaluate('(()=>{const c=document.createElement("canvas"),b=brs.getDisplayBuffer();c.width=b.width;c.height=b.height;c.getContext("2d").drawImage(b,0,0);return c.toDataURL("image/png").split(",")[1]})()');fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result,'base64'));}
  await waitFor(async()=>(await state())?.mode==='menu','Native RGE boot and first frames');await capture('01-menu');
  console.log('MOL_RGE_BOOT',await logs());
  await press('select');await waitFor(()=>mode('intro'),'Intro screen');await capture('02-intro');
  await press('select');await waitFor(async()=>{const s=await state();return s?.mode==='playing'&&s.enemies>0},'Native gameplay');await capture('03-gameplay');
  const before=await state();await evaluate('brs.sendKeyDown("right")');
  await waitFor(async()=>{const s=await state();return s?.x>before.x+10},'Held movement',90000);
  await evaluate('brs.sendKeyUp("right")');await press('select');
  await waitFor(async()=>{const s=await state();return s?.x>before.x+10&&s.firing&&s.shots>0},'Movement/firing');await capture('04-firing');
  await press('play');await waitFor(()=>mode('paused'),'Pause');await capture('05-paused');
  await press('select');await waitFor(async()=>((await logs()).match(/MOL_RGE_MODE=playing/g)||[]).length>=2,'Resume transition');
  await press('play');await waitFor(async()=>((await logs()).match(/MOL_RGE_MODE=paused/g)||[]).length>=2,'Second pause');
  await press('down');await pause(1000);await press('select');await waitFor(async()=>(await state())?.mode==='menu','Return to menu');await capture('06-returned-menu');
  const log=await logs();fs.writeFileSync(path.join(artifacts,'runtime.log'),log);
  if(/runtime error|compile error|FAIL:/i.test(log)||errors.length)throw Error('Runtime errors: '+errors.join('\n')+'\n'+log.slice(-7000));
  fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({passed:true,build:build.output,checks:['native startup','RGE focus action','intro','native pooled gameplay','movement','firing','pause','resume','return to menu'],state:await state()},null,2));
  console.log('MOL_RGE_SIMULATOR_PASS',artifacts);
  await send('Browser.close').catch(()=>{});
 }finally{for(const cb of callbacks.values())clearTimeout(cb.timer);socket?.close();browser.kill();stopSimulatorHost();}
}
// Chromium's inherited Windows pipe handles can outlive the closed browser.
// All owned helpers are stopped in finally before this CLI exits.
main().then(()=>process.exit(0),error=>{console.error(error);stopSimulatorHost();process.exit(1)});
