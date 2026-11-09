const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {getSchema}=require('../project_snapshot'),{validateSnapshot}=require('../build_diagnostics');
const geometry=require('../../editor/layout_geometry'),schema=getSchema();
test('nested UI containers match runtime slots with hidden siblings, anchors and center pivots',()=>{
 const make=(id,type,parentId,properties={})=>schema.createDefaultNode(type,{id,name:id,parentId,properties});
 const canvas=make('canvas','CanvasLayer',null),row=make('row','HBoxContainer','canvas',{width:300,height:200,separation:10,alignment:'center'});
 const column=make('column','VBoxContainer','row',{width:100,height:80,separation:4,alignment:'end'});
 const button=make('button','Button','column',{width:70,height:50,anchorLeft:.5,anchorTop:.5});Object.assign(button.transform,{pivotPreset:'center',pivotX:35,pivotY:25});
 const hidden=make('hidden','Button','row',{width:200,height:20});hidden.visible=false;
 const world=make('world','Node2D','row');const second=make('second','Button','row',{width:80,height:40});
 const nodes=[button,column,hidden,world,second,row,canvas];
 const bridge={getNodes:()=>nodes,getEditorState:()=>({uiMeta:{resolution:'1280x720'}}),isUiNodeType:schema.isUiNodeType};
 const c={RGELayoutGeometry:geometry,RGESceneBridge:bridge};c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../editor/ui_editor.js'),'utf8'),c);
 c.RGEUIEditor.applyContainerLayout();
 assert.equal(column.transform.x-column.transform.pivotX,55);assert.equal(column.properties.height,200);
 assert.equal(second.transform.x-second.transform.pivotX,165);
 assert.equal(button.transform.x-button.transform.pivotX,0);assert.equal(button.transform.y-button.transform.pivotY,150);
 assert.equal(button.properties.width,100);assert.equal(button.properties.height,50);
 const before=JSON.stringify(nodes);for(let i=0;i<10;i++)c.RGEUIEditor.applyContainerLayout();assert.equal(JSON.stringify(nodes),before,'repeated redraws do not move controls');
});
test('build diagnostics check menu item links and built-in targets with runtime whitespace rules',()=>{
 const root=schema.createDefaultNode('SceneRoot',{id:'root',name:'Root'});
 const menu=schema.createDefaultNode('MenuList',{id:'menu',name:'Menu',parentId:'root',properties:{items:[{label:'Start',action:' scene: Game '},{label:'Bad',action:'scene:Typo'},{label:'Screen',action:'screen:Missing'}]}});
 const records=[{runtimeScene:{scene:{name:'Title',rootNodeId:'root'},nodes:[root,menu]}},{runtimeScene:{scene:{name:'Game',rootNodeId:'root'},nodes:[root]}}];
 let errors=validateSnapshot(process.cwd(),records,'Title').filter(d=>d.severity==='error');
 assert.ok(!errors.some(d=>d.property==='items[0].action'));
 assert.ok(errors.some(d=>d.code==='SCENE_REFERENCE'&&d.property==='items[1].action'));
 assert.ok(errors.some(d=>d.code==='SCREEN_REFERENCE'&&d.property==='items[2].action'));
 menu.properties.items=[];menu.properties.action='open_options';errors=validateSnapshot(process.cwd(),records,'Title');assert.ok(errors.some(d=>d.code==='SCENE_REFERENCE'&&d.property==='action'));
 menu.properties.action='start_game';assert.ok(!validateSnapshot(process.cwd(),records,'Title').some(d=>d.code==='SCENE_REFERENCE'));
});
test('new CanvasLayers start at the screen origin and explicit saved pivots survive',()=>{
 const layer=schema.createDefaultNode('CanvasLayer');assert.equal(layer.transform.pivotX,0);assert.equal(layer.transform.pivotY,0);
 const saved=schema.createDefaultNode('CanvasLayer',{transform:{pivotX:640,pivotY:360,pivotPreset:'center'}});
 assert.equal(saved.transform.pivotX,640);assert.equal(saved.transform.pivotY,360);
});
test('action suggestions use actual scene names without requiring typed targets',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../../editor/scene_editor.js'),'utf8');const start=source.indexOf('function getUiActionChoices('),end=source.indexOf('\nfunction ',start+1);
 const c={state:{scenes:[{sceneState:{scene:{name:'Title'}}},{sceneState:{scene:{name:'Play'}}}]},getNodes:()=>[{type:'CanvasLayer',name:'HUD',properties:{uiScreenName:'GameUI'}}]};vm.createContext(c);vm.runInContext(source.slice(start,end),c);
 const choices=c.getUiActionChoices();assert.ok(choices.some(c=>c.value==='transition_scene:Play'));assert.ok(choices.some(c=>c.value==='scene:Title'));assert.ok(choices.some(c=>c.value==='screen:GameUI'));
});
