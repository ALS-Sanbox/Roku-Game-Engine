const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async({send,evaluate,sessionId,previewSession,build,errors})=>{
  const output=path.resolve(__dirname,'../.visual-editor/artifacts/mol-engine');fs.mkdirSync(output,{recursive:true});
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const evaluateGame=expression=>evaluate(previewSession,expression);
  const logs=()=>evaluateGame('document.getElementById("logs").textContent');
  const mode=()=>evaluateGame('Array.from(document.getElementById("logs").textContent.matchAll(/MOL_FRAME_MODE=([a-z]+)/g)).at(-1)?.[1]');
  async function waitFor(test,message,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){if(await test())return;await pause(250);}throw new Error(message+'\n'+await logs());}
  async function waitMode(expected){await waitFor(async()=>await mode()===expected,'Expected MOL mode '+expected);}
  async function press(key){
    const action=({up:'move_up',down:'move_down',left:'move_left',right:'move_right',select:'confirm',back:'cancel',play:'pause'})[key]||key;
    const marker='MOL_EDGE '+action+' false';
    const count=()=>logs().then(text=>text.split(marker).length);
    const before=await count();
    const frames=()=>logs().then(text=>text.match(/MOL_FRAME_INPUT=/g)?.length||0);
    const beforeFrames=await frames();
    await evaluateGame('brs.sendKeyPress('+JSON.stringify(key==='options'?'info':key)+',180)');
    await waitFor(async()=>await count()>before,'Remote release '+key);
    await waitFor(async()=>await frames()>beforeFrames,'Rendered remote input '+key);
  }
  async function telemetry(){return evaluateGame('(()=>{const rows=Array.from(document.getElementById("logs").textContent.matchAll(/MOL_TELEMETRY (\\{[^\\r\\n]+\\})/g));return rows.length?JSON.parse(rows.at(-1)[1]):null;})()');}
  async function capture(name){const data=await evaluateGame('(()=>{const src=brs.getDisplayBuffer(),c=document.createElement("canvas");c.width=src.width;c.height=src.height;c.getContext("2d").drawImage(src,0,0);return c.toDataURL("image/png").split(",")[1];})()');const png=Buffer.from(data,'base64');fs.writeFileSync(path.join(output,name+'.png'),png);return crypto.createHash('sha256').update(png).digest('hex');}
  const report={checks:[],screenshots:[],build:build.output};
  async function shot(name){await capture(name);report.screenshots.push(name+'.png');console.log('MOL_SCREEN',name);fs.writeFileSync(path.join(output,'runtime.log'),await logs());}
  const check=(name,passed)=>{report.checks.push({name,passed:!!passed});if(!passed)throw new Error(name);};
  for(const marker of ['PASS: Roku gameplay regression checks','PASS: Roku frontend and save regression checks','PASS: Roku audio lifecycle checks']){await waitFor(async()=>(await logs()).includes(marker),marker);check(marker,true);}
  await waitMode('menu');await shot('01-title');
  await press('down');await press('select');await waitMode('scores');await shot('02-high-scores');
  await press('back');await waitMode('menu');
  await press('down');await press('down');await press('select');await waitMode('instructions');await shot('03-instructions');
  const page1=await capture('03-instructions-page1');await press('right');await pause(400);const page2=await capture('03-instructions-page2');check('Instructions page navigation',page1!==page2);
  await press('back');await waitMode('menu');await press('select');
  await waitFor(async()=>['intro','playing'].includes(await mode()),'Game/intro start');
  if(await mode()==='intro'){await shot('04-intro');await press('select');}
  await waitMode('playing');
  await waitFor(async()=>{const t=await telemetry();return t?.mode==='playing';},'Gameplay telemetry');
  const start=await telemetry();await press('select');
  await evaluateGame('brs.sendKeyDown("right")');
  try{await waitFor(async()=>{const t=await telemetry();return t?.x>start.x+15&&t.firing&&t.shots>0;},'Movement and firing');}finally{await evaluateGame('brs.sendKeyUp("right")');}
  check('Player movement and firing',true);await shot('05-gameplay');
  await waitFor(async()=>(await logs()).includes('PASS: MOL runtime clones leave hidden template layer'),'Visible runtime clones');check('Runtime clones render outside hidden templates',true);
  await press('play');await waitMode('paused');await pause(700);
  const paused=await capture('06-paused');await pause(1000);check('Pause freezes framebuffer',paused===await capture('06-paused-settled'));
  await press('play');await waitMode('playing');await pause(700);check('Resume advances framebuffer',paused!==await capture('07-resumed'));
  await press('back');await waitMode('paused');await press('back');await waitMode('menu');
  // Use actual remote controls to select the final day in the editable menu.
  for(let day=2;day<=22;day++){
    await press('right');await waitFor(async()=>await evaluateGame('Array.from(document.getElementById("logs").textContent.matchAll(/MOL_START_DAY\\s+(\\d+)/g)).at(-1)?.[1]')===String(day),'Start-day selector '+day);
  }
  check('All 22 starting days selectable',true);
  await press('select');await waitMode('alert');await shot('08-final-boss-alert');await waitMode('playing');
  await waitFor(async()=>{const t=await telemetry();return t?.day===22&&t.enemies>0&&t.time>=5;},'Final boss entrance');await shot('09-final-boss');
  check('Final boss encounter',true);
  // Test-only validation component clears the encounter, then advances delivery.
  // This component is injected into a fixture copy and never ships with MOL.
  await press('options');await waitMode('delivering');await shot('10-delivery');
  await press('options');await waitMode('won');await shot('11-victory');
  await waitMode('entry');await shot('12-score-entry');
  await press('up');await press('right');await press('up');await press('select');await waitMode('credits');await shot('13-credits');
  await press('right');await waitMode('scores');await shot('14-saved-score');
  check('Delivery, victory, high-score entry and credits',true);
  const finalLogs=await logs();check('No runtime errors',!/runtime error|compile error|error:|FAIL:/i.test(finalLogs)&&errors.length===0);
  const packageScene=JSON.parse(fs.readFileSync(path.join(build.output,'assets/scenes/MOL.json')));
  check('Edited player width exported',packageScene.nodes.find(n=>n.id==='Player').properties.width===72);
  check('Preview image data excluded from package',!packageScene.nodes.some(n=>n.properties?.imageDataUrl));
  report.finalTelemetry=await telemetry();report.passed=true;
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(output,'runtime.log'),finalLogs);
  console.log('MOL_ENGINE_PLAY_TEST',JSON.stringify({passed:true,checks:report.checks.length,output}));
};
