'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Program } = require('brighterscript');
const { buildClassicExportMetadataFiles } = require('./runtime_manifest_builder');
const { writeClassicRuntimeFiles } = require('./classic2d_export');
const { packageRoku } = require('../visual-editor/roku-package');

function runtimeWarnings(scenes) {
  const warnings = [];
  for (const entry of scenes) for (const node of entry.runtimeScene?.nodes || []) {
    const p = node.properties || {}, name = node.name || node.id;
    if (['CameraPath2D', 'CameraZone2D', 'CameraTargetGroup'].includes(node.type)) warnings.push(`${name}: ${node.type} has editor tooling but no native runtime implementation yet.`);
    if (node.type === 'Camera2D' && Number(p.zoom || 1) !== 1) warnings.push(`${name}: camera zoom is not applied by the native renderer yet.`);
    if (p.clipContent) warnings.push(`${name}: UI clipping is not implemented by the native renderer yet.`);
    if (/\.svg$/i.test(p.imagePath || '')) warnings.push(`${name}: use a PNG texture for native Roku rendering; SVG artwork needs conversion.`);
    if (['Control', 'CanvasLayer', 'Panel', 'Label', 'Button', 'TextureRect', 'NineSlicePanel', 'MenuList', 'ProgressBar', 'CheckBox', 'Slider'].includes(node.type) && ['scaleX', 'scaleY'].some(key => node.transform?.[key] !== undefined && Number(node.transform[key]) !== 1)) warnings.push(`${name}: inherited UI scale needs native layout work; use explicit pixel dimensions for now.`);
    if (['anchorLeft', 'anchorTop', 'anchorRight', 'anchorBottom'].some(key => Number(p[key] || 0) !== 0) || (p.anchorPreset && p.anchorPreset !== 'top_left')) warnings.push(`${name}: native UI anchor layout needs implementation; use explicit positions and dimensions for now.`);
    if (Number(node.transform?.rotation || 0) !== 0) warnings.push(`${name}: native drawing does not yet apply authored rotation consistently.`);
    if (Number(node.transform?.pivotX || 0) || Number(node.transform?.pivotY || 0)) warnings.push(`${name}: authored pivots are not applied consistently by native drawing yet.`);
  }
  return warnings;
}
function validateBrightScript(root) {
  const program = new Program({ rootDir: root, createPackage: false, copyToStaging: false });
  try {
    for (const file of fs.readdirSync(path.join(root, 'source'), { recursive: true }).filter(file => file.endsWith('.brs'))) {
      const name = 'source/' + file.replaceAll('\\', '/');
      program.setFile({ src: path.join(root, name), dest: name }, fs.readFileSync(path.join(root, name), 'utf8'));
    }
    program.validate();
    const errors = program.getDiagnostics().filter(d => d.severity === 1);
    if (errors.length) throw new Error('BrightScript validation failed:\n' + errors.slice(0, 15).map(d => `${d.file?.pkgPath}:${(d.range?.start.line || 0) + 1}: ${d.message}`).join('\n'));
  } finally { program.dispose(); }
}
function buildSimulatorProject(payload, options = {}) {
  const projectRoot = path.resolve(payload.projectRoot);
  const scenes = payload.scenes || [];
  if (!scenes.length) throw new Error('Create or open a scene before testing.');
  const output = path.join(options.buildRoot || path.resolve(__dirname, '../.visual-editor/engine-builds'), crypto.randomUUID());
  fs.mkdirSync(path.join(output, 'assets/scenes'), { recursive: true });
  for (const folder of ['assets', 'images', 'audio', 'fonts', 'data']) {
    const source = path.join(projectRoot, folder);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(output, folder), { recursive: true, filter: file => !fs.lstatSync(file).isSymbolicLink() });
  }
  const metadata = buildClassicExportMetadataFiles(scenes, { projectRoot, exportOptions: { bakeTerrain: true } });
  if (!metadata.scenePayloads.length) throw new Error('No exportable scenes.');
  for (const scene of metadata.scenePayloads) {
    if (/[\\/<>:"|?*\x00-\x1f]/.test(scene.sceneName) || ['.', '..'].includes(scene.sceneName)) throw new Error('Scene name contains characters that cannot be used in a Roku asset filename.');
    fs.writeFileSync(path.join(output, 'assets/scenes', scene.sceneName + '.json'), scene.json);
  }
  for (const [file, key] of Object.entries({ spriteframes: 'spriteframesJson', spritesheets: 'spritesheetsJson', tilesets: 'tilesetsJson', audio: 'audioJson', resources: 'resourcesJson', ui_screens: 'uiScreensJson', ui_transition_presets: 'uiTransitionPresetsJson', ui_option_defs: 'uiOptionDefsJson', ui_high_score_table: 'uiHighScoreTableJson', nine_slice_styles: 'nineSliceStylesJson' })) {
    if (metadata[key]) fs.writeFileSync(path.join(output, 'assets', file + '.json'), metadata[key]);
  }
  fs.writeFileSync(path.join(output, 'assets/project_settings.json'), JSON.stringify(payload.settings || {}));
  const title = String(payload.projectTitle || 'RokuEngine Game').replace(/[\r\n]/g, ' ');
  fs.writeFileSync(path.join(output, 'manifest'), `title=${title}\nmajor_version=1\nminor_version=0\nbuild_version=0\nui_resolutions=hd\nsplash_color=#101820\n`);
  writeClassicRuntimeFiles(output, { startupSceneName: metadata.scenePayloads[0].sceneName, projectName: title });
  if (options.copyScripts) options.copyScripts(projectRoot, output);
  validateBrightScript(output);
  const zipPath = path.join(output, 'game.zip');
  const summary = packageRoku(output, zipPath);
  return { success: true, output, zipPath, ...summary, warnings: [...(metadata.warnings || []), ...runtimeWarnings(scenes)] };
}
module.exports = { buildSimulatorProject, validateBrightScript, runtimeWarnings };
