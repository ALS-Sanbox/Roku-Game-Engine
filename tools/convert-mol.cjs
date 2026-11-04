'use strict';
// One-time import. Never overwrite a project that has been edited afterwards.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=path.resolve(process.argv[2]||path.join(__dirname,'../../MOL/roku'));
const output=path.resolve(process.argv[3]||path.join(__dirname,'../.visual-editor/converted-projects/MOL'));
if(fs.existsSync(path.join(output,'MOL.rkscene')))throw new Error('MOL engine project already exists. Import refuses to overwrite your edits.');
for(const folder of ['images','audio','source'])if(!fs.existsSync(path.join(source,folder)))throw new Error('Missing MOL source folder: '+folder);
fs.mkdirSync(path.join(output,'components/game'),{recursive:true});
fs.cpSync(path.join(source,'images'),path.join(output,'images'),{recursive:true});
fs.cpSync(path.join(source,'audio'),path.join(output,'audio'),{recursive:true});
const provenance={sourceProject:'Messenger of Light, native Roku 0.2',files:{},adaptations:[]};
for(const name of ['game','enemies','weapons','input','frontend','presentation','save','audio']){
  const file=path.join(source,'source',name+'.brs'),original=fs.readFileSync(file,'utf8');
  provenance.files['source/'+name+'.brs']=crypto.createHash('sha256').update(original).digest('hex');
  let text=original;
  if(name==='presentation')text=text.slice(0,text.indexOf('sub MOLImage('));
  if(name==='frontend'){const a=text.indexOf('sub MOLDrawFrontend('),b=text.indexOf('function MOLGuidePages(');text=text.slice(0,a)+text.slice(b);}
  // Speeds become controller settings; all combat/campaign algorithms are retained.
  if(name==='game')text=text.replace('speed = 330.0','speed = 330.0\n    if g.playerSpeed <> invalid then speed = g.playerSpeed').replace('if MOLEffect(g, "speed") then speed = 580.0','if MOLEffect(g, "speed") then speed = speed * 580.0 / 330.0');
  fs.writeFileSync(path.join(output,'components/game',name+'.brs'),text);
  if(text!==original)provenance.adaptations.push(name+'.brs: '+(name==='game'?'expose player speed':'replace direct drawing with authored engine nodes'));
}
fs.mkdirSync(path.join(output,'tests'),{recursive:true});
for(const name of ['game_test','frontend_test','audio_test'])fs.copyFileSync(path.join(source,'tests',name+'.brs'),path.join(output,'tests',name+'.brs'));
const nodes=[];
function n(id,type,parent,x,y,w,h,props={},meta={}){
  const node={id,name:id,type,parentId:parent,children:[],visible:true,locked:false,zIndex:0,transform:{x,y,rotation:0,scaleX:1,scaleY:1,pivotX:0,pivotY:0,pivotPreset:'top-left'},properties:{width:w,height:h,opacity:1,...props},metadata:meta,components:[]};nodes.push(node);return node;
}
function layer(id,number,modes){return n(id,'CanvasLayer','root',0,0,1280,720,{layer:number},{molModes:modes});}
function panel(id,parent,x,y,w,h,color,z=0){const node=n(id,'Panel',parent,x,y,w,h,{color});node.zIndex=z;return node;}
function label(id,parent,x,y,w,text,size=22,color='#f5dc9a'){return n(id,'Label',parent,x,y,w,size+12,{text,textColor:color,fontSize:size,align:'left',valign:'top'});}
function image(id,parent,x,y,w,h,file,z=0,rect){const node=n(id,'TextureRect',parent,x,y,w,h,{imagePath:'res://images/'+file,fitMode:'stretch',...(rect?{sourceRect:rect}:{})});node.zIndex=z;return node;}
function sprite(id,row,size=42,column=0){const node=image(id,'Templates',0,0,size,size,'sprites.png',50,{x:column*64,y:row*64,w:64,h:64});node.transform.pivotX=size/2;node.transform.pivotY=size/2;node.transform.pivotPreset='center';node.metadata={animationFrames:4,cellSize:64,referenceSize:size};return node;}
const root=n('root','SceneRoot',null,0,0,1280,720);
root.components=[{type:'ScriptComponent',enabled:true,scriptPath:'res://components/mol_controller.brs',startDay:1,playerSpeed:330,debugLogging:false}];
layer('World',0);const playfield=n('Playfield','Control','World',478,72,540,960);playfield.zIndex=-200;playfield.transform.scaleX=.6;playfield.transform.scaleY=.6;
image('BackgroundPrevious','Playfield',0,0,540,960,'background0.png',-100);
image('Background','Playfield',0,0,540,960,'background0.png',-99);
const earth=image('Earth','Playfield',250,700,350,350,'earth.png',-90);earth.transform.pivotX=175;earth.transform.pivotY=175;
const grass=image('Grass','Playfield',0,0,540,960,'grass.png',-90);grass.visible=false;
panel('Road','Playfield',190,0,160,960,'#2e3640',-85).visible=false;
panel('RoadDivider','Playfield',267,0,6,960,'#e2c779',-84).visible=false;
for(const [id,row,size] of [['Player',0,62],['Prayer',1,64]]){const actor=sprite(id,row,size);actor.parentId='Playfield';actor.transform.x=270;actor.transform.y=id==='Player'?720:875;actor.zIndex=100;}
layer('Masks',2);
panel('LeftMask','Masks',0,0,476,720,'#071527');panel('RightMask','Masks',804,0,476,720,'#071527');panel('TopMask','Masks',476,0,328,70,'#071527');panel('BottomMask','Masks',476,650,328,70,'#071527');
image('PlayfieldFrame','Masks',478,72,324,576,'frame.png',20);
layer('HUD',3);
label('Brand1','HUD',70,90,350,'MESSENGER',30);label('Brand2','HUD',70,128,350,'OF LIGHT',30);
label('Version','HUD',70,184,370,'ENGINE EDITION',20);
for(const [id,y,text] of [['Day',240,'DAY 1 / 22'],['Wave',277,'WAVE 1 / 3'],['Region',314,'DEEP SPACE'],['Score',367,'SCORE 0'],['Best',404,'BEST 0'],['NextWave',460,'NEXT WAVE'],['Chain',504,'CHAIN 0'],['Defense',540,'DEFENSE +0'],['Encounter',580,'']])label(id,'HUD',70,y,360,text,id==='Encounter'?16:22);
label('AngelHealthTitle','HUD',850,90,350,'ANGEL');label('PrayerHealthTitle','HUD',850,166,350,'PRAYER');
panel('AngelHealthBack','HUD',850,128,250,12,'#34415a');panel('AngelHealth','HUD',850,128,250,12,'#9edbff',1).metadata.maxWidth=250;
panel('PrayerHealthBack','HUD',850,204,250,12,'#34415a');panel('PrayerHealth','HUD',850,204,250,12,'#ffcd65',1).metadata.maxWidth=250;
for(const [id,y,text] of [['Firing',254,'FIRE OFF - OK TO TOGGLE'],['MovementHelp',300,'D-PAD: MOVE'],['PauseHelp',340,'PLAY/PAUSE: PAUSE'],['BackHelp',380,'BACK: PAUSE / MENU'],['Tier',430,'WEAPON TIER 1'],['Kills',470,'KILLS 0']])label(id,'HUD',850,y,400,text,20);
for(let i=0;i<8;i++)label('Effect'+i,'HUD',850,510+i*22,400,'',16);
label('Notice','Masks',490,82,310,'',13).zIndex=30;
layer('Menu',10,['menu']);image('MenuArt','Menu',478,72,324,576,'menu.png');panel('MenuShade','Menu',478,72,324,576,'#071527',1).properties.opacity=.8;
label('MenuTitle','Menu',490,126,310,'MESSENGER OF LIGHT',22).zIndex=2;
label('MenuSubtitle','Menu',490,169,310,'A prayer. A journey. A messenger.',16).zIndex=2;
for(const [i,text] of ['START GAME','HIGH SCORES','INSTRUCTIONS','SFX: ON','BGM: ON'].entries()){
 const b=n('MenuItem'+i,'Button','Menu',490,265+i*48,298,40,{text,fontSize:22,focusMode:'none',normalColor:'#102339',textColor:'#f5dc9a',action:''},{menuIndex:i,selectedColor:'#b79760',idleColor:'#102339'});b.zIndex=3;
}
label('StartDay','Menu',490,553,310,'START DAY 1 - LEFT / RIGHT',16).zIndex=3;label('MenuHelp','Menu',490,587,310,'UP / DOWN: SELECT  OK: CONFIRM',14).zIndex=3;
for(const mode of ['intro','instructions','scores','entry','credits']){
 const screen=mode[0].toUpperCase()+mode.slice(1);layer(screen,11,[mode]).visible=false;
 image(screen+'Art',screen,478,72,324,576,'menu.png');panel(screen+'Shade',screen,478,72,324,576,'#071527',1).properties.opacity=.88;
 label(screen+'Title',screen,490,96,310,screen.toUpperCase(),22).zIndex=3;
 for(let i=0;i<18;i++)label(screen+'Line'+i,screen,490,155+i*25,310,'',14).zIndex=3;
 label(screen+'Help',screen,490,605,310,'OK / BACK: MENU',16).zIndex=3;
}
layer('Overlay',12,['paused','alert','transition','lost','won']).visible=false;
panel('OverlayPanel','Overlay',478,230,324,250,'#071527').properties.opacity=.94;
label('OverlayTitle','Overlay',494,260,300,'PAUSED',22).zIndex=2;
label('OverlayMessage','Overlay',494,310,300,'OK / Play to resume',18).zIndex=2;
label('OverlayHint','Overlay',494,358,300,'Back: return to menu',16).zIndex=2;
layer('Templates',30).visible=false;
for(let row=2;row<=10;row++){const names=['Shade','Wisp','Specter','Serpent','Elite','Emissary','Warden','King','Prince'];sprite('Enemy'+row,row,row>=7?100:42).name=names[row-2]+' Template';}
sprite('PlayerShot',11,22);sprite('EnemyShot',12,20);sprite('Particle',13,20).metadata.animationFrames=8;
sprite('Echo',0,62);sprite('Trail',2,42);
const hazard=image('Hazard','Templates',0,0,64,64,'level_objects.png',20,{x:0,y:0,w:64,h:64});hazard.transform.pivotX=32;hazard.transform.pivotY=32;hazard.metadata.referenceSize=64;
sprite('Pickup',14,42);
for(const [id,file,cell,row,col,size] of [['Animal','animals.png',64,0,0,42],['Tree','trees.png',128,0,0,100],['Car','cars.png',64,0,0,48],['Person','pedestrians.png',64,0,0,27],['Building','buildings.png',128,0,0,148],['Recipient','recipients.png',128,0,0,140]]){
 const t=image(id,'Templates',0,0,size,size,file,-70,{x:col*cell,y:row*cell,w:cell,h:cell});t.metadata={cellSize:cell,animationFrames:id==='Animal'||id==='Person'?4:1};
}
image('Cloud','Templates',0,0,240,100,'clouds.png',-10).properties.opacity=.12;
panel('Star','Templates',0,0,2,3,'#a5bdd7',-80);
panel('RoadMark','Templates',0,0,3,25,'#bbbbae',-80);
panel('EnemyHealth','Templates',0,0,40,4,'#ffcd65',110);
for(const [id,color] of [['ShieldRing','#69d7ff'],['PrayerRing','#ffdf80'],['ThreatRing','#ff4b5c']]){
 fs.writeFileSync(path.join(output,'images',id+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="59" fill="none" stroke="${color}" stroke-width="4"/></svg>`);
 const ring=image(id,'Templates',0,0,72,72,id+'.svg',115);ring.transform.pivotX=36;ring.transform.pivotY=36;ring.metadata.referenceSize=72;
}
const close=image('AngelClose','Templates',0,0,120,120,'sprites.png',110,{x:256,y:448,w:256,h:256});close.metadata.animationFrames=1;
image('DeliveryHome','Playfield',0,0,540,960,'home.png',200).visible=false;
for(const node of nodes)node.children=nodes.filter(child=>child.parentId===node.id).map(child=>child.id);
const scene={formatVersion:2,scene:{name:'MOL',rootNodeId:'root'},nodes};
require('./link-mol-scripts.cjs').linkMolScripts(scene);
fs.writeFileSync(path.join(output,'MOL.rkscene'),JSON.stringify(scene,null,2));
fs.writeFileSync(path.join(output,'MOL.rkscene.editstate'),JSON.stringify({editorVersion:2,selection:{selectedIds:['Player'],selectedId:'Player'},expandedTreeNodes:{root:true,World:true,Playfield:true,HUD:true,Menu:true},uiScreens:[],uiMeta:{resolution:'1280x720',snap:{enabled:true,gridSize:8}},spritesheets:[]},null,2));
fs.writeFileSync(path.join(output,'project.settings.json'),JSON.stringify({projectName:'Messenger of Light - Engine Edition',startupScene:'MOL',screen:{width:1280,height:720,mode:'720p'},input:{actionMap:{move_up:'up',move_down:'down',move_left:'left',move_right:'right',action:'ok',pause:'play',back:'back'}}},null,2));
fs.writeFileSync(path.join(output,'source-provenance.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify({project:output,editableNodes:nodes.length,gameplayModules:Object.keys(provenance.files).length}));
