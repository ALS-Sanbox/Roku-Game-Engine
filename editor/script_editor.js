/* Dedicated BrightScript editor. Source stays text; no script executes in Electron. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const drafts = new Map();
  let active = '', busy = false;
  const api = payload => window.electronAPI.scriptEditorFile(payload);
  const bridge = () => window.RGESceneBridge;
  const baseName = resource => 'RokuScript_' + resource.replace(/^res:\/\//, '').replace(/\.brs$/i, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^[^A-Za-z_]+/, '');
  const status = text => { $('script-status').textContent = text; };
  function remember() {
    if (active) drafts.get(active).text = $('script-text').value;
  }
  function lines() {
    $('script-highlight').innerHTML = window.RGEBrightScriptSyntax.highlight($('script-text').value) + '\n';
    $('script-lines').textContent = Array.from({length: $('script-text').value.split('\n').length}, (_, i) => i + 1).join('\n');
    $('script-lines').scrollTop = $('script-text').scrollTop;
    syncScroll();
  }
  function syncScroll() {
    $('script-highlight').scrollTop = $('script-text').scrollTop;
    $('script-highlight').scrollLeft = $('script-text').scrollLeft;
    $('script-lines').scrollTop = $('script-text').scrollTop;
  }
  function connections() {
    const host=$('script-connections'); if(!host)return;
    host.replaceChildren();
    const node=bridge()?.getNode(bridge()?.getSelectedId());
    const label=document.createElement('span');label.textContent=node ? `${node.name} (${node.id}):` : 'Select a scene element to see its scripts.';host.append(label);
    function link(text,file,hook) {
      const button=document.createElement('button');button.className='mini-btn';button.textContent=text;button.title=file;
      button.onclick=()=>void open(file,hook);host.append(button);
    }
    const attached=(node?.components||[]).filter(c=>c.type==='ScriptComponent'&&c.scriptPath);
    for(const c of attached)link(`Attached${c.enabled===false?' (disabled)':''}: ${c.scriptPath}`,c.scriptPath);
    const linked=node?.metadata?.scriptLinks || [];
    for(const entry of linked)if(entry?.scriptPath)link(`${entry.role||'Related'}: ${entry.scriptPath}${entry.hook?' → '+entry.hook:''}`,entry.scriptPath,entry.hook);
    if(node&&!attached.length&&!linked.length){const empty=document.createElement('span');empty.textContent='No script connections recorded.';host.append(empty);}
    if(active) {
      const owners=(bridge()?.getNodes()||[]).filter(n=>(n.components||[]).some(c=>c.type==='ScriptComponent'&&c.scriptPath===active));
      for(const owner of owners){const button=document.createElement('button');button.className='mini-btn';button.textContent='Script owner: '+owner.name;button.onclick=()=>{bridge().selectNode(owner.id);connections();};host.append(button);}
    }
  }
  function options() {
    const select = $('script-files'); select.replaceChildren(new Option('Choose a script', ''));
    for (const [file, draft] of drafts) select.add(new Option(file + (draft.text !== draft.original ? ' *' : ''), file));
    select.value = active;
  }
  async function refresh() {
    try {
      const result = await api({operation: 'list'});
      if (!result.success) throw new Error(result.reason);
      for (const file of result.files) if (!drafts.has(file)) drafts.set(file, {text: null, original: null});
      options();
      connections();
      const selected = $('script-nodes').value;
      $('script-nodes').replaceChildren(new Option('Choose scene element', ''));
      for (const node of bridge()?.getNodes() || []) $('script-nodes').add(new Option(`${node.name} (${node.type})`, node.id));
      $('script-nodes').value = selected;
    } catch (error) { status(error.message); }
  }
  async function open(file,hook) {
    if (!file || busy) { options(); return; }
    busy = true;
    try {
      remember();
      let draft = drafts.get(file);
      if (!draft || draft.text === null) {
        const result = await api({operation:'read',resourcePath:file});
        if (!result.success) throw new Error(result.reason);
        draft = {text:result.text, original:result.text}; drafts.set(file,draft);
      }
      active = file; $('script-text').disabled = false; $('script-text').value = draft.text;
      options(); lines(); connections(); status(file); window.RGEShowDockTab?.('scripts'); $('script-text').focus();
      if(hook&&/^\w+$/.test(hook)) {
        const area=$('script-text'),match=new RegExp('(?:sub|function)\\s+('+hook+')\\s*\\(','i').exec(area.value);
        if(match){const index=match.index+match[0].indexOf(match[1]);area.setSelectionRange(index,index+hook.length);area.scrollTop=Math.max(0,(area.value.slice(0,index).split('\n').length-4)*20);syncScroll();}
      }
    } catch (error) { status(error.message); options(); }
    finally { busy = false; }
  }
  async function saveAll() {
    remember();
    for (const [file, draft] of drafts) {
      if (draft.text === null || draft.text === draft.original) continue;
      const savedText = draft.text;
      const result = await api({operation:'save',resourcePath:file,text:savedText,original:draft.original});
      if (!result.success) { status(result.reason); bridge()?.setStatus(result.reason); window.RGEShowDockTab?.('scripts'); return false; }
      draft.original = savedText;
    }
    options(); status(active ? 'Scripts saved. ' + active : 'No unsaved scripts.'); return true;
  }
  function insert(text) {
    if (!active) throw new Error('Open a script first.');
    const area = $('script-text'); area.setRangeText(text,area.selectionStart,area.selectionEnd,'end');
    area.dispatchEvent(new Event('input')); area.focus();
  }
  function action() {
    if (!active) throw new Error('Open a script first.');
    const owner = bridge().getNode(bridge().getSelectedId());
    if (owner?.type !== 'Button') throw new Error('Select a UI Button in the Scene tree first.');
    const name = bridge().attachScript(active,true);
    const hook = baseName(active) + '_Action';
    if (!new RegExp('(?:sub|function)\\s+' + hook + '\\s*\\(', 'i').test($('script-text').value)) {
      $('script-text').setSelectionRange($('script-text').value.length,$('script-text').value.length);
      insert(`\nsub ${hook}(context as Object)\n  if context.extra.nodeId <> context.node.id then return\n  ' Runs when this button is activated.\n  context.node.properties.text = "Clicked!"\nend sub\n`);
    }
    status('Connected ' + name + '. Save the script and scene before testing.');
  }
  function guard(fn) { return async () => { try { await fn(); } catch(error) { status(error.message); } }; }
  function init() {
    $('script-files').addEventListener('change', () => void open($('script-files').value));
    $('script-save').onclick = guard(saveAll);
    $('script-new').onclick = guard(async () => {
      const name = $('script-new-path').value.trim(); if (!name) throw new Error('Enter a new path, e.g. components/my_script.brs, then click New.');
      const file = 'res://' + name.replace(/^res:\/\//,'').replace(/\\/g,'/');
      const base = baseName(file);
      const text = `' ${file}\nsub ${base}_Ready(context as Object)\n  ' context.node is the owner.\nend sub\n\nsub ${base}_Update(context as Object)\n  ' context.dt is elapsed seconds.\nend sub\n`;
      const result = await api({operation:'save',resourcePath:file,text,original:null});
      if (!result.success) throw new Error(result.reason);
      drafts.set(file,{text,original:text}); await open(file);
    });
    $('script-reload').onclick = guard(async () => {
      if (!active) return;
      remember(); const file=active, draft=drafts.get(file);
      if (draft.text !== draft.original && !confirm('Discard unsaved edits to this script and reload from disk?')) return;
      const result=await api({operation:'read',resourcePath:file}); if(!result.success)throw new Error(result.reason);
      draft.text=result.text;draft.original=result.text;$('script-text').value=result.text;lines();options();status('Reloaded '+file);
    });
    $('script-attach').onclick = guard(() => {
      if (!active) throw new Error('Open a script first.');
      status('Attached to ' + bridge().attachScript(active) + '. Save the scene to keep the attachment.');
    });
    $('script-reference').onclick = guard(() => {
      const id = $('script-nodes').value;if(!id)throw new Error('Choose a scene element first.');
      insert('target = context.scene.nodeMap["' + id.replace(/"/g, '""') + '"]\n  if target <> invalid then\n    \' Edit target.properties, target.transform, or target.visible here.\n  end if\n');
    });
    $('script-button').onclick = guard(action);
    const find = () => {
      const area=$('script-text'), needle=$('script-find').value;if(!needle)return;
      const source=area.value.toLowerCase();let index=source.indexOf(needle.toLowerCase(),area.selectionEnd);
      if(index<0)index=source.indexOf(needle.toLowerCase());
      if(index<0){status('No matches.');return;}
      area.focus();area.setSelectionRange(index,index+needle.length);
      area.scrollTop=Math.max(0,(source.slice(0,index).split('\n').length-4)*20);lines();
    };
    $('script-find-next').onclick=find;
    $('script-find').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();find();}};
    $('script-text').addEventListener('input',()=>{remember();lines();options();status('Unsaved edits — '+active);});
    $('script-text').addEventListener('scroll',syncScroll);
    $('script-text').addEventListener('keydown',e=>{
      if(e.key==='Tab'){e.preventDefault();e.stopPropagation();insert('  ');}
    });
    $('script-editor-wrap').addEventListener('keydown',e=>{
      e.stopPropagation();
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void guard(saveAll)();}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('script-find').focus();}
    });
    window.addEventListener('beforeunload', e=>{remember();if([...drafts.values()].some(d=>d.text!==d.original)){e.preventDefault();e.returnValue='Unsaved scripts';}});
  }
  window.RGEScriptEditor={open,refresh,saveAll,connections};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
