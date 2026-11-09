const {test}=require('node:test');
const assert=require('node:assert/strict');
const {grid,rectangle,patches}=require('../../editor/sprite_slicing');
test('slicing grid respects spacing, offsets, row order and incomplete edges',()=>{
  const result=grid(50,30,{cellWidth:12,cellHeight:10,gap:2,offsetX:3,offsetY:4});
  assert.equal(result.length,6);
  assert.deepEqual(result[0],{x:3,y:4,w:12,h:10});
  assert.deepEqual(result[3],{x:3,y:16,w:12,h:10});
  for(const r of result){assert.ok(r.x+r.w<=50);assert.ok(r.y+r.h<=30);}
  for(const options of [{cellWidth:0,cellHeight:10},{cellWidth:1,cellHeight:1},{cellWidth:101,cellHeight:100},{cellWidth:10.5,cellHeight:10}])assert.throws(()=>grid(100,100,options));
});
test('manual rectangles normalize reverse drags and clamp to image',()=>{
  assert.deepEqual(rectangle({x:50,y:40},{x:-5,y:5},32,32),{x:0,y:5,w:32,h:27});
});
test('UI nine-slice regions preserve atlas origin and corner sizes',()=>{
  const result=patches({x:64,y:32,w:32,h:32},100,80,{sliceLeft:4,sliceTop:4,sliceRight:4,sliceBottom:4});
  assert.equal(result.length,9);assert.deepEqual(result[0],{sx:64,sy:32,sw:4,sh:4,x:0,y:0,w:4,h:4});
  assert.equal(result[4].w,92);assert.equal(result[4].h,72);
  assert.deepEqual(patches({x:64,y:32,w:32,h:32},100,80),[{sx:64,sy:32,sw:32,sh:32,x:0,y:0,w:100,h:80}]);
});

test('asymmetric frame slices retain margins larger than half the source',()=>{
  const result=patches({x:10,y:20,w:100,h:80},300,200,{sliceLeft:60,sliceRight:10,sliceTop:45,sliceBottom:5});
  assert.equal(result[0].sw,60);assert.equal(result[0].sh,45);
  assert.equal(result[4].sw,30);assert.equal(result[4].sh,30);
  assert.equal(result[4].w,230);assert.equal(result[4].h,150);
});
