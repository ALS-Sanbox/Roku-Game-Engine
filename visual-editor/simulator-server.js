'use strict';
// Serve a downloaded brs-engine web app without changing its files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { inside } = require('./project');
const downloads = path.join(os.homedir(), 'Downloads');
function findDefault() {
  if (!fs.existsSync(downloads)) return undefined;
  return fs.readdirSync(downloads).filter(name => /^brs-engine.*web-app$/i.test(name))
    .map(name => path.join(downloads, name))
    .filter(root => fs.existsSync(path.join(root, 'index.html')))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
const built = path.resolve(__dirname, '../tools/brs-engine/packages/browser');
const input = process.argv[2] || (fs.existsSync(path.join(built, 'lib/brs.api.js')) ? built : findDefault());
if (!input) { console.error('Usage: npm.cmd run simulator -- "C:\\path\\to\\simulator-folder"'); process.exit(1); }
const root = fs.realpathSync(path.resolve(input));
if (!fs.existsSync(path.join(root, 'index.html'))) { console.error('Choose the simulator folder containing index.html.'); process.exit(1); }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.zip': 'application/zip', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!inside(root, target)) { res.writeHead(403); res.end(); return; }
    const real = fs.realpathSync(target);
    if (!inside(root, real) || !fs.statSync(real).isFile()) { res.writeHead(403); res.end(); return; }
    res.setHeader('Content-Type', mime[path.extname(real).toLowerCase()] || 'application/octet-stream');
    res.writeHead(200);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(real).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.RGE_SIMULATOR_PORT || 4174), '127.0.0.1', () => console.log(`BrightScript Simulator: http://127.0.0.1:${server.address().port}\nServing: ${root}\nKeep this terminal running. Open the URL in Chrome, then load your game ZIP.`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
