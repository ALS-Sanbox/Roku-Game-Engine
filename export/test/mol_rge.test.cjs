const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {getClassicRuntimeSourceFiles}=require('../classic2d_export');
const {buildNativeProject}=require('../native_build');
const {collectProjectBrightScriptFiles,buildUserScriptRegistrySource}=require('../user_scripts');
const root=path.resolve(__dirname,'../../projects/MOL');
const sceneFile=path.join(root,'MOL.rkscene');
const scene=fs.existsSync(sceneFile)?JSON.parse(fs.readFileSync(sceneFile)):null;
const scripts=scene?collectProjectBrightScriptFiles(root):[];

test('rebuilt MOL uses canonical RGE nodes and hooks without a replacement engine',{skip:!scene},()=>{
  for(const type of ['AnimatedSprite2D','Sprite2D','Timer','Button','MenuList','FocusGroup'])assert.ok(scene.nodes.some(n=>n.type===type),type);
  const pools=scene.nodes.flatMap(n=>n.components||[]).find(c=>c.type==='ObjectPoolComponent');
  assert.equal(JSON.parse(pools.pools).length,7);
  for(const def of JSON.parse(pools.pools))for(const component of def.components)if(component.type==='AnimationPlayerComponent')assert.equal(component.triggerAction,'__manual_animation__');
  assert.equal(scene.nodes.find(n=>n.id==='PauseFocus').properties.initialFocus,'Resume');
  const text=scripts.map(e=>fs.readFileSync(e.absolutePath,'utf8')).join('\n');
  assert.doesNotMatch(text,/\bengine\.(?:Render|HandleFocusInput|UpdateFocusState|HandleAudioEvent|DrawDebugText)\s*=/i);
  assert.doesNotMatch(text,/CreateObject\s*\(\s*"ro(?:Screen|AudioPlayer|AudioResource|RegistrySection)"/i);
  assert.match(text,/engine\.QuerySegment\(/);
  const registry=buildUserScriptRegistrySource(scripts.filter(e=>e.hasAnyHookFunctions));
  assert.match(registry,/contacts\.brs" then return \[\]/);
  assert.match(registry,/campaign\.brs" then return \["input", "pre_update", "fixed_update", "update"\]/);
});

test('rebuilt MOL exports its scenes, scripts and playable audio',{skip:!scene},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mol-rge-'));
  try{
    const build=buildNativeProject({projectRoot:root},{buildRoot:dir});
    for(const file of ['assets/scenes/MOL.json','audio/intro_text.mp3','audio/bgm00.wav','audio/boss00.wav','audio/sfx_shoot.wav','source/game_scripts/components_campaign.brs'])assert.ok(fs.existsSync(path.join(build.output,file)),file);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

const interpreterPath=path.resolve(__dirname,'../../tools/brs-engine/packages/node/bin/brs.node.js');
test('MOL campaign, powers, combat, saves and native engine regressions execute in BrightScript',{skip:!scene||!fs.existsSync(interpreterPath)},()=>{
  const brs=require(interpreterPath);
  const runtime=Object.values(getClassicRuntimeSourceFiles()).join('\n');
  const helpers=fs.readFileSync(path.join(__dirname,'fixtures/gameplay_checks.brs'),'utf8');
  const fixture=fs.readFileSync(path.join(__dirname,'fixtures/mol_rge_checks.brs'),'utf8');
  const encoded=JSON.stringify(scene).replaceAll('"','""');
  const source=[runtime,helpers,...scripts.map(e=>fs.readFileSync(e.absolutePath,'utf8')),`molDoc = ParseJSON("${encoded}", "i")`,fixture].join('\n');
  const tokens=brs.Lexer.scan(source);assert.deepEqual(tokens.errors,[]);
  const parsed=brs.Parser.parse(tokens.tokens);assert.deepEqual(parsed.errors,[]);
  let output='';const interpreter=new brs.Interpreter({stdout:{write:v=>output+=v},stderr:{write:v=>output+=v},post:false});
  interpreter.exec(parsed.statements);
  assert.deepEqual(interpreter.errors,[],output);assert.ok(!output.includes('FAIL:'),output);
  assert.match(output,/PASS: MOL native campaign/);
});
