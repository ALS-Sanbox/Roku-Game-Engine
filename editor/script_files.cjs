const fs = require('fs');
const path = require('path');

function resolveScript(root, resource) {
  root = fs.realpathSync(root);
  const relative = String(resource || '').replace(/^res:\/\//, '').replace(/\\/g, '/');
  if (!/^(components|source)\/.+\.brs$/i.test(relative) || relative.split('/').some(p => !p || p === '.' || p === '..') || /^source\/(engine\/|main\.brs$)/i.test(relative)) {
    throw new Error('Choose a .brs script inside components/ or source/ (excluding generated engine files).');
  }
  const target = path.resolve(root, relative);
  const inside = p => { const rel = path.relative(root, p); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
  if (!inside(target)) throw new Error('Script is outside the project.');
  let ancestor = target;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!inside(fs.realpathSync(ancestor)) && fs.realpathSync(ancestor) !== root) throw new Error('Script links outside the project.');
  const canonical = path.join(fs.realpathSync(ancestor), path.relative(ancestor, target));
  const canonicalRelative = path.relative(root, canonical).replace(/\\/g, '/');
  if (!/^(components|source)\//i.test(canonicalRelative) || /^source\/(engine\/|main\.brs$)/i.test(canonicalRelative)) throw new Error('Script links to a generated or non-script directory.');
  return target;
}

function scriptFile(root, payload) {
  const target = resolveScript(root, payload.resourcePath);
  const exists = fs.existsSync(target);
  const current = exists ? fs.readFileSync(target, 'utf8') : null;
  if (payload.operation === 'save') {
    if (typeof payload.text !== 'string' || Buffer.byteLength(payload.text) > 4 * 1024 * 1024) throw new Error('Script must be text under 4 MB.');
    if (payload.original !== current) throw new Error('Script changed on disk. Reload it before saving; copy your edits first.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, payload.text, 'utf8');
    return { success: true, text: payload.text };
  }
  if (!exists) throw new Error('Script does not exist.');
  return { success: true, text: current };
}
function listScripts(root) {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    if (fs.lstatSync(dir).isSymbolicLink()) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).replace(/\\/g, '/');
      if (/^source\/engine$/i.test(relative)) continue;
      if (entry.isDirectory()) walk(full);
      else if (/\.brs$/i.test(entry.name) && !/^source\/main\.brs$/i.test(relative)) files.push('res://' + relative);
    }
  }
  walk(path.join(root, 'components')); walk(path.join(root, 'source'));
  return files.sort();
}
module.exports = { resolveScript, scriptFile, listScripts };
