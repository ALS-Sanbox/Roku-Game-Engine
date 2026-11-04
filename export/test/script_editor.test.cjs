const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {scriptFile,listScripts,resolveScript}=require('../../editor/script_files.cjs');
const {collectProjectBrightScriptFiles,buildUserScriptRegistrySource}=require('../user_scripts');
test('BrightScript syntax colors preserve source and escape markup',()=>{
  const {highlight}=require('../../editor/brightscript_syntax');
  const source='sub Test(context as Object)\n  x = "<b>""quoted""" \' if true 12\n  print 42\nend sub';
  const html=highlight(source);
  assert.match(html,/class="brs-keyword">sub/);
  assert.match(html,/class="brs-string">&quot;&lt;b&gt;/);
  assert.match(html,/class="brs-comment">\' if true 12<\/span>/);
  assert.match(html,/class="brs-number">42/);
  assert.doesNotMatch(html,/<b>/);
  assert.equal(html.replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'),source);
});
test('MOL connection metadata leaves executable components unchanged',()=>{
  const {linkMolScripts}=require('../../tools/link-mol-scripts.cjs');
  const scene={scene:{rootNodeId:'root'},nodes:[{id:'root',components:[{type:'ScriptComponent',scriptPath:'res://components/mol_controller.brs'}]},{id:'Menu',parentId:'root'},{id:'MenuItem0',parentId:'Menu',components:[]}]};
  const before=JSON.stringify(scene.nodes.map(n=>n.components));linkMolScripts(scene);linkMolScripts(scene);
  assert.equal(JSON.stringify(scene.nodes.map(n=>n.components)),before);
  assert.equal(scene.nodes[2].metadata.scriptLinks[0].hook,'MOLScene_Screens');
  assert.equal(scene.nodes[0].metadata.scriptLinks.length,9);
});
test('script editor creates, reads, lists, and refuses stale or unsafe writes',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rge-scripts-'));
  try{
    const resourcePath='res://components/menu.brs';
    const text='sub RokuScript_components_menu_Action(context as Object)\nend sub\n';
    scriptFile(root,{operation:'save',resourcePath,text,original:null});
    assert.equal(scriptFile(root,{resourcePath}).text,text);
    assert.deepEqual(listScripts(root),[resourcePath]);
    assert.throws(()=>scriptFile(root,{operation:'save',resourcePath,text:'oops',original:null}),/changed on disk/);
    for(const resource of ['../escape.brs','source/engine/core.brs','source/main.brs','components/../escape.brs','components/no.js','C:/escape.brs'])assert.throws(()=>resolveScript(root,resource));
    const registry=buildUserScriptRegistrySource(collectProjectBrightScriptFiles(root));
    assert.match(registry,/eventKey = "action"/);
    assert.match(registry,/RokuScript_components_menu_Action\(context\)/);
    scriptFile(root,{operation:'save',resourcePath,text:'new',original:text});
    assert.equal(scriptFile(root,{resourcePath}).text,'new');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
