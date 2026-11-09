(() => {
  'use strict';
  const $=id=>document.getElementById(id),bridge=()=>window.RGESceneBridge;
  let image=null,resource='',data='',rects=[],selected=new Set(),regionId='',drag=null,loadVersion=0,guideDrag=null;
  const status=text=>{$('slicer-status').textContent=text;};
  const zoom=()=>Number($('slicer-zoom').value);
  const number=id=>Number($(id).value);
  function borders() {
    return Object.fromEntries(['Left','Top','Right','Bottom'].map(side=>['slice'+side,number('slicer-'+side.toLowerCase())]));
  }
  function preview() {
    const canvas=$('slicer-preview'),ctx=canvas.getContext('2d');
    const w=number('slicer-output-w'),h=number('slicer-output-h');
    const r=rects[[...selected][0]],b=borders();
    const valid=Object.values(b).every(v=>Number.isInteger(v)&&v>=0);
    if(!image||!r||!valid||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>4096||h>4096||b.sliceLeft+b.sliceRight>=r.w||b.sliceTop+b.sliceBottom>=r.h) {
      ctx.clearRect(0,0,canvas.width,canvas.height);$('slicer-preview-status').textContent='Select a region and use valid margins with a nonempty center; output size must be 1-4096.';return;
    }
    canvas.width=w;canvas.height=h;ctx.imageSmoothingEnabled=false;
    for(const p of window.RGESpriteSlicing.patches(r,w,h,b))ctx.drawImage(image,p.sx,p.sy,p.sw,p.sh,p.x,p.y,p.w,p.h);
    $('slicer-preview-status').textContent=`${w} x ${h} output; first selected region`;
  }
  function draw() {
    const canvas=$('slicer-canvas');if(!image){canvas.width=1;canvas.height=1;return;}
    canvas.width=Math.ceil(image.naturalWidth*zoom());canvas.height=Math.ceil(image.naturalHeight*zoom());
    const ctx=canvas.getContext('2d');ctx.scale(zoom(),zoom());ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0);
    preview();
    rects.forEach((r,i)=>{ctx.strokeStyle=selected.has(i)?'#ffcf65':'#54caff';ctx.lineWidth=(selected.has(i)?2:1)/zoom();ctx.strokeRect(r.x,r.y,r.w,r.h);if(selected.has(i)){ctx.fillStyle='rgba(255,207,101,.2)';ctx.fillRect(r.x,r.y,r.w,r.h);}});
    const r=rects[[...selected][0]];
    if(r){
      const b=borders();ctx.strokeStyle='#ff76dd';ctx.lineWidth=1/zoom();ctx.setLineDash([5/zoom(),3/zoom()]);
      for(const x of [r.x+b.sliceLeft,r.x+r.w-b.sliceRight]){ctx.beginPath();ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.h);ctx.stroke();}
      for(const y of [r.y+b.sliceTop,r.y+r.h-b.sliceBottom]){ctx.beginPath();ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.w,y);ctx.stroke();}
    }
  }
  async function load(asset) {
    const version=++loadVersion;
    const candidate=new Image();await new Promise((resolve,reject)=>{candidate.onload=resolve;candidate.onerror=()=>reject(new Error('Could not load this image.'));candidate.src=asset.dataUrl||asset.imageDataUrl;});
    if(version!==loadVersion)return;
    if(candidate.naturalWidth>16384||candidate.naturalHeight>16384)throw new Error('Image dimensions exceed 16384 pixels.');
    image=candidate;resource=asset.resPath||asset.imagePath;data=asset.dataUrl||asset.imageDataUrl;
    rects=[{x:0,y:0,w:image.naturalWidth,h:image.naturalHeight}];selected=new Set([0]);regionId='';$('slicer-image-name').textContent=`${resource} (${image.naturalWidth} × ${image.naturalHeight})`;
    $('slicer-zoom').value=image.naturalWidth*image.naturalHeight>64000000?'0.25':'1';draw();renderRegions();status('Image loaded. Slice a grid or draw a rectangle.');
  }
  function sliceGrid() {
    if(!image)throw new Error('Load an image first.');
    const next=window.RGESpriteSlicing.grid(image.naturalWidth,image.naturalHeight,{cellWidth:number('slicer-cell-w'),cellHeight:number('slicer-cell-h'),gap:number('slicer-gap'),offsetX:number('slicer-offset-x'),offsetY:number('slicer-offset-y')});
    rects=next;regionId='';selected=new Set(rects.map((_,i)=>i));$('slicer-mode').value='grid';draw();renderRegions();status(`${rects.length} full cells selected. Save them as reusable regions.`);
  }
  function renderRegions() {
    const host=$('slicer-regions');host.replaceChildren();
    for(const r of bridge()?.getNineSliceStyles()||[]) {
      const button=document.createElement('button');button.className='mini-btn'+(r.id===regionId?' active':'');button.textContent=`${r.name} (${r.sourceRect.w} × ${r.sourceRect.h})`;button.dataset.regionId=r.id;
      button.onclick=guard(async()=>{
        if(r.imagePath!==resource){const asset=await window.electronAPI.readProjectAsset({resourcePath:r.imagePath});if(!asset.success)throw new Error('Cannot read region image.');await load(asset);}
        $('slicer-name').value=r.name;
        for(const side of ['Left','Top','Right','Bottom'])$('slicer-'+side.toLowerCase()).value=r['slice'+side]||0;
        regionId=r.id;rects=[{...r.sourceRect}];selected=new Set([0]);draw();renderRegions();status('Selected region: '+r.name);
      });host.append(button);
    }
  }
  function save() {
    if(!image||!resource||!selected.size)throw new Error('Load an image and select at least one slice.');
    const margins=borders();
    if(!Object.values(margins).every(v=>Number.isInteger(v)&&v>=0))throw new Error('Slice margins must be whole pixels or zero.');
    const chosen=[...selected].sort((a,b)=>a-b).map(i=>rects[i]);
    for(const r of chosen)if(r.w<=margins.sliceLeft+margins.sliceRight||r.h<=margins.sliceTop+margins.sliceBottom)throw new Error('Each slice must have an interior larger than its margins.');
    const border=Object.values(margins).some(v=>v>0);
    const name=$('slicer-name').value.trim()||'Slice';
    const saved=bridge().saveSlicedRegions(chosen.map((r,i)=>({name:chosen.length===1?name:`${name} ${i+1}`,imagePath:resource,imageDataUrl:data,sourceRect:r,type:border?'NineSlice':'Image',...margins})));
    regionId=saved[0].id;renderRegions();status(`Saved ${saved.length} regions. Save the scene to keep them.`);
  }
  function outputSize() {
    const width=number('slicer-output-w'),height=number('slicer-output-h');
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw new Error('Output size must be 1-4096 pixels.');
    return {width,height};
  }
  function currentRegion() { const r=bridge().getNineSliceStyleById(regionId);if(!r)throw new Error('Save slices and choose a saved region first.');return r; }
  function guard(fn){return async e=>{try{await fn(e);}catch(error){status(error.message);}};}
  function point(event){const bounds=$('slicer-canvas').getBoundingClientRect();return{x:(event.clientX-bounds.left)/zoom(),y:(event.clientY-bounds.top)/zoom()};}
  function init() {
    for(const key of ['left','top','right','bottom'])$('slicer-'+key).oninput=()=>{regionId='';draw();};
    for(const key of ['output-w','output-h'])$('slicer-'+key).oninput=preview;
    $('slicer-border').oninput=()=>{for(const key of ['left','top','right','bottom'])$('slicer-'+key).value=$('slicer-border').value;regionId='';draw();};
    $('slicer-pick').onclick=guard(async()=>{const asset=await window.electronAPI.openImageFile({assetKind:'image'});if(asset.success)await load(asset);});
    $('slicer-use').onclick=guard(async()=>{
      const node=bridge().getNode(bridge().getSelectedId());const properties=node?.properties;
      if(!properties?.imagePath)throw new Error('Select a Sprite2D or UI image element with an assigned image.');
      const asset=await window.electronAPI.readProjectAsset({resourcePath:properties.imagePath});if(!asset.success)throw new Error('Could not read the selected image.');await load(asset);
    });
    $('slicer-grid').onclick=guard(sliceGrid);$('slicer-save').onclick=guard(save);
    $('slicer-all').onclick=()=>{selected=new Set(rects.map((_,i)=>i));draw();};$('slicer-none').onclick=()=>{selected.clear();draw();};
    $('slicer-zoom').onchange=()=>{if(image&&image.naturalWidth*zoom()*image.naturalHeight*zoom()>64000000){$('slicer-zoom').value='1';status('Zoom limited for this large image.');}draw();};
    $('slicer-apply').onclick=guard(()=>{const r=currentRegion();bridge().applySlicedRegion(r.id,undefined,outputSize());status('Applied '+r.name+'. Save the scene to keep the change.');});
    $('slicer-create').onclick=guard(()=>{const r=currentRegion();bridge().createSlicedElement($('slicer-create-type').value,r.id,outputSize());status('Created element from '+r.name+'.');});
    $('slicer-ui-editor').onclick=guard(()=>{const r=currentRegion();bridge().setSelectedNineSliceStyleId(r.id);window.RGEShowDockTab('nineslice');window.RGENineSliceEditor.render();});
    const canvas=$('slicer-canvas');
    canvas.onpointerdown=event=>{
      if(!image||event.button!==0)return;
      const p=point(event),r=rects[[...selected][0]],b=borders();
      if(r&&p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h){
        const guides=[['left',Math.abs(p.x-r.x-b.sliceLeft)],['right',Math.abs(p.x-r.x-r.w+b.sliceRight)],['top',Math.abs(p.y-r.y-b.sliceTop)],['bottom',Math.abs(p.y-r.y-r.h+b.sliceBottom)]].sort((a,b)=>a[1]-b[1]);
        if(guides[0][1]<=6/zoom()){
          guideDrag={side:guides[0][0],rect:r};regionId='';
          try{canvas.setPointerCapture(event.pointerId);}catch{}
          return;
        }
      }
      if($('slicer-mode').value==='grid'){
        const index=rects.findIndex(r=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h);if(index<0)return;
        if(event.ctrlKey||event.metaKey||event.shiftKey){if(selected.has(index))selected.delete(index);else selected.add(index);}else selected=new Set([index]);draw();return;
      }
      regionId='';renderRegions();drag=p;try{canvas.setPointerCapture(event.pointerId);}catch{ /* Synthetic or interrupted pointer. */ }
    };
    canvas.onpointermove=event=>{
      if(guideDrag){
        const p=point(event),{side,rect:r}=guideDrag,b=borders();
        const value=side==='left'?p.x-r.x:side==='right'?r.x+r.w-p.x:side==='top'?p.y-r.y:r.y+r.h-p.y;
        const limit=side==='left'?r.w-b.sliceRight-1:side==='right'?r.w-b.sliceLeft-1:side==='top'?r.h-b.sliceBottom-1:r.h-b.sliceTop-1;
        $('slicer-'+side).value=Math.max(0,Math.min(limit,Math.round(value)));draw();return;
      }
      if(!drag)return;rects=[window.RGESpriteSlicing.rectangle(drag,point(event),image.naturalWidth,image.naturalHeight)];selected=new Set([0]);draw();};
    canvas.onpointerup=event=>{if(guideDrag){canvas.onpointermove(event);guideDrag=null;return;}if(drag){canvas.onpointermove(event);drag=null;status('Rectangle selected. Save it as a reusable region.');}};
    canvas.onpointercancel=()=>{drag=null;guideDrag=null;};
    new MutationObserver(()=>{if($('sprite-slicer-wrap').classList.contains('active'))renderRegions();}).observe($('sprite-slicer-wrap'),{attributes:true,attributeFilter:['class']});
  }
  window.RGESpriteSlicer={load,sliceGrid,renderRegions};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
