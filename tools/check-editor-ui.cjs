const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ send, evaluate, sessionId, errors }) => {
  const output = path.resolve(__dirname, '../.visual-editor/artifacts/ui');
  fs.mkdirSync(output, { recursive: true });
  await send('Emulation.setDeviceMetricsOverride', {width:1100,height:600,deviceScaleFactor:1,mobile:false},sessionId);
  const run = fn => evaluate(sessionId, '(' + fn.toString() + ')()');
  await new Promise(resolve => setTimeout(resolve, 500));
  const report = await run(async () => {
    const results = [], failures = [];
    const wait = () => new Promise(resolve => setTimeout(resolve, 120));
    const check = (name, passed, detail) => { results.push({name, passed:!!passed, detail}); if (!passed) failures.push(name); };
    const click = id => { const b=document.getElementById(id); if (!b) throw new Error('Missing button: '+id); b.click(); };
    const visible = e => !!e && e.getBoundingClientRect().height>0 && getComputedStyle(e).display!=='none';
    for(const button of document.querySelectorAll('.toolbar > button,.toolbar > .toolbar-group')) {
      const rect=button.getBoundingClientRect();
      check('toolbar fits '+(button.id||button.className),rect.right<=innerWidth+1 && rect.left>=0);
    }
    // Exercise lazy initialization through the same Tabs menu used by the user.
    const keys=['create','scene','filesystem','game','ui','inspector','node-info','output','audio','sprites','spriteframes','transitions','tilesets','uitemplates','optscores','nineslice','tilemaps','camera-preview'];
    async function openTab(key) {
      click('btn-tabs-menu'); await wait();
      document.querySelector('.tabs-menu-item[data-tab-key="'+key+'"]').click();
      await wait();
      const tab=document.querySelector('.rge-dock-tab[data-dock-key="'+key+'"]');
      tab?.click(); await wait();
      const panel=key==='game'?document.getElementById('viewport-wrap'):document.getElementById(tab?.dataset.target);
      check('tab '+key, visible(panel), panel?.id);
      return panel;
    }
    for(const key of keys) await openTab(key);
    window.confirm=()=>true; window.prompt=(_message,value)=>value||'UI audit';
    for(const [id,key] of [['btn-grid','showGrid'],['btn-snap','snapEnabled']]) {
      const before=state[key];click(id);check(id,state[key]!==before);click(id);check(id+' restore',state[key]===before);
    }
    for(const b of document.querySelectorAll('.tool-btn[data-tool]')) {b.click();check('tool '+b.dataset.tool,state.tool===b.dataset.tool);}
    selectNode('player');refreshInspector({force:true});await wait();
    const xInput=document.querySelector('#inspector [data-field-key="transform.x"]');
    const xBefore=getNode('player').transform.x;
    xInput.parentElement.querySelector('.num-step-btn').click();
    check('numeric step button keyboard activation',getNode('player').transform.x===xBefore+1);
    const bridge=RGESceneBridge;
    await openTab('nineslice');
    const styleCount=bridge.getNineSliceStyles().length;
    click('nse-btn-add');check('atlas add',bridge.getNineSliceStyles().length===styleCount+1);
    click('nse-btn-save');
    click('nse-btn-duplicate');check('atlas duplicate',bridge.getNineSliceStyles().length===styleCount+2);
    click('nse-btn-delete');click('nse-btn-delete');check('atlas delete',bridge.getNineSliceStyles().length===styleCount);
    await openTab('tilesets');
    renderTilesetsPanel();renderTilesetsPanel();
    const overlay=state.tilesetTerrainEditor.overlayRules;
    click('ts-overlay-rules');check('tileset overlay toggles once after redraw',state.tilesetTerrainEditor.overlayRules!==overlay);
    click('ts-overlay-rules');
    for(const [tab,add,dupe,del,get] of [
      ['transitions','te-btn-add','te-btn-dupe','te-btn-delete','getUITransitionPresets'],
      ['optscores','oe-btn-add-opt',null,'oe-btn-del-opt','getUIOptionDefs'],
      ['optscores','oe-btn-add-hs',null,'oe-btn-del-hs','getUIHighScoreTables']
    ]) {
      await openTab(tab);
      if(add==='oe-btn-add-hs')click('oe-tab-highscores');else if(tab==='optscores')click('oe-tab-options');
      const count=bridge[get]().length;click(add);check(add,bridge[get]().length===count+1);
      if(dupe){click(dupe);check(dupe,bridge[get]().length===count+2);click(del);}
      click(del);check(del,bridge[get]().length===count);
    }
    await openTab('ui');
    const details=Array.from(document.querySelectorAll('details[id]'));
    for(const d of details) {
      const original=d.open;
      d.querySelector('summary').click(); await wait();check('details toggle '+d.id,d.open!==original);
      d.querySelector('summary').click(); await wait();check('details restore '+d.id,d.open===original);
    }
    const uiDetails=document.getElementById('ui-tree-details');uiDetails.open=true;
    click('ui-btn-refresh-canvas');await wait();check('UI refresh preserves expansion',uiDetails.open);
    const initial=state.sceneState.nodes.length;
    document.querySelector('.ui-add-btn[data-type="Label"]').click();await wait();
    const labelId=state.selectedId;
    check('UI add Label',state.sceneState.nodes.length>initial);
    click('ui-btn-delete-node');await wait();check('UI delete Label',!state.sceneState.nodes.some(n=>n.id===labelId));
    await openTab('inspector');
    for(const type of ['Camera2D','Button','MenuList','TileMap','CameraZone2D','CameraTargetGroup','CameraPath2D','CanvasLayer']) {
      addNode(type);await wait();refreshInspector({force:true});await wait();
      const sections=Array.from(document.querySelectorAll('#inspector .inspector-section'));
      for(const section of sections) {
        const button=section.querySelector('.section-toggle'),body=section.querySelector('.section-body');
        const original=section.classList.contains('collapsed');
        button.click();check(type+' collapse '+button.textContent,getComputedStyle(body).display===(original?'flex':'none'));
        button.click();check(type+' expand '+button.textContent,section.classList.contains('collapsed')===original);
      }
      const inspector=document.getElementById('inspector');inspector.scrollTop=inspector.scrollHeight;
      check(type+' inspector scroll',inspector.scrollHeight<=inspector.clientHeight+1||inspector.scrollTop>0,{height:inspector.clientHeight,content:inspector.scrollHeight});
      for(const body of inspector.querySelectorAll('.section-body')) {
        if(getComputedStyle(body).display==='none')continue;
        body.scrollTop=body.scrollHeight;
        check(type+' section scroll',body.scrollHeight<=body.clientHeight+1||body.scrollTop>0);
      }
    }
    await openTab('transitions');click('te-btn-add');click('te-wait-load');await wait();
    const sizes=Array.from(document.querySelectorAll('.te-editor-pane,.oe-editor-pane,.nse-main,#ui-editor-sidebar')).map(e=>({class:e.className,height:e.clientHeight,content:e.scrollHeight,overflow:getComputedStyle(e).overflowY}));
    return {results,failures,sizes};
  });
  await evaluate(sessionId,'selectNode("camera"); refreshInspector({force:true}); true');
  await new Promise(resolve=>setTimeout(resolve,200));
  const wheelResult=await evaluate(sessionId,`(()=>{
    const section=Array.from(document.querySelectorAll('#inspector .inspector-section')).find(e=>e.querySelector('.section-toggle')?.textContent==='Camera');
    section.classList.remove('collapsed');
    const body=section.querySelector('.section-body'),input=body.querySelector('.num-field-input');
    input.focus();const value=input.value;
    const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:160});
    input.dispatchEvent(event);
    body.scrollTop=0;body.scrollTop=160;
    return {passed:!event.defaultPrevented && input.value===value && body.scrollTop>0,top:body.scrollTop};
  })()`);
  report.results.push({name:'numeric fields allow wheel scrolling without changing values',passed:wheelResult.passed,detail:wheelResult});
  if(!wheelResult.passed)report.failures.push('numeric field wheel scrolling');
  const inventory = await send('Runtime.evaluate', {
    expression: `JSON.stringify(Array.from(document.querySelectorAll('button[id]')).map(b=>({id:b.id,text:b.textContent.trim().slice(0,60),disabled:b.disabled,listeners:Object.keys(getEventListeners(b))})))`,
    includeCommandLineAPI:true,returnByValue:true
  },sessionId);
  report.buttons=JSON.parse(inventory.result.value);
  const unbound=report.buttons.filter(b=>!b.disabled&&!b.listeners.length);
  for(const button of unbound)report.failures.push('Unbound enabled button '+button.id);
  const shot=await send('Page.captureScreenshot',{},sessionId);
  fs.writeFileSync(path.join(output,'editor.png'),Buffer.from(shot.data,'base64'));
  // Open the actual settings window through its File-menu action.
  await evaluate(sessionId, 'document.getElementById("menu-settings").click(); true');
  let settings;
  for(let attempt=0;attempt<40;attempt++) {
    settings=(await send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/settings.html'));
    if(settings)break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!settings)throw new Error('Settings button did not open its window');
  const attached=await send('Target.attachToTarget',{targetId:settings.targetId,flatten:true});
  await send('Runtime.enable',{},attached.sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:700,height:420,deviceScaleFactor:1,mobile:false},attached.sessionId);
  for(let attempt=0;attempt<40;attempt++) {
    if(await evaluate(attached.sessionId,'document.getElementById("btn-save") && document.getElementById("project-name").value.length>0'))break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const settingsResult=await evaluate(attached.sessionId,`(()=>{
    const results=[];
    for(const tab of document.querySelectorAll('.tab')) {
      tab.click();const panel=document.querySelector('.panel.active');
      panel.scrollTop=panel.scrollHeight;
      const footer=document.querySelector('.footer').getBoundingClientRect();
      results.push({name:'settings '+tab.dataset.tab,passed:panel.dataset.panel===tab.dataset.tab && footer.bottom<=innerHeight+1 && (panel.scrollHeight<=panel.clientHeight+1||panel.scrollTop>0)});
    }
    document.querySelector('[data-tab="project"]').click();
    document.getElementById('project-name').value='UI Audit Project';
    document.getElementById('btn-save').click();
    return results;
  })()`);
  report.results.push(...settingsResult);
  for(const result of settingsResult)if(!result.passed)report.failures.push(result.name);
  let saved=false;
  for(let attempt=0;attempt<40;attempt++) {
    saved=await evaluate(attached.sessionId,'(async()=>{const result=await window.electronAPI.getProjectSettings("");return result.success && result.settings.projectName==="UI Audit Project";})()');
    if(saved)break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  report.results.push({name:'settings Save Settings',passed:saved});
  if(!saved)report.failures.push('settings Save Settings');
  const settingsShot=await send('Page.captureScreenshot',{},attached.sessionId);
  fs.writeFileSync(path.join(output,'settings.png'),Buffer.from(settingsShot.data,'base64'));
  await evaluate(attached.sessionId,'document.getElementById("btn-cancel").click(); true').catch(()=>{});
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log('UI_AUDIT',JSON.stringify({checks:report.results.length,failures:report.failures,unbound}));
  if(errors.length||report.failures.length)throw new Error(JSON.stringify({errors,failures:report.failures}));
};
