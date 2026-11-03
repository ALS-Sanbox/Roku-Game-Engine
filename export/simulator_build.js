'use strict';
function runtimeWarnings(scenes) {
  const warnings = [];
  for (const entry of scenes) for (const node of entry.runtimeScene?.nodes || []) {
    const p = node.properties || {}, name = node.name || node.id;
    if (['CameraPath2D', 'CameraZone2D', 'CameraTargetGroup'].includes(node.type)) warnings.push(`${name}: ${node.type} has editor tooling but no native runtime implementation yet.`);
    if (p.clipContent) warnings.push(`${name}: UI clipping is not implemented by the native renderer yet.`);
    if (Number(node.transform?.rotation || 0) !== 0) warnings.push(`${name}: native drawing does not yet apply authored rotation consistently.`);
  }
  return warnings;
}
const {buildNativeProject: buildSimulatorProject, validateBrightScript}=require('./native_build');
module.exports={buildSimulatorProject,validateBrightScript,runtimeWarnings};
