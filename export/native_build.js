'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Program } = require('brighterscript');
const { gatherProjectScenes, getSchema } = require('./project_snapshot');
const { BuildError, formatDiagnostic, validateSnapshot, packagePath } = require('./build_diagnostics');
const { copyProjectBrightScriptFiles } = require('./user_scripts');
const { buildClassicExportMetadataFiles } = require('./runtime_manifest_builder');
const { writeClassicRuntimeFiles } = require('./classic2d_export');
const { packageRoku } = require('../visual-editor/roku-package');
function validateBrightScript(root) {
  const program = new Program({ rootDir: root, createPackage: false, copyToStaging: false });
  try {
    for (const file of fs.readdirSync(path.join(root, 'source'), { recursive: true }).filter(f => f.endsWith('.brs'))) {
      const name = 'source/' + file.replaceAll('\\', '/'); program.setFile({ src: path.join(root, name), dest: name }, fs.readFileSync(path.join(root, name), 'utf8'));
    }
    program.validate();
    const diagnostics = program.getDiagnostics().map(d => ({ severity: d.severity === 1 ? 'error' : 'warning', code: 'BRS' + d.code, message: d.message, path: d.file?.pkgPath, line: (d.range?.start.line || 0) + 1, column: (d.range?.start.character || 0) + 1 }));
    if (diagnostics.some(d => d.severity === 'error')) throw new BuildError(diagnostics);
    return diagnostics;
  } finally { program.dispose(); }
}
function normalizeSettings(root, override) {
  const file = path.join(root, 'project.settings.json');
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const settings = { ...saved, ...override };
  settings.projectName ||= path.basename(root);
  settings.screen = { width: 1280, height: 720, mode: '720p', ...(settings.screen || {}) };
  settings.input = { actionMap: { move_up: 'up', move_down: 'down', move_left: 'left', move_right: 'right', action: 'ok', pause: 'play', back: 'back' }, ...(settings.input || {}) };
  return settings;
}
function rewriteSvg(value, root, output, conversions) {
  if (typeof value === 'string' && /\.svg$/i.test(value) && /^(res:\/\/|pkg:\/)/.test(value)) {
    const relative = value.replace(/^(res:\/\/|pkg:\/)/, '');
    const mapped = 'assets/generated/' + crypto.createHash('sha256').update(relative).digest('hex').slice(0, 16) + '.png';
    if (!conversions[relative]) {
      const svg = fs.readFileSync(path.join(root, relative), 'utf8');
      if (/(?:href|url)\s*(?:=|\()\s*["']?(?:https?:|file:|\/\/)/i.test(svg)) throw new BuildError([{ severity: 'error', code: 'SVG_EXTERNAL', path: relative, message: 'SVG external resources are not supported; embed them before building.' }]);
      const { Resvg } = require('@resvg/resvg-js');
      const renderer = new Resvg(svg, { font: { loadSystemFonts: false } });
      if (renderer.width > 2048 || renderer.height > 2048 || renderer.width * renderer.height > 1048576) throw new BuildError([{ severity: 'error', code: 'SVG_SIZE', path: relative, message: 'SVG raster exceeds 2048 pixels per axis or 1 megapixel. Resize the artwork before building.' }]);
      const png = renderer.render().asPng();
      fs.mkdirSync(path.dirname(path.join(output, mapped)), { recursive: true }); fs.writeFileSync(path.join(output, mapped), png); conversions[relative] = mapped;
    }
    return value.startsWith('pkg:/') ? 'pkg:/' + mapped : 'res://' + mapped;
  }
  if (Array.isArray(value)) return value.map(v => rewriteSvg(v, root, output, conversions));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteSvg(v, root, output, conversions)]));
  return value;
}
function buildNativeProject(payload, options = {}) {
  const projectRoot = fs.realpathSync(path.resolve(payload.projectRoot));
  const settings = normalizeSettings(projectRoot, payload.settings);
  if (payload.profile != null) {
    if (!['debug','dev','release'].includes(payload.profile)) throw new BuildError([{ severity: 'error', code: 'BUILD_PROFILE', message: 'Unknown build profile: ' + payload.profile }]);
    settings.runtimeTelemetry = payload.profile !== 'release';
  }
  let scenes;
  try { scenes = gatherProjectScenes(projectRoot, payload.scenes || []); }
  catch (e) { throw new BuildError([{ severity: 'error', code: 'SCENE_READ', path: projectRoot, message: e.message }]); }
  const startupScene = payload.startupScene || settings.startupScene || scenes[0]?.runtimeScene?.scene?.name;
  let diagnostics = validateSnapshot(projectRoot, scenes, startupScene, settings);
  if (!scenes.length) diagnostics.push({ severity: 'error', code: 'NO_SCENES', message: 'Create or open a scene before building.' });
  if (diagnostics.some(d => d.severity === 'error')) throw new BuildError(diagnostics);
  const schema = getSchema();
  scenes = scenes.map(s => ({ ...s, runtimeScene: JSON.parse(JSON.stringify(schema.normalizeScene(s.runtimeScene))), editorState: JSON.parse(JSON.stringify(s.editorState || {})) }));
  scenes.sort((a, b) => a.runtimeScene.scene.name.localeCompare(b.runtimeScene.scene.name));
  const output = path.join(options.buildRoot || path.resolve(__dirname, '../.visual-editor/engine-builds'), crypto.randomUUID());
  fs.mkdirSync(path.join(output, 'assets/scenes'), { recursive: true });
  const conversions = {};
  for (const folder of ['assets', 'images', 'audio', 'fonts', 'data']) {
    const source = path.join(projectRoot, folder);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(output, folder), { recursive: true, filter: file => !fs.lstatSync(file).isSymbolicLink() });
  }
  // Resources outside conventional folders still belong to the snapshot.
  function copyReferences(value) {
    if (typeof value === 'string' && /^(res:\/\/|pkg:\/)/.test(value)) {
      const { relative, target } = packagePath(projectRoot, value);
      if (fs.statSync(target).isFile() && !/\.brs$/i.test(relative)) {
        fs.mkdirSync(path.dirname(path.join(output, relative)), { recursive: true });
        fs.copyFileSync(target, path.join(output, relative));
      }
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) copyReferences(child);
  }
  copyReferences(scenes.map(s => ({ runtimeScene: s.runtimeScene, editorState: s.editorState })));
  // Older atlas imports retained only a filename plus embedded image bytes.
  // Recover those bytes into the package so reopened projects still render.
  for (const scene of scenes) {
    for (const style of scene.editorState.nineSliceStyles || []) {
      const embedded = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(style.imageDataUrl || '');
      if (!embedded) continue;
      const bytes = Buffer.from(embedded[2], 'base64');
      const valid = embedded[1] === 'png' ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' : bytes.subarray(0, 2).toString('hex') === 'ffd8';
      if (!valid) throw new BuildError([{ severity: 'error', code: 'ATLAS_IMAGE', message: 'Embedded atlas image is invalid.', scene: scene.runtimeScene.scene.name }]);
      const relative = 'assets/generated/atlas-' + crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16) + (embedded[1] === 'png' ? '.png' : '.jpg');
      fs.mkdirSync(path.dirname(path.join(output, relative)), { recursive: true });
      fs.writeFileSync(path.join(output, relative), bytes);
      style.imagePath = 'res://' + relative;
      style.imageDataUrl = '';
      for (const node of scene.runtimeScene.nodes) {
        const props = node.properties || {};
        if (props.atlasRegionId === style.id || props.nineSliceStyleId === style.id) {
          props.imagePath = style.imagePath;
          props.imageDataUrl = '';
        }
      }
    }
  }
  scenes = scenes.map(s => rewriteSvg(s, projectRoot, output, conversions));
  // Editor previews hydrate images as data URLs. Durable packaged paths are
  // sufficient at runtime; retaining the preview bytes repeats whole atlases.
  for (const scene of scenes) for (const node of scene.runtimeScene.nodes) {
    const props = node.properties || {};
    if (props.imageDataUrl && /^(res:\/\/|pkg:\/)/.test(props.imagePath || '')) {
      const relative = props.imagePath.replace(/^(res:\/\/|pkg:\/)/, '').split('#')[0];
      if (fs.existsSync(path.join(output, relative))) props.imageDataUrl = '';
    }
  }
  require('./native_audio.cjs').prepareAudio(scenes,projectRoot,output,diagnostics);
  if(diagnostics.some(d=>d.severity==='error'))throw new BuildError(diagnostics);
  const metadata = buildClassicExportMetadataFiles(scenes, { projectRoot, exportOptions: payload.exportOptions || { bakeTerrain: payload.bakeTerrain !== false } });
  for (const scene of metadata.scenePayloads) fs.writeFileSync(path.join(output, 'assets/scenes', scene.sceneName + '.json'), scene.json);
  for (const [file, key] of Object.entries({ spriteframes: 'spriteframesJson', spritesheets: 'spritesheetsJson', tilesets: 'tilesetsJson', audio: 'audioJson', resources: 'resourcesJson', ui_screens: 'uiScreensJson', ui_transition_presets: 'uiTransitionPresetsJson', ui_option_defs: 'uiOptionDefsJson', ui_high_score_table: 'uiHighScoreTableJson', nine_slice_styles: 'nineSliceStylesJson' })) if (metadata[key]) fs.writeFileSync(path.join(output, 'assets', file + '.json'), metadata[key]);
  for (const message of metadata.warnings || []) diagnostics.push({ severity: 'warning', code: 'METADATA', message: String(message) });
  fs.writeFileSync(path.join(output, 'assets/project_settings.json'), JSON.stringify(settings, null, 2));
  const title = String(payload.projectTitle || settings.projectName).replace(/[\r\n]/g, ' ');
  const manifest = `title=${title}\nmajor_version=${Number(payload.majorVersion ?? 1)}\nminor_version=${Number(payload.minorVersion ?? 0)}\nbuild_version=1\nui_resolutions=hd\nsplash_color=#101820\n`;
  fs.writeFileSync(path.join(output, 'manifest'), manifest);
  writeClassicRuntimeFiles(output, { startupSceneName: startupScene, projectName: title });
  const scripts = copyProjectBrightScriptFiles(projectRoot, output);
  diagnostics.push(...validateBrightScript(output));
  const zipPath = path.join(output, 'game.zip'); const summary = packageRoku(output, zipPath);
  const result = { success: true, output, exportRoot: output, zipPath, zipBytes: summary.bytes, ...summary, diagnostics, warnings: diagnostics.filter(d => d.severity === 'warning').map(formatDiagnostic), scenes: scenes.map(s => s.runtimeScene.scene.name), startupScene, scriptCount: scripts.length, conversions };
  fs.writeFileSync(path.join(output, 'build-result.json'), JSON.stringify(result, null, 2));
  return result;
}
module.exports = { buildNativeProject, validateBrightScript, normalizeSettings };
