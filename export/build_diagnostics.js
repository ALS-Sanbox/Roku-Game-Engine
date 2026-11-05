'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { inside } = require('../visual-editor/project');
const { getSchema } = require('./project_snapshot');
class BuildError extends Error {
  constructor(diagnostics) { super(diagnostics.filter(d => d.severity === 'error').map(formatDiagnostic).join('\n')); this.diagnostics = diagnostics; }
}
function formatDiagnostic(d) { return [d.scene, d.node, d.property, d.path && `${d.path}${d.line ? ':' + d.line : ''}`].filter(Boolean).join(' / ') + ': ' + d.message; }
function packagePath(root, reference) {
  const relative = String(reference).replace(/^(res:\/\/|pkg:\/)/, '').split('#')[0].replaceAll('\\', '/');
  const target = path.resolve(root, relative);
  if (!relative || relative.startsWith('/') || relative.includes(':') || !inside(root, target)) throw new Error('Asset/script path must stay inside the project.');
  if (fs.existsSync(target) && !inside(fs.realpathSync(root), fs.realpathSync(target))) throw new Error('Asset/script resolves outside the project.');
  return { relative, target };
}
function validateSnapshot(root, scenes, startupScene, settings = {}) {
  const diagnostics = [], names = new Set();
  const add = (severity, code, message, context = {}) => diagnostics.push({ severity, code, message, ...context });
  for (const record of scenes) {
    const doc = record.runtimeScene, name = doc?.scene?.name, ctx = { scene: name, path: record.filePath };
    if (!name || /[\\/<>:"|?*\x00-\x1f]/.test(name) || ['.', '..'].includes(name)) add('error', 'SCENE_NAME', 'Invalid scene/package filename.', ctx);
    if (names.has(String(name).toLowerCase())) add('error', 'SCENE_CONFLICT', 'Scene names conflict (case-insensitive).', ctx);
    names.add(String(name).toLowerCase());
    if (!Array.isArray(doc?.nodes)) { add('error', 'SCENE_NODES', 'Scene nodes must be an array.', ctx); continue; }
    const ids = new Set(), nodeNames = new Set();
    for (const n of doc.nodes) {
      if (!n || typeof n !== 'object') { add('error', 'NODE_RECORD', 'Invalid node record.', ctx); continue; }
      if (!n.id || ids.has(n.id)) add('error', 'NODE_ID', 'Missing or duplicate node identifier.', { ...ctx, node: n.name, property: 'id' });
      ids.add(n.id); nodeNames.add(n.name?.toLowerCase());
    }
    if (!ids.has(doc.scene.rootNodeId)) add('error', 'ROOT_REFERENCE', 'Root node does not exist.', ctx);
    for (const n of doc.nodes) {
      if (!n || typeof n !== 'object') continue;
      const location = { ...ctx, node: n.name, nodeId: n.id };
      if (!getSchema().NodeRegistry[n.type]) add('error', 'NODE_TYPE', 'Unknown node type would be discarded during normalization: ' + n.type, location);
      for (const child of n.children || []) if (!ids.has(child)) add('error', 'CHILD_REFERENCE', 'Child node does not exist: ' + child, { ...location, property: 'children' });
      for (const component of n.components || []) if (!getSchema().ComponentRegistry[component.type]) add('error', 'COMPONENT_TYPE', 'Unknown component type would be discarded: ' + component.type, { ...location, property: 'components' });
      if (n.parentId && !ids.has(n.parentId)) add('error', 'PARENT_REFERENCE', 'Parent does not exist.', { ...location, property: 'parentId' });
      let parent = n, visited = new Set();
      while (parent?.parentId) { if (visited.has(parent.id)) { add('error', 'PARENT_CYCLE', 'Parent hierarchy contains a cycle.', location); break; } visited.add(parent.id); parent = doc.nodes.find(p => p.id === parent.parentId); }
      const p = n.properties || {};
      if (p.followTargetName && !nodeNames.has(p.followTargetName.toLowerCase())) add('error', 'TARGET_REFERENCE', 'Camera follow target does not exist.', { ...location, property: 'followTargetName' });
      for (const key of ['focusUp', 'focusDown', 'focusLeft', 'focusRight']) if (p[key] && !ids.has(p[key]) && !nodeNames.has(String(p[key]).toLowerCase())) add('error', 'TARGET_REFERENCE', 'Focus target does not exist.', { ...location, property: key });
      for (const [key, value] of Object.entries(p)) if (typeof value === 'string' && /^(?:transition_scene:|scene:|push:)/i.test(value)) {
        const target = value.slice(value.indexOf(':') + 1);
        if (!scenes.some(s => s.runtimeScene.scene?.name === target)) add('error', 'SCENE_REFERENCE', 'Target scene does not exist (names are case-sensitive): ' + target, { ...location, property: key });
      }
      for (const key of ['action', 'actionBack']) if (/^(?:screen:|pushscreen:|transition_screen:)/i.test(p[key] || '')) {
        const target = p[key].slice(p[key].indexOf(':') + 1);
        const screens = [...(record.editorState?.uiScreens || []).map(s => s.name), ...doc.nodes.filter(n => n?.type === 'CanvasLayer').map(n => n.properties?.uiScreenName || n.name)];
        if (!screens.includes(target)) add('error', 'SCREEN_REFERENCE', 'Target UI screen does not exist: ' + target, { ...location, property: key });
      }
      function references(value, property) {
        if (typeof value === 'string' && /^(?:res:\/\/|pkg:\/)/.test(value)) {
          try { const file = packagePath(root, value); if (!fs.existsSync(file.target)) add('error', 'MISSING_FILE', 'Referenced asset or script does not exist.', { ...location, property, path: value }); }
          catch (e) { add('error', 'PACKAGE_PATH', e.message, { ...location, property, path: value }); }
        } else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) references(child, property + '.' + key);
      }
      references(p, 'properties'); references(n.components, 'components');
      if (Number(n.transform?.rotation || 0) && !['Sprite2D','AnimatedSprite2D','TileMap'].includes(n.type)) add('warning','NATIVE_ROTATION','This node renders with axis-aligned bounds; artwork rotation is implemented for sprites and tilemaps.',{...location,property:'transform.rotation'});
      if (Number(n.transform?.rotation || 0) && (n.components||[]).some(c=>c.type==='Collider2DComponent')) add('warning','NATIVE_COLLIDER_AABB','Rotated colliders use enclosing AABBs, not oriented polygons.',location);
      for(const component of n.components||[])if(component.type==='Collider2DComponent'&&(component.physicsShapes?.length>1||component.physicsShapes?.some(s=>s.type==='polygon')))add('warning','NATIVE_COLLIDER_SHAPES','Compound/polygon physics shapes use their combined enclosing AABB in the native solver.',location);
    }
    function resources(value, property) {
      if (typeof value === 'string' && /^(res:\/\/|pkg:\/)/.test(value)) { try { const f = packagePath(root, value); if (!fs.existsSync(f.target)) add('error', 'MISSING_FILE', 'Resource asset does not exist.', { ...ctx, property, path: value }); } catch (e) { add('error', 'PACKAGE_PATH', e.message, { ...ctx, property, path: value }); } }
      else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) resources(child, property + '.' + key);
    }
    resources(record.editorState, 'resources');
  }
  if (!scenes.some(s => s.runtimeScene.scene?.name === startupScene)) add('error', 'STARTUP_SCENE', 'Startup scene does not exist: ' + startupScene, { property: 'startupScene' });
  if (settings.screen && (settings.screen.width !== 1280 || settings.screen.height !== 720)) add('warning', 'DISPLAY_SIZE', 'Native display uses 720p; custom display sizes need device verification.', { property: 'screen' });
  return diagnostics;
}
module.exports = { BuildError, formatDiagnostic, packagePath, validateSnapshot };
