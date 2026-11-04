const fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,sessionId,fixtureRoot})=>{
  const checks=await evaluate(sessionId,`(async()=>{
    clearInterval(state.document.autosaveTimer);state.document.autosaveTimer=null;
    const checks=[],check=(name,ok)=>{checks.push({name,passed:!!ok});if(!ok)throw new Error(name);};
    const $=id=>document.getElementById(id),wait=()=>new Promise(r=>setTimeout(r,180));
    RGEShowDockTab('slicer');await wait();
    await RGESpriteSlicer.load(await electronAPI.readProjectAsset({resourcePath:'res://images/slicing.png'}));
    $('slicer-cell-w').value=32;$('slicer-cell-h').value=32;$('slicer-border').value=2;$('slicer-name').value='Test slice';
    $('slicer-grid').click();await wait();check('Grid slices full cells',$('slicer-status').textContent.includes('2 full cells'));
    $('slicer-save').click();await wait();check('Slices saved as reusable regions',RGESceneBridge.getNineSliceStyles().length===2);
    document.getElementById('btn-undo').click();await wait();check('Slice batch is undoable',RGESceneBridge.getNineSliceStyles().length===0);
    document.getElementById('btn-redo').click();await wait();check('Slice batch can redo',RGESceneBridge.getNineSliceStyles().length===2);
    RGESpriteSlicer.renderRegions();$('slicer-regions').querySelectorAll('button')[1].click();await wait();
    const region=RGESceneBridge.getNineSliceStyles()[1];check('Region keeps atlas coordinates',region.sourceRect.x===32&&region.sourceRect.w===32);
    let i=0;
    for(const type of ['Sprite2D','TextureRect','Button','Panel']){
      RGESceneBridge.selectNode('hud');$('slicer-create-type').value=type;$('slicer-create').click();await wait();
      const node=getNode(state.selectedId);check('Create sliced '+type,node.type===type&&node.properties.sourceRect.x===32);
      node.transform.x=100+i*200;node.transform.y=100;node.properties.width=80;node.properties.height=80;if(type==='Button')node.properties.text='';
      if(type==='Sprite2D'){const image=buildSpriteGroup(node,false).findOne('Image');check('Sprite preview uses cropped source',image.cropX()===32&&image.cropWidth()===32);}
      i++;
    }
    const panel=getNode(state.selectedId),x=panel.transform.x,width=panel.properties.width;
    $('slicer-apply').click();await wait();check('Applying region preserves layout',panel.transform.x===x&&panel.properties.width===width);
    check('UI border values persist',RGESceneBridge.getNineSliceStyles()[1].sliceLeft===2);
    $('slicer-mode').value='manual';const canvas=$('slicer-canvas'),bounds=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,button:0,clientX:bounds.left+3,clientY:bounds.top+4,bubbles:true}));
    canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:bounds.left+15,clientY:bounds.top+18,bubbles:true}));
    canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:bounds.left+15,clientY:bounds.top+18,bubbles:true}));
    $('slicer-save').click();await wait();check('Manual rectangle can be saved',RGESceneBridge.getNineSliceStyles().length===3);
    check('Source image unchanged',(await electronAPI.readProjectAsset({resourcePath:'res://images/slicing.png'})).success);
    check('Scene and regions save',await saveProject());
    return checks;
  })()`);
  console.log('SLICING_EDITOR',JSON.stringify(checks));
  const saved=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'SmokeScene.rkscene.editstate'),'utf8'));
  if(saved.nineSliceStyles.length!==3)throw new Error('Sliced regions missing after save');
};
