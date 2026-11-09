'use strict';
// Runs the actual exported RGE package in the supported native simulator.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {buildNativeProject}=require('../export/native_build');
const {registerSimulatorPackage,stopSimulatorHost}=require('../export/simulator_host');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'.visual-editor/artifacts/scene-workflow');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 fs.mkdirSync(artifacts,{recursive:true});
 const build=buildNativeProject({projectRoot:path.join(root,'samples/scene-to-scene')});
 const url=await registerSimulatorPackage(build.zipPath,'Scene workflow');
 const executable=process.env.MANUAL_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 if(!executable)throw Error('Set MANUAL_BROWSER to a Chromium executable.');
 const browser=spawn(executable,['--headless=new','--disable-gpu','--autoplay-policy=no-user-gesture-required','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+path.join(root,'.visual-editor/scene-workflow-browser-'+process.pid),...(process.env.MANUAL_BROWSER_FLAGS?.split(/\s+/).filter(Boolean)||[]),'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
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
  async function press(key){await evaluate('brs.sendKeyPress('+JSON.stringify(key)+',100)');await pause(300);}
  async function capture(name){const result=await evaluate('(()=>{const c=document.createElement("canvas"),b=brs.getDisplayBuffer();c.width=b.width;c.height=b.height;c.getContext("2d").drawImage(b,0,0);return c.toDataURL("image/png").split(",")[1]})()');fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result,'base64'));}
  await waitFor(async()=>(await logs()).includes('SCENE_WORKFLOW_READY=Title'),'Title scene startup');
  await capture('01-title');
  await press('select');
  await waitFor(async()=>(await logs()).includes('SCENE_WORKFLOW_READY=Play'),'Button fades to Play scene');
  await pause(800); await capture('02-play');
  await press('select');
  await waitFor(async()=>((await logs()).match(/SCENE_WORKFLOW_READY=Title/g)||[]).length>=2,'Button returns to Title');
  await pause(800); await capture('03-returned-title');
  const log=await logs(); fs.writeFileSync(path.join(artifacts,'runtime.log'),log);
  const rects=[...log.matchAll(/SCENE_WORKFLOW_BUTTON=(\{[^\r\n]+\})/g)].map(m=>JSON.parse(m[1]));
  if(rects.length<3||rects.some(r=>r.x!==460||r.y!==480||r.width!==360||r.height!==80))throw Error('UI placement differs from authored rectangle: '+JSON.stringify(rects));
  if(/runtime error|compile error|FAIL:/i.test(log)||errors.length)throw Error('Runtime errors: '+errors.join('\n')+'\n'+log.slice(-7000));
  fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({passed:true,checks:['Title startup','default button focus','fade to Play','return to Title','button position and dimensions in all three loads'],rects},null,2));
  console.log('SCENE_WORKFLOW_PASS',artifacts);
  await send('Browser.close').catch(()=>{});
 }finally{for(const cb of callbacks.values())clearTimeout(cb.timer);socket?.close();browser.kill();stopSimulatorHost();}
}
// Chromium's inherited Windows pipe handles can outlive the closed browser.
// All owned helpers are stopped in finally before this CLI exits.
main().then(()=>process.exit(0),error=>{console.error(error);stopSimulatorHost();process.exit(1)});
