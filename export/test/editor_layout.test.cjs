const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {Group}=require('konva/lib/Group');
const geometry=require('../../editor/layout_geometry');
const editor=fs.readFileSync(path.resolve(__dirname,'../../editor/scene_editor.js'),'utf8');
function declarations(names) {
  return names.map(name=>{
    const start=editor.indexOf('function '+name+'(');
    assert.ok(start>=0,name);
    const end=editor.indexOf('\nfunction ',start+1);
    return editor.slice(start,end<0?undefined:end);
  }).join('\n');
}
function node(){return {id:'texture',type:'TextureRect',parentId:'parent',transform:{x:300,y:182,pivotX:256,pivotY:108.5,pivotPreset:'center',scaleX:1,scaleY:1,rotation:0},properties:{width:512,height:217},components:[]};}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
test('repeated viewport resizes preserve local geometry under a pivoted parent and camera zoom',()=>{
  for(const preset of ['center','custom']) {
    const n=node();n.transform.pivotPreset=preset;
    const camera=new Group({x:150,y:200,scaleX:2,scaleY:2});
    const parent=new Group({x:338,y:472,offsetX:299.5,offsetY:181.5,rotation:25,scaleX:1.5,scaleY:1.5});
    const shape=new Group({x:300,y:182,offsetX:256,offsetY:108.5});camera.add(parent);parent.add(shape);
    // Konva validates plain objects by realm; normalize VM-created attribute objects.
    for(const method of ['scale','position','offset']) {
      const original=shape[method].bind(shape);
      shape[method]=value=>value?original({...value}):original();
    }
    const context={state:{},stage:null,transformer:null,_bumpSceneVersion:()=>{},getMovableSelectedNodeIds:()=>[n.id],getNode:()=>n,shapeRefs:new Map([[n.id,shape]]),syncNodeAnchorOffsets:()=>{}};
    vm.createContext(context);
    vm.runInContext(declarations(['rotatePoint','getPivotableNodeSize','getPivotPresetCoords','applyPivotChange','applyPivotPreset','scaleNodeColliders','captureTransformerSession','syncSelectedNodesFromShapes']),context);
    for(let i=0;i<30;i++) {
      context.captureTransformerSession();shape.scale({x:1.1,y:.95});
      const left=shape.x()-shape.offsetX()*shape.scaleX(),top=shape.y()-shape.offsetY()*shape.scaleY();
      context.syncSelectedNodesFromShapes();
      close(n.transform.x-n.transform.pivotX*n.transform.scaleX,left);
      close(n.transform.y-n.transform.pivotY*n.transform.scaleY,top);
      assert.equal(n.transform.scaleX,1);assert.equal(n.transform.scaleY,1);
      const before={...n.transform};context.captureTransformerSession();context.syncSelectedNodesFromShapes();
      assert.deepEqual(n.transform,before,'a no-op resize must not move the image');
    }
  }
});
test('all point and stretch presets align their intended edges and remain stable',()=>{
  const anchors=[[0,0,0,0],[.5,0,.5,0],[1,0,1,0],[0,.5,0,.5],[.5,.5,.5,.5],[1,.5,1,.5],[0,1,0,1],[.5,1,.5,1],[1,1,1,1],[0,0,0,1],[.5,0,.5,1],[1,0,1,1],[0,0,1,0],[0,0,1,1],[0,.5,1,.5],[0,1,1,1]];
  for(const a of anchors) {
    const n=node();Object.assign(n.properties,{marginLeft:123,marginRight:-21,marginTop:87,marginBottom:-9});
    geometry.preset(n,a,600,400);
    const expectedWidth=a[0]===a[2]?512:600,expectedHeight=a[1]===a[3]?217:400;
    assert.equal(n.properties.width,expectedWidth);assert.equal(n.properties.height,expectedHeight);
    close(n.transform.x-n.transform.pivotX,(600-expectedWidth)*a[0]);
    close(n.transform.y-n.transform.pivotY,(400-expectedHeight)*a[1]);
    const initial=JSON.stringify(n);for(let i=0;i<30;i++)geometry.layout(n,600,400);
    assert.equal(JSON.stringify(n),initial,'anchor layout must be idempotent');
  }
});
test('UI resize keeps the opposite edge fixed and saved margins survive re-layout',()=>{
  for(const handle of ['nw','n','ne','e','se','s','sw','w']) {
    const n=node();geometry.preset(n,[0,0,1,1],600,400);
    const start={nodeX:n.transform.x,nodeY:n.transform.y,nodeW:600,nodeH:400,pivotX:300,pivotY:200};
    geometry.resize(n,start,40,30,handle);
    const left=n.transform.x-n.transform.pivotX,top=n.transform.y-n.transform.pivotY;
    close(left,handle.includes('w')?40:0);close(top,handle.includes('n')?30:0);
    if(handle.includes('w'))close(left+n.properties.width,600);
    if(handle.includes('n'))close(top+n.properties.height,400);
    geometry.captureOffsets(n,600,400);const resized=JSON.stringify(n);
    for(let i=0;i<30;i++)geometry.layout(n,600,400);
    assert.equal(JSON.stringify(n),resized);
  }
});
test('anchor pass resolves children after parents even when the scene lists children first',()=>{
  const child=node(),parent={id:'parent',type:'Control',transform:{x:0,y:0},properties:{width:600,height:400,anchorLeft:0,anchorTop:0,anchorRight:1,anchorBottom:1}};
  Object.assign(child.properties,{anchorLeft:0,anchorTop:0,anchorRight:1,anchorBottom:1});
  const bridge={getNodes:()=>[child,parent],getEditorState:()=>({uiMeta:{resolution:'1280x720'}})};
  const context={RGELayoutGeometry:geometry,RGESceneBridge:bridge};context.window=context;context.globalThis=context;
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../editor/ui_editor.js'),'utf8'),context);
  context.RGEUIEditor.applyAnchorLayout();
  assert.equal(child.properties.width,1280);assert.equal(child.properties.height,720);
  assert.equal(child.transform.pivotX,640);assert.equal(child.transform.pivotY,360);
});
test('contain, cover and stretch produce distinct centered texture geometry',()=>{
  const contain=geometry.textureRect(400,200,200,200,'contain');
  assert.deepEqual(contain,{x:0,y:50,width:200,height:100,crop:{x:0,y:0,width:400,height:200}});
  const cover=geometry.textureRect(400,200,200,200,'cover');
  assert.deepEqual(cover,{x:0,y:0,width:200,height:200,crop:{x:100,y:0,width:200,height:200}});
  const stretch=geometry.textureRect(400,200,200,200,'stretch');
  assert.deepEqual(stretch,{x:0,y:0,width:200,height:200,crop:{x:0,y:0,width:400,height:200}});
  const atlas=geometry.textureRect(1024,1024,200,100,'contain',{x:100,y:200,w:400,h:200});
  assert.deepEqual(atlas.crop,{x:100,y:200,width:400,height:200});
  assert.equal(atlas.y,0);assert.equal(atlas.height,100);
});
