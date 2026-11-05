'use strict';
function runtimeWarnings(scenes) {
  const warnings = [];
  for (const entry of scenes) for (const node of entry.runtimeScene?.nodes || []) {
    const p = node.properties || {}, name = node.name || node.id;
    if (Number(node.transform?.rotation || 0) !== 0 && !['Sprite2D','AnimatedSprite2D','TileMap'].includes(node.type)) warnings.push(`${name}: this node uses axis-aligned bounds instead of authored rotation.`);
  }
  return warnings;
}
const {buildNativeProject: buildSimulatorProject, validateBrightScript}=require('./native_build');
module.exports={buildSimulatorProject,validateBrightScript,runtimeWarnings};
