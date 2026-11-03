'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let schema;
function getSchema() {
  if (!schema) {
    const context = { window: {}, crypto: require('node:crypto').webcrypto, console };
    vm.createContext(context);
    for (const file of ['schema/resources.js', 'schema/nodes.js']) vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), context, { filename: file });
    schema = context.window.RokuNodes;
  }
  return schema;
}
function sceneFiles(root, current = root) {
  const result = [];
  if (!fs.existsSync(current)) return result;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.') || ['build', 'dist', 'node_modules', 'source', 'tools'].includes(entry.name)) continue;
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...sceneFiles(root, file));
    else if (/\.rkscene$/i.test(entry.name) && !/\.autosave\.rkscene$/i.test(entry.name)) result.push(file);
  }
  return result.sort();
}
function gatherProjectScenes(root, edits = []) {
  const records = sceneFiles(root).map(file => {
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sidecar = file + '.editstate';
    return { filePath: file, runtimeScene: document.runtimeScene || document.runtime || document, editorState: fs.existsSync(sidecar) && fs.statSync(sidecar).size ? JSON.parse(fs.readFileSync(sidecar, 'utf8')) : document.editorState || {} };
  });
  for (const edit of edits) {
    const file = edit.filePath || edit.scenePath || edit.document?.currentScenePath;
    const match = records.findIndex(r => file ? path.resolve(r.filePath) === path.resolve(file) : r.runtimeScene.scene?.name === edit.runtimeScene?.scene?.name);
    if (match >= 0) records[match] = { ...edit, filePath: file || records[match].filePath };
    else records.push(edit);
  }
  return records;
}
module.exports = { getSchema, gatherProjectScenes, sceneFiles };
