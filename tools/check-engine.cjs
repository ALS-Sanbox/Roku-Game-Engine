const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sampleMode = process.argv.includes('--sample');
const testgeMode = process.argv.includes('--testge');
const molEditorMode = process.argv.includes('--mol-ui');
const molMode = process.argv.includes('--mol') || molEditorMode;
const typographyMode = process.argv.includes('--typography');
const scriptActionsMode = process.argv.includes('--script-actions');
const slicingMode = process.argv.includes('--slicing');
const coordinatesMode = process.argv.includes('--coordinates') || typographyMode;
const fixtureRoot = path.join(root, sampleMode ? '.visual-editor/sample-test-' + process.pid : '.visual-editor/engine-smoke-' + process.pid);
if(sampleMode){fs.mkdirSync(fixtureRoot,{recursive:true});fs.cpSync(path.join(root,'samples/collect-the-stars'),fixtureRoot,{recursive:true});}
if(testgeMode){fs.mkdirSync(fixtureRoot,{recursive:true});fs.cpSync(path.resolve(root,'../TestGE'),fixtureRoot,{recursive:true});}
if(molMode){
  const project = require('./mol-project-path.cjs')();
  if (!project) throw new Error('Set MOL_RGE_PROJECT to the folder containing MOL.rkscene.');
  fs.mkdirSync(fixtureRoot,{recursive:true});fs.cpSync(project,fixtureRoot,{recursive:true});
  if(molEditorMode){
    fs.mkdirSync(path.join(fixtureRoot,'fonts'),{recursive:true});
    fs.copyFileSync(path.join(root,'tools/brs-engine/src/core/common/fonts/RobotoMono-Regular.ttf'),path.join(fixtureRoot,'fonts/RobotoMono-Regular.ttf'));
  }
  const validation=path.join(fixtureRoot,'components/validation');fs.mkdirSync(validation,{recursive:true});
  const calls=[];
  for(const name of ['game_test','frontend_test','audio_test']){
    let source=fs.readFileSync(path.join(fixtureRoot,'tests',name+'.brs'),'utf8');
    const names=[...source.matchAll(/^(?:sub|function)\s+(\w+)\s*\(/gmi)].map(m=>m[1]);
    for(const functionName of names)source=source.replace(new RegExp('\\b'+functionName+'\\b','gi'),'MOLValidation_'+name+'_'+functionName);
    fs.writeFileSync(path.join(validation,name+'.brs'),source);calls.push('  MOLValidation_'+name+'_Main()');
  }
  fs.writeFileSync(path.join(validation,'validate.brs'),'sub RokuScript_components_validation_validate_Ready(context as Object)\n'+calls.join('\n')+'\nend sub\n'+`
sub RokuScript_components_validation_validate_Update(context as Object)
  state = context.scene.runtime.mol
  if state.game.mode = "playing" and state.validationPoolChecked <> true
    visible = 0
    for each kind in state.pools
      for each node in state.pools[kind]
        if node.parentId <> "Playfield" then print "FAIL: MOL runtime clone parent"
        tf = context.engine.GetNodeScreenTransform(node.id)
        if tf.visible then visible = visible + 1
      end for
    end for
    if visible > 0
      print "PASS: MOL runtime clones leave hidden template layer"
      state.validationPoolChecked = true
    end if
  end if
  down = context.engine.inputState.heldActions.options = true or context.engine.inputState.pressedActions.options = true
  if down and state.validationOptionDown <> true
    g = state.game
    if g.day = 22 and g.mode = "playing"
      g.enemies = [] : g.hostile = [] : g.firing = false
      print "MOL_VALIDATION final encounter cleared"
    else if g.mode = "delivering"
      g.delivery.time = 5 : g.score = 123456
      print "MOL_VALIDATION delivery checkpoint"
    end if
  end if
  state.validationOptionDown = down
end sub
`);
  const file=path.join(fixtureRoot,'MOL.rkscene'),doc=JSON.parse(fs.readFileSync(file));
  doc.nodes[0].components[0].debugLogging=true;
  doc.nodes[0].components.push({type:'ScriptComponent',enabled:true,scriptPath:'res://components/validation/validate.brs'});
  fs.writeFileSync(file,JSON.stringify(doc));
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function node(id, type, parentId, x, y, properties = {}) {
  return { id, name: id, type, parentId, children: [], visible: true, zIndex: 0, transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 }, properties, components: [] };
}
const scene = { formatVersion: 2, scene: { name: 'SmokeScene', rootNodeId: 'root' }, nodes: [
  node('root', 'SceneRoot', null, 0, 0),
  node('player', 'Node2D', 'root', 100, 150, { width: 64, height: 64, tint: '#00ff80' }),
  node('sprite', 'Sprite2D', 'player', 100, 0, { width: 64, height: 64, imagePath: 'res://images/pixel.png' }),
  node('camera', 'Camera2D', 'root', 0, 0, { enabled: true, current: true, followTargetName: 'player', followLerp: 1, zoom: 1 }),
  node('hud', 'CanvasLayer', 'root', 0, 0),
  node('panel', 'Panel', 'hud', 20, 20, { width: 400, height: 100, color: '#224466', opacity: 1 }),
  node('label', 'Label', 'hud', 30, 30, { width: 360, height: 60, text: 'Native Roku engine running', textColor: '#ffffff', fontSize: 22, opacity: 1 }),
  node('texture', 'TextureRect', 'hud', 500, 150, { width: 80, height: 80, imagePath: 'res://images/pixel.png', opacity: 1 })
] };
scene.nodes.find(n => n.id === 'player').components = [{ type: 'MoveComponent', enabled: true, vx: 60, vy: 0 }];
if (coordinatesMode) {
  scene.nodes = [node('root','SceneRoot',null,0,0),
    node('parent','Node2D','root',400,250,{width:0,height:0}),
    node('sprite','Sprite2D','parent',100,50,{width:40,height:40,imagePath:'res://images/pixel.png'}),
    node('camera','Camera2D','root',640,360,{current:true,enabled:true,zoom:2,cameraBounds:true,boundsX:320,boundsY:180,boundsWidth:640,boundsHeight:360}),
    node('hud','CanvasLayer','parent',0,0),
    node('container','Control','hud',100,50,{width:200,height:100}),
    node('panel','Panel','container',0,0,{width:60,height:20,color:'#224466',anchorLeft:1,anchorRight:1,marginLeft:-80,marginTop:10})];
  scene.nodes.find(n=>n.id==='parent').transform.scaleX=2;
  scene.nodes.find(n=>n.id==='parent').transform.scaleY=2;
  scene.nodes.find(n=>n.id==='sprite').transform.pivotX=10;
  scene.nodes.find(n=>n.id==='sprite').transform.pivotY=10;
  scene.nodes.find(n=>n.id==='container').transform.scaleX=2;
  scene.nodes.find(n=>n.id==='container').transform.scaleY=2;
}

for (const n of scene.nodes) n.children = scene.nodes.filter(c => c.parentId === n.id).map(c => c.id);
fs.mkdirSync(fixtureRoot, { recursive: true });
if(typographyMode){
  fs.mkdirSync(path.join(fixtureRoot,'fonts'),{recursive:true});
  fs.copyFileSync(path.join(root,'tools/brs-engine/src/core/common/fonts/RobotoMono-Regular.ttf'),path.join(fixtureRoot,'fonts/RobotoMono-Regular.ttf'));
  for(const [id,x,style] of [['plain',40,{}],['styled',360,{fontBold:true,fontItalic:true,align:'right',valign:'bottom'}],['custom',680,{fontFamily:'Roboto Mono',fontPath:'res://fonts/RobotoMono-Regular.ttf'}],['multiline',980,{text:'Line one\nLine two',valign:'top'}]])scene.nodes.push(node(id,'Label','hud',x,520,{width:260,height:80,text:'Font Aa 123',fontSize:28,textColor:'#ffffff',...style}));
  for(const n of scene.nodes)n.children=scene.nodes.filter(c=>c.parentId===n.id).map(c=>c.id);
}
if(coordinatesMode){
  fs.mkdirSync(path.join(fixtureRoot,'components'),{recursive:true});
  fs.copyFileSync(path.join(root,'tools/fixtures/coordinates.brs'),path.join(fixtureRoot,'components/coordinates.brs'));
  scene.nodes.find(n=>n.id==='root').components=[{type:'ScriptComponent',enabled:true,scriptPath:'res://components/coordinates.brs'}];
  scene.nodes.find(n=>n.id==='sprite').components=[{type:'Collider2DComponent',enabled:true,width:40,height:40,isTrigger:true}];
}

fs.mkdirSync(path.join(fixtureRoot, 'images'), { recursive: true });
function pngChunk(type, data) {
  const name = Buffer.from(type), header = Buffer.alloc(4), crc = Buffer.alloc(4); header.writeUInt32BE(data.length);
  crc.writeUInt32BE(require('../visual-editor/roku-package').crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, crc]);
}
const dimensions = Buffer.alloc(13); dimensions.writeUInt32BE(1, 0); dimensions.writeUInt32BE(1, 4); dimensions[8] = 8; dimensions[9] = 6;
fs.writeFileSync(path.join(fixtureRoot, 'images/pixel.png'), Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', dimensions), pngChunk('IDAT', require('node:zlib').deflateSync(Buffer.from([0, 0, 80, 255, 255]))), pngChunk('IEND', Buffer.alloc(0))]));
if (scriptActionsMode) {
  scene.nodes.push(node('scriptButton','Button','hud',100,200,{width:300,height:60,text:'Run script',focusable:true,action:'custom:EditorCheck'}));
  scene.nodes.find(n=>n.id==='scriptButton').components=[{type:'ScriptComponent',enabled:true,scriptPath:'res://components/button.brs'}];
  scene.nodes.find(n=>n.id==='hud').children.push('scriptButton');
  fs.mkdirSync(path.join(fixtureRoot,'components'),{recursive:true});
  fs.writeFileSync(path.join(fixtureRoot,'components/button.brs'),`sub RokuScript_components_button_Ready(context as Object)
  print "SCRIPT_READY saved"
end sub
sub RokuScript_components_button_Action(context as Object)
  if context.extra.nodeId <> context.node.id then return
  if context.extra.name <> "EditorCheck" then return
  label = context.scene.nodeMap["label"]
  player = context.scene.nodeMap["player"]
  label.properties.text = "Button script ran"
  player.transform.x = 999
  print "SCRIPT_ACTION passed "; label.properties.text; " x="; player.transform.x
end sub
`);
}
if(slicingMode){
  scene.nodes=[node('root','SceneRoot',null,0,0),node('hud','CanvasLayer','root',0,0)];scene.nodes[0].children=['hud'];
  const size=Buffer.alloc(13);size.writeUInt32BE(64,0);size.writeUInt32BE(32,4);size[8]=8;size[9]=6;
  const pixels=Buffer.alloc((64*4+1)*32);
  for(let y=0;y<32;y++)for(let x=0;x<64;x++){const i=y*257+1+x*4;const edge=x>=32&&(x<34||x>=62||y<2||y>=30);const rgb=x<32?[255,0,0]:edge?[255,255,0]:[0,255,0];pixels.set([...rgb,255],i);}
  fs.writeFileSync(path.join(fixtureRoot,'images/slicing.png'),Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),pngChunk('IHDR',size),pngChunk('IDAT',require('node:zlib').deflateSync(pixels)),pngChunk('IEND',Buffer.alloc(0))]));
}
if (!sampleMode && !testgeMode && !molMode) fs.writeFileSync(path.join(fixtureRoot, 'SmokeScene.rkscene'), JSON.stringify(scene));
async function main() {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), ['.', '--engine-smoke-test', '--remote-debugging-port=0'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let socket;
  try {
    const address = await new Promise((resolve, reject) => {
      let logs = ''; const timer = setTimeout(() => reject(new Error('Engine startup timed out: ' + logs)), 20000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stderr.on('data', chunk => { logs += chunk; const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      child.stdout.on('data', chunk => process.stdout.write(chunk));
    });
    socket = new WebSocket(address); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0; const waiting = new Map(); const errors = [];
    socket.onmessage = event => {
      const m = JSON.parse(event.data);
      if (m.id && waiting.has(m.id)) { const cb = waiting.get(m.id); waiting.delete(m.id); m.error ? cb.reject(new Error(m.error.message)) : cb.resolve(m.result); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (molEditorMode && m.method === 'Page.javascriptDialogOpening') {
        console.log('UI_TEST_DIALOG',m.params.type,m.params.message.slice(0,160));
        void send('Page.handleJavaScriptDialog',{accept:false},m.sessionId).catch(error=>console.error(error.message));
      }
    };
    function send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++seq, timer = setTimeout(() => { waiting.delete(id); reject(new Error('Timed out: ' + method)); }, 30000);
        waiting.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }
    const evaluate = async (session, expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session).catch(e=>{throw new Error(e.message+' evaluating '+expression.slice(0,180));});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await delay(1000);
    const targets = await send('Target.getTargets');
    const page = targets.targetInfos.find(t => t.type === 'page');
    const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    if(molEditorMode)await send('Page.enable',{},sessionId);
    for (let attempt = 0; ; attempt++) {
      if (await evaluate(sessionId, '!!window.electronAPI?.openProjectInEditor')) break;
      if (attempt >= 60) throw new Error('Project manager did not initialize');
      await delay(500);
    }
    await evaluate(sessionId, `void window.electronAPI.openProjectInEditor(${JSON.stringify(fixtureRoot)}); true`);
    for (let attempt = 0; ; attempt++) {
      if (await evaluate(sessionId, 'typeof state!=="undefined" && state.sceneState?.scene?.name===' + JSON.stringify(molMode ? 'MOL' : testgeMode ? 'MainScene' : sampleMode ? 'CollectStars' : 'SmokeScene') + ' && !!document.getElementById("btn-test-simulator")')) break;
      if (attempt >= 60) throw new Error('Scene editor did not initialize');
      await delay(500);
    }
    console.log('EDITOR', JSON.stringify(await evaluate(sessionId, '({title:document.title,scene:typeof state!=="undefined"?state.sceneState.scene.name:null,projectRoot:state.projectRoot,status:state.status,logs:state.logs.slice(-8),viewportError:window.__viewportInitError?.message,konva:typeof Konva,buildButton:!!document.getElementById("btn-test-simulator")})')));
    if (errors.length) throw new Error(errors.join('\n'));
    if (testgeMode) {
      let texture;
      for(let attempt=0;attempt<40;attempt++) {
        texture=await evaluate(sessionId,'(()=>{const n=getNodes().find(n=>n.type==="TextureRect"),img=state.imageCache.get(n?.id);return {loaded:!!img?.complete&&img.naturalWidth>0,width:img?.naturalWidth,height:img?.naturalHeight};})()');
        if(texture.loaded)break;
        await delay(250);
      }
      if(!texture?.loaded)throw new Error('TestGE texture was not restored in the editor');
      console.log('TESTGE_EDITOR_TEXTURE',JSON.stringify(texture));
      const layout=await evaluate(sessionId,`(async()=>{
        const saved=serializeScene();
        try {
          const n=getNodes().find(n=>n.type==='TextureRect');
          selectNode(n.id);await new Promise(resolve=>setTimeout(resolve,200));
          const shape=shapeRefs.get(n.id);
          for(let i=0;i<20;i++) {
            captureTransformerSession();shape.scaleX(shape.scaleX()*1.05);shape.scaleY(shape.scaleY()*.95);
            const left=shape.x()-shape.offsetX()*shape.scaleX(),top=shape.y()-shape.offsetY()*shape.scaleY();
            syncSelectedNodesFromShapes();
            if(Math.abs(n.transform.x-n.transform.pivotX*n.transform.scaleX-left)>.001||Math.abs(n.transform.y-n.transform.pivotY*n.transform.scaleY-top)>.001)throw new Error('Resize drift at iteration '+i);
          }
          refreshInspector({force:true});
          const titles=Array.from(document.querySelectorAll('#inspector .anchor-preset-btn,#inspector .anchor-stretch-btn')).map(b=>b.title);
          if(titles.length!==16)throw new Error('Expected all 16 anchor controls');
          for(const title of titles) {
            refreshInspector({force:true});
            Array.from(document.querySelectorAll('#inspector .anchor-preset-btn,#inspector .anchor-stretch-btn')).find(b=>b.title===title).click();
            const once=JSON.stringify({transform:n.transform,properties:n.properties});
            for(let i=0;i<10;i++)RGEUIEditor.applyAnchorLayout();
            if(JSON.stringify({transform:n.transform,properties:n.properties})!==once)throw new Error('Anchor drift: '+title);
          }
          return {resizes:20,presets:titles.length,passed:true};
        } finally {applySceneSnapshot(saved,'Restored TestGE after layout checks');}
      })()`);
      console.log('TESTGE_LAYOUT',JSON.stringify(layout));
    }
    if (process.argv.includes('--ui')) {
      await require('./check-editor-ui.cjs')({ send, evaluate, sessionId, errors, fixtureRoot });
      await evaluate(sessionId, 'window.electronAPI.closeWindow(); true');
      return;
    }
    if(molEditorMode){
      await require(process.argv.includes('--scripts') ? './check-scripts.cjs' : './check-ui-screens.cjs')({send,evaluate,sessionId,errors,fixtureRoot});
      await evaluate(sessionId, 'window.electronAPI.closeWindow(); true'); return;
    }
    if(molMode){
      const edited=await evaluate(sessionId,`(async()=>{getNode('Player').properties.width=72;getNode('Version').properties.text='EDITABLE ENGINE PROJECT';if(!await saveProject())throw new Error('MOL project save failed');return true;})()`);
      await evaluate(sessionId,`void window.electronAPI.openProjectInEditor(${JSON.stringify(fixtureRoot)});true`);
      let reopened=false;
      for(let attempt=0;attempt<60;attempt++){
        try{reopened=await evaluate(sessionId,'typeof state!=="undefined" && getNode("Player")?.properties.width===72 && getNode("Version")?.properties.text==="EDITABLE ENGINE PROJECT"');}catch{}
        if(reopened)break;await delay(250);
      }
      if(!reopened)throw new Error('MOL editable scene did not survive save/reopen');
      console.log('MOL_SAVE_REOPEN',JSON.stringify({edited,reopened}));
    }
    if (sampleMode) {
      const saved = await evaluate(sessionId, `(async()=>{
        getNode('player').transform.x=210;
        getNode('instructions').properties.text='Edited in the desktop editor';
        duplicateNode('star1');
        const copy=state.sceneState.nodes.find(n=>n.metadata?.collectible&&n.id!=='star1'&&n.id!=='star2'&&n.id!=='star3');
        copy.transform.x=500;copy.transform.y=300;
        if(!await saveProject())throw new Error('Project save failed');
        getNode('player').transform.x=999;
        await openProjectFromRoot(state.projectRoot);
        return {x:getNode('player').transform.x,text:getNode('instructions').properties.text,count:state.sceneState.nodes.filter(n=>n.metadata?.collectible).length};
      })()`);
      if(saved.x!==210||saved.text!=='Edited in the desktop editor'||saved.count!==4)throw new Error('Save/reopen failed: '+JSON.stringify(saved));
      console.log('SAVE_REOPEN',JSON.stringify(saved));
    }
    if(slicingMode){
      for(let i=0;i<60;i++){if(await evaluate(sessionId,'!!window.RGEShowDockTab && !!window.RGESpriteSlicer'))break;await delay(100);}
      await require('./check-slicing.cjs')({send,evaluate,sessionId,fixtureRoot});
    }
    if(scriptActionsMode)await evaluate(sessionId,`(async()=>{await RGEScriptEditor.open('res://components/button.brs');const area=document.getElementById('script-text');area.value=area.value.replace('SCRIPT_READY saved','SCRIPT_READY auto-saved');area.dispatchEvent(new Event('input'));return true;})()`);
    const result = await evaluate(sessionId, 'testInRokuSimulator()');
    console.log('BUILD', JSON.stringify(result));
    if (!result?.success) throw new Error('Build & Test failed: ' + await evaluate(sessionId, 'state.status'));
    await delay(1000);
    const next = await send('Target.getTargets'); const preview = next.targetInfos.find(t => t.type === 'page' && t.url.includes('/simulator/'));
    if (!preview) throw new Error('Simulator window did not open.');
    const attached = await send('Target.attachToTarget', { targetId: preview.targetId, flatten: true });
    await send('Runtime.enable', {}, attached.sessionId);
    let snapshot;
    for (let i = 0; i < (molMode?120:30); i++) {
      await delay(500);
      snapshot = await evaluate(attached.sessionId, '({state:document.getElementById("state")?.textContent,logs:document.getElementById("logs")?.textContent,painted:document.getElementById("display")?.getContext("2d").getImageData(0,0,1280,720).data.some((v,i)=>i%4!==3&&v>0),isolated:crossOriginIsolated})');
      if (snapshot.painted || snapshot.state?.includes('error') || snapshot.state === 'Game stopped.') break;
    }
    console.log('SIMULATOR', JSON.stringify(snapshot));
    if (!snapshot.painted || !snapshot.state?.startsWith('Running') || /runtime error|compile error|error:/i.test(snapshot.logs) || errors.length) throw new Error('Engine simulator failed: ' + JSON.stringify({ snapshot, errors }));
    if(slicingMode){
      const pixels=await evaluate(attached.sessionId,'(()=>{const ctx=brs.getDisplayBuffer().getContext("2d");const p=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3);return {sprite:p(140,140),texture:p(340,140),button:p(540,140),panel:p(740,140),panelCorner:p(700,100),panelInterior:p(703,103)};})()');
      console.log('SLICING_NATIVE',JSON.stringify(pixels));
      for(const [key,value]of Object.entries(pixels)){
        const ok=key==='panelCorner'?value[0]>200&&value[1]>200&&value[2]<150:JSON.stringify(value)==='[0,255,0]';
        if(!ok)throw new Error('Slicing pixel mismatch: '+key);
      }
      await send('Target.closeTarget',{targetId:preview.targetId});await evaluate(sessionId,'window.electronAPI.closeWindow();true');return;
    }
    if(scriptActionsMode){
      await evaluate(attached.sessionId,'brs.sendKeyPress("select",60)');
      let logs='';
      for(let i=0;i<40;i++){await delay(250);logs=await evaluate(attached.sessionId,'document.getElementById("logs").textContent');if(logs.includes('SCRIPT_ACTION passed'))break;}
      if(!logs.includes('SCRIPT_READY auto-saved')||!logs.includes('SCRIPT_ACTION passed Button script ran x= 999'))throw new Error('Script hookup failed: '+logs);
      console.log('SCRIPT_ACTION_NATIVE',logs);
      await send('Target.closeTarget',{targetId:preview.targetId});await evaluate(sessionId,'window.electronAPI.closeWindow();true');return;
    }
    if(molMode){
      await require('./check-mol-project.cjs')({send,evaluate,sessionId,previewSession:attached.sessionId,build:result,errors});
      await send('Target.closeTarget',{targetId:preview.targetId});await evaluate(sessionId,'window.electronAPI.closeWindow();true');return;
    }
    if (testgeMode) {
      await delay(1000);
      const colors=await evaluate(attached.sessionId,'(()=>{const d=brs.getDisplayBuffer().getContext("2d").getImageData(0,0,1280,720).data,s=new Set();for(let i=0;i<d.length;i+=16)s.add(d[i]+","+d[i+1]+","+d[i+2]);return s.size;})()');
      if(colors<100)throw new Error('TestGE framebuffer lacks texture colors: '+colors);
      const output=path.join(root,'.visual-editor/artifacts/testge');fs.mkdirSync(output,{recursive:true});
      const screenshot=await send('Page.captureScreenshot',{},attached.sessionId);
      fs.writeFileSync(path.join(output,'simulator.png'),Buffer.from(screenshot.data,'base64'));
      console.log('TESTGE_SIMULATOR_TEXTURE',JSON.stringify({colors,output}));
      await send('Target.closeTarget',{targetId:preview.targetId});
      await evaluate(sessionId,'window.electronAPI.returnToProjectManager(); true');
      for(let attempt=0;attempt<40;attempt++) {
        if(await evaluate(sessionId,'!!document.getElementById("pm-close-btn")'))break;
        await delay(250);
      }
      await evaluate(sessionId,'document.getElementById("pm-close-btn").click(); true').catch(()=>{});
      if(child.exitCode===null)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Manager Close did not exit the app')),5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
      console.log('MANAGER_CLOSE passed');return;
    }
    if (coordinatesMode) {
      if(typographyMode){
        await delay(1500);
        const regions=await evaluate(attached.sessionId,'[40,360,680,980].map(x=>{const c=brs.getDisplayBuffer(),d=c.getContext("2d").getImageData(x,520,260,80).data;let ink=0,hash=2166136261;for(let i=0;i<d.length;i++){hash=Math.imul(hash^d[i],16777619);if(i%4===0&&d[i]>200&&d[i+1]>200&&d[i+2]>200)ink++;}return {ink,hash:hash>>>0};})');
        if(regions.some(r=>r.ink<50)||new Set(regions.map(r=>r.hash)).size!==4)throw new Error('Native text styling/custom font failure: '+JSON.stringify(regions));
        console.log('NATIVE_TYPOGRAPHY',JSON.stringify(regions));
      }
      await delay(1000);
      const pixels=await evaluate(attached.sessionId,`(()=>{const ctx=brs.getDisplayBuffer().getContext('2d');const p=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);return {sprite:p(530,350),beforeSprite:p(500,350),afterSprite:p(690,350),panel:p(350,80),outsidePanel:p(470,80)};})()`);
      const coordinateLogs=await evaluate(attached.sessionId,'document.getElementById("logs").textContent');
      if(!coordinateLogs.includes('COORDINATE_MODEL passed')||coordinateLogs.includes('COORDINATE_FAILURE'))throw new Error(coordinateLogs);
      console.log('STATIC_ZOOM_BOUNDS_PIVOT_ANCHORS',JSON.stringify(pixels));
      if(JSON.stringify(pixels.sprite.slice(0,3))!=='[0,80,255]'||JSON.stringify(pixels.panel.slice(0,3))!=='[34,68,102]'||pixels.beforeSprite[2]===255||pixels.afterSprite[2]===255||pixels.outsidePanel[1]===68)throw new Error('Coordinate framebuffer mismatch');
      await send('Target.closeTarget',{targetId:preview.targetId});await evaluate(sessionId,'window.electronAPI.closeWindow(); true');return;
    }
    if (sampleMode) {
      async function waitFor(expression, message, timeout=15000) {const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(attached.sessionId,expression))return;await delay(200);}throw new Error(message+': '+await evaluate(attached.sessionId,'document.getElementById("logs").textContent'));}
      await waitFor('document.getElementById("logs").textContent.includes("UI: Title")','Title did not initialize');
      await evaluate(attached.sessionId,'brs.sendKeyPress("select",60)');
      await waitFor('document.getElementById("logs").textContent.includes("UI: Game")','Start button did not activate Game');
      await delay(500);
      await evaluate(attached.sessionId,'brs.sendKeyDown("right")');
      await waitFor('document.getElementById("logs").textContent.includes("score= 4") || document.getElementById("logs").textContent.includes("score=4")','Collection did not reach 4',90000);
      await evaluate(attached.sessionId,'brs.sendKeyUp("right")');
      await waitFor('document.getElementById("logs").textContent.includes("UI: Win")','Win screen did not activate');
      await waitFor('brs.getDisplayBuffer().getContext("2d").getImageData(100,150,1,1).data[1]===43','Win framebuffer did not draw');
      const win=await evaluate(attached.sessionId,'Array.from(brs.getDisplayBuffer().getContext("2d").getImageData(100,150,1,1).data)');
      console.log('SAMPLE_WIN',JSON.stringify(win));
      if(win[1]!==43)throw new Error('Win framebuffer mismatch');
      await delay(500);await evaluate(attached.sessionId,'brs.sendKeyPress("select",60)');
      await waitFor('document.getElementById("logs").textContent.split("UI: Title").length>=3','Restart did not reload Title');
      console.log('SAMPLE_GAMEPLAY',await evaluate(attached.sessionId,'document.getElementById("logs").textContent'));
      const snapshot=await evaluate(sessionId,'getNativeBuildSnapshot()');
      const destination=path.join(fixtureRoot,'exported.zip');
      const exported=await evaluate(sessionId,'window.electronAPI.exportRokuProject('+JSON.stringify({...snapshot,destination})+')');
      const sideload=await evaluate(sessionId,'window.electronAPI.sideloadBuild({})');
      if(!exported.success||!sideload.success)throw new Error('Build consumer failed: '+JSON.stringify({exported,sideload}));
      const {packageFiles}=require('../visual-editor/roku-package');const fingerprint=dir=>Object.fromEntries(packageFiles(dir).filter(f=>f!=='build-result.json').map(f=>[f,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(dir,f))).digest('hex')]));
      if(JSON.stringify(fingerprint(result.output))!==JSON.stringify(fingerprint(exported.output))||JSON.stringify(fingerprint(result.output))!==JSON.stringify(fingerprint(sideload.output)))throw new Error('Native package consumer mismatch');
      console.log('BUILD_EQUIVALENCE passed');
      await send('Target.closeTarget',{targetId:preview.targetId});await evaluate(sessionId,'window.electronAPI.closeWindow(); true');return;
    }
    await delay(1000);
    const pixelExpression = '(()=>{const c=brs.getDisplayBuffer(),ctx=c.getContext("2d"),pixel=(x,y)=>Array.from(ctx.getImageData(Math.floor(c.width*x/1280),Math.floor(c.height*y/720),1,1).data);return {player:pixel(640,360),sprite:pixel(740,360),hud:pixel(390,100),texture:pixel(550,190),outsideTexture:pixel(600,190),state:document.getElementById("state").textContent};})()';
    const first = await evaluate(attached.sessionId, pixelExpression); await delay(800); const second = await evaluate(attached.sessionId, pixelExpression);
    console.log('CAMERA_AND_UI', JSON.stringify({ first, second }));
    const equal = (a, b) => JSON.stringify(a.slice(0, 3)) === JSON.stringify(b);
    if (!equal(second.player, [0, 255, 128]) || !equal(second.sprite, [0, 80, 255]) || !equal(second.hud, [34, 68, 102]) || !equal(second.texture, [0, 80, 255]) || equal(second.outsideTexture, [0, 80, 255]) || JSON.stringify(first) !== JSON.stringify(second)) throw new Error('Camera-follow, sprite or UI rendering regression.');
    await send('Target.closeTarget', { targetId: preview.targetId });
    await evaluate(sessionId, 'window.electronAPI.closeWindow(); true');
  } finally { socket?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
