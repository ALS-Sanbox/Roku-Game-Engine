const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../samples/collect-the-stars');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.mkdirSync(path.join(root, 'components/behaviors'), { recursive: true });
function n(id,type,parent,x,y,p={},metadata={},components=[]) { return { id, type, name:id, parentId:parent, children:[], visible:true, zIndex:0, transform:{x,y,rotation:0,scaleX:1,scaleY:1,pivotX:0,pivotY:0}, properties:p, metadata, components }; }
const nodes = [n('root','SceneRoot',null,0,0), n('world','Node2D','root',0,0),
  n('player','Node2D','world',200,300,{width:48,height:48,tint:'#45d6a4'}, {}, [{type:'Collider2DComponent',enabled:true,width:48,height:48,isTrigger:true},{type:'ScriptComponent',enabled:true,scriptPath:'res://components/behaviors/collect.brs',speed:240}]),
  n('camera','Camera2D','root',0,0,{current:true,enabled:true,followTargetName:'player',followLerp:1,zoom:1}),
  n('Title','CanvasLayer','root',0,0,{uiScreenName:'Title',startupScreen:true}),
  n('titlePanel','Panel','Title',0,0,{width:1280,height:720,color:'#101d35',anchorPreset:'full_rect'}),
  n('titleLabel','Label','Title',320,180,{width:640,height:80,text:'COLLECT THE STARS',textColor:'#ffd166',fontSize:40,align:'center'}),
  n('instructions','Label','Title',220,280,{width:840,height:70,text:'Move with the remote. Collect every gold star.',textColor:'#ffffff',fontSize:24,align:'center'}),
  n('start','Button','Title',480,420,{width:320,height:64,text:'START',action:'transition_screen:Game',defaultFocus:true,focusMode:'all'}),
  n('Game','CanvasLayer','root',0,0,{uiScreenName:'Game'}),
  n('hudPanel','Panel','Game',16,16,{width:420,height:80,color:'#1a2944'}),
  n('scoreLabel','Label','Game',30,24,{width:400,height:60,text:'Stars: 0',textColor:'#ffd166',fontSize:26},{scoreLabel:true}),
  n('Win','CanvasLayer','root',0,0,{uiScreenName:'Win'}),
  n('winPanel','Panel','Win',0,0,{width:1280,height:720,color:'#102b25',anchorPreset:'full_rect'}),
  n('winLabel','Label','Win',320,200,{width:640,height:100,text:'YOU COLLECTED EVERY STAR!',textColor:'#ffd166',fontSize:32,align:'center'}),
  n('restart','Button','Win',480,400,{width:320,height:64,text:'PLAY AGAIN',action:'transition_scene:CollectStars',defaultFocus:true,focusMode:'all'})];
for (let i=0;i<3;i++) nodes.push(n('star'+(i+1),'Sprite2D','world',400+i*260,300,{width:40,height:40,imagePath:'res://assets/star.svg'},{collectible:true},[{type:'Collider2DComponent',enabled:true,width:40,height:40,isTrigger:true}]));
for(const node of nodes)node.children=nodes.filter(child=>child.parentId===node.id).map(child=>child.id);
const scene={formatVersion:2,scene:{name:'CollectStars',rootNodeId:'root'},nodes};
fs.writeFileSync(path.join(root,'CollectStars.rkscene'),JSON.stringify(scene,null,2));
fs.writeFileSync(path.join(root,'CollectStars.rkscene.editstate'),JSON.stringify({editorVersion:2,uiScreens:['Title','Game','Win'].map(name=>({name,rootNodeIds:[name],startupScreen:name==='Title'}))},null,2));
fs.writeFileSync(path.join(root,'project.settings.json'),JSON.stringify({projectName:'Collect the Stars',startupScene:'CollectStars',screen:{width:1280,height:720,mode:'720p'},input:{actionMap:{move_up:'up',move_down:'down',move_left:'left',move_right:'right',action:'ok',pause:'play',back:'back'}}},null,2));
fs.writeFileSync(path.join(root,'assets/star.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path fill="#ffd166" d="M20 1 26 13 39 15 29 25 32 39 20 32 8 39 11 25 1 15 14 13Z"/></svg>');
console.log(root);
