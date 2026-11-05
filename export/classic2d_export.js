globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
const fs = require('fs');
const path = require('path');

const TEMPLATE_ROOT = path.join(__dirname, 'runtime_templates');
const ENGINE_TEMPLATE_ROOT = path.join(TEMPLATE_ROOT, 'engine');
// Canonical source directory; templates are only a fallback for missing files.
const ENGINE_SOURCE_ROOT = path.join(__dirname, '..', 'source', 'engine');

function readEngineFile(relativeName) {
  // relativeName is relative to source/engine/, e.g. 'enemy_ai.brs' or 'ui/ui_storage.brs'
  const sourcePath = path.join(ENGINE_SOURCE_ROOT, relativeName);
  if (fs.existsSync(sourcePath)) return fs.readFileSync(sourcePath, 'utf8');
  const templatePath = path.join(ENGINE_TEMPLATE_ROOT, relativeName);
  if (fs.existsSync(templatePath)) return fs.readFileSync(templatePath, 'utf8');
  throw new Error(`Engine file not found: ${relativeName}`);
}

function buildMainBrightScriptTemplate(sceneName = 'MainScene', projectName = 'RokuEngine Game') {
  const safeSceneName = String(sceneName || 'MainScene').replace(/"/g, '""').replace(/[\r\n]/g, ' ');
  const safeProjectName = String(projectName || 'RokuEngine Game').replace(/"/g, '""').replace(/[\r\n]/g, ' ');
  return `' main.brs - ${safeProjectName}
sub Main()
  projectName = "${safeProjectName}"
  engine = RokuEngine_Create("${safeSceneName}")
  if engine = invalid then return
  engine.Run()
end sub
`;
}

function getClassicRuntimeSourceFiles() {
  return {
    'source/engine/core.brs':               readEngineFile('core.brs'),
    'source/engine/runtime_bindings.brs':   readEngineFile('runtime_bindings.brs'),
    // RGE v91: new runtime systems
    'source/engine/animation_state_machine.brs': readEngineFile('animation_state_machine.brs'),
    'source/engine/asset_stream.brs':            readEngineFile('asset_stream.brs'),
    // Existing engine files
    'source/engine/component_registry.brs': readEngineFile('component_registry.brs'),
    'source/engine/enemy_ai.brs':           readEngineFile('enemy_ai.brs'),
    'source/engine/object_pool.brs':        readEngineFile('object_pool.brs'),
    'source/engine/scene_manager.brs':      readEngineFile('scene_manager.brs'),
    'source/engine/camera_policies.brs':    readEngineFile('camera_policies.brs'),
    'source/engine/audio_runtime.brs':      readEngineFile('audio_runtime.brs'),
    'source/engine/resource_manager.brs':   readEngineFile('resource_manager.brs'),
    'source/engine/ui_system.brs':          readEngineFile('ui_system.brs'),
    'source/engine/focus_manager.brs':      readEngineFile('focus_manager.brs'),
    'source/engine/input.brs':              readEngineFile('input.brs'),
    'source/engine/render.brs':             readEngineFile('render.brs'),
    'source/engine/render_server.brs':      readEngineFile('render_server.brs'),
    'source/engine/renderers/sprite_renderer.brs': readEngineFile('renderers/sprite_renderer.brs'),
    'source/engine/renderers/debug_renderer.brs':  readEngineFile('renderers/debug_renderer.brs'),
    'source/engine/renderers/ui_renderer.brs':     readEngineFile('renderers/ui_renderer.brs'),
    'source/engine/animation.brs':          readEngineFile('animation.brs'),
    'source/engine/collision.brs':          readEngineFile('collision.brs'),
    'source/engine/camera.brs':             readEngineFile('camera.brs'),
    'source/engine/transform_system.brs':   readEngineFile('transform_system.brs'),
    'source/engine/scripts.brs':            readEngineFile('scripts.brs'),
    'source/engine/user_scripts_registry.brs': readEngineFile('user_scripts_registry.brs'),
    'source/engine/ui/ui_compat.brs':             readEngineFile('ui/ui_compat.brs'),
    'source/engine/ui/ui_focus_manager.brs':      readEngineFile('ui/ui_focus_manager.brs'),
    'source/engine/ui/ui_screen_manager.brs':     readEngineFile('ui/ui_screen_manager.brs'),
    'source/engine/ui/ui_transition_manager.brs': readEngineFile('ui/ui_transition_manager.brs'),
    'source/engine/ui/ui_nineslice.brs':          readEngineFile('ui/ui_nineslice.brs'),
    'source/engine/ui/ui_storage.brs':            readEngineFile('ui/ui_storage.brs'),
    'source/engine/ui/ui_options.brs':            readEngineFile('ui/ui_options.brs'),
    'source/engine/ui/ui_high_scores.brs':        readEngineFile('ui/ui_high_scores.brs'),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeClassicRuntimeFiles(outputRoot, options = {}) {
  const root = path.resolve(outputRoot);
  ensureDir(path.join(root, 'source'));
  ensureDir(path.join(root, 'source', 'engine'));
  ensureDir(path.join(root, 'source', 'engine', 'ui'));
  ensureDir(path.join(root, 'source', 'engine', 'renderers'));
  fs.writeFileSync(
    path.join(root, 'source', 'main.brs'),
    buildMainBrightScriptTemplate(options.startupSceneName || 'MainScene', options.projectName || 'RokuEngine Game'),
    'utf8'
  );
  const runtimeFiles = getClassicRuntimeSourceFiles();
  Object.entries(runtimeFiles).forEach(([relativePath, contents]) => {
    const outputPath = path.join(root, relativePath);
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, contents, 'utf8');
  });
  return {
    mainPath: path.join(root, 'source', 'main.brs'),
    runtimeFiles: Object.keys(runtimeFiles).map((relativePath) => path.join(root, relativePath))
  };
}

module.exports = {
  buildMainBrightScriptTemplate,
  getClassicRuntimeSourceFiles,
  writeClassicRuntimeFiles
};


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
