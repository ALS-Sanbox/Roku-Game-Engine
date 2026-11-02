'use strict';
const $ = id => document.getElementById(id);
const token = document.querySelector('meta[name=editor-token]').content;
const canvas = $('canvas'), ctx = canvas.getContext('2d');
let project, edits = {}, selected, dirty = false, history = [], future = [], drag, reference;
const status = message => { $('status').textContent = message; };
async function api(route, body) {
  const response = await fetch(route, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-editor-token': token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
function endpoint(route) { return `/api/${route}?id=${project.id}`; }
function assetUrl(file) { return `/asset?id=${project.id}&file=${encodeURIComponent(file)}&token=${token}`; }
function checkpoint() { history.push(JSON.stringify(edits)); if (history.length > 100) history.shift(); future = []; }
function values(element) { return { ...element.values, ...edits[element.id] }; }
function elements() {
  if (!project) return [];
  const search = $('search').value.toLowerCase();
  return project.elements.filter(e => `${e.file} / ${e.section}` === $('section').value && (!search || (e.sample + e.expression).toLowerCase().includes(search)));
}
function changed() { dirty = true; $('undo').disabled = !history.length; $('redo').disabled = !future.length; render(); }
function render() {
  ctx.clearRect(0, 0, 1280, 720); ctx.fillStyle = '#07101f'; ctx.fillRect(0, 0, 1280, 720);
  if (reference) { ctx.globalAlpha = .55; ctx.drawImage(reference, 0, 0, 1280, 720); ctx.globalAlpha = 1; }
  if ($('grid').checked) { ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = 0; x <= 1280; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, 720); } for (let y = 0; y <= 720; y += 40) { ctx.moveTo(0, y); ctx.lineTo(1280, y); } ctx.stroke(); }
  for (const e of elements()) {
    const v = values(e); if (!e.positioned) continue;
    ctx.fillStyle = v.color || '#dce4efff';
    if (e.kind === 'drawrect') ctx.fillRect(v.x, v.y, v.width || 80, v.height || 40);
    else if (e.kind === 'drawtext') { ctx.font = '22px sans-serif'; ctx.textBaseline = 'top'; ctx.fillText(v.text ?? e.sample, v.x, v.y); }
    else { ctx.strokeStyle = '#7789a4'; ctx.strokeRect(v.x, v.y, 64 * (v.scaleX || 1), 64 * (v.scaleY || 1)); ctx.font = '12px sans-serif'; ctx.fillText('sprite', v.x + 4, v.y + 4); }
    if (e.id === selected) { const b = bounds(e); ctx.strokeStyle = '#6fffd2'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6); }
  }
  $('layers').replaceChildren();
  for (const e of elements()) {
    const button = document.createElement('button'); button.className = 'layer' + (e.id === selected ? ' active' : '');
    button.textContent = values(e).text ?? e.sample;
    const hint = document.createElement('small'); hint.textContent = `Line ${e.line} · ${e.positioned ? 'position editable' : 'calculated position'}`; button.append(hint);
    button.onclick = () => { selected = e.id; render(); properties(); }; $('layers').append(button);
  }
}
function bounds(e) {
  const v = values(e); ctx.font = '22px sans-serif';
  return { x: v.x, y: v.y, w: e.kind === 'drawtext' ? Math.max(24, ctx.measureText(v.text ?? e.sample).width) : (v.width || 64 * (v.scaleX || 1)), h: e.kind === 'drawtext' ? 28 : (v.height || 64 * (v.scaleY || 1)) };
}
function properties() {
  const panel = $('properties'); panel.replaceChildren();
  const e = project?.elements.find(e => e.id === selected); if (!e) { panel.textContent = 'Select a drawing to edit its properties.'; return; }
  const location = document.createElement('p'); location.textContent = `${e.file}:${e.line}`; panel.append(location);
  for (const [key, value] of Object.entries(values(e))) {
    const label = document.createElement('label'); label.textContent = key;
    const input = document.createElement('input'); input.value = value; input.type = typeof value === 'number' ? 'number' : 'text'; if (input.type === 'number') input.step = 'any';
    input.onchange = () => {
      const next = input.type === 'number' ? Number(input.value) : input.value;
      if ((input.type === 'number' && (!Number.isFinite(next) || Math.abs(next) > 100000 || (['width', 'height', 'scaleX', 'scaleY'].includes(key) && next <= 0))) || (key === 'color' && !/^#[0-9a-f]{8}$/i.test(next))) { status('Enter a valid value. Colors use #RRGGBBAA.'); input.value = values(e)[key]; return; }
      checkpoint(); (edits[e.id] ||= {})[key] = next; changed();
    };
    label.append(input); panel.append(label);
  }
  const source = document.createElement('pre'); source.className = 'source'; source.textContent = e.expression; panel.append(source);
  const reset = document.createElement('button'); reset.textContent = 'Reset this drawing'; reset.onclick = () => { checkpoint(); delete edits[e.id]; changed(); properties(); }; panel.append(reset);
}
function discardAllowed() { return !dirty || confirm('Discard unsaved visual edits?'); }
function load(p) {
  project = p; edits = p.edits || {}; selected = undefined; history = []; future = []; dirty = false; reference = undefined;
  $('title').textContent = `${p.name} · 1280 × 720`; $('save').disabled = $('export').disabled = $('build').disabled = false; $('undo').disabled = $('redo').disabled = true;
  $('section').replaceChildren();
  for (const section of [...new Set(p.elements.map(e => `${e.file} / ${e.section}`))]) { const option = document.createElement('option'); option.value = option.textContent = section; $('section').append(option); }
  const useful = p.elements.find(e => e.positioned && /^(MOLDraw|DrawGame)$/i.test(e.section)); if (useful) $('section').value = `${useful.file} / ${useful.section}`;
  $('reference').replaceChildren(new Option('None', '')); $('assets').replaceChildren();
  const heading = document.createElement('h2'); heading.textContent = `Artwork · ${p.assets.length} images`; $('assets').append(heading);
  for (const file of p.assets) {
    $('reference').append(new Option(file, file));
    const button = document.createElement('button'); button.className = 'asset'; button.title = 'Use as preview reference';
    const img = document.createElement('img'); img.loading = 'lazy'; img.src = assetUrl(file); img.alt = ''; button.append(img, document.createTextNode(file));
    button.onclick = () => { $('reference').value = file; setReference(); }; $('assets').append(button);
  }
  $('search').value = ''; render(); properties();
  status(p.stale ? 'Source has changed since the saved session. Old edits were not applied and will be archived when you save.' : `Opened ${p.root} · ${p.elements.length} supported drawings. Originals stay intact.`);
}
function setReference() { const file = $('reference').value; reference = undefined; render(); if (file) { const img = new Image(); img.onload = () => { if ($('reference').value === file) { reference = img; render(); } }; img.src = assetUrl(file); } }
$('reference').onchange = setReference;
$('section').onchange = () => { selected = undefined; render(); properties(); };
$('search').oninput = render; $('grid').onchange = render;
$('projects').onchange = async () => { try { if ($('projects').value && discardAllowed()) load(await api(`/api/project?id=${$('projects').value}`)); } catch (e) { status(e.message); } };
$('open').onclick = () => { $('open-dialog').showModal(); $('root').focus(); };
$('cancel-open').onclick = () => $('open-dialog').close();
$('open-form').onsubmit = async event => { event.preventDefault(); if (!discardAllowed()) return; try { load(await api('/api/open', { root: $('root').value })); $('open-dialog').close(); } catch (e) { status(e.message); } };
async function saveOrExport(route) {
  const preview = route === 'build' ? window.open('about:blank', 'roku-game-preview') : undefined;
  $('save').disabled = $('export').disabled = $('build').disabled = true;
  try { const result = await api(endpoint(route), { edits }); dirty = false; status(result.message + (result.output ? ': ' + result.output : '')); if (result.preview) { if (preview) preview.location.href = result.preview; else location.href = result.preview; } }
  catch (e) { if (preview) preview.close(); status(e.message); }
  finally { $('save').disabled = $('export').disabled = $('build').disabled = false; }
}
$('save').onclick = () => saveOrExport('save'); $('export').onclick = () => saveOrExport('export');
$('build').onclick = () => saveOrExport('build');
$('undo').onclick = () => { if (history.length) { future.push(JSON.stringify(edits)); edits = JSON.parse(history.pop()); changed(); properties(); } };
$('redo').onclick = () => { if (future.length) { history.push(JSON.stringify(edits)); edits = JSON.parse(future.pop()); changed(); properties(); } };
function point(event) { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * 1280 / r.width, y: (event.clientY - r.top) * 720 / r.height }; }
canvas.onpointerdown = event => {
  if (!project) return; const p = point(event);
  const hit = [...elements()].reverse().find(e => { if (!e.positioned) return false; const b = bounds(e); return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; });
  if (!hit) return; selected = hit.id; const v = values(hit); drag = { id: hit.id, x: p.x, y: p.y, originalX: v.x, originalY: v.y, started: false }; canvas.setPointerCapture(event.pointerId); render(); properties();
};
canvas.onpointermove = event => {
  if (!drag) return; const p = point(event); if (!drag.started && Math.hypot(p.x - drag.x, p.y - drag.y) < 2) return;
  if (!drag.started) { checkpoint(); drag.started = true; }
  const snap = Math.max(1, Math.min(100, Number($('snap').value) || 1));
  edits[drag.id] = { ...edits[drag.id], x: Math.round((drag.originalX + p.x - drag.x) / snap) * snap, y: Math.round((drag.originalY + p.y - drag.y) / snap) * snap }; changed();
};
canvas.onpointerup = canvas.onpointercancel = () => { drag = undefined; properties(); };
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
api('/api/projects').then(projects => { for (const p of projects) $('projects').append(new Option(p.name, p.id)); status(`Found ${projects.length} Roku projects. Choose a project or open another folder.`); }).catch(e => status(e.message));
render();
