(function(root){
  'use strict';
  function grid(width,height,{cellWidth,cellHeight,gap=0,offsetX=0,offsetY=0}) {
    for(const value of [width,height,cellWidth,cellHeight,gap,offsetX,offsetY])if(!Number.isInteger(value)||!Number.isFinite(value))throw new Error('Use whole pixel values.');
    if(width<1||height<1||cellWidth<1||cellHeight<1||gap<0||offsetX<0||offsetY<0)throw new Error('Cell sizes must be positive; offsets and spacing cannot be negative.');
    const columns=Math.max(0,Math.floor((width-offsetX+gap)/(cellWidth+gap)));
    const rows=Math.max(0,Math.floor((height-offsetY+gap)/(cellHeight+gap)));
    if(!columns||!rows)throw new Error('No full cells fit inside this image.');
    if(columns*rows>4096)throw new Error('Use larger cells (maximum 4096 slices).');
    return Array.from({length:columns*rows},(_,i)=>({x:offsetX+(i%columns)*(cellWidth+gap),y:offsetY+Math.floor(i/columns)*(cellHeight+gap),w:cellWidth,h:cellHeight}));
  }
  function rectangle(a,b,width,height) {
    const clamp=(v,max)=>Math.max(0,Math.min(max,Math.round(v)));
    const x1=clamp(a.x,width),x2=clamp(b.x,width),y1=clamp(a.y,height),y2=clamp(b.y,height);
    return {x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.abs(x2-x1),h:Math.abs(y2-y1)};
  }
  function patches(rect,width,height,borders={},scale=1) {
    const l=Math.min(Math.max(0,Number(borders.sliceLeft)||0),rect.w),r=Math.min(Math.max(0,Number(borders.sliceRight)||0),rect.w-l);
    const t=Math.min(Math.max(0,Number(borders.sliceTop)||0),rect.h),b=Math.min(Math.max(0,Number(borders.sliceBottom)||0),rect.h-t);
    const dl=Math.min(l*scale,width),dr=Math.min(r*scale,width-dl),dt=Math.min(t*scale,height),db=Math.min(b*scale,height-dt);
    const sx=[rect.x,rect.x+l,rect.x+rect.w-r,rect.x+rect.w],sy=[rect.y,rect.y+t,rect.y+rect.h-b,rect.y+rect.h];
    const dx=[0,dl,width-dr,width],dy=[0,dt,height-db,height],out=[];
    for(let y=0;y<3;y++)for(let x=0;x<3;x++)if(sx[x+1]>sx[x]&&sy[y+1]>sy[y]&&dx[x+1]>dx[x]&&dy[y+1]>dy[y])out.push({sx:sx[x],sy:sy[y],sw:sx[x+1]-sx[x],sh:sy[y+1]-sy[y],x:dx[x],y:dy[y],w:dx[x+1]-dx[x],h:dy[y+1]-dy[y]});
    return out;
  }
  const api={grid,rectangle,patches};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RGESpriteSlicing=api;
})(typeof window==='undefined'?globalThis:window);
