// Run with: node tools/check-engine.cjs --sample --release-screenshot --shot=editor
const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({send,evaluate,sessionId,root}) => {
  const mode = process.argv.find(arg => arg.startsWith('--shot='))?.split('=')[1] || 'editor';
  if (!['editor','ui','scripts'].includes(mode)) throw new Error('Unknown release screenshot mode');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  for(let i=0;i<60;i++) {
    if(await evaluate(sessionId,'!!window.RGEShowDockTab && !!window.RGEUIEditor && !!window.RGEScriptEditor')) break;
    await pause(200);
  }
  await evaluate(sessionId,'clearInterval(state.document.autosaveTimer); state.document.autosaveTimer=null; true');
  await evaluate(sessionId,'selectNode("player");true');
  await evaluate(sessionId,'_viewportRenderedThisFlush=false;renderViewport();attachTransformer();true');
  if(mode==='ui') await evaluate(sessionId,`(()=>{RGEShowDockTab('ui');RGEUIEditor.activate();const s=document.getElementById('ui-screen-select');s.value='Title';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  if(mode==='scripts') await evaluate(sessionId,`(async()=>{RGEShowDockTab('scripts');await RGEScriptEditor.open('res://components/behaviors/collect.brs');return true;})()`);
  if(mode==='scripts') await evaluate(sessionId,`document.getElementById('bottom-dock').style.height='160px';document.getElementById('script-text').setSelectionRange(0,0);document.getElementById('script-text').scrollTop=0;document.getElementById('script-text').dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));true`);
  if(mode==='ui') {
    await pause(400);
    await evaluate(sessionId,`document.querySelector('#ui-node-tree [data-node-id="titleLabel"]').click();true`);
  }
  await pause(2500);
  const output=path.join(root,'docs/images/alpha');fs.mkdirSync(output,{recursive:true});
  const file=path.join(output,mode+'.png');
  await evaluate(sessionId,`window.__releaseScreenshot=${JSON.stringify(mode)};true`);
  let completed=false;
  for(let i=0;i<100;i++){if(await evaluate(sessionId,'window.__releaseScreenshotDone===true')){completed=true;break;}await pause(200);}
  if(!completed)throw new Error('Release screenshot capture timed out');
  console.log('RELEASE_SCREENSHOT',file);
};
