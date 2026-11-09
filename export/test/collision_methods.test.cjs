const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {getSchema}=require('../project_snapshot');
const {buildNativeProject}=require('../native_build');
const {validateSnapshot}=require('../build_diagnostics');
const root=path.resolve(__dirname,'../..');

test('desktop and editor settings preserve the collision choice and existing settings',()=>{
  for(const file of ['main.js','editor/scene_editor.js','renderer.js']){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    const start=source.indexOf('function normalizeProjectSettings('),end=source.indexOf('\n}',start)+2;
    const context={state:{projectRoot:''},defaultProjectSettings:()=>({projectName:'Game',input:{movement:'standard',action:'ok',pause:'play'},screen:{width:1280,height:720,mode:'720p'}})};
    vm.createContext(context);vm.runInContext(source.slice(start,end),context);
    const normalized=context.normalizeProjectSettings({startupScene:'Level',debugOverlay:false,physics:{contactMethod:'circle'}},root);
    assert.equal(normalized.physics.contactMethod,'circle',file);
    assert.equal(normalized.startupScene,'Level',file);assert.equal(normalized.debugOverlay,false,file);
    assert.equal(context.normalizeProjectSettings({},root).physics.contactMethod,'aabb',file);
    assert.equal(context.normalizeProjectSettings({physics:{contactMethod:'bad'}},root).physics.contactMethod,'aabb',file);
  }
  const html=fs.readFileSync(path.join(root,'settings.html'),'utf8');
  const start=html.indexOf('    function normalizeSettings('),end=html.indexOf('    async function load()',start);
  const els={};for(const key of ['projectName','contactMethod','inputMovement','inputAction','inputPause','actionMoveUp','actionMoveDown','actionMoveLeft','actionMoveRight','actionBack','screenMode','screenWidth','screenHeight','screenFullscreen'])els[key]={};
  const context={els,settings:{projectName:'Game',startupScene:'Level',debugOverlay:false,physics:{contactMethod:'circle'}}};
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  context.settings=context.normalizeSettings(context.settings);context.render();
  assert.equal(els.contactMethod.value,'circle');els.contactMethod.value='aabb';
  const saved=context.collect();assert.equal(saved.physics.contactMethod,'aabb');assert.equal(saved.startupScene,'Level');assert.equal(saved.debugOverlay,false);
});

test('collider choices round trip and the editor draws the selected trigger shape',()=>{
  const schema=getSchema();
  const node=schema.createDefaultNode('Node2D',{id:'collider',components:[{type:'Collider2DComponent',isTrigger:true,contactMethod:'circle',circleRadius:8,width:40,height:20,offsetX:3,offsetY:4}]});
  const normalized=schema.normalizeScene({formatVersion:2,scene:{name:'Test',rootNodeId:'collider'},nodes:[node]});
  assert.equal(normalized.nodes[0].components[0].contactMethod,'circle');
  const trigger=schema.createDefaultNode('TriggerZone2D');assert.equal(trigger.properties.contactMethod,'project');
  assert.ok(schema.getNodeFields('TriggerZone2D').some(f=>f.key==='properties.contactMethod'&&f.type==='select'&&f.options.includes('circle')));
  const source=fs.readFileSync(path.join(root,'editor/scene_editor.js'),'utf8');
  const start=source.indexOf('function _addPhysicsShapesOverlay('),end=source.indexOf('\nfunction ',start+1);
  const Konva=require('konva/lib/_FullInternals').Konva;
  const context={Konva,state:{projectSettings:{physics:{contactMethod:'circle'}}},getNodeOutlineAttrs:()=>({strokeWidth:1,dash:[6,4]})};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  let group=new Konva.Group();context._addPhysicsShapesOverlay(group,node);
  const circle=group.getChildren()[0].getChildren()[0];assert.equal(circle.getClassName(),'Circle');assert.equal(circle.radius(),8);assert.equal(circle.x(),23);assert.equal(circle.y(),14);
  assert.equal(group.getChildren()[0].getClientRect().width,0);group.destroy();
  node.components[0].contactMethod='project';group=new Konva.Group();context._addPhysicsShapesOverlay(group,node);assert.equal(group.getChildren()[0].getChildren()[0].getClassName(),'Circle');group.destroy();
  node.components[0].isTrigger=false;group=new Konva.Group();context._addPhysicsShapesOverlay(group,node);assert.equal(group.getChildren()[0].getChildren()[0].getClassName(),'Rect');group.destroy();
});

test('native exports retain project and collider choices and diagnose unsupported solid circles',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'rge-contact-'));
  try{
    const result=buildNativeProject({projectRoot:path.join(root,'samples/gameplay-helpers'),settings:{physics:{contactMethod:'circle'}}},{buildRoot:temporary});
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.output,'assets/project_settings.json'))).physics.contactMethod,'circle');
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
  const schema=getSchema(),node=schema.createDefaultNode('Node2D',{id:'root',components:[{type:'Collider2DComponent',isTrigger:false,contactMethod:'circle'}]});
  const doc={scene:{name:'Test',rootNodeId:'root'},nodes:[node]};
  assert.ok(validateSnapshot(root,[{runtimeScene:doc}],'Test').some(d=>d.code==='NATIVE_CIRCLE_SOLID'));
  node.components[0].isTrigger=true;node.transform.rotation=45;
  assert.ok(!validateSnapshot(root,[{runtimeScene:doc}],'Test').some(d=>d.code==='NATIVE_COLLIDER_AABB'||d.code==='NATIVE_CIRCLE_SOLID'));
});
