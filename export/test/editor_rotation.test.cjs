const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Konva=require('konva/lib/_FullInternals').Konva;
const source=fs.readFileSync(path.resolve(__dirname,'../../editor/scene_editor.js'),'utf8');
function declarations(names){return names.map(name=>{const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);assert.ok(start>=0,name);return source.slice(start,end<0?undefined:end);}).join('\n');}
const near=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-6,`${message} ${a} != ${b}`);

function fixture({pivotX=0,pivotY=0,rotation=12,scaleX=1,scaleY=1,parentScaleX=1,parentScaleY=1}={}){
  const n={id:'actor',type:'Sprite2D',transform:{x:230,y:170,rotation,scaleX,scaleY,pivotX,pivotY,pivotPreset:'custom'},properties:{width:80,height:40},components:[]};
  const camera=new Konva.Group({x:150,y:-30,scaleX:1.75,scaleY:1.75});
  const parent=new Konva.Group({x:330,y:250,rotation:37,offsetX:46,offsetY:19,scaleX:parentScaleX,scaleY:parentScaleY});
  const shape=new Konva.Group({x:230,y:170,rotation,scaleX,scaleY,offsetX:pivotX,offsetY:pivotY});
  shape.add(new Konva.Rect({x:0,y:0,width:80,height:40}));camera.add(parent);parent.add(shape);
  const transformer=new Konva.Transformer({ignoreStroke:true,keepRatio:false});camera.add(transformer);
  const layer={batchDraw(){}};
  let pointer={x:0,y:0};const stage={batchDraw(){},getPointerPosition:()=>pointer,setPointersPositions:e=>{pointer={x:e.clientX,y:e.clientY}}};
  camera.getStage=()=>stage;shape.getLayer=()=>layer;transformer.getLayer=()=>layer;
  transformer.nodes([shape]);
  // Konva's plain-object validation is realm-specific.
  for(const method of ['scale','position','offset','skew']){const original=shape[method].bind(shape);shape[method]=value=>value?original({...value}):original();}
  const inputs=['transform.x','transform.y','transform.rotation'].map(key=>({value:'',dataset:{fieldKey:key}}));
  let version=0;const history=[],renders=[];
  const context={state:{history:{}},stage,transformer,shapeRefs:new Map([[n.id,shape]]),getMovableSelectedNodeIds:()=>[n.id],getSelectedNodeIds:()=>[n.id],getNode:()=>n,inspectorEl:{querySelectorAll:()=>inputs},syncNodeAnchorOffsets:()=>{},_bumpSceneVersion:()=>version++,_getSceneVersion:()=>version,_sceneChanged:v=>v!==version,serializeScene:()=>JSON.stringify(n),pushHistory:(label,before)=>history.push({label,before,after:JSON.stringify(n)}),scheduleRender:flags=>renders.push(flags),RenderFlags:{VIEWPORT:1,SCENE_SUMMARY:2,INSPECTOR:4}};
  vm.createContext(context);
  vm.runInContext(declarations(['rotatePoint','scaleNodeColliders','bindTransformerEvents','captureTransformerSession','syncTransformerRotation','syncSelectedNodesFromShapes','patchInspectorTransformInputs']),context);
  context.bindTransformerEvents();
  let initialAngle;
  return {n,shape,parent,camera,transformer,context,history,renders,inputs,
    start(){const handle=transformer.findOne('.rotater');pointer=handle.getAbsolutePosition();const local=parent.getAbsoluteTransform().copy().invert().point(pointer);initialAngle=Math.atan2(local.y-shape.y(),local.x-shape.x());transformer._handleMouseDown({target:handle,evt:{}});},
    move(degrees){const a=initialAngle+degrees*Math.PI/180;const p=parent.getAbsoluteTransform().point({x:230+Math.cos(a)*150,y:170+Math.sin(a)*150});transformer._handleMouseMove({clientX:p.x,clientY:p.y});},
    moveToPivot(){const p=parent.getAbsoluteTransform().point({x:230,y:170});transformer._handleMouseMove({clientX:p.x,clientY:p.y});},
    end(){transformer._handleMouseUp({});},
    destroy(){transformer.destroy();camera.destroy();}
  };
}

test('rotation handle matches Inspector pivot and updates the angle live under transformed parents',()=>{
  for(const settings of [{},{pivotX:40,pivotY:20},{pivotX:17,pivotY:-10,scaleX:1.4,scaleY:.7,parentScaleX:2,parentScaleY:.6},{pivotX:0,pivotY:0,scaleX:-1,scaleY:1,parentScaleX:-1.5,parentScaleY:2}]){
    const f=fixture(settings),before={...f.n.transform};
    const pivot=f.parent.getAbsoluteTransform().point({x:before.x,y:before.y});
    f.start();
    for(const degrees of [20,70,130,179,230,300,365,410]){
      f.move(degrees);
      near(f.n.transform.rotation,before.rotation+degrees,'stored angle');
      near(Number(f.inputs[2].value),f.n.transform.rotation,'live Inspector');
      near(Number(f.inputs[2].dataset.lastValid),f.n.transform.rotation,'numeric editor baseline');
      near(f.shape.x(),before.x);near(f.shape.y(),before.y);
      near(f.shape.scaleX(),before.scaleX);near(f.shape.scaleY(),before.scaleY);
      near(f.shape.skewX(),0);near(f.shape.skewY(),0);
      const world=f.shape.getAbsoluteTransform().point({x:before.pivotX,y:before.pivotY});near(world.x,pivot.x,'fixed pivot x');near(world.y,pivot.y,'fixed pivot y');
      const expected=new Konva.Group({...before,offsetX:before.pivotX,offsetY:before.pivotY,rotation:before.rotation+degrees});
      const actual=f.shape.getTransform().getMatrix(),numeric=expected.getTransform().getMatrix();actual.forEach((v,i)=>near(v,numeric[i],'same geometry as numeric rotation'));expected.destroy();
    }
    f.end();near(f.n.transform.x,before.x);near(f.n.transform.y,before.y);assert.equal(f.n.properties.width,80);assert.equal(f.n.properties.height,40);
    assert.equal(f.history.length,1,'one undo record per gesture');assert.ok(f.renders.at(-1)&4,'Inspector refresh on release');
    const undone=JSON.parse(f.history[0].before);assert.equal(undone.transform.rotation,before.rotation);
    const redone=JSON.parse(f.history[0].after);near(redone.transform.rotation,before.rotation+410);
    f.destroy();
  }
});

test('rotation end keeps scale and custom pivot stable across repeated gestures',()=>{
  const f=fixture({pivotX:5,pivotY:30,parentScaleX:2,parentScaleY:.5});
  for(let i=0;i<20;i++){const angle=f.n.transform.rotation;f.start();f.move(30);f.end();near(f.n.transform.rotation,angle+30);near(f.n.transform.x,230);near(f.n.transform.y,170);}
  assert.equal(f.history.length,20);assert.equal(f.n.transform.pivotX,5);assert.equal(f.n.transform.pivotY,30);assert.equal(f.n.properties.width,80);assert.equal(f.n.properties.height,40);f.destroy();
});

test('releasing the rotation handle over the pivot keeps the last valid angle and position',()=>{
  const f=fixture({pivotX:5,pivotY:30,parentScaleX:2,parentScaleY:.5});
  f.start();f.move(50);f.moveToPivot();f.end();
  near(f.n.transform.rotation,62);near(f.n.transform.x,230);near(f.n.transform.y,170);assert.equal(f.history.length,1);f.destroy();
});
