const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Konva=require('konva/lib/_FullInternals').Konva;
const source=fs.readFileSync('editor/scene_editor.js','utf8');
function declaration(name){const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+1);return source.slice(a,b);}
test('scene search matches names, types and IDs, includes ancestors and tolerates cycles',()=>{
 const c={};vm.createContext(c);vm.runInContext(declaration('getSceneTreeSearch'),c);
 const nodes=[{id:'root',name:'Scene'},{id:'play',name:'Playfield',parentId:'root'},{id:'earth-id',name:'Earth',type:'Sprite2D',parentId:'play'},{id:'moon',name:'Moon',type:'Sprite2D',parentId:'play'}];
 const before=JSON.stringify(nodes);
 let r=c.getSceneTreeSearch(nodes,' EARTH sprite2d ');
 assert.deepEqual([...r.matches],['earth-id']);assert.deepEqual([...r.visible],['earth-id','play','root']);
 assert.deepEqual([...c.getSceneTreeSearch(nodes,'earth-id').matches],['earth-id']);
 assert.equal(c.getSceneTreeSearch(nodes,'missing').visible.size,0);
 assert.equal(c.getSceneTreeSearch(nodes,' ').active,false);
 assert.equal(JSON.stringify(nodes),before);
 assert.equal(c.getSceneTreeSearch([{id:'x',name:'Earth',parentId:'x'}],'earth').visible.size,1);
});
test('nested Earth drag stays on Earth, updates coordinates and records history',()=>{
 const parent=new Konva.Group({x:478,y:72,scaleX:.6,scaleY:.6});
 const earth=new Konva.Group({x:445,y:921,offsetX:157,offsetY:155.5});parent.add(earth);
 const nodes={parent:{id:'parent',type:'Node2D',transform:{x:478,y:72}},earth:{id:'earth',type:'Sprite2D',transform:{x:445,y:921}}};
 let selection=new Set(['parent']),version=0,starts=[],ends=0,patched=[],snapshot;
 const c={state:{tool:'select'},getNode:id=>nodes[id],getSelectionSet:()=>selection,selectNode:(id,options)=>{assert.equal(options.deferViewport,true);selection=new Set([id]);},isTileMapScenePaintModeActive:()=>false,beginSelectionDrag:id=>{starts.push(id);snapshot=version;},endSelectionDrag:()=>{assert.ok(version>snapshot);ends++;},_bumpSceneVersion:()=>version++,updateSelectionDragFromNode:()=>{},patchInspectorTransformInputs:id=>patched.push(id),updateSceneSummary:()=>{},transformer:null,getSelectedNodeIds:()=>[...selection],syncNodeAnchorOffsets:()=>{}};
 vm.createContext(c);vm.runInContext(declaration('bindViewportNodeDrag'),c);
 c.bindViewportNodeDrag(parent,'parent');c.bindViewportNodeDrag(earth,'earth');
 earth.fire('dragstart',{},true);earth.x(465);earth.y(901);earth.fire('dragmove',{},true);earth.fire('dragend',{},true);
 assert.deepEqual(starts,['earth']);assert.deepEqual(patched,['earth']);assert.equal(ends,1);
 assert.equal(nodes.earth.transform.x,465);assert.equal(nodes.earth.transform.y,901);assert.equal(nodes.parent.transform.x,478);assert.equal(parent.x(),478);
 parent.destroy();
});
test('locked nodes reject body dragging',()=>{
 const shape=new Konva.Group();let stopped=0;shape.stopDrag=()=>stopped++;
 const c={state:{tool:'select'},getNode:()=>({locked:true}),endSelectionDrag:()=>{},syncNodeAnchorOffsets:()=>{}};
 vm.createContext(c);vm.runInContext(declaration('bindViewportNodeDrag'),c);c.bindViewportNodeDrag(shape,'locked');shape.fire('dragstart',{},true);assert.equal(stopped,1);shape.destroy();
});
