'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspect, inside, replacements, apply, hash } = require('./project');
const { packageRoku } = require('./roku-package');
const workspace = path.resolve(__dirname, '..');
const storage = path.join(workspace, '.visual-editor');
const token = crypto.randomBytes(24).toString('hex');
const projects = new Map();
const builds = new Map();
const simulatorRoot = path.join(workspace, 'tools/brs-engine/packages/browser');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function remember(root) {
  const project = inspect(root); projects.set(project.id, project);
  const saved = path.join(storage, project.id + '.json');
  let edits = {}, stale = false;
  if (fs.existsSync(saved)) {
    const session = JSON.parse(fs.readFileSync(saved, 'utf8'));
    stale = JSON.stringify(session.files) !== JSON.stringify(project.files);
    if (!stale) edits = session.edits;
  }
  return { ...project, edits, stale };
}
function discover() {
  const roots = [path.dirname(workspace)];
  const candidates = [];
  for (const root of roots) for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const candidate = path.join(root, entry.name);
    if (fs.existsSync(path.join(candidate, 'roku', 'source'))) candidates.push(candidate);
  }
  return candidates.map(root => { const p = remember(root); return { id: p.id, name: p.name, root: p.root }; });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2e6) { reject(new Error('Request too large.')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON.')); } });
    req.on('error', reject);
  });
}
function verified(project) {
  const fresh = inspect(project.root);
  if (JSON.stringify(fresh.files) !== JSON.stringify(project.files)) throw new Error('Source files changed. Reopen the project before editing or exporting. Saved edits have been kept.');
  return fresh;
}
const server = http.createServer(async (req, res) => {
  try {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    const url = new URL(req.url, 'http://localhost');
    if (req.headers.host !== `127.0.0.1:${server.address().port}` && req.headers.host !== `localhost:${server.address().port}`) return send(res, 403, { error: 'Invalid host.' });
    if (url.pathname.startsWith('/api/') || url.pathname === '/asset') {
      if ((req.headers['x-editor-token'] || url.searchParams.get('token')) !== token) return send(res, 403, { error: 'Invalid session.' });
      if (url.pathname === '/api/package' && req.method === 'GET') {
        const zip = builds.get(url.searchParams.get('build'));
        if (!zip) return send(res, 404, { error: 'Build not found. Build the game again.' });
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="game.zip"' });
        fs.createReadStream(zip).pipe(res); return;
      }
      if (url.pathname === '/api/projects' && req.method === 'GET') return send(res, 200, discover());
      if (url.pathname === '/api/open' && req.method === 'POST') { const body = await readBody(req); return send(res, 200, remember(body.root)); }
      const project = projects.get(url.searchParams.get('id'));
      if (!project) return send(res, 404, { error: 'Open a project first.' });
      if (url.pathname === '/api/project' && req.method === 'GET') return send(res, 200, remember(project.root));
      if (url.pathname === '/asset' && req.method === 'GET') {
        const relative = url.searchParams.get('file');
        if (!project.assets.includes(relative)) throw new Error('Unknown asset.');
        const file = fs.realpathSync(path.join(project.root, relative));
        if (!inside(project.root, file)) throw new Error('Asset is outside project.');
        res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res); return;
      }
      if (req.method === 'POST' && ['/api/save', '/api/export', '/api/build'].includes(url.pathname)) {
        if (url.pathname === '/api/build' && !['lib/brs.api.js', 'lib/brs.worker.js', 'assets/common.zip'].every(file => fs.existsSync(path.join(simulatorRoot, file)))) throw new Error('Run npm.cmd run simulator:setup to build the simulator first.');
        const body = await readBody(req); verified(project);
        const changes = replacements(project, body.edits);
        fs.mkdirSync(storage, { recursive: true });
        const sessionPath = path.join(storage, project.id + '.json');
        if (fs.existsSync(sessionPath)) {
          const previous = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
          if (JSON.stringify(previous.files) !== JSON.stringify(project.files)) fs.copyFileSync(sessionPath, sessionPath + '.stale-' + Date.now());
        }
        fs.writeFileSync(sessionPath + '.tmp', JSON.stringify({ version: 1, root: project.root, files: project.files, edits: body.edits }, null, 2));
        fs.renameSync(sessionPath + '.tmp', sessionPath);
        if (url.pathname === '/api/save') return send(res, 200, { message: 'Saved visual edits.' });
        const output = path.join(storage, 'exports', `${project.name.replace(/[^a-z0-9_-]/gi, '_')}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
        if (inside(project.root, output)) throw new Error('Export destination must be outside the source project.');
        fs.cpSync(project.root, output, { recursive: true, filter: file => {
          if (fs.lstatSync(file).isSymbolicLink()) return false;
          return !path.relative(project.root, file).split(path.sep).some(p => ['.git', 'node_modules', 'build', '.visual-editor'].includes(p));
        } });
        for (const [file, patches] of Object.entries(changes)) {
          const original = fs.readFileSync(path.join(project.root, file), 'utf8');
          if (hash(original) !== project.files[file]) throw new Error('Source changed during export. Reopen and export again.');
          fs.writeFileSync(path.join(output, file), apply(original, patches));
        }
        fs.writeFileSync(path.join(output, 'visual-editor-changes.json'), JSON.stringify({ version: 1, original: project.root, edits: body.edits }, null, 2));
        if (url.pathname === '/api/build') {
          const zipPath = path.join(output, 'game.zip');
          const summary = packageRoku(output, zipPath);
          const build = crypto.randomBytes(16).toString('hex'); builds.set(build, zipPath);
          return send(res, 200, { message: 'Built native Roku ZIP', output: zipPath, preview: `/simulator/?build=${build}&name=${encodeURIComponent(project.name + '.zip')}`, ...summary });
        }
        return send(res, 200, { message: 'Exported edited Roku project', output });
      }
      return send(res, 404, { error: 'Unknown operation.' });
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'GET required.' });
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (url.pathname.startsWith('/simulator/') && url.pathname !== '/simulator/') {
      const file = fs.realpathSync(path.resolve(simulatorRoot, '.' + decodeURIComponent(url.pathname.slice('/simulator'.length))));
      if (!inside(simulatorRoot, file) || !fs.statSync(file).isFile()) throw new Error('Invalid simulator file.');
      const extension = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': extension === '.zip' ? 'application/zip' : (mime[extension] || 'application/octet-stream'), 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res); return;
    }
    if (url.pathname === '/assets/common.zip') {
      res.writeHead(200, { 'Content-Type': 'application/zip' });
      fs.createReadStream(path.join(simulatorRoot, 'assets/common.zip')).on('error', () => res.destroy()).pipe(res); return;
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname === '/simulator/' ? 'simulator.html' : url.pathname.slice(1);
    if (!['index.html', 'app.js', 'style.css', 'simulator.html', 'simulator-app.js', 'simulator.css'].includes(name)) return send(res, 404, { error: 'Not found.' });
    let data = fs.readFileSync(path.join(__dirname, name), 'utf8');
    if (name.endsWith('.html')) data = data.replace('__TOKEN__', token);
    const policy = name === 'simulator.html'
      ? "default-src 'self'; img-src 'self' blob: data:; font-src 'self' blob: data:; media-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; frame-ancestors 'none'"
      : "default-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'";
    res.writeHead(200, { 'Content-Type': mime[path.extname(name)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': policy });
    res.end(data);
  } catch (error) { if (!res.headersSent) send(res, 400, { error: error.message }); else res.end(); }
});
process.on('message', message => {
  if (message.type !== 'register-package') return;
  try {
    const file = fs.realpathSync(message.zipPath);
    if (!inside(storage, file) || path.extname(file) !== '.zip') throw new Error('Simulator packages must be built inside the engine workspace.');
    const build = crypto.randomBytes(16).toString('hex'); builds.set(build, file);
    process.send?.({ requestId: message.requestId, build });
  } catch (error) { process.send?.({ requestId: message.requestId, error: error.message }); }
});
server.listen(Number(process.env.RGE_EDITOR_PORT || 4173), '127.0.0.1', () => {
  console.log(`Roku simulator host: http://127.0.0.1:${server.address().port}`);
  process.send?.({ type: 'ready', port: server.address().port });
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
