'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const table = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) { let crc = 0xffffffff; for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
const excluded = new Set(['tests', 'test', 'tools', 'node_modules', 'build', 'dist', 'html5', '__MACOSX']);
function packageFiles(root, dir = root) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...packageFiles(root, full));
    else if (!/\.(zip|bpk|md|ps1|py|cmd|bat|cjs|js|map)$/i.test(entry.name) && !['package.json', 'package-lock.json', 'bsconfig.json', 'visual-editor-changes.json'].includes(entry.name)) result.push(path.relative(root, full).replaceAll('\\', '/'));
  }
  return result.sort();
}
function packageRoku(root, output) {
  if (!fs.existsSync(path.join(root, 'manifest'))) throw new Error('This Roku project needs a manifest before it can run in the simulator.');
  const files = packageFiles(root);
  if (!files.some(file => /^source\/.*\.brs$/i.test(file))) throw new Error('No native BrightScript source found.');
  if (files.length > 65535) throw new Error('Too many files for a standard Roku ZIP.');
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file, 'utf8'), data = fs.readFileSync(path.join(root, file));
    const compressed = deflateRawSync(data), crc = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, name, compressed); central.push(directory, name); offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(output, Buffer.concat([...local, directory, end]));
  return { files: files.length, bytes: fs.statSync(output).size };
}
module.exports = { packageRoku, packageFiles, crc32 };
