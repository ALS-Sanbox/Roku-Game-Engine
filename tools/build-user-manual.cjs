'use strict';
// Offline manual builder: registry-backed reference + embedded illustrations.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const vm = require('node:vm');
const { getSchema } = require('../export/project_snapshot');
const { getClassicRuntimeSourceFiles } = require('../export/classic2d_export');
const data = require('../docs/manual/reference-data.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/manual');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim();
const inline = text => escape(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
const table = (headers, rows, cls = '') => `<table class="${cls}"><thead><tr>${headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const code = text => `<code>${escape(text)}</code>`;
let figureNumber = 0;
function svg(contents, width = 1000, height = 330) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><rect width="100%" height="100%" fill="#f0f4f9" rx="12"/>${contents}</svg>`;
}
function text(x, y, label, size = 19, color = '#243950') {
  return `<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" fill="${color}">${escape(label)}</text>`;
}
function box(x, y, width, height, title, lines = [], fill = '#fff') {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="9" fill="${fill}" stroke="#71879c"/>${text(x+15,y+29,title,20)}${lines.map((line,i)=>text(x+15,y+57+i*25,line,16)).join('')}`;
}
function arrow(x1,y1,x2,y2) {
  return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#3278ac" stroke-width="3" fill="none"/><circle cx="${x2}" cy="${y2}" r="5" fill="#3278ac"/>`;
}
function photo(file, markers = [], crop) {
  const bytes = fs.readFileSync(path.join(root, 'docs/images/alpha', file));
  const [x,y,w,h] = crop || [0,0,1600,1000];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" role="img"><image width="1600" height="1000" href="data:image/png;base64,${bytes.toString('base64')}"/>${markers.map(([cx,cy,n])=>`<circle cx="${cx}" cy="${cy}" r="23" fill="#ffd166" stroke="#16293b" stroke-width="3"/><text x="${cx}" y="${cy+8}" text-anchor="middle" font-family="Segoe UI,Arial" font-size="25" font-weight="700" fill="#16293b">${n}</text>`).join('')}</svg>`;
}
function figure(name) {
  const illustrations = {
    pipeline: [svg(box(20,60,210,120,'AUTHOR',['Nodes + assets','Components + scripts'])+arrow(240,120,275,120)+box(285,60,210,120,'BUILD',['Native BrightScript','Validate + ZIP'])+arrow(505,120,540,120)+box(550,60,200,120,'SIMULATE',['Native package','Remote + logs'])+arrow(760,120,790,120)+box(800,60,180,120,'ROKU',['Developer device','Profile + verify'])+text(25,245,'Illustration: authoring, build, simulator and hardware are separate steps.',20),1000,280), 'Build pipeline. A visible authoring preview is not a native execution test.'],
    workspace: [photo('editor.png',[[180,46,1],[120,112,2],[750,350,3],[1450,112,4],[180,570,5],[850,790,6]]), 'Workspace screenshot (Dark theme): 1 toolbar; 2 Create/tools; 3 world canvas; 4 Inspector; 5 Scene tree; 6 Output.'],
    hierarchy: [svg(box(30,30,280,100,'SceneRoot',['Game scene'])+arrow(310,75,375,75)+box(390,25,250,105,'World nodes',['Player, enemies, tiles','Camera2D frames them'])+arrow(310,105,375,220)+box(390,175,250,110,'CanvasLayer',['ScoreLabel, menus','Screen-space layout'])+arrow(640,225,700,225)+box(715,175,250,110,'FocusGroup',['Start, Options, Quit','Remote focus scope']),1000,320), 'Illustration: separate world content from screen-space HUD/menu hierarchy.'],
    icons: [svg(['▶','↶','↷','⊡','⊞','+','×','↻'].map((icon,i)=>box(18+i*122,25,110,100,icon,[['Play','Undo','Redo','Frame','Grid','Add','Close','Refresh'][i]])).join('')+text(25,185,'Read the label/tooltip: the same symbol can operate on a different object in another panel.',18),1000,220), 'Symbol guide. Text labels are the primary identifiers when fonts render an icon differently.'],
    transform: [svg(`<path d="M120 70V260H400" fill="none" stroke="#3278ac" stroke-width="3"/>`+text(410,266,'+X →',22)+text(60,285,'+Y ↓',22)+`<rect x="160" y="100" width="210" height="105" fill="#83b8db" stroke="#245e86"/><circle cx="160" cy="100" r="9" fill="#d34d48"/>`+text(180,90,'Pivot',18)+box(500,55,460,190,'LOCAL TRANSFORM',['X/Y relative to the parent','Width/height define a rectangle','Scale changes its transform','Rotation uses the pivot']),1000,320), 'Illustration: parent-local coordinates, local rectangle and pivot. Positive Y points down.'],
    nineslice: [svg([0,1,2].map(row=>[0,1,2].map(col=>`<rect x="${50+col*85}" y="${30+row*85}" width="85" height="85" fill="${row===1&&col===1?'#9cc8e5':'#d8e7f1'}" stroke="#3278ac"/>`).join('')).join('')+arrow(330,150,445,150)+box(475,40,465,210,'NINE-SLICE',['Four corners retain their shape','Edge strips fill one axis','The center fills the remaining space','Borders must leave a usable center']),1000,315), 'Illustration: nine-slice borders resize surfaces without stretching their corner details.'],
    animation: [svg(box(70,70,270,145,'IDLE',['Frames 0, 1 · 4 FPS','Speed = 0'])+arrow(355,110,625,110)+text(385,90,'Speed > 0',20)+box(650,70,270,145,'RUN',['Frames 2–5 · 10 FPS','Footstep event on frame 2'])+arrow(635,190,355,190)+text(380,220,'Speed == 0',20)+text(210,285,'Transition duration controls an image fade between states.',20),1000,330), 'Illustration: parameter-driven animation state changes; clips still need valid frame-library metadata.'],
    camera: [svg(`<rect x="40" y="25" width="920" height="280" fill="#dce7f0" stroke="#557b98" stroke-dasharray="10 6"/><rect x="180" y="60" width="550" height="210" fill="#fff" stroke="#3278ac" stroke-width="3"/><rect x="345" y="120" width="200" height="90" fill="#e2f1e8" stroke="#4b8c6c" stroke-dasharray="8 4"/><circle cx="430" cy="165" r="13" fill="#d79d22"/>`+text(60,53,'Bounds',18)+text(195,88,'Camera frame',18)+text(350,145,'Deadzone',17)+arrow(450,165,640,165)+text(560,150,'Look-ahead',17),1000,330), 'Illustration: bounds limit travel, the frame shows the view, deadzone tolerates target movement, and look-ahead shifts framing.'],
    ui: [photo('ui.png',[[95,180,1],[100,310,2],[750,265,3],[1450,275,4],[510,95,5]]), 'UI Screens screenshot (Dark theme): 1 screen/layer; 2 Elements tree; 3 selected screen canvas; 4 element properties; 5 Fit/zoom/refresh controls.'],
    gameplay: [svg(box(35,60,245,135,'TIMER / SPAWNER',['Interval → request spawn','Markers choose position'])+arrow(290,125,365,125)+box(380,60,245,135,'TEMPLATE / POOL',['Clone a subtree','or acquire an object'])+arrow(635,125,710,125)+box(725,60,240,135,'ACTIVE OBJECT',['Move / collide / render','Destroy or release'])+text(95,265,'Visibility regions can suspend processing; merely hiding a node is a different operation.',19),1000,305), 'Illustration: bounded spawning and reusable pooled objects.'],
    scripts: [photo('scripts.png',[[510,140,1],[900,175,2],[680,225,3],[600,500,4]]), 'Scripts screenshot (Dark theme): 1 source/draft controls; 2 reference/button connection tools; 3 script owners/connections; 4 native BrightScript source.'],
    themes: [svg([['Dark','#1c1e26','#252830','#dde3f0'],['Light','#edf0f5','#ffffff','#202b3b'],['Mid-tone · default','#434b58','#505b6b','#f5f7fb']].map(([name,bg,panel,fg],i)=>`<rect x="${25+i*325}" y="30" width="300" height="200" rx="10" fill="${bg}"/><rect x="${40+i*325}" y="95" width="270" height="110" rx="5" fill="${panel}"/>${text(45+i*325,70,name,21,fg)}${text(55+i*325,130,'Inspector / tools',19,fg)}${text(55+i*325,175,'Scene colors stay authored',15,fg)}`).join(''),1000,260), 'Palette illustration using the actual theme colors. Saved choices override the new Mid-tone default.'],
    audio: [svg(box(25,65,225,160,'CLIP',['Play / Stop','Volume · pitch · loop','One Shot / Awake'])+arrow(260,140,350,140)+box(365,65,255,160,'BUS',['Fader · pan · mute/solo','LOW / MID / HIGH EQ','FX chain · sends'])+arrow(630,140,720,140)+box(735,65,240,160,'MASTER',['Output route','Preview in editor','Bake → native audio']),1000,290), 'Illustration: clips route through buses to the master. Faders/knobs change sound; meters indicate activity rather than changing it.'],
    inspector: [photo('editor.png',[],[1300,95,300,830]), 'Enlarged Inspector screenshot. Search, section disclosures, text fields, checkboxes, numeric steppers and resource/color controls have different input roles.'],
    scripttools: [photo('scripts.png',[],[265,120,1028,125]), 'Enlarged Scripts toolbar: source file, New, Save, Reload, Attach; Find, scene reference, Insert reference and Connect selected button.']
  };
  if (!illustrations[name]) throw new Error('Unknown manual figure: '+name);
  const [drawing, caption] = illustrations[name];
  return `<figure class="${name==='inspector'?'narrow':''}">${drawing}<figcaption>Figure ${++figureNumber}. ${escape(caption)}</figcaption></figure>`;
}
let headingNumber = 0;
const toc = [];
function heading(title, level = 2) {
  const id = 'section-'+(++headingNumber);
  if (level===2) toc.push({id,title});
  return `<h${level} id="${id}">${escape(title)}</h${level}>`;
}
function markdown(source) {
  const lines=source.split(/\r?\n/);let out='',i=0;
  while(i<lines.length) {
    const line=lines[i];
    if (!line.trim()) { i++;continue; }
    if (line.startsWith('```')) { const block=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))block.push(lines[i++]);i++;out+=`<pre>${escape(block.join('\n'))}</pre>`;continue; }
    const h=/^(#{1,3}) (.+)$/.exec(line);
    if(h){out+=h[1].length===1?`<h1>${escape(h[2])}</h1>`:heading(h[2],h[1].length);i++;continue;}
    const f=/^\[\[figure:(\w+)\]\]$/.exec(line.trim());if(f){out+=figure(f[1]);i++;continue;}
    if(line.startsWith('|')){
      const rows=[];while(i<lines.length&&lines[i].startsWith('|'))rows.push(lines[i++].split('|').slice(1,-1).map(c=>c.trim()));
      out+=table(rows[0],rows.slice(2).map(row=>row.map(inline)));continue;
    }
    if(/^\d+\. /.test(line)) {const list=[];while(i<lines.length&&/^\d+\. /.test(lines[i]))list.push(lines[i++].replace(/^\d+\. /,''));out+='<ol>'+list.map(t=>`<li>${inline(t)}</li>`).join('')+'</ol>';continue;}
    const block=[line];i++;
    while(i<lines.length&&lines[i].trim()&&!/^(#|\||```|\[\[|\d+\. )/.test(lines[i]))block.push(lines[i++]);
    out+=`<p>${inline(block.join(' '))}</p>`;
  }
  return out;
}
function defaultText(value) {
  if(value===undefined)return 'Unset / optional';
  const encoded=typeof value==='string'?JSON.stringify(value):JSON.stringify(value);
  return encoded.length>320?encoded.slice(0,317)+'…':encoded;
}
function fieldDescription(name) {
  if(!data.fields[name])throw new Error('Document this field before building: '+name);
  return data.fields[name];
}
function catalog(schema) {
  let html=heading('23. Node catalog — all creatable types');
  html+='<p>Property paths below are relative to node.properties. Common name/visibility/order/transform fields are explained in chapter 5. Unset means the schema does not supply an explicit value; optional resource and target fields must be configured when used. Some nodes also expose specialized array/resource editors (points, targets, items and layers) described in their workflow chapters.</p>';
  for(const def of schema.getCreatableNodeTypes()) {
    if(!data.nodes[def.type])throw new Error('Missing node explanation: '+def.type);
    const node=schema.createDefaultNode(def.type);
    html+=`<article class="reference-entry">${heading(def.displayName||def.type,3)}<div class="eyebrow">${escape(def.category)} · ${code(def.type)}</div><p>${escape(data.nodes[def.type])}</p>`;
    const fields=schema.getNodeFields(def.type).filter(f=>f.key.startsWith('properties.'));
    html+=table(['Field / default','Meaning and choices'],fields.map(f=>{
      const key=f.key.slice(11);
      let description=fieldDescription(key);
      if(f.options?.length)description+=' Choices: '+f.options.map(o=>typeof o==='object'?o.label||o.value: o).join(', ')+'.';
      if(f.min!==undefined)description+=' Minimum: '+f.min+'.';
      if(f.max!==undefined)description+=' Maximum: '+f.max+'.';
      return [`<strong>${escape(f.label||key)}</strong><br>${code(key)}<br><span class="default">${escape(defaultText(node.properties[key]))}</span>`,escape(description)];
    }));
    html+='</article>';
  }
  html+=heading('24. Component catalog — all creatable behaviors');
  html+='<p>These values live on a component object, not inside node.properties. Common Enabled/Priority apply within the component phase. IDs identify a particular component when a node owns more than one. Defaults are authoring defaults, not a guarantee that every combination has useful gameplay behavior.</p>';
  for(const def of schema.getCreatableComponentTypes()) {
    html+=`<article class="reference-entry">${heading(def.displayName,3)}<p>${code(def.type)}</p><p>${escape(def.description)}</p>`;
    html+=table(['Setting / default','Meaning'],Object.entries(def.defaults).map(([key,value])=>[`${code(key)}<br><span class="default">${escape(defaultText(value))}</span>`,escape(fieldDescription(key))]));
    html+='</article>';
  }
  return html;
}
function controlContext(id, file, attrs) {
  if(file==='settings.html')return 'Settings · chapter 19';
  if(file==='sideload.html')return 'Sideload · chapter 17';
  if(file==='project_manager.html')return 'Project manager · chapter 2';
  if(id.startsWith('script-'))return 'Scripts · chapter 16';
  if(id.startsWith('slicer-'))return 'Sprite Slicer · chapter 6';
  if(/^(tm-|ts-|tcs-|tps-)/.test(id))return 'Tiles/terrain/collision · chapter 8';
  if(id.startsWith('nse-'))return 'UI Assets Atlas · chapter 12';
  if(id.startsWith('te-'))return 'Transitions · chapter 12';
  if(id.startsWith('oe-'))return 'Options / High Scores · chapter 12';
  if(id.startsWith('tpl-'))return 'UI Templates · chapter 12';
  if(/^(cam|cpv-|btn-camera|btn-edit-camera)/.test(id))return 'Camera tools · chapter 9';
  if(id.startsWith('ui-')||attrs.includes('ui-add-btn'))return 'UI Screens · chapters 10–11';
  if(id.startsWith('sheet-')||id==='btn-import-sheet'||id==='btn-sheet-grid')return 'Sprites · chapter 6';
  if(id.startsWith('menu-')||id.includes('menu'))return 'Menus / docking · chapters 3–4';
  if(id.startsWith('btn-'))return 'Toolbar / scene · chapters 4–5';
  if(attrs.includes('data-tab')||attrs.includes('data-bottom'))return 'Dock tabs · chapter 3';
  return 'Editor workspace';
}
function controlMeaning(id,label,title,tag,attrs) {
  if(data.controls[id])return data.controls[id];
  const panelAction=/data-panel-action="([^"]+)"/.exec(attrs)?.[1];
  if(panelAction)return ({edit:'Open the selected project in the editor.',export:'Export the selected project through native build.',rename:'Rename the selected project folder through the manager workflow.',duplicate:'Duplicate the selected project folder.',tags:'Edit comma-separated project tags.',remove:'Remove the project from the manager list; the project folder is not deleted.'})[panelAction];
  if(title)return title+'.';
  const type=/data-type="([^"]+)"/.exec(attrs)?.[1];
  if(type)return 'Create a '+type+' in the UI hierarchy. See the node catalog for its fields.';
  if(attrs.includes('data-tab')||attrs.includes('data-panel')||attrs.includes('data-bottom'))return 'Show/select this tool or settings tab. Opening a tool does not change the running game.';
  if(attrs.includes('data-workspace'))return 'Switch the center workspace between world scene editing and UI screen editing.';
  if(attrs.includes('data-tool="select"'))return 'Select and manipulate nodes in the world canvas.';
  if(attrs.includes('data-tool="pan"'))return 'Pan the editing viewport without changing game node coordinates.';
  if(id.startsWith('tm-tool-'))return 'Select the '+label+' tile painting operation for the active map/layer.';
  if(id.startsWith('tm-mode-'))return 'Select '+label+' editing mode before painting.';
  if(id.startsWith('ui-zoom')||id.startsWith('cpv-zoom'))return 'Change authoring preview magnification, leaving source assets and game camera zoom unchanged.';
  if(id.startsWith('menu-'))return 'Run '+label+' through its menu workflow; see chapters 4–5 for save/reload/inheritance consequences.';
  if(tag==='select')return 'Choose the '+label+' setting/resource for this panel; choices are listed below.';
  if(/delete|clear|remove/i.test(label))return 'Remove/clear the selected data in this panel. Check its current selection before using it.';
  if(/add|new|create|upload|import/i.test(label))return 'Add or import the named item in this panel; configure its resource/selection first.';
  if(/save/i.test(label))return 'Persist the current values through this panel save operation.';
  if(/close|cancel|×|✕/.test(label))return 'Close the current window/panel or cancel the applicable operation; follow any unsaved-work prompt.';
  if(/scan|discover/i.test(label))return 'Search the local network for Roku developer devices.';
  if(/ping|test connection/i.test(label))return 'Check whether the configured device responds.';
  if(/deploy|upload|sideload/i.test(label))return 'Build/upload through the developer-device workflow using the selected target and credentials.';
  if(/stop|restart|play|pause/i.test(label))return 'Control playback/run state in this panel context; see the corresponding workflow chapter.';
  return 'Use '+label+' for the current panel selection/context. Related workflow chapter explains the operation.';
}
function controls() {
  let html=heading('25. Button, selector and icon control index');
  html+='<p>Each entry uses the visible label and, where available, its original tooltip. The code-sized identifier helps distinguish repeated labels such as Save, Fit or Clear. Dropdown choices are listed for static options; scene/resource lists populate from the current project. Numeric/text fields and dynamically generated properties are documented in the catalogs. Keyboard-only shortcuts are in chapter 5.</p>';
  let count=0;
  for(const file of ['index.html','settings.html','sideload.html','project_manager.html']) {
    html+=heading(file==='index.html'?'Main editor':file.replace('.html','').replace('_',' '),3);
    const rows=[];
    for(const match of read(file).matchAll(/<(button|select)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const [,tag,attrs,content]=match;
      const id=/\bid="([^"]+)"/.exec(attrs)?.[1]||'';
      const title=plain(/\btitle="([^"]+)"/.exec(attrs)?.[1]||'');
      let label=tag==='select'?'':plain(content);
      label=label||/\baria-label="([^"]+)"/.exec(attrs)?.[1]||title||id||/data-(?:tab|bottom|tool)="([^"]+)"/.exec(attrs)?.[1]||'Control';
      const choices=tag==='select'?[...content.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/g)].map(m=>plain(m[1])).filter(Boolean):[];
      rows.push([`<strong>${escape(label)}</strong>${id?'<br>'+code(id):''}<br><span class="default">${escape(controlContext(id,file,attrs))}</span>`,escape(controlMeaning(id,label,title,tag,attrs))+(choices.length?`<br><em>Choices:</em> ${escape(choices.join('; '))}`:'')]);
      count++;
    }
    html+=table(['Control / location','Purpose'],rows);
  }
  html+=heading('Dynamic panel controls',3);
  html+=table(['Panel / controls','Purpose'],[
    ['Deploy: Target, username/password, profile','Select a device, authenticate the developer installer and choose telemetry behavior.'],
    ['Deploy: Add / Scan / Deploy','Register an IP / discover devices / build and upload the current project.'],
    ['Deploy: Connect logs / Disconnect / Screenshot / Restart','Open TCP logs / stop reconnection / capture the selected device / relaunch the installed developer channel.'],
    ['Device Logs: Filter / All, Errors, Warnings, Info / Clear / Auto','Filter displayed lines, clear the view and choose automatic scrolling.'],
    ['Memory Estimates: Refresh','Recalculate the current asset estimate. It does not sample total device RAM.'],
    ['Audio: clip/bus selection, transport, volume, pan, pitch, loop, One Shot, mute/solo, FX/EQ','Author/audition sound, choose routes and configure processing baked during native export.'],
    ['Scene row: disclosure / eye / lock / name / type','Expand children, change visibility/edit protection, identify and select the node.'],
    ['Inspector: component selector / Add / enable checkbox / Edit script / remove','Attach/manage behavior components and open project source. Removal affects the selected owner.'],
    ['Path points: add / point selection / move / delete','Edit the node-local route, independently of moving its parent transform.'],
    ['UI properties: resource/font/color pickers, layout presets, alignment, snap/guides','Configure the selected element using the layout and styling concepts in chapters 10–12.'],
    ['Saved slice/style/terrain/clip lists: select / add / rename / remove','Manage the selected reusable resource in its own editor context; save scene/resource changes afterward.']
  ].map(row=>row.map(escape)));
  return {html,count};
}
function api() {
  const sources=getClassicRuntimeSourceFiles();
  const signatures=new Map();
  for(const [file,source] of Object.entries(sources))for(const match of source.matchAll(/^(?:function|sub)\s+(\w+)\(([^\r\n]*)\)(?:\s+as\s+(\w+))?/gim))signatures.set(match[1].toLowerCase(),{args:match[2],type:match[3],file});
  const bindings=[...read('source/engine/core.brs').matchAll(/^\s+(\w+):\s*((?:RokuEngine_|RGE_)\w+)\s*$/gm)].map(m=>({name:m[1],fn:m[2]}));
  const signature=b=>{
    const sig=signatures.get(b.fn.toLowerCase());
    if(!sig)throw new Error('Missing canonical runtime signature: '+b.fn);
    return `${b.name}(${sig.args})${sig.type?' as '+sig.type:''}`;
  };
  let html=heading('26. BrightScript API reference');
  html+='<p>Call these methods through context.engine. Signatures below are taken directly from the canonical runtime. BrightScript optional arguments include their defaults. Check node/resource results for invalid; use valid scene/screen/pool/option names. Stored changes are device data; normal node mutations are temporary runtime state.</p>';
  const publicBindings=bindings.filter(b=>data.api[b.name]);
  html+=table(['Method signature','Purpose'],publicBindings.map(b=>[code(signature(b)),escape(data.api[b.name])]),'api');
  html+=heading('Advanced engine-bound signature index',3);
  html+='<p>The remaining bound methods are implementation/extension interfaces. Their names and source files are supplied for source navigation, not as stable beginner gameplay APIs. Calling render, cache, input-pump or phase functions out of order can break the engine. Prefer the game-facing operations above.</p>';
  html+=table(['Bound signature','Canonical implementation'],bindings.filter(b=>!data.api[b.name]).map(b=>[code(signature(b)),`${code(b.fn)}<br>${escape(signatures.get(b.fn.toLowerCase()).file)}`]),'api');
  html+=heading('Asset streamer interface',3);
  html+=table(['Method/property','Meaning'],[
    ['engine.assetStream.PreloadGroup(groupId, lazy)','Queue/request an existing manifest group. true enables incremental texture queue processing.'],
    ['engine.assetStream.EnqueueLazy(guid, path, kind)','Queue an asset identified by GUID/path; use supported resource kinds.'],
    ['engine.assetStream.IsLoaded(guid)','Query successful cache tracking; failed bitmap loads are not success.'],
    ['engine.assetStream.budgetKb / batchSize / lastWarning','Bitmap budget / assets processed per frame / explanation when pinned content prevents eviction.']
  ].map(row=>row.map(escape)));
  return {html,count:bindings.length,publicCount:publicBindings.length};
}
function buildHtml() {
  fs.mkdirSync(output,{recursive:true});
  const schema=getSchema();
  let body=markdown(read('docs/manual/user-manual.md'));
  // Source the exact current glyphs; keep explanations distinct from screenshots.
  const uiSource=read('editor/ui_editor.js').split('function nodeIcon(type)')[1];
  const fileSource=read('editor/scene_editor.js').split('function getFilesystemIcon(node)')[1];
  const iconRows=[];
  for(const [context,source] of [['UI element',uiSource],['FileSystem',fileSource]]) {
    const literal=/const icons\s*=\s*(\{[\s\S]*?\})/.exec(source)?.[1];
    const mapping=vm.runInNewContext('('+literal+')');
    for(const [name,glyph] of Object.entries(mapping))iconRows.push([escape(glyph)+' · '+escape(name),escape(context)+' identifier. '+(context==='UI element'?'Select its row to edit the element; see the node catalog.':'The icon identifies the resource kind; its filename/path is the reliable reference.')]);
  }
  const iconTable=heading('Tree and FileSystem glyphs',3)+table(['Glyph / kind','Meaning'],iconRows);
  // Insert after the complete icon figure (the caption follows its SVG).
  const symbolCaption=body.indexOf('Symbol guide.');
  const symbolEnd=body.indexOf('</figure>',symbolCaption)+9;
  body=body.slice(0,symbolEnd)+iconTable+body.slice(symbolEnd);
  body+=heading('Visual close-ups',3)+figure('inspector')+figure('scripttools');
  body+=catalog(schema);
  const controlsResult=controls();body+=controlsResult.html;
  const apiResult=api();body+=apiResult.html;
  body+=heading('27. Files, glossary and further reading');
  body+=table(['File/folder','Role'],[
    ['project.settings.json','Project name, input and display settings.'],['*.rkscene','Authored scene document.'],['*.rkscene.editstate','Editor resources, preview/workspace/resource state associated with the scene.'],
    ['components/*.brs','Project behavior scripts with path-derived hook names.'],['images / assets / audio / fonts','Project source assets referenced by the build.'],['source/engine','Canonical native engine runtime in this repository.'],['.visual-editor/engine-builds','Generated build output, replaced by subsequent builds.'],
    ['editor-preferences.json in Electron userData','Application-wide theme preference, separate from project data.'],['samples/collect-the-stars','Editable first-game example used in screenshots.'],['samples/gameplay-helpers','Gameplay helper nodes and event-hook examples.']
  ].map(row=>row.map(escape)));
  body+='<p><strong>Glossary:</strong> AABB: axis-aligned bounding box. Atlas: regions sharing a texture. Bake: pre-render processing into a playback asset. Collider: bounds used for interactions. D-pad: directional remote control. Easing: transition timing curve. Focus: control receiving remote navigation. Gizmo: editing guide. LRU: least-recently-used eviction. Nine-slice: scalable texture preserving borders. Pool: preallocated reusable objects. Prefab/instance: reusable scene content. Sidecar: associated editor-state file. Sideload: developer-channel install. Telemetry: runtime-reported measurements/estimates.</p>';
  body+='<p>Further repository guides: README.md, docs/SCRIPTING.md, docs/SPRITE_SLICING.md, docs/gameplay-nodes.md, docs/NATIVE_CONTROLS.md, docs/native-systems.md and docs/system-audit.md. For current implementation details, prefer canonical source and the latest audit over historical architecture notes.</p>';
  const counts={nodes:schema.getCreatableNodeTypes().length,components:schema.getCreatableComponentTypes().length,nodeFields:schema.getCreatableNodeTypes().reduce((n,d)=>n+schema.getNodeFields(d.type).filter(f=>f.key.startsWith('properties.')).length,0),controls:controlsResult.count,engineMethods:apiResult.count,gameApis:apiResult.publicCount,figures:figureNumber};
  const contents=`<nav class="contents"><h2>Contents</h2><p>Click a chapter title in the PDF. Printed page numbers appear in the footer; use PDF search for a field, node or button.</p><ol style="list-style:none;padding-left:0">${toc.map(t=>`<li><a href="#${t.id}">${escape(t.title)}</a></li>`).join('')}</ol><p class="coverage">Reference coverage: ${counts.nodes} creatable nodes · ${counts.components} components · ${counts.nodeFields} node property entries · ${counts.controls} static controls · ${counts.engineMethods} bound engine signatures · ${counts.figures} figures.</p></nav>`;
  const css=`@page{size:Letter;margin:17mm 16mm 18mm}*{box-sizing:border-box}html{font-size:10pt;color:#243246;background:white;font-family:'Segoe UI',Arial,sans-serif}body{margin:0;line-height:1.47}h1{font-size:34pt;line-height:1.12;margin:30mm 0 12mm;color:#163c5e}h2{break-before:page;font-size:23pt;line-height:1.2;padding-top:4mm;margin:0 0 7mm;color:#174a70;break-after:avoid}h3{font-size:15pt;margin:7mm 0 3mm;color:#174a70;break-after:avoid}p{margin:0 0 3.5mm;orphans:3;widows:3}a{color:#185e92;text-decoration:none}strong{font-weight:650}ol{padding-left:6mm}li{margin-bottom:2mm;orphans:2;widows:2}table{width:100%;border-collapse:collapse;font-size:9pt;margin:4mm 0 6mm;table-layout:fixed}th{text-align:left;background:#e2ebf3;color:#173d5b;font-weight:650;padding:2.5mm;border:1px solid #b7c8d8}td{padding:2.3mm;border:1px solid #cbd5e0;vertical-align:top;overflow-wrap:anywhere}td:first-child{width:34%}tr{break-inside:avoid}thead{display:table-header-group}tbody tr:nth-child(even){background:#f6f8fb}code{font:8.3pt Consolas,'Courier New',monospace;overflow-wrap:anywhere}pre{font:8.6pt/1.5 Consolas,'Courier New',monospace;background:#eef3f8;border-left:3px solid #5585ab;padding:4mm;white-space:pre-wrap;overflow-wrap:anywhere;margin:4mm 0 6mm;break-inside:avoid}figure{margin:5mm 0 6mm;break-inside:avoid}figure svg{width:100%;height:auto;display:block;max-height:160mm}figure.narrow svg{max-height:170mm}figcaption{font-size:8.6pt;color:#53677d;margin-top:2mm;line-height:1.4}.reference-entry{break-before:page}.reference-entry h3{font-size:21pt;margin-top:0}.eyebrow{color:#54718a;font-size:10pt;margin-bottom:4mm}.default{font-size:8pt;color:#596b80;overflow-wrap:anywhere}.contents{break-before:page;break-after:page}.contents h2{break-before:auto}.contents ol{columns:2;column-gap:10mm;font-size:9.5pt}.contents li{break-inside:avoid;margin-bottom:3mm}.coverage{margin-top:7mm;padding:4mm;background:#eef3f8}.api td:first-child{width:50%}@media screen{body{max-width:820px;margin:30px auto;padding:25px;box-shadow:0 4px 24px #c5ced8}h2{border-top:1px solid #cbd5e0;padding-top:20px}.reference-entry{margin-top:35px}.contents{margin:40px 0}}`;
  const introEnd=body.indexOf('<h2');
  body=body.slice(0,introEnd)+contents+body.slice(introEnd);
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Roku Game Engine — User Manual</title><style>${css}</style></head><body>${body}</body></html>`;
  fs.writeFileSync(path.join(output,'Roku-Game-Engine-User-Manual.html'),html);
  fs.writeFileSync(path.join(output,'coverage.json'),JSON.stringify(counts,null,2)+'\n');
  console.log('Manual HTML and reference coverage:',counts);
}
async function printPdf() {
  const browser=process.env.MANUAL_BROWSER || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(file=>fs.existsSync(file));
  if(!browser)throw new Error('Set MANUAL_BROWSER to a Chromium executable, or use --html-only.');
  const profile=path.join(root,'.visual-editor','manual-browser-'+process.pid);
  const extraFlags=process.env.MANUAL_BROWSER_FLAGS?.split(/\s+/).filter(Boolean)||[];
  const child=spawn(browser,['--headless=new','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,...extraFlags,'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let socket;const waiting=new Map();let sequence=0;
  try {
    const address=await new Promise((resolve,reject)=>{
      let logs='';const timer=setTimeout(()=>reject(new Error('Manual browser startup timed out: '+logs.slice(-1500))),20000);
      child.on('error',error=>{clearTimeout(timer);reject(error)});
      child.on('exit',code=>{clearTimeout(timer);reject(new Error('Manual browser exited with '+code+': '+logs.slice(-1500)))});
      child.stderr.on('data',chunk=>{logs+=chunk;const match=/DevTools listening on (ws:\/\/\S+)/.exec(logs);if(match){clearTimeout(timer);resolve(match[1])}});
    });
    socket=new WebSocket(address);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
    socket.onmessage=event=>{const message=JSON.parse(event.data);if(waiting.has(message.id)){const entry=waiting.get(message.id);waiting.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(new Error(JSON.stringify(message.error))):entry.resolve(message.result)}};
    const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
      const id=++sequence;const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('Browser command timed out: '+method))},30000);
      waiting.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
    const target=await send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    await send('Page.enable',{},sessionId);
    await send('Page.navigate',{url:pathToFileURL(path.join(output,'Roku-Game-Engine-User-Manual.html')).href},sessionId);
    let ready=false;
    for(let i=0;i<80;i++) {
      const result=await send('Runtime.evaluate',{expression:'document.readyState === "complete" && [...document.images].every(i=>i.complete) && !!document.querySelector(".reference-entry")',returnByValue:true},sessionId);
      if(result.result?.value){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    if(!ready)throw new Error('Manual document did not finish loading.');
    await send('Runtime.evaluate',{expression:'document.fonts.ready',awaitPromise:true},sessionId);
    const printOptions={printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:8px Arial;color:#62758a;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>Roku Game Engine · User Manual · v0.1.0</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',generateDocumentOutline:true,generateTaggedPDF:true};
    let pdf, previousDestinations='', pageCount=0;
    for(let pass=0;pass<4;pass++) {
      pdf=await send('Page.printToPDF',printOptions,sessionId);
      // Chromium emits page dictionaries in print order and uncompressed named
      // destinations. Read only that known output format, not arbitrary PDFs.
      const source=Buffer.from(pdf.data,'base64').toString('latin1');
      const pages=[...source.matchAll(/(\d+) 0 obj\s*<<\/Type \/Page\b/g)].map(m=>m[1]);
      pageCount=pages.length;
      const destinations=Object.fromEntries([...source.matchAll(/\/(section-\d+) \[(\d+) 0 R \/XYZ/g)].map(m=>[m[1],pages.indexOf(m[2])+1]));
      if(!pageCount||Object.values(destinations).some(page=>page<1))throw new Error('Invalid PDF page destinations.');
      const signature=JSON.stringify(destinations);
      if(signature===previousDestinations)break;
      if(pass===3)throw new Error('Manual contents pagination did not stabilize.');
      previousDestinations=signature;
      await send('Runtime.evaluate',{expression:`(() => { const pages=${signature}; for(const link of document.querySelectorAll('.contents a')) { let label=link.querySelector('.toc-page'); if(!label) { link.style.cssText='display:flex;justify-content:space-between;gap:8px'; label=document.createElement('span');label.className='toc-page';label.style.cssText='min-width:24px;text-align:right;font-variant-numeric:tabular-nums';link.append(label); } label.textContent=pages[link.hash.slice(1)]||''; } return true; })()`,returnByValue:true},sessionId);
    }
    const filename=path.join(output,'Roku-Game-Engine-User-Manual.pdf');
    fs.writeFileSync(filename,Buffer.from(pdf.data,'base64'));
    const html=await send('Runtime.evaluate',{expression:'document.documentElement.outerHTML',returnByValue:true},sessionId);
    fs.writeFileSync(path.join(output,'Roku-Game-Engine-User-Manual.html'),'<!doctype html>'+html.result.value);
    const coverage=JSON.parse(fs.readFileSync(path.join(output,'coverage.json'),'utf8'));
    fs.writeFileSync(path.join(output,'coverage.json'),JSON.stringify({...coverage,pdfPages:pageCount},null,2)+'\n');
    // Produce a visual review image from the actual HTML used to print.
    await send('Emulation.setDeviceMetricsOverride',{width:1000,height:1250,deviceScaleFactor:1,mobile:false},sessionId);
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
    fs.writeFileSync(path.join(root,'.visual-editor/manual-preview.png'),Buffer.from(shot.data,'base64'));
    console.log('PDF written:',filename,fs.statSync(filename).size,'bytes');
    await send('Browser.close').catch(()=>{});
  } finally {
    for(const entry of waiting.values())clearTimeout(entry.timer);
    socket?.close();child.kill();
  }
}
buildHtml();
if(!process.argv.includes('--html-only'))printPdf().catch(error=>{console.error(error);process.exitCode=1});

