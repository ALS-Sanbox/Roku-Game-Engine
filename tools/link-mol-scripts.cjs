// Add editor-only connection metadata without changing MOL's runtime ownership.
const fs=require('node:fs');
const path=require('node:path');
function linkMolScripts(scene) {
  const nodes=new Map(scene.nodes.map(n=>[n.id,n]));
  const controller='res://components/mol_controller.brs';
  for(const node of scene.nodes) {
    let group=node;const visited=new Set();
    while(group.parentId&&group.parentId!==scene.scene.rootNodeId&&!visited.has(group.id)) {
      visited.add(group.id);group=nodes.get(group.parentId)||group;
    }
    let hook='RokuScript_components_mol_controller_Update';
    if(['Menu','Intro','Instructions','Scores','Entry','Credits','Overlay'].includes(group.id))hook='MOLScene_Screens';
    else if(group.id==='HUD'||group.id==='Masks')hook='MOLScene_Hud';
    else if(group.id==='Templates'||['Player','Prayer'].includes(node.id))hook='MOLScene_Actors';
    else if(group.id==='World')hook='MOLScene_Landscape';
    const links=[{scriptPath:controller,role:'Controller (attached to root)',hook}];
    const modules=node.id===scene.scene.rootNodeId ? ['game','input','frontend','presentation','enemies','weapons','save','audio']
      : ['Menu','Intro','Instructions','Scores','Entry','Credits','Overlay'].includes(group.id) ? ['frontend','input']
      : group.id==='HUD' ? ['game'] : group.id==='Templates' || ['Player','Prayer'].includes(node.id) ? ['game','enemies','weapons'] : [];
    for(const name of modules)links.push({scriptPath:`res://components/game/${name}.brs`,role:'Shared module (called by controller)'});
    node.metadata ||= {};
    node.metadata.scriptLinks=links;
  }
  return scene;
}
function updateProject(root) {
  root=path.resolve(root);
  const file=path.join(root,'MOL.rkscene');
  const before=fs.readFileSync(file,'utf8');
  const scene=linkMolScripts(JSON.parse(before));
  for(const node of scene.nodes)for(const link of node.metadata.scriptLinks) {
    if(!fs.existsSync(path.join(root,link.scriptPath.slice(6))))throw new Error('Missing linked script: '+link.scriptPath);
  }
  const backup=file+'.before-script-links.bak';
  if(!fs.existsSync(backup))fs.writeFileSync(backup,before,{flag:'wx'});
  fs.writeFileSync(file,JSON.stringify(scene,null,2)+'\n');
  console.log(JSON.stringify({project:root,nodes:scene.nodes.length,backup}));
}
if(require.main===module)updateProject(process.argv[2]||require('./mol-project-path.cjs')());
module.exports={linkMolScripts,updateProject};
