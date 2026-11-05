const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildNativeProject}=require('../native_build');
const root=require('../../tools/mol-project-path.cjs')();
test('MOL is a self-contained editable project with native node presentation',{skip:!root},()=>{
  const scene=JSON.parse(fs.readFileSync(path.join(root,'MOL.rkscene')));
  assert.equal(scene.nodes.length,215);
  for(const id of ['Player','Prayer','Playfield','HUD','Menu','Intro','Instructions','Scores','Entry','Credits','Overlay','Enemy10','PlayerShot','Pickup'])assert.ok(scene.nodes.some(n=>n.id===id),id);
  assert.equal(scene.nodes.find(n=>n.id==='root').components[0].scriptPath,'res://components/mol_controller.brs');
  // The editor may have written its generated entry point into an opened project.
  const entry=path.join(root,'source/main.brs');
  if(fs.existsSync(entry))assert.match(fs.readFileSync(entry,'utf8'),/RokuEngine_Create\("MOL"\)/);
  for(const node of scene.nodes)if(node.properties.imagePath)assert.ok(fs.existsSync(path.join(root,node.properties.imagePath.slice(6))),node.id);
  const game=fs.readFileSync(path.join(root,'components/game/game.brs'),'utf8');
  assert.match(game,/g\.day = 22/);assert.match(game,/hp = 500/);
  const controller=fs.readFileSync(path.join(root,'components/mol_controller.brs'),'utf8');
  assert.doesNotMatch(controller,/\.screen\.Draw|\.SwapBuffers\(/);
});
test('MOL packages canonical runtime, all campaign scripts and original assets',{skip:!root},()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'roku-mol-'));
  try{
    const before=fs.readFileSync(path.join(root,'MOL.rkscene'));
    const result=buildNativeProject({projectRoot:root},{buildRoot:temporary});
    assert.equal(result.scriptCount,9);assert.ok(result.zipBytes<8*1024*1024);
    assert.ok(fs.existsSync(path.join(result.output,'audio/intro_text.mp3')));
    assert.ok(fs.existsSync(path.join(result.output,'images/sprites.png')));
    assert.equal(result.startupScene,'MOL');
    assert.deepEqual(fs.readFileSync(path.join(root,'MOL.rkscene')),before);
    assert.equal(fs.existsSync(path.join(result.output,'tests')),false);
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
