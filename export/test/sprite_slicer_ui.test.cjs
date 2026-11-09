const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const slicing=require('../../editor/sprite_slicing');
test('slicer previews immediately, drags margins, saves and applies output dimensions',async()=>{
 const elements=new Map(),calls=[],saved=[];let applied;
 const values={'slicer-zoom':'1','slicer-output-w':'320','slicer-output-h':'180','slicer-mode':'grid','slicer-name':'Frame','slicer-create-type':'Panel'};
 const ctx={scale(){},drawImage(...args){calls.push(args);},strokeRect(){},fillRect(){},clearRect(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 function el(id){if(!elements.has(id))elements.set(id,{value:values[id]||'0',width:1,height:1,classList:{contains:()=>true},getContext:()=>ctx,replaceChildren(){},append(){},getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){}});return elements.get(id);}
 const bridge={getNineSliceStyles:()=>saved,saveSlicedRegions:regions=>{saved.push(...regions.map((r,i)=>({...r,id:'region'+i})));return saved;},getNineSliceStyleById:id=>saved.find(r=>r.id===id),applySlicedRegion:(id,target,size)=>applied={id,size}};
 class Image {constructor(){this.naturalWidth=100;this.naturalHeight=80;}set src(value){this.onload();}}
 const window={RGESpriteSlicing:slicing,RGESceneBridge:bridge};
 const context={window,document:{readyState:'complete',getElementById:el,createElement:()=>({})},Image,MutationObserver:class{observe(){}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('editor/sprite_slicer.js','utf8'),context);
 await window.RGESpriteSlicer.load({resPath:'res://frame.png',dataUrl:'data:test'});
 assert.equal(el('slicer-preview').width,320);assert.ok(calls.some(c=>c.length===9),'cropped output preview rendered immediately');
 el('slicer-border').value='12';el('slicer-border').oninput();
 const canvas=el('slicer-canvas');canvas.onpointerdown({button:0,clientX:12,clientY:40,pointerId:1});canvas.onpointermove({clientX:5,clientY:40});canvas.onpointerup({clientX:5,clientY:40});
 assert.equal(el('slicer-left').value,5);assert.equal(el('slicer-right').value,'12');
 await el('slicer-save').onclick();assert.equal(saved[0].sliceLeft,5);assert.equal(saved[0].sliceRight,12);
 el('slicer-output-w').value='500';el('slicer-output-w').oninput();assert.equal(el('slicer-preview').width,500);
 await el('slicer-apply').onclick();assert.equal(applied.size.width,500);assert.equal(applied.id,'region0');
 el('slicer-left').value='99';el('slicer-left').oninput();assert.match(el('slicer-preview-status').textContent,/valid margins/);
 await el('slicer-save').onclick();assert.equal(saved.length,1,'invalid margins do not save');
});
