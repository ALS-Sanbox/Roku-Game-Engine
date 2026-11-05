'use strict';

function validateGameplayNode(doc, node, report) {
  const p = node.properties || {};
  const resolve = ref => doc.nodes.find(n => n.id === ref || n.name?.toLowerCase() === String(ref).toLowerCase());
  const error = (key, message) => report('GAMEPLAY_SETTINGS', message, 'properties.' + key);
  const number = (key, min, integer = false) => {
    if (p[key] == null) return;
    if (!Number.isFinite(Number(p[key])) || Number(p[key]) < min || (integer && !Number.isInteger(Number(p[key])))) error(key, `${key} must be ${integer ? 'an integer' : 'a finite number'} >= ${min}.`);
  };
  const reference = (key, fallback, required = true, type) => {
    const ref = p[key] || fallback;
    if (!ref && !required) return null;
    const target = resolve(ref);
    if (!target || (type && target.type !== type)) {
      error(key, `Choose ${type || 'an existing node'} by ID or name for ${key}.`);
      return null;
    }
    return target;
  };
  const contains = (ancestor, descendant) => {
    const seen = new Set();
    for (let current = descendant; current && !seen.has(current.id); current = resolve(current.parentId)) {
      if (current.id === ancestor.id) return true;
      seen.add(current.id);
    }
    return false;
  };
  if (node.type === 'Timer') number('waitTime', 0.001);
  if (['TriggerZone2D','VisibilityEnabler2D','Parallax2D','FocusGroup'].includes(node.type)) {
    number('width', 1); number('height', 1);
  }
  if (node.type === 'Marker2D') number('gizmoSize', 1);
  if (node.type === 'Path2D' && p.points != null) {
    if (!Array.isArray(p.points) || !p.points.length || p.points.some(point => !point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y)))) error('points', 'Path points must be a nonempty array of {x, y} coordinates.');
  }
  if (node.type === 'PathFollow2D') {
    const path = reference('path', node.parentId, true, 'Path2D');
    if (path && contains(node, path)) error('path', 'A follower cannot follow a path inside its own subtree.');
    for (const key of ['speed','progress']) if (p[key] != null && !Number.isFinite(Number(p[key]))) error(key, `${key} must be a finite number.`);
  }
  if (node.type === 'VisibilityEnabler2D') {
    number('margin', 0);
    const target = reference('target', node.parentId);
    if (target?.type === 'SceneRoot') error('target', 'Choose a gameplay node to suspend, rather than the scene root.');
  }
  if (node.type === 'Parallax2D') {
    number('repeatWidth', 0); number('repeatHeight', 0);
    for (const key of ['scrollScaleX','scrollScaleY','autoscrollX','autoscrollY']) if (p[key] != null && !Number.isFinite(Number(p[key]))) error(key, `${key} must be a finite number.`);
  }
  if (node.type === 'Spawner2D') {
    number('interval', 0.01); number('maxActive', 0, true); number('spawnCount', 1, true);
    if (!p.poolName) {
      const template = reference('template');
      if (template && contains(template, node)) error('template', 'The spawn template cannot contain the spawner itself.');
    } else {
      const pools = doc.nodes.flatMap(n => (n.components || []).filter(c => c.type === 'ObjectPoolComponent' && c.enabled !== false).flatMap(c => {
        try { const defs = JSON.parse(c.pools || '[]'); return Array.isArray(defs) ? defs : []; } catch { return []; }
      }));
      if (!pools.some(pool => pool?.name === p.poolName)) error('poolName', 'Choose a pool defined by an enabled ObjectPoolComponent in this scene.');
    }
    if (p.spawnPoints != null && !Array.isArray(p.spawnPoints)) error('spawnPoints', 'Spawn points must be an array of node IDs or names.');
    for (const ref of Array.isArray(p.spawnPoints) ? p.spawnPoints : []) if (!resolve(ref)) error('spawnPoints', 'Spawn marker does not exist: ' + ref);
  }
  if (node.type === 'FocusGroup' && p.initialFocus) {
    const target = reference('initialFocus');
    if (target && (target.id === node.id || !contains(node, target))) error('initialFocus', 'Initial focus must be a control inside this focus group.');
  }
}

module.exports = { validateGameplayNode };
