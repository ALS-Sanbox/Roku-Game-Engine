globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { execFileSync } = require('child_process');
const { writeClassicRuntimeFiles } = require('./export/classic2d_export');
const { buildClassicExportMetadataFiles } = require('./export/runtime_manifest_builder');

let mainWindow = null;
let settingsWindow = null;
let sideloadWindow = null;
let currentProjectRoot = __dirname;
let projectWatchers = [];
let projectWatchDebounce = null;

const APP_METADATA_FILE = 'app-metadata.json';
const RECOVERY_FOLDER_NAME = 'recovery';
const RECENT_SCENES_LIMIT = 12;
const RECENT_PROJECTS_LIMIT = 48;
const ENGINE_VERSION = 'v24';

const PROJECT_SETTINGS_FILE = 'project.settings.json';

function defaultProjectSettings(projectRoot = getProjectRoot()) {
  const fallbackName = path.basename(projectRoot || getProjectRoot() || __dirname) || 'RokuEngine Game';
  return {
    projectName: fallbackName,
    input: {
      movement: 'standard',
      action: 'ok',
      pause: 'play',
      actionMap: { move_up: 'up', move_down: 'down', move_left: 'left', move_right: 'right', action: 'ok', pause: 'play', back: 'back' }
    },
    screen: { width: 1280, height: 720, mode: '720p', fullscreen: true }
  };
}

function getProjectSettingsPath(projectRoot = getProjectRoot()) {
  return path.join(path.resolve(projectRoot || getProjectRoot() || __dirname), PROJECT_SETTINGS_FILE);
}

function normalizeProjectSettings(settings = {}, projectRoot = getProjectRoot()) {
  const defaults = defaultProjectSettings(projectRoot);
  const input = settings && typeof settings.input === 'object' && !Array.isArray(settings.input) ? settings.input : {};
  const screen = settings && typeof settings.screen === 'object' && !Array.isArray(settings.screen) ? settings.screen : {};
  return {
    projectName: String(settings.projectName || defaults.projectName).trim() || defaults.projectName,
    input: {
      movement: String(input.movement || defaults.input.movement).trim() || defaults.input.movement,
      action: String(input.action || defaults.input.action).trim() || defaults.input.action,
      pause: String(input.pause || defaults.input.pause).trim() || defaults.input.pause,
      actionMap: {
        move_up: String((input.actionMap && input.actionMap.move_up) || 'up').trim() || 'up',
        move_down: String((input.actionMap && input.actionMap.move_down) || 'down').trim() || 'down',
        move_left: String((input.actionMap && input.actionMap.move_left) || 'left').trim() || 'left',
        move_right: String((input.actionMap && input.actionMap.move_right) || 'right').trim() || 'right',
        action: String((input.actionMap && input.actionMap.action) || defaults.input.action).trim() || defaults.input.action,
        pause: String((input.actionMap && input.actionMap.pause) || defaults.input.pause).trim() || defaults.input.pause,
        back: String((input.actionMap && input.actionMap.back) || 'back').trim() || 'back'
      }
    },
    screen: {
      width: Math.max(1, Number(screen.width) || defaults.screen.width),
      height: Math.max(1, Number(screen.height) || defaults.screen.height),
      mode: String(screen.mode || defaults.screen.mode).trim() || defaults.screen.mode,
      fullscreen: screen.fullscreen !== false
    }
  };
}

function readProjectSettings(projectRoot = getProjectRoot()) {
  const settingsPath = getProjectSettingsPath(projectRoot);
  try {
    if (!fs.existsSync(settingsPath)) return defaultProjectSettings(projectRoot);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return normalizeProjectSettings(parsed, projectRoot);
  } catch (_error) {
    return defaultProjectSettings(projectRoot);
  }
}

function writeProjectSettings(projectRoot = getProjectRoot(), settings = {}) {
  const normalizedRoot = path.resolve(projectRoot || getProjectRoot() || __dirname);
  ensureDir(normalizedRoot);
  const normalized = normalizeProjectSettings(settings, normalizedRoot);
  fs.writeFileSync(getProjectSettingsPath(normalizedRoot), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function extractStartupSceneName(mainSource = '') {
  const match = String(mainSource || "").match(/RokuEngine_Create\("([^\"\r\n]+)"\)/);
  return match && match[1] ? match[1] : '';
}

function notifyProjectSettingsUpdated(projectRoot, settings) {
  const payload = {
    projectRoot: path.resolve(projectRoot || getProjectRoot() || __dirname),
    settings: normalizeProjectSettings(settings, projectRoot)
  };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('project-settings-updated', payload);
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('project-settings-updated', payload);
}


function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getAppDataRoot() {
  return ensureDir(path.join(app.getPath('userData'), 'roku-engine-editor'));
}

function getAppMetadataPath() {
  return path.join(getAppDataRoot(), APP_METADATA_FILE);
}

function getRecoveryRoot() {
  return ensureDir(path.join(getAppDataRoot(), RECOVERY_FOLDER_NAME));
}

function defaultAppMetadata() {
  return {
    version: 1,
    recentScenes: [],
    recentProjects: [],
    projectTags: {},
    recoveryManifest: []
  };
}

function readAppMetadata() {
  const filePath = getAppMetadataPath();
  try {
    if (!fs.existsSync(filePath)) return defaultAppMetadata();
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: 1,
      recentScenes: Array.isArray(raw.recentScenes) ? raw.recentScenes : [],
      recentProjects: Array.isArray(raw.recentProjects) ? raw.recentProjects : [],
      projectTags: raw && typeof raw.projectTags === 'object' && !Array.isArray(raw.projectTags) ? raw.projectTags : {},
      recoveryManifest: Array.isArray(raw.recoveryManifest) ? raw.recoveryManifest : []
    };
  } catch (_error) {
    return defaultAppMetadata();
  }
}

function writeAppMetadata(metadata) {
  const next = {
    version: 1,
    recentScenes: Array.isArray(metadata?.recentScenes) ? metadata.recentScenes : [],
    recentProjects: Array.isArray(metadata?.recentProjects) ? metadata.recentProjects : [],
    projectTags: metadata && typeof metadata.projectTags === 'object' && !Array.isArray(metadata.projectTags) ? metadata.projectTags : {},
    recoveryManifest: Array.isArray(metadata?.recoveryManifest) ? metadata.recoveryManifest : []
  };
  fs.writeFileSync(getAppMetadataPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function touchRecentScene(scenePath, sceneName = '') {
  if (!scenePath) return null;
  const absolutePath = path.resolve(scenePath);
  const metadata = readAppMetadata();
  const now = new Date().toISOString();
  const existing = metadata.recentScenes.filter((entry) => entry && entry.filePath !== absolutePath);
  let stat = null;
  try { stat = fs.statSync(absolutePath); } catch (_error) {}
  const recentEntry = {
    filePath: absolutePath,
    sceneName: sceneName || path.basename(absolutePath, path.extname(absolutePath)) || 'Untitled',
    lastOpenedAt: now,
    exists: !!stat,
    updatedAt: stat ? stat.mtime.toISOString() : null
  };
  metadata.recentScenes = [recentEntry, ...existing].slice(0, RECENT_SCENES_LIMIT);
  writeAppMetadata(metadata);
  return recentEntry;
}


function findPrimaryScenePath(projectRoot) {
  const screensDir = path.join(projectRoot, 'components', 'screens');
  if (fs.existsSync(screensDir)) {
    const sceneFiles = fs.readdirSync(screensDir)
      .filter((name) => name.toLowerCase().endsWith('.rkscene'))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (sceneFiles.length) return path.join(screensDir, sceneFiles[0]);
  }
  const rootFiles = fs.readdirSync(projectRoot)
    .filter((name) => name.toLowerCase().endsWith('.rkscene'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return rootFiles.length ? path.join(projectRoot, rootFiles[0]) : '';
}

function sanitizeTagList(tags = []) {
  return Array.from(new Set((Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map((tag) => String(tag || '').trim())
    .filter(Boolean))).slice(0, 24);
}

function readRawProjectSettings(projectRoot) {
  try {
    const settingsPath = getProjectSettingsPath(projectRoot);
    if (!fs.existsSync(settingsPath)) return {};
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) || {};
  } catch (_error) {
    return {};
  }
}

function isProjectFolder(projectRoot) {
  try {
    const normalizedRoot = path.resolve(projectRoot);
    return fs.existsSync(getProjectSettingsPath(normalizedRoot))
      || !!findPrimaryScenePath(normalizedRoot)
      || fs.existsSync(path.join(normalizedRoot, 'source', 'main.brs'));
  } catch (_error) {
    return false;
  }
}

function summarizeProject(projectRoot) {
  const normalizedRoot = path.resolve(projectRoot);
  const metadata = readAppMetadata();
  const rawSettings = readRawProjectSettings(normalizedRoot);
  const settings = normalizeProjectSettings(rawSettings, normalizedRoot);
  const stat = fs.existsSync(normalizedRoot) ? fs.statSync(normalizedRoot) : null;
  const mainScenePath = findPrimaryScenePath(normalizedRoot);
  let sceneStat = null;
  try { if (mainScenePath) sceneStat = fs.statSync(mainScenePath); } catch (_error) {}
  const tagMap = metadata.projectTags || {};
  const projectVersion = String(rawSettings.engineVersion || rawSettings.editorVersion || ENGINE_VERSION).trim() || ENGINE_VERSION;
  return {
    rootPath: normalizedRoot,
    name: settings.projectName || path.basename(normalizedRoot),
    logoText: String((settings.projectName || path.basename(normalizedRoot) || 'P').trim().charAt(0) || 'P').toUpperCase(),
    engineVersion: projectVersion,
    mainScenePath,
    lastEditedAt: (sceneStat && sceneStat.mtime ? sceneStat.mtime.toISOString() : (stat && stat.mtime ? stat.mtime.toISOString() : null)),
    path: normalizedRoot,
    tags: sanitizeTagList(tagMap[normalizedRoot] || []),
    exists: !!stat
  };
}

function touchRecentProject(projectRoot) {
  if (!projectRoot) return null;
  const normalizedRoot = path.resolve(projectRoot);
  const metadata = readAppMetadata();
  const existing = (metadata.recentProjects || []).filter((entry) => entry && path.resolve(entry.rootPath || '') !== normalizedRoot);
  const summary = summarizeProject(normalizedRoot);
  metadata.recentProjects = [{
    rootPath: normalizedRoot,
    lastOpenedAt: new Date().toISOString(),
    name: summary.name
  }, ...existing].slice(0, RECENT_PROJECTS_LIMIT);
  writeAppMetadata(metadata);
  return summary;
}

function listKnownProjects() {
  const metadata = readAppMetadata();
  const paths = Array.from(new Set((metadata.recentProjects || []).map((entry) => path.resolve(String(entry?.rootPath || ''))).filter(Boolean)));
  return paths.filter((projectRoot) => {
    try { return isProjectFolder(projectRoot); } catch (_error) { return false; }
  }).map((projectRoot) => summarizeProject(projectRoot));
}

function scanProjectsInFolder(folderPath) {
  const normalizedFolder = path.resolve(folderPath);
  if (!fs.existsSync(normalizedFolder) || !fs.statSync(normalizedFolder).isDirectory()) return [];
  const results = [];
  if (isProjectFolder(normalizedFolder)) results.push(summarizeProject(normalizedFolder));
  const entries = fs.readdirSync(normalizedFolder, { withFileTypes: true });
  entries.forEach((entry) => {
    if (!entry.isDirectory() || entry.name.startsWith('.')) return;
    const candidate = path.join(normalizedFolder, entry.name);
    if (isProjectFolder(candidate)) results.push(summarizeProject(candidate));
  });
  const deduped = new Map();
  results.forEach((project) => deduped.set(project.rootPath, project));
  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function registerScannedProjects(projects = []) {
  const metadata = readAppMetadata();
  const existing = Array.isArray(metadata.recentProjects) ? metadata.recentProjects : [];
  const byPath = new Map(existing.map((entry) => [path.resolve(String(entry?.rootPath || '')), entry]).filter((entry) => entry[0]));
  projects.forEach((project) => {
    const normalizedRoot = path.resolve(String(project?.rootPath || ''));
    if (!normalizedRoot) return;
    const previous = byPath.get(normalizedRoot) || {};
    byPath.set(normalizedRoot, {
      rootPath: normalizedRoot,
      name: project?.name || previous.name || path.basename(normalizedRoot),
      lastOpenedAt: previous.lastOpenedAt || null
    });
  });
  metadata.recentProjects = Array.from(byPath.values()).slice(0, RECENT_PROJECTS_LIMIT);
  writeAppMetadata(metadata);
  return listKnownProjects();
}

function setProjectTags(projectRoot, tags = []) {
  const normalizedRoot = path.resolve(projectRoot);
  const metadata = readAppMetadata();
  metadata.projectTags = metadata.projectTags || {};
  metadata.projectTags[normalizedRoot] = sanitizeTagList(tags);
  writeAppMetadata(metadata);
  return summarizeProject(normalizedRoot);
}

function removeProjectFromManager(projectRoot) {
  const normalizedRoot = path.resolve(projectRoot);
  const metadata = readAppMetadata();
  metadata.recentProjects = (metadata.recentProjects || []).filter((entry) => path.resolve(String(entry?.rootPath || '')) !== normalizedRoot);
  if (metadata.projectTags && metadata.projectTags[normalizedRoot]) delete metadata.projectTags[normalizedRoot];
  writeAppMetadata(metadata);
  return true;
}

function copyDirectoryRecursiveSafe(sourceDir, destinationDir) {
  ensureDir(destinationDir);
  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) copyDirectoryRecursiveSafe(sourcePath, destinationPath);
    else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(sourcePath);
      fs.symlinkSync(target, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  });
}
function sanitizeRecoveryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    id: String(entry.id || ''),
    scenePath: entry.scenePath ? path.resolve(entry.scenePath) : '',
    sceneName: entry.sceneName || 'Untitled',
    recoveryFolder: entry.recoveryFolder ? path.resolve(entry.recoveryFolder) : '',
    runtimeAutosavePath: entry.runtimeAutosavePath ? path.resolve(entry.runtimeAutosavePath) : '',
    editorAutosavePath: entry.editorAutosavePath ? path.resolve(entry.editorAutosavePath) : '',
    updatedAt: entry.updatedAt || null,
    source: entry.source === 'saved' ? 'saved' : 'untitled'
  };
}

function getSavedSceneRecoveryPaths(scenePath) {
  const absoluteScenePath = path.resolve(scenePath);
  const parsed = path.parse(absoluteScenePath);
  return {
    recoveryFolder: parsed.dir,
    runtimeAutosavePath: path.join(parsed.dir, `${parsed.name}.autosave${parsed.ext || '.rkscene'}`),
    editorAutosavePath: path.join(parsed.dir, `${parsed.name}.autosave.editstate`)
  };
}

function createUntitledRecoveryPaths(recoveryId) {
  const folder = ensureDir(path.join(getRecoveryRoot(), recoveryId));
  return {
    recoveryFolder: folder,
    runtimeAutosavePath: path.join(folder, 'scene.autosave.rkscene'),
    editorAutosavePath: path.join(folder, 'scene.autosave.editstate')
  };
}

function deleteFileIfExists(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_error) {}
}

function cleanupRecoveryFolder(dirPath) {
  if (!dirPath) return;
  try {
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      const entries = fs.readdirSync(dirPath);
      if (!entries.length) fs.rmdirSync(dirPath);
    }
  } catch (_error) {}
}

function removeRecoveryEntryById(recoveryId) {
  if (!recoveryId) return false;
  const metadata = readAppMetadata();
  const entry = metadata.recoveryManifest.find((item) => item?.id === recoveryId);
  metadata.recoveryManifest = metadata.recoveryManifest.filter((item) => item?.id !== recoveryId);
  writeAppMetadata(metadata);
  if (entry) {
    deleteFileIfExists(entry.runtimeAutosavePath);
    deleteFileIfExists(entry.editorAutosavePath);
    cleanupRecoveryFolder(entry.recoveryFolder);
  }
  return !!entry;
}

function removeRecoveryEntriesForScene(scenePath) {
  if (!scenePath) return false;
  const absoluteScenePath = path.resolve(scenePath);
  const metadata = readAppMetadata();
  const removed = metadata.recoveryManifest.filter((entry) => path.resolve(entry?.scenePath || '') === absoluteScenePath);
  metadata.recoveryManifest = metadata.recoveryManifest.filter((entry) => path.resolve(entry?.scenePath || '') !== absoluteScenePath);
  writeAppMetadata(metadata);
  removed.forEach((entry) => {
    deleteFileIfExists(entry.runtimeAutosavePath);
    deleteFileIfExists(entry.editorAutosavePath);
    cleanupRecoveryFolder(entry.recoveryFolder);
  });
  return removed.length > 0;
}

function writeRecoveryAutosave(payload = {}) {
  const runtimeJson = typeof payload.runtimeJson === 'string' ? payload.runtimeJson : '';
  if (!runtimeJson.trim()) throw new Error('Missing runtimeJson for autosave.');
  const editorStateJson = typeof payload.editorStateJson === 'string' ? payload.editorStateJson : '';
  const scenePath = typeof payload.scenePath === 'string' && payload.scenePath.trim() ? path.resolve(payload.scenePath) : '';
  const recoveryId = typeof payload.recoveryId === 'string' && payload.recoveryId.trim()
    ? payload.recoveryId.trim()
    : crypto.randomUUID();
  const paths = scenePath ? getSavedSceneRecoveryPaths(scenePath) : createUntitledRecoveryPaths(recoveryId);
  ensureDir(path.dirname(paths.runtimeAutosavePath));
  ensureDir(path.dirname(paths.editorAutosavePath));
  fs.writeFileSync(paths.runtimeAutosavePath, runtimeJson, 'utf8');
  fs.writeFileSync(paths.editorAutosavePath, editorStateJson, 'utf8');

  const metadata = readAppMetadata();
  const entry = {
    id: recoveryId,
    scenePath,
    sceneName: payload.sceneName || (scenePath ? path.basename(scenePath, path.extname(scenePath)) : 'Untitled'),
    recoveryFolder: paths.recoveryFolder,
    runtimeAutosavePath: paths.runtimeAutosavePath,
    editorAutosavePath: paths.editorAutosavePath,
    updatedAt: new Date().toISOString(),
    source: scenePath ? 'saved' : 'untitled'
  };
  metadata.recoveryManifest = (metadata.recoveryManifest || []).filter((item) => {
    if (item?.id === recoveryId) return false;
    if (scenePath && item?.scenePath && path.resolve(item.scenePath) === scenePath) return false;
    return true;
  });
  metadata.recoveryManifest.unshift(entry);
  writeAppMetadata(metadata);
  return sanitizeRecoveryEntry(entry);
}

function getStartupState() {
  const metadata = readAppMetadata();
  const recoveries = (metadata.recoveryManifest || [])
    .map(sanitizeRecoveryEntry)
    .filter((entry) => entry && entry.id && entry.runtimeAutosavePath && fs.existsSync(entry.runtimeAutosavePath))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return {
    recentScenes: (metadata.recentScenes || []).filter(Boolean),
    recoveries
  };
}

function loadRecoveryPayload(recoveryId) {
  const metadata = readAppMetadata();
  const entry = sanitizeRecoveryEntry((metadata.recoveryManifest || []).find((item) => item?.id === recoveryId));
  if (!entry) return { success: false, reason: 'not_found' };
  if (!fs.existsSync(entry.runtimeAutosavePath)) return { success: false, reason: 'missing_runtime_autosave' };
  const json = fs.readFileSync(entry.runtimeAutosavePath, 'utf8');
  const editorStateJson = readJsonFileIfExists(entry.editorAutosavePath);
  return {
    success: true,
    recovery: entry,
    json,
    editorStateJson,
    filePath: entry.scenePath || '',
    hasEditState: !!editorStateJson,
    isRecovery: true
  };
}

function notifyProjectFilesChanged() {
  if (projectWatchDebounce) clearTimeout(projectWatchDebounce);
  projectWatchDebounce = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('project-files-changed', { rootPath: currentProjectRoot || __dirname });
  }, 150);
}

function closeProjectWatchers() {
  projectWatchers.forEach((watcher) => {
    try { watcher.close(); } catch (_error) {}
  });
  projectWatchers = [];
}

function collectWatchDirectories(rootPath, maxDepth = 6, depth = 0, visited = new Set()) {
  const resolvedRoot = path.resolve(rootPath);
  if (visited.has(resolvedRoot)) return [];
  visited.add(resolvedRoot);

  const dirs = [resolvedRoot];
  if (depth >= maxDepth) return dirs;

  let entries = [];
  try {
    entries = fs.readdirSync(resolvedRoot, { withFileTypes: true });
  } catch (_error) {
    return dirs;
  }

  entries.forEach((entry) => {
    if (!entry.isDirectory() || entry.name.startsWith('.')) return;
    dirs.push(...collectWatchDirectories(path.join(resolvedRoot, entry.name), maxDepth, depth + 1, visited));
  });

  return dirs;
}

function watchDirectory(dirPath) {
  try {
    const watcher = fs.watch(dirPath, { recursive: false }, () => notifyProjectFilesChanged());
    watcher.on('error', () => {});
    projectWatchers.push(watcher);
    return true;
  } catch (_error) {
    return false;
  }
}

function restartProjectWatchers() {
  closeProjectWatchers();
  const rootPath = currentProjectRoot || __dirname;

  try {
    const watcher = fs.watch(rootPath, { recursive: true }, () => notifyProjectFilesChanged());
    watcher.on('error', () => {});
    projectWatchers.push(watcher);
    return;
  } catch (_error) {}

  collectWatchDirectories(rootPath, 6).forEach((dirPath) => watchDirectory(dirPath));
}

function setCurrentProjectRoot(nextRootPath) {
  const resolvedPath = path.resolve(nextRootPath || __dirname);
  if (currentProjectRoot === resolvedPath && projectWatchers.length) return;
  currentProjectRoot = resolvedPath;
  restartProjectWatchers();
}

function normalizeRelativePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function stripResPrefix(resourcePath) {
  const normalized = normalizeRelativePath(resourcePath).trim();
  return normalized.replace(/^res:\/\//i, '');
}

function getProjectRoot() {
  return currentProjectRoot || __dirname;
}

function isSubPath(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  if (!relative) return true;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function makeResRelativePath(filePath) {
  if (!filePath) return '';
  const baseDir = getProjectRoot();
  const absoluteFilePath = path.resolve(filePath);
  if (!isSubPath(baseDir, absoluteFilePath)) return '';
  const relativePath = normalizeRelativePath(path.relative(baseDir, absoluteFilePath));
  if (!relativePath || relativePath === '.') return '';
  return `res://${relativePath}`;
}

function ensureImportDirectory(assetKind = 'generic') {
  const normalizedKind = String(assetKind || 'generic').trim().toLowerCase();
  const folderByKind = {
    image: path.join('assets', 'images'),
    spritesheet: path.join('assets', 'spritesheets'),
    sprite: path.join('assets', 'spritesheets'),
    audio: path.join('assets', 'audio')
  };
  const relativeDir = folderByKind[normalizedKind] || path.join('assets', 'imported');
  const dirPath = path.join(getProjectRoot(), relativeDir);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getUniqueImportPath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  let index = 2;
  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
}

function importFileIntoProject(filePath, options = {}) {
  const absoluteSourcePath = path.resolve(filePath);
  const existingResPath = makeResRelativePath(absoluteSourcePath);
  if (existingResPath) {
    return {
      imported: false,
      absolutePath: absoluteSourcePath,
      resPath: existingResPath
    };
  }

  const importDir = ensureImportDirectory(options.assetKind || options.category || 'generic');
  const defaultTargetPath = getUniqueImportPath(path.join(importDir, path.basename(absoluteSourcePath)));
  const targetPath = options.targetPath ? path.resolve(options.targetPath) : defaultTargetPath;
  if (!isSubPath(getProjectRoot(), targetPath)) {
    throw new Error('Imported asset target must stay inside the project root.');
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(absoluteSourcePath, targetPath);
  return {
    imported: true,
    absolutePath: targetPath,
    resPath: makeResRelativePath(targetPath)
  };
}

async function chooseImportTarget(filePath, options = {}) {
  const importDir = ensureImportDirectory(options.assetKind || options.category || 'generic');
  const defaultTargetPath = getUniqueImportPath(path.join(importDir, path.basename(filePath)));
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Import Asset Into Project',
    defaultPath: defaultTargetPath,
    buttonLabel: 'Import Here'
  });
  if (result.canceled || !result.filePath) return { success: false, reason: 'canceled' };
  const chosenPath = path.resolve(result.filePath);
  if (!isSubPath(getProjectRoot(), chosenPath)) {
    return { success: false, reason: 'outside_project_root' };
  }
  return { success: true, filePath: chosenPath };
}


function getEditStatePath(scenePath) {
  return `${scenePath}.editstate`;
}

function writeSceneFilesToPath(payload = {}) {
  const runtimeJson = typeof payload.runtimeJson === 'string' ? payload.runtimeJson : '';
  const editorStateJson = typeof payload.editorStateJson === 'string' ? payload.editorStateJson : '';
  const targetScenePath = typeof payload.targetScenePath === 'string' && payload.targetScenePath.trim()
    ? path.resolve(payload.targetScenePath)
    : '';
  const previousScenePath = typeof payload.currentScenePath === 'string' && payload.currentScenePath.trim()
    ? path.resolve(payload.currentScenePath)
    : '';
  const sceneName = typeof payload.sceneName === 'string' ? payload.sceneName.trim() : '';

  if (!targetScenePath) throw new Error('Missing targetScenePath.');
  fs.mkdirSync(path.dirname(targetScenePath), { recursive: true });
  const editStatePath = getEditStatePath(targetScenePath);
  fs.writeFileSync(targetScenePath, runtimeJson, 'utf8');
  if (typeof editorStateJson === 'string' && editorStateJson.trim()) {
    fs.writeFileSync(editStatePath, editorStateJson, 'utf8');
  }
  setCurrentProjectRoot(path.resolve(path.dirname(targetScenePath)));
  touchRecentScene(targetScenePath, sceneName || path.basename(targetScenePath, path.extname(targetScenePath)));
  if (previousScenePath) removeRecoveryEntriesForScene(previousScenePath);
  removeRecoveryEntriesForScene(targetScenePath);
  if (payload.recoveryId) removeRecoveryEntryById(payload.recoveryId);
  const projectRoot = path.resolve(path.dirname(targetScenePath));
  const settings = payload.projectSettings ? writeProjectSettings(projectRoot, payload.projectSettings) : readProjectSettings(projectRoot);
  writeProjectMainScript(projectRoot, settings, sceneName || path.basename(targetScenePath, path.extname(targetScenePath)) || 'MainScene');
  notifyProjectSettingsUpdated(projectRoot, settings);
  return { success: true, filePath: targetScenePath, editStatePath, settings };
}

function readJsonFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return null;
  }
}


function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 560,
    minWidth: 640,
    minHeight: 500,
    title: 'Project Settings',
    parent: mainWindow || undefined,
    modal: false,
    show: false,
    backgroundColor: '#1c1e26',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  return settingsWindow;
}

function createSideloadWindow() {
  if (sideloadWindow && !sideloadWindow.isDestroyed()) {
    sideloadWindow.focus();
    return sideloadWindow;
  }

  sideloadWindow = new BrowserWindow({
    width:     580,
    height:    720,
    minWidth:  520,
    minHeight: 600,
    title:     'Sideload to Roku',
    parent:    mainWindow || undefined,
    modal:     false,
    show:      false,
    backgroundColor: '#1c1e26',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  sideloadWindow.loadFile(path.join(__dirname, 'sideload.html'));
  sideloadWindow.once('ready-to-show', () => sideloadWindow.show());
  sideloadWindow.on('closed', () => { sideloadWindow = null; });
  return sideloadWindow;
}

function loadProjectManagerWindow() {
  if (!mainWindow) return;
  mainWindow.setMinimumSize(1120, 720);
  mainWindow.loadFile(path.join(__dirname, 'project_manager.html'));
}

function openEditorForProject(projectRoot) {
  const normalizedRoot = path.resolve(projectRoot || currentProjectRoot || __dirname);
  setCurrentProjectRoot(normalizedRoot);
  if (!mainWindow) return;
  mainWindow.setMinimumSize(1100, 700);
  mainWindow.loadFile(path.join(__dirname, 'index.html'), { query: { projectRoot: normalizedRoot } });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f1117',
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    thickFrame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadProjectManagerWindow();
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  setCurrentProjectRoot(currentProjectRoot || __dirname);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});


ipcMain.handle('get-launch-project', async () => {
  try {
    return { success: true, rootPath: currentProjectRoot || '' };
  } catch (error) {
    return { success: false, reason: error.message, rootPath: '' };
  }
});

ipcMain.handle('get-project-manager-state', async () => {
  try {
    return { success: true, engineName: 'RokuEngine', engineVersion: ENGINE_VERSION, projects: listKnownProjects() };
  } catch (error) {
    return { success: false, reason: error.message, engineName: 'RokuEngine', engineVersion: ENGINE_VERSION, projects: [] };
  }
});

ipcMain.handle('scan-projects-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Scan Folder For Projects',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { success: false, reason: 'canceled', projects: [] };
  try {
    const folderPath = path.resolve(result.filePaths[0]);
    const projects = scanProjectsInFolder(folderPath);
    const merged = registerScannedProjects(projects);
    return { success: true, folderPath, projects, allProjects: merged };
  } catch (error) {
    return { success: false, reason: error.message, projects: [] };
  }
});

ipcMain.handle('import-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Existing Project',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { success: false, reason: 'canceled' };
  try {
    const rootPath = path.resolve(result.filePaths[0]);
    if (!isProjectFolder(rootPath)) return { success: false, reason: 'Selected folder is not a recognizable RokuEngine project.' };
    const summary = touchRecentProject(rootPath);
    return { success: true, project: summary };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('open-project-in-editor', async (_event, projectRoot) => {
  try {
    const normalizedRoot = path.resolve(String(projectRoot || '').trim());
    if (!normalizedRoot || !isProjectFolder(normalizedRoot)) return { success: false, reason: 'Project folder not found.' };
    const summary = touchRecentProject(normalizedRoot);
    openEditorForProject(normalizedRoot);
    return { success: true, project: summary };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('rename-project-folder', async (_event, payload = {}) => {
  try {
    const rootPath = path.resolve(String(payload.rootPath || '').trim());
    const nextName = String(payload.nextName || '').trim();
    if (!rootPath || !nextName) return { success: false, reason: 'Missing project path or name.' };
    const parentDir = path.dirname(rootPath);
    const nextRoot = path.join(parentDir, nextName);
    if (fs.existsSync(nextRoot)) return { success: false, reason: 'A folder with that name already exists.' };
    fs.renameSync(rootPath, nextRoot);
    const metadata = readAppMetadata();
    metadata.recentProjects = (metadata.recentProjects || []).map((entry) => {
      const existingPath = path.resolve(String(entry?.rootPath || ''));
      if (existingPath !== rootPath) return entry;
      return { ...entry, rootPath: nextRoot, name: nextName };
    });
    if (metadata.projectTags && metadata.projectTags[rootPath]) {
      metadata.projectTags[nextRoot] = metadata.projectTags[rootPath];
      delete metadata.projectTags[rootPath];
    }
    writeAppMetadata(metadata);
    const settings = readProjectSettings(nextRoot);
    notifyProjectSettingsUpdated(nextRoot, settings);
    return { success: true, project: summarizeProject(nextRoot) };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('duplicate-project-folder', async (_event, payload = {}) => {
  try {
    const rootPath = path.resolve(String(payload.rootPath || '').trim());
    if (!rootPath || !fs.existsSync(rootPath)) return { success: false, reason: 'Project folder not found.' };
    const parentDir = path.dirname(rootPath);
    const baseName = path.basename(rootPath);
    let index = 1;
    let duplicateRoot = path.join(parentDir, `${baseName} Copy`);
    while (fs.existsSync(duplicateRoot)) {
      index += 1;
      duplicateRoot = path.join(parentDir, `${baseName} Copy ${index}`);
    }
    copyDirectoryRecursiveSafe(rootPath, duplicateRoot);
    const summary = touchRecentProject(duplicateRoot);
    return { success: true, project: summary };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('remove-project-from-manager', async (_event, projectRoot) => {
  try {
    removeProjectFromManager(projectRoot);
    return { success: true };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('set-project-tags', async (_event, payload = {}) => {
  try {
    const project = setProjectTags(payload.rootPath, payload.tags || []);
    return { success: true, project };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('return-to-project-manager', async () => {
  try {
    loadProjectManagerWindow();
    return { success: true };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});
ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

function normalizeRelativePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function makeProjectRelativePath(filePath) {
  if (!filePath) return '';
  const baseDir = currentProjectRoot || __dirname;
  return normalizeRelativePath(path.relative(baseDir, filePath) || path.basename(filePath));
}

function filePathToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mimeMap = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    aac: 'audio/aac',
    json: 'application/json',
    js: 'text/javascript',
    txt: 'text/plain',
    md: 'text/markdown'
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  const bytes = fs.readFileSync(filePath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

ipcMain.handle('open-image-file', async (_event, payload = {}) => {
  const assetKind = String(payload?.assetKind || payload?.category || 'image').trim().toLowerCase();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: assetKind === 'spritesheet' ? 'Choose Spritesheet Image' : 'Choose Image',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) {
    return { success: false, reason: 'canceled' };
  }

  try {
    const sourcePath = result.filePaths[0];
    const insideProject = !!makeResRelativePath(sourcePath);
    let importedAsset = null;

    if (!insideProject) {
      const targetChoice = await chooseImportTarget(sourcePath, { assetKind });
      if (!targetChoice.success) {
        return { success: false, reason: targetChoice.reason || 'canceled' };
      }
      importedAsset = importFileIntoProject(sourcePath, { targetPath: targetChoice.filePath, assetKind });
    }

    const finalPath = importedAsset?.absolutePath || path.resolve(sourcePath);
    const resPath = importedAsset?.resPath || makeResRelativePath(finalPath);
    if (!resPath) {
      return { success: false, reason: 'outside_project_root' };
    }

    const dataUrl = filePathToDataUrl(finalPath);
    return {
      success: true,
      filePath: finalPath,
      resPath,
      imported: !!importedAsset,
      dataUrl
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('save-scene', async (_event, payload = {}) => {
  const runtimeJson = typeof payload.runtimeJson === 'string' ? payload.runtimeJson : '';
  const editorStateJson = typeof payload.editorStateJson === 'string' ? payload.editorStateJson : '';
  const currentScenePath = typeof payload.currentScenePath === 'string' && payload.currentScenePath.trim()
    ? path.resolve(payload.currentScenePath)
    : '';
  const sceneName = typeof payload.sceneName === 'string' ? payload.sceneName.trim() : '';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Scene',
    defaultPath: currentScenePath || payload.suggestedPath || 'RokuScene.rkscene',
    filters: [{ name: 'Roku Scene', extensions: ['rkscene', 'json'] }]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, reason: 'canceled' };
  }

  try {
    return writeSceneFilesToPath({
      runtimeJson,
      editorStateJson,
      targetScenePath: result.filePath,
      currentScenePath,
      recoveryId: payload.recoveryId,
      sceneName
    });
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('save-scene-direct', async (_event, payload = {}) => {
  try {
    return writeSceneFilesToPath(payload);
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

function loadSceneFilePayload(filePath) {
  const absolutePath = path.resolve(filePath);
  const json = fs.readFileSync(absolutePath, 'utf8');
  const editStatePath = getEditStatePath(absolutePath);
  const editorStateJson = readJsonFileIfExists(editStatePath);
  setCurrentProjectRoot(path.resolve(path.dirname(absolutePath)));
  touchRecentScene(absolutePath);
  return { success: true, json, editorStateJson, filePath: absolutePath, editStatePath, hasEditState: !!editorStateJson };
}

ipcMain.handle('open-scene', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Scene',
    filters: [{ name: 'Roku Scene', extensions: ['rkscene', 'json'] }],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) {
    return { success: false, reason: 'canceled' };
  }

  try {
    return loadSceneFilePayload(result.filePaths[0]);
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('open-scene-file', async (_event, filePath) => {
  if (!filePath) return { success: false, reason: 'missing_file_path' };
  try {
    return loadSceneFilePayload(filePath);
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

function buildTree(rootPath, currentPath, depth, maxDepth = 4) {
  const name = depth === 0 ? path.basename(currentPath) || currentPath : path.basename(currentPath);
  const stat = fs.statSync(currentPath);
  const node = {
    name,
    path: currentPath,
    relativePath: path.relative(rootPath, currentPath) || '.',
    type: stat.isDirectory() ? 'directory' : 'file',
    children: []
  };

  if (!stat.isDirectory() || depth >= maxDepth) return node;

  const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  node.children = entries.map((entry) => buildTree(rootPath, path.join(currentPath, entry.name), depth + 1, maxDepth));
  return node;
}

ipcMain.handle('list-project-files', async (_event, requestedRootPath) => {
  const rootPath = path.resolve(requestedRootPath || currentProjectRoot || __dirname);
  try {
    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
      return { success: false, reason: 'invalid_project_root', rootPath };
    }
    setCurrentProjectRoot(rootPath);
    const tree = buildTree(rootPath, rootPath, 0, 4);
    return { success: true, rootPath, tree };
  } catch (error) {
    return { success: false, reason: error.message, rootPath };
  }
});


ipcMain.handle('resolve-scene-resource', async (_event, payload = {}) => {
  const resourcePath = typeof payload.resourcePath === 'string' ? payload.resourcePath.trim() : '';
  if (!resourcePath) {
    return { success: true, exists: false, resolvedPath: '' };
  }

  try {
    const normalizedPath = stripResPrefix(resourcePath);
    const rootPath = getProjectRoot();
    const resolvedPath = path.resolve(rootPath, normalizedPath);
    if (!isSubPath(rootPath, resolvedPath)) {
      return { success: false, exists: false, resolvedPath: '', reason: 'outside_project_root' };
    }
    return {
      success: true,
      exists: fs.existsSync(resolvedPath),
      resolvedPath,
      resPath: makeResRelativePath(resolvedPath)
    };
  } catch (error) {
    return { success: false, exists: false, resolvedPath: '', reason: error.message };
  }
});

ipcMain.handle('read-project-asset', async (_event, payload = {}) => {
  const rawResourcePath = typeof payload.resourcePath === 'string' ? payload.resourcePath.trim() : '';
  const resourcePath = stripResPrefix(rawResourcePath);
  if (!resourcePath) {
    return { success: false, reason: 'missing_resource_path' };
  }

  try {
    const rootPath = getProjectRoot();
    const resolvedPath = path.resolve(rootPath, resourcePath);
    if (!isSubPath(rootPath, resolvedPath)) {
      return { success: false, reason: 'outside_project_root' };
    }
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, reason: 'not_found' };
    }
    return {
      success: true,
      filePath: resolvedPath,
      resPath: makeResRelativePath(resolvedPath),
      dataUrl: filePathToDataUrl(resolvedPath)
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});


ipcMain.handle('get-startup-state', async () => {
  try {
    return { success: true, ...getStartupState() };
  } catch (error) {
    return { success: false, reason: error.message, recentScenes: [], recoveries: [] };
  }
});

ipcMain.handle('write-autosave', async (_event, payload = {}) => {
  try {
    const recovery = writeRecoveryAutosave(payload);
    return { success: true, recovery };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('load-recovery', async (_event, recoveryId) => {
  try {
    return loadRecoveryPayload(recoveryId);
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('discard-recovery', async (_event, recoveryId) => {
  try {
    const removed = removeRecoveryEntryById(recoveryId);
    return { success: true, removed };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});


function ensurePathInsideProject(targetPath) {
  const rootPath = getProjectRoot();
  const resolvedPath = path.resolve(targetPath);
  if (!isSubPath(rootPath, resolvedPath)) throw new Error('outside_project_root');
  return resolvedPath;
}

function getImportDialogConfig(assetType = 'image') {
  const normalized = String(assetType || 'image').trim().toLowerCase();
  if (normalized === 'audio') {
    return {
      title: 'Import Audio Asset',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] }]
    };
  }
  if (normalized === 'json') {
    return {
      title: 'Import JSON Asset',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    };
  }
  return {
    title: 'Import Image Asset',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
  };
}

function sanitizeRokuComponentName(name) {
  return String(name || 'NewComponent')
    .trim()
    .replace(/\.[^.]+$/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'NewComponent';
}

function ensureDefaultScriptParent(kind, requestedParentPath) {
  const rootPath = getProjectRoot();
  const resolvedParentPath = path.resolve(requestedParentPath || rootPath);
  const isRootSelection = resolvedParentPath === rootPath;
  if (kind === 'scene' && isRootSelection) {
    return ensureDir(path.join(rootPath, 'components', 'screens'));
  }
  if (kind === 'roku_component' && isRootSelection) {
    return ensureDir(path.join(rootPath, 'components'));
  }
  if (kind === 'scene_hud_component' && isRootSelection) {
    return ensureDir(path.join(rootPath, 'components', 'screens'));
  }
  if (kind === 'task_component' && isRootSelection) {
    return ensureDir(path.join(rootPath, 'components', 'tasks'));
  }
  if (kind === 'brightscript' && isRootSelection) {
    return ensureDir(path.join(rootPath, 'source'));
  }
  if (kind === 'main_script' && isRootSelection) {
    return ensureDir(path.join(rootPath, 'source'));
  }
  return resolvedParentPath;
}

function buildRokuComponentTemplate(componentName, scriptFilename) {
  return `<?xml version="1.0" encoding="utf-8" ?>
<component name="${componentName}" extends="Group">
  <script type="text/brightscript" uri="pkg:/components/${scriptFilename}" />

  <interface>
    <field id="ready" type="boolean" alwaysNotify="true" />
  </interface>

  <children>
    <!-- Add Roku SceneGraph child nodes here -->
  </children>
</component>
`;
}

function buildRokuBrightScriptTemplate(scriptName) {
  return `' ${scriptName}

sub init()
  m.top.ready = true
end sub
`;
}

function buildPlainBrightScriptTemplate(scriptName) {
  const baseName = buildScriptHookBaseName(scriptName || 'script.brs');
  return `' ${scriptName}
' ScriptComponent hook convention:
'   ${baseName}_Ready(context)
'   ${baseName}_Init(context)
'   ${baseName}_PreUpdate(context)
'   ${baseName}_PhysicsUpdate(context)
'   ${baseName}_Update(context)
'   ${baseName}_LateUpdate(context)
'   ${baseName}_PostUpdate(context)
'   ${baseName}_Input(context)
'   ${baseName}_SceneEnter(context)
'   ${baseName}_SceneExit(context)
'   ${baseName}_Collision(context)
'   ${baseName}_CollisionEnter(context)
'   ${baseName}_CollisionStay(context)
'   ${baseName}_CollisionExit(context)

sub ${baseName}_Ready(context as Object)
  ' Runs once when the node first becomes ready.
end sub

sub ${baseName}_Init(context as Object)
  ' Legacy alias for Ready.
end sub

sub ${baseName}_PreUpdate(context as Object)
  ' Runs before fixed and variable simulation work for the frame.
end sub

sub ${baseName}_PhysicsUpdate(context as Object)
  ' Runs once per fixed simulation step.
end sub

sub ${baseName}_Update(context as Object)
  ' Runs once per rendered frame after fixed-step simulation.
end sub

sub ${baseName}_LateUpdate(context as Object)
  ' Runs after normal Update for post-move adjustments.
end sub

sub ${baseName}_PostUpdate(context as Object)
  ' Runs after late update and collision finalization.
end sub

sub ${baseName}_Input(context as Object)
  ' context.extra.code contains the Roku button code.
end sub

sub ${baseName}_SceneEnter(context as Object)
end sub

sub ${baseName}_SceneExit(context as Object)
end sub

sub ${baseName}_Collision(context as Object)
  ' context.extra.otherNodeId contains the other collider node id.
  ' context.extra.phase contains CollisionEnter / CollisionStay / CollisionExit.
end sub

sub ${baseName}_CollisionEnter(context as Object)
end sub

sub ${baseName}_CollisionStay(context as Object)
end sub

sub ${baseName}_CollisionExit(context as Object)
end sub
`;
}


function buildTaskComponentTemplate(componentName, scriptUri) {
  return `<?xml version="1.0" encoding="utf-8" ?>
<component name="${componentName}" extends="Task">
  <script type="text/brightscript" uri="${scriptUri}" />

  <interface>
    <field id="result" type="assocarray" alwaysNotify="true" />
    <field id="errorMessage" type="string" alwaysNotify="true" />
  </interface>
</component>
`;
}

function buildTaskBrightScriptTemplate(scriptName) {
  return `' ${scriptName}

sub init()
  m.top.functionName = "run"
end sub

sub run()
  m.top.result = {}
end sub
`;
}


function writeRuntimeProjectSettings(projectRoot, settings = {}) {
  const normalizedRoot = path.resolve(projectRoot || getProjectRoot() || __dirname);
  const normalized = normalizeProjectSettings(settings, normalizedRoot);
  ensureDir(path.join(normalizedRoot, 'assets'));
  fs.writeFileSync(path.join(normalizedRoot, 'assets', 'project_settings.json'), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function writeProjectMainScript(projectRoot, settings = {}, startupSceneName = 'MainScene') {
  const normalizedRoot = path.resolve(projectRoot || getProjectRoot() || __dirname);
  ensureDir(path.join(normalizedRoot, 'source'));
  const mainPath = path.join(normalizedRoot, 'source', 'main.brs');
  let resolvedStartupScene = String(startupSceneName || '').trim();
  if ((!resolvedStartupScene || resolvedStartupScene === 'MainScene') && fs.existsSync(mainPath)) {
    const currentSource = fs.readFileSync(mainPath, 'utf8');
    const existingStartupScene = extractStartupSceneName(currentSource);
    if (existingStartupScene) resolvedStartupScene = existingStartupScene;
  }
  if (!resolvedStartupScene) resolvedStartupScene = 'MainScene';
  writeRuntimeProjectSettings(normalizedRoot, settings);
  writeClassicRuntimeFiles(normalizedRoot, {
    startupSceneName: resolvedStartupScene,
    projectName: settings.projectName || path.basename(normalizedRoot) || 'RokuEngine Game'
  });
  syncProjectRuntimeScripts(normalizedRoot);
  return mainPath;
}

function buildManifestContent(options = {}) {
  const title = String(options.title || 'RokuEngine Game').trim() || 'RokuEngine Game';
  const major = Number.isFinite(Number(options.majorVersion)) ? Number(options.majorVersion) : 1;
  const minor = Number.isFinite(Number(options.minorVersion)) ? Number(options.minorVersion) : 0;
  return `title=${title}
major_version=${major}
minor_version=${minor}
build_version=1
mm_icon_focus_hd=pkg:/images/StoreLogo.png
mm_icon_focus_sd=pkg:/images/StoreLogo.png
splash_screen_hd=pkg:/images/SplashScreen.png
splash_screen_sd=pkg:/images/SplashScreen.png
ui_resolutions=hd
`;
}

function walkFilesRecursive(dirPath, visit) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFilesRecursive(fullPath, visit);
    } else if (entry.isFile()) {
      visit(fullPath);
    }
  }
}

function sanitizeBrightScriptIdentifier(value = '') {
  return String(value || '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^([^A-Za-z_]+)/, '') || 'Script';
}

function buildScriptHookBaseName(projectRelativePath = '') {
  const normalized = normalizeRelativePath(projectRelativePath).replace(/^\/+/, '');
  const withoutExt = normalized.replace(/\.brs$/i, '');
  return `RokuScript_${sanitizeBrightScriptIdentifier(withoutExt)}`;
}

function buildUserScriptRegistrySource(scriptEntries = []) {
  const lines = [
    "' user_scripts_registry.brs - generated from project scripts",
    '',
    'function RokuEngine_UserScriptDispatch(scriptPath as String, entryPoint as String, context as Object) as Boolean'
  ];
  if (!scriptEntries.length) {
    lines.push('  return false', 'end function', '');
    return lines.join('\n');
  }
  scriptEntries.forEach((entry, index) => {
    const prefix = index === 0 ? '  if' : '  else if';
    lines.push(`${prefix} scriptPath = ${JSON.stringify(entry.scriptPath)} then`);
    lines.push('    eventKey = LCase(Trim(Str(entryPoint)))');
    const orderedHooks = [
      ['Ready', 'ready'],
      ['Init', 'init'],
      ['SceneEnter', 'sceneenter'],
      ['PreUpdate', 'preupdate'],
      ['PhysicsUpdate', 'physicsupdate'],
      ['Update', 'update'],
      ['LateUpdate', 'lateupdate'],
      ['PostUpdate', 'postupdate'],
      ['Input', 'input'],
      ['SceneExit', 'sceneexit'],
      ['CollisionEnter', 'collisionenter'],
      ['CollisionStay', 'collisionstay'],
      ['CollisionExit', 'collisionexit'],
      ['Collision', 'collision']
    ].filter(([hookName]) => entry.hookMap?.[hookName]);
    if (!orderedHooks.length) {
      lines.push('      return false');
      return;
    }
    orderedHooks.forEach(([hookName, eventKey], hookIndex) => {
      const branch = hookIndex === 0 ? '    if' : '    else if';
      lines.push(`${branch} eventKey = ${JSON.stringify(eventKey)} then`);
      lines.push(`      ${entry.baseName}_${hookName}(context)`);
      lines.push('      return true');
    });
    lines.push('    end if');
  });
  lines.push('  end if', '  return false', 'end function', '');
  return lines.join('\n');
}

function collectProjectBrightScriptFiles(projectRoot) {
  const rootPath = path.resolve(projectRoot || getProjectRoot() || __dirname);
  const scriptRoots = [
    path.join(rootPath, 'components'),
    path.join(rootPath, 'source')
  ];
  const entries = [];
  const seen = new Set();
  scriptRoots.forEach((scriptRoot) => {
    walkFilesRecursive(scriptRoot, (fullPath) => {
      if (!/\.brs$/i.test(fullPath)) return;
      const normalizedRelative = normalizeRelativePath(path.relative(rootPath, fullPath));
      if (!normalizedRelative || seen.has(normalizedRelative)) return;
      if (/^source\/main\.brs$/i.test(normalizedRelative)) return;
      if (/^source\/engine\//i.test(normalizedRelative)) return;
      if (/^source\/game_scripts\//i.test(normalizedRelative)) return;
      seen.add(normalizedRelative);
      const baseName = buildScriptHookBaseName(normalizedRelative);
      const sourceText = fs.readFileSync(fullPath, 'utf8');
      const hookMap = {
        Ready: sourceText.includes(`${baseName}_Ready`),
        Init: sourceText.includes(`${baseName}_Init`),
        SceneEnter: sourceText.includes(`${baseName}_SceneEnter`),
        PreUpdate: sourceText.includes(`${baseName}_PreUpdate`),
        PhysicsUpdate: sourceText.includes(`${baseName}_PhysicsUpdate`),
        Update: sourceText.includes(`${baseName}_Update`),
        LateUpdate: sourceText.includes(`${baseName}_LateUpdate`),
        PostUpdate: sourceText.includes(`${baseName}_PostUpdate`),
        Input: sourceText.includes(`${baseName}_Input`),
        SceneExit: sourceText.includes(`${baseName}_SceneExit`),
        Collision: sourceText.includes(`${baseName}_Collision`),
        CollisionEnter: sourceText.includes(`${baseName}_CollisionEnter`),
        CollisionStay: sourceText.includes(`${baseName}_CollisionStay`),
        CollisionExit: sourceText.includes(`${baseName}_CollisionExit`)
      };
      const hasAnyHookFunctions = Object.values(hookMap).some(Boolean);
      entries.push({
        absolutePath: fullPath,
        relativePath: normalizedRelative,
        scriptPath: `res://${normalizedRelative}`,
        baseName,
        hookMap,
        hasAnyHookFunctions,
        exportRelativePath: `source/game_scripts/${sanitizeBrightScriptIdentifier(normalizedRelative.replace(/\.brs$/i, ''))}.brs`
      });
    });
  });
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}

function syncProjectRuntimeScripts(projectRoot) {
  const rootPath = path.resolve(projectRoot || getProjectRoot() || __dirname);
  const scriptEntries = collectProjectBrightScriptFiles(rootPath);
  const runtimeScriptsRoot = path.join(rootPath, 'source', 'game_scripts');
  ensureDir(runtimeScriptsRoot);
  const expectedPaths = new Set();
  scriptEntries.forEach((entry) => {
    const targetPath = path.join(rootPath, entry.exportRelativePath);
    expectedPaths.add(path.resolve(targetPath));
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(entry.absolutePath, targetPath);
  });
  if (fs.existsSync(runtimeScriptsRoot)) {
    walkFilesRecursive(runtimeScriptsRoot, (fullPath) => {
      const resolved = path.resolve(fullPath);
      if (!expectedPaths.has(resolved) && /\.brs$/i.test(fullPath)) fs.rmSync(fullPath, { force: true });
    });
  }
  fs.writeFileSync(
    path.join(rootPath, 'source', 'engine', 'user_scripts_registry.brs'),
    buildUserScriptRegistrySource(scriptEntries.filter((entry) => entry.hasAnyHookFunctions)),
    'utf8'
  );
  return scriptEntries;
}

function copyProjectBrightScriptFiles(projectRoot, exportRoot) {
  const scriptEntries = collectProjectBrightScriptFiles(projectRoot);
  scriptEntries.forEach((entry) => {
    const targetPath = path.join(exportRoot, entry.exportRelativePath);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(entry.absolutePath, targetPath);
  });
  fs.writeFileSync(
    path.join(exportRoot, 'source', 'engine', 'user_scripts_registry.brs'),
    buildUserScriptRegistrySource(scriptEntries.filter((entry) => entry.hasAnyHookFunctions)),
    'utf8'
  );
  return scriptEntries;
}

function writeExportMetadata(exportRoot, metadata = {}) {
  fs.writeFileSync(path.join(exportRoot, 'rokuengine-export.json'), JSON.stringify(metadata, null, 2), 'utf8');
}

ipcMain.handle('import-project-asset', async (_event, payload = {}) => {
  const assetType = String(payload.assetType || 'image').trim().toLowerCase();
  const dialogConfig = getImportDialogConfig(assetType);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: dialogConfig.title,
    filters: dialogConfig.filters,
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { success: false, reason: 'canceled' };
  try {
    const sourcePath = result.filePaths[0];
    const insideProject = !!makeResRelativePath(sourcePath);
    let importedAsset = null;
    if (!insideProject) {
      const targetChoice = await chooseImportTarget(sourcePath, { assetKind: assetType });
      if (!targetChoice.success) return { success: false, reason: targetChoice.reason || 'canceled' };
      importedAsset = importFileIntoProject(sourcePath, { targetPath: targetChoice.filePath, assetKind: assetType });
    }
    const finalPath = importedAsset?.absolutePath || path.resolve(sourcePath);
    const resPath = importedAsset?.resPath || makeResRelativePath(finalPath);
    return {
      success: true,
      filePath: finalPath,
      resPath,
      imported: !!importedAsset,
      assetType,
      dataUrl: filePathToDataUrl(finalPath)
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('create-project-item', async (_event, payload = {}) => {
  try {
    const kind = String(payload.kind || '').trim().toLowerCase();
    const requestedParentPath = ensurePathInsideProject(payload.parentPath || getProjectRoot());
    const parentPath = ensurePathInsideProject(ensureDefaultScriptParent(kind, requestedParentPath));
    const name = String(payload.name || '').trim();
    if (!name) return { success: false, reason: 'missing_name' };
    if (!kind) return { success: false, reason: 'missing_kind' };

    let filename = name;
    if (kind === 'scene' && !/\.(rkscene|json)$/i.test(filename)) filename += '.rkscene';
    if (kind === 'brightscript' && !/\.brs$/i.test(filename)) filename += '.brs';
    if (kind === 'main_script') filename = 'main.brs';
    if (kind === 'roku_component' && !/\.(xml|brs)$/i.test(filename)) filename += '.xml';
    if (kind === 'scene_hud_component' && !/\.(xml|brs)$/i.test(filename)) filename += '.xml';
    if (kind === 'task_component' && !/\.(xml|brs)$/i.test(filename)) filename += '.xml';

    const targetPath = ensurePathInsideProject(path.join(parentPath, filename));
    if (fs.existsSync(targetPath)) return { success: false, reason: 'already_exists' };

    if (kind === 'folder') {
      ensureDir(targetPath);
    } else if (kind === 'scene') {
      const sceneName = path.basename(targetPath, path.extname(targetPath));
      const rootNodeId = crypto.randomUUID();
      const runtime = {
        formatVersion: 2,
        scene: { name: sceneName, rootNodeId },
        nodes: [{
          id: rootNodeId,
          type: 'SceneRoot',
          name: sceneName,
          parentId: null,
          children: [],
          visible: true,
          locked: false,
          zIndex: 0,
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
          properties: {},
          metadata: {}
        }]
      };
      const editorState = {
        editorVersion: 1,
        selection: [],
        expandedTreeNodes: [rootNodeId],
        viewport: { x: 0, y: 0, scale: 1 },
        spritesheets: [],
        recentInspectorSections: {},
        spriteFramesLibraries: [],
        selectedSheetId: null,
        selectedSpriteFramesId: null
      };
      fs.writeFileSync(targetPath, JSON.stringify(runtime, null, 2), 'utf8');
      fs.writeFileSync(getEditStatePath(targetPath), JSON.stringify(editorState, null, 2), 'utf8');
    } else if (kind === 'brightscript') {
      const scriptName = path.basename(targetPath);
      fs.writeFileSync(targetPath, buildPlainBrightScriptTemplate(normalizeRelativePath(path.relative(getProjectRoot(), targetPath))), 'utf8');
      syncProjectRuntimeScripts(getProjectRoot());
    } else if (kind === 'main_script') {
      const scriptName = path.basename(targetPath, path.extname(targetPath));
      if (fs.existsSync(targetPath)) return { success: false, reason: 'already_exists' };
      fs.writeFileSync(targetPath, buildMainBrightScriptTemplate('MainScene', readProjectSettings(getProjectRoot()).projectName), 'utf8');
    } else if (kind === 'roku_component' || kind === 'scene_hud_component' || kind === 'task_component') {
      const componentName = sanitizeRokuComponentName(path.basename(targetPath, path.extname(targetPath)));
      const xmlPath = ensurePathInsideProject(path.join(parentPath, `${componentName}.xml`));
      const brsPath = ensurePathInsideProject(path.join(parentPath, `${componentName}.brs`));
      if (fs.existsSync(xmlPath) || fs.existsSync(brsPath)) return { success: false, reason: 'already_exists' };
      let scriptUri = `pkg:/${normalizeRelativePath(path.relative(getProjectRoot(), brsPath))}`;
      let xml = buildRokuComponentTemplate(componentName, normalizeRelativePath(path.relative(path.join(getProjectRoot(), 'components'), brsPath)));
      let brs = buildRokuBrightScriptTemplate(`${componentName}.brs`);
      if (kind === 'scene_hud_component') {
        xml = `<?xml version="1.0" encoding="utf-8" ?>
<component name="${componentName}" extends="Group">
  <script type="text/brightscript" uri="${scriptUri}" />
  <children>
    <Label id="titleLabel" text="${componentName}" translation="[32,32]" />
  </children>
</component>
`;
      } else if (kind === 'task_component') {
        xml = buildTaskComponentTemplate(componentName, scriptUri);
        brs = buildTaskBrightScriptTemplate(`${componentName}.brs`);
      }
      fs.writeFileSync(xmlPath, xml, 'utf8');
      fs.writeFileSync(brsPath, brs, 'utf8');
      syncProjectRuntimeScripts(getProjectRoot());
      notifyProjectFilesChanged();
      return {
        success: true,
        path: xmlPath,
        auxPath: brsPath,
        name: path.basename(xmlPath),
        auxName: path.basename(brsPath),
        kind
      };
    } else {
      return { success: false, reason: 'unsupported_kind' };
    }

    notifyProjectFilesChanged();
    return { success: true, path: targetPath, name: path.basename(targetPath), kind };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('rename-project-item', async (_event, payload = {}) => {
  try {
    const currentPath = ensurePathInsideProject(payload.path || '');
    const nextName = String(payload.newName || '').trim();
    if (!nextName) return { success: false, reason: 'missing_new_name' };
    const nextPath = ensurePathInsideProject(path.join(path.dirname(currentPath), nextName));
    if (fs.existsSync(nextPath)) return { success: false, reason: 'already_exists' };
    fs.renameSync(currentPath, nextPath);
    const currentEditStatePath = getEditStatePath(currentPath);
    if (fs.existsSync(currentEditStatePath)) {
      const nextEditStatePath = getEditStatePath(nextPath);
      if (!fs.existsSync(nextEditStatePath)) fs.renameSync(currentEditStatePath, nextEditStatePath);
    }
    syncProjectRuntimeScripts(getProjectRoot());
    notifyProjectFilesChanged();
    return { success: true, oldPath: currentPath, path: nextPath, name: path.basename(nextPath) };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('delete-project-item', async (_event, payload = {}) => {
  try {
    const targetPath = ensurePathInsideProject(payload.path || '');
    if (!fs.existsSync(targetPath)) return { success: false, reason: 'not_found' };
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true });
    else fs.rmSync(targetPath, { force: true });
    const editStatePath = getEditStatePath(targetPath);
    if (fs.existsSync(editStatePath)) fs.rmSync(editStatePath, { force: true });
    syncProjectRuntimeScripts(getProjectRoot());
    notifyProjectFilesChanged();
    return { success: true, path: targetPath };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('read-text-file', async (_event, payload = {}) => {
  try {
    const resourcePath = typeof payload.resourcePath === 'string' ? payload.resourcePath.trim() : '';
    const resolvedPath = resourcePath.startsWith('res://')
      ? ensurePathInsideProject(path.join(getProjectRoot(), stripResPrefix(resourcePath)))
      : ensurePathInsideProject(payload.path || '');
    if (!fs.existsSync(resolvedPath)) return { success: false, reason: 'not_found' };
    return {
      success: true,
      filePath: resolvedPath,
      resPath: makeResRelativePath(resolvedPath),
      text: fs.readFileSync(resolvedPath, 'utf8')
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('choose-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Project Folder',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return { success: false, reason: 'canceled' };
  }

  setCurrentProjectRoot(path.resolve(result.filePaths[0]));
  return { success: true, rootPath: currentProjectRoot };
});

ipcMain.handle('export-roku-project', async (_event, payload = {}) => {
  let exportRoot = '';
  try {
    const projectRoot = path.resolve(String(payload.projectRoot || getProjectRoot() || __dirname));
    const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
    if (!scenes.length) return { success: false, reason: 'missing_scenes' };

    const bundleBaseName = getExportBundleBaseName(payload.projectTitle || path.basename(projectRoot), projectRoot);
    const buildRoot = path.join(projectRoot, 'build');
    const stagingRoot = path.join(buildRoot, `${bundleBaseName}-roku-staging`);
    const defaultZipPath = path.join(buildRoot, `${bundleBaseName}.zip`);
    ensureDir(buildRoot);

    const chosen = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Game Zip',
      defaultPath: defaultZipPath,
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      properties: ['createDirectory']
    });
    if (chosen.canceled || !chosen.filePath) return { success: false, reason: 'canceled' };
    const zipPath = /\.zip$/i.test(chosen.filePath) ? path.resolve(chosen.filePath) : path.resolve(`${chosen.filePath}.zip`);

    removeDirectoryRecursive(stagingRoot);
    exportRoot = stagingRoot;
    ensureDir(exportRoot);
    ensureDir(path.join(exportRoot, 'source'));
    ensureDir(path.join(exportRoot, 'images'));
    ensureDir(path.join(exportRoot, 'audio'));
    ensureDir(path.join(exportRoot, 'assets'));
    ensureDir(path.join(exportRoot, 'assets', 'scenes'));
    ensureDir(path.join(exportRoot, 'assets', 'images'));
    ensureDir(path.join(exportRoot, 'assets', 'audio'));
    ensureDir(path.join(exportRoot, 'assets', 'spritesheets'));

    const exportedScenes = [];
    const copyPairs = [
      ['assets', 'assets'],
      ['images', 'images'],
      ['audio', 'audio']
    ];
    for (const [fromRel, toRel] of copyPairs) {
      copyDirectoryRecursive(path.join(projectRoot, fromRel), path.join(exportRoot, toRel));
    }

    const metadataFiles = buildClassicExportMetadataFiles(scenes, { projectRoot, exportOptions: payload.exportOptions || { bakeTerrain: true } });
    for (const sceneEntry of metadataFiles.scenePayloads) {
      fs.writeFileSync(path.join(exportRoot, 'assets', 'scenes', `${sceneEntry.sceneName}.json`), sceneEntry.json, 'utf8');
      if (!exportedScenes.includes(sceneEntry.sceneName)) exportedScenes.push(sceneEntry.sceneName);
    }
    if (!exportedScenes.length) return { success: false, reason: 'no_exportable_scenes' };

    fs.writeFileSync(path.join(exportRoot, 'assets', 'spriteframes.json'), metadataFiles.spriteframesJson, 'utf8');
    fs.writeFileSync(path.join(exportRoot, 'assets', 'spritesheets.json'), metadataFiles.spritesheetsJson, 'utf8');
    fs.writeFileSync(path.join(exportRoot, 'assets', 'tilesets.json'), metadataFiles.tilesetsJson, 'utf8');
    fs.writeFileSync(path.join(exportRoot, 'assets', 'audio.json'), metadataFiles.audioJson, 'utf8');
    fs.writeFileSync(path.join(exportRoot, 'assets', 'resources.json'), metadataFiles.resourcesJson, 'utf8');
    fs.writeFileSync(path.join(exportRoot, 'assets', 'project_settings.json'), JSON.stringify(normalizeProjectSettings(readProjectSettings(projectRoot), projectRoot), null, 2), 'utf8');

    fs.writeFileSync(path.join(exportRoot, 'manifest'), buildManifestContent({
      title: payload.projectTitle || path.basename(projectRoot),
      majorVersion: payload.majorVersion,
      minorVersion: payload.minorVersion
    }), 'utf8');
    writeClassicRuntimeFiles(exportRoot, {
      startupSceneName: exportedScenes[0] || 'MainScene',
      projectName: payload.projectTitle || path.basename(projectRoot)
    });
    const exportedScriptEntries = copyProjectBrightScriptFiles(projectRoot, exportRoot);

    writeExportMetadata(exportRoot, {
      scriptCount: exportedScriptEntries.length,
      exportedAt: new Date().toISOString(),
      projectRoot,
      runtime: 'classic-2d',
      renderer: 'roScreen+roCompositor',
      sceneCount: exportedScenes.length,
      scenes: exportedScenes,
      zipPath,
      warnings: metadataFiles.warnings || [],
      exportOptions: payload.exportOptions || { bakeTerrain: true }
    });

    zipDirectoryContents(exportRoot, zipPath);
    return { success: true, exportRoot, zipPath, scenes: exportedScenes, runtime: 'classic-2d' };
  } catch (error) {
    return { success: false, reason: error.message };
  } finally {
    if (exportRoot) removeDirectoryRecursive(exportRoot);
  }
});


ipcMain.handle('open-in-explorer', async (_event, targetPath) => {
  if (!targetPath) return { success: false, reason: 'missing_target_path' };
  try {
    const absolutePath = path.resolve(String(targetPath));
    await shell.openPath(absolutePath);
    return { success: true, path: absolutePath };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});


ipcMain.handle('open-project-settings', async () => {
  try {
    createSettingsWindow();
    return { success: true };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('get-project-settings', async (_event, projectRoot) => {
  try {
    const normalizedRoot = path.resolve(projectRoot || getProjectRoot() || __dirname);
    const settings = readProjectSettings(normalizedRoot);
    return { success: true, projectRoot: normalizedRoot, settings };
  } catch (error) {
    return { success: false, reason: error.message, settings: defaultProjectSettings(projectRoot) };
  }
});

ipcMain.handle('save-project-settings', async (_event, payload = {}) => {
  try {
    const projectRoot = path.resolve(String(payload.projectRoot || getProjectRoot() || __dirname));
    const settings = writeProjectSettings(projectRoot, payload.settings || {});
    writeProjectMainScript(projectRoot, settings, String(payload.startupSceneName || '').trim() || 'MainScene');
    notifyProjectSettingsUpdated(projectRoot, settings);
    return { success: true, projectRoot, settings };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('create-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Create or Choose New Project Folder',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return { success: false, reason: 'canceled' };
  }

  try {
    const rootPath = path.resolve(result.filePaths[0]);
    ensureDir(rootPath);
    ensureDir(path.join(rootPath, 'assets'));
    ensureDir(path.join(rootPath, 'assets', 'images'));
    ensureDir(path.join(rootPath, 'assets', 'audio'));
    ensureDir(path.join(rootPath, 'assets', 'spritesheets'));
    ensureDir(path.join(rootPath, 'assets', 'imported'));
    ensureDir(path.join(rootPath, 'components'));
    ensureDir(path.join(rootPath, 'components', 'screens'));
    ensureDir(path.join(rootPath, 'components', 'tasks'));
    ensureDir(path.join(rootPath, 'source'));
    ensureDir(path.join(rootPath, 'source', 'game_scripts'));
    const settings = writeProjectSettings(rootPath, { ...defaultProjectSettings(rootPath), engineVersion: ENGINE_VERSION });
    writeProjectMainScript(rootPath, settings, 'MainScene');
    setCurrentProjectRoot(rootPath);
    notifyProjectSettingsUpdated(rootPath, settings);
    touchRecentProject(rootPath);
    return { success: true, rootPath: currentProjectRoot, settings };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SIDELOAD — IPC handlers and helpers
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.handle('open-sideload-window', async () => {
  try { createSideloadWindow(); return { success: true }; }
  catch (error) { return { success: false, reason: error.message }; }
});

ipcMain.handle('sideload-ping', async (_event, payload = {}) => {
  const ip = String(payload.ip || '').trim();
  if (!ip) return { success: false, reason: 'missing_ip' };
  const t0 = Date.now();
  return new Promise((resolve) => {
    const req = http.get(`http://${ip}:80/`, { timeout: 4000 }, (res) => {
      res.resume();
      resolve({ success: true, ms: Date.now() - t0, statusCode: res.statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve({ success: false, reason: 'timeout' }); });
    req.on('error',   (e) => { resolve({ success: false, reason: e.message }); });
  });
});

ipcMain.handle('sideload-build', async (_event, payload = {}) => {
  try {
    const projectRoot = path.resolve(getProjectRoot() || __dirname);
    const sceneFiles  = sideloadGatherScenes(projectRoot);
    if (!sceneFiles.length) return { success: false, reason: 'no_scenes_found' };

    const bundleName  = getExportBundleBaseName(path.basename(projectRoot), projectRoot);
    const buildRoot   = path.join(projectRoot, 'build');
    const stagingRoot = path.join(buildRoot, `${bundleName}-sideload-staging`);
    const zipPath     = path.join(buildRoot, `${bundleName}-sideload.zip`);

    ensureDir(buildRoot);
    sideloadRmrf(stagingRoot);
    ensureDir(stagingRoot);
    for (const sub of ['assets', 'images', 'audio']) {
      sideloadCopyDir(path.join(projectRoot, sub), path.join(stagingRoot, sub));
    }
    ensureDir(path.join(stagingRoot, 'source'));
    ensureDir(path.join(stagingRoot, 'assets', 'scenes'));

    const projectSettings = normalizeProjectSettings(readProjectSettings(projectRoot), projectRoot);
    const metadataFiles   = buildClassicExportMetadataFiles(sceneFiles, {
      projectRoot,
      exportOptions: { bakeTerrain: payload.bakeTerrain !== false },
    });

    const exportedScenes = [];
    for (const scene of metadataFiles.scenePayloads) {
      fs.writeFileSync(
        path.join(stagingRoot, 'assets', 'scenes', `${scene.sceneName}.json`),
        scene.json, 'utf8'
      );
      if (!exportedScenes.includes(scene.sceneName)) exportedScenes.push(scene.sceneName);
    }
    if (!exportedScenes.length) return { success: false, reason: 'no_exportable_scenes' };

    const metaMap = {
      'assets/spriteframes.json':      metadataFiles.spriteframesJson,
      'assets/spritesheets.json':      metadataFiles.spritesheetsJson,
      'assets/tilesets.json':          metadataFiles.tilesetsJson,
      'assets/audio.json':             metadataFiles.audioJson,
      'assets/resources.json':         metadataFiles.resourcesJson,
      'assets/project_settings.json':  JSON.stringify(projectSettings, null, 2),
    };
    for (const [rel, content] of Object.entries(metaMap)) {
      fs.writeFileSync(path.join(stagingRoot, rel), content, 'utf8');
    }

    fs.writeFileSync(
      path.join(stagingRoot, 'manifest'),
      buildManifestContent({
        title:        projectSettings.projectName || path.basename(projectRoot),
        majorVersion: payload.majorVersion || 1,
        minorVersion: payload.minorVersion || 0,
      }),
      'utf8'
    );

    writeClassicRuntimeFiles(stagingRoot, {
      startupSceneName: exportedScenes[0] || 'MainScene',
      projectName:      projectSettings.projectName || path.basename(projectRoot),
    });

    const scriptEntries = copyProjectBrightScriptFiles(projectRoot, stagingRoot);

    sideloadZip(stagingRoot, zipPath);
    sideloadRmrf(stagingRoot);

    const zipStat = fs.existsSync(zipPath) ? fs.statSync(zipPath) : null;
    return {
      success:     true,
      zipPath,
      zipBytes:    zipStat ? zipStat.size : 0,
      scenes:      exportedScenes,
      scriptCount: scriptEntries.length,
      warnings:    metadataFiles.warnings || [],
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
});

ipcMain.handle('sideload-delete', async (_event, payload = {}) => {
  const { ip, user = 'rokudev', pass } = payload;
  if (!ip || !pass) return { success: false, reason: 'missing_ip_or_password' };
  const body = Buffer.from('mysubmit=Delete&archive=');
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  return new Promise((resolve) => {
    const req = http.request({
      hostname: ip, port: 80, path: '/plugin_install', method: 'POST', timeout: 8000,
      headers: {
        'Authorization':  `Basic ${auth}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end',  () => { resolve({ success: true, status: res.statusCode, body: data.substring(0, 300) }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ success: false, reason: 'timeout' }); });
    req.on('error',   (e) => { resolve({ success: false, reason: e.message }); });
    req.write(body);
    req.end();
  });
});

ipcMain.handle('sideload-upload', async (event, payload = {}) => {
  const { ip, user = 'rokudev', pass, zipPath } = payload;
  if (!ip || !pass || !zipPath)    return { success: false, reason: 'missing_params' };
  if (!fs.existsSync(zipPath))     return { success: false, reason: 'zip_not_found: ' + zipPath };

  const zipBuf   = fs.readFileSync(zipPath);
  const auth     = Buffer.from(`${user}:${pass}`).toString('base64');
  const boundary = '----RGESideloadBoundary' + Date.now().toString(16);

  const partHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="mysubmit"\r\n\r\nReplace\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="archive"; filename="channel.zip"\r\n` +
    `Content-Type: application/zip\r\n\r\n`
  );
  const partFooter  = Buffer.from(`\r\n--${boundary}--\r\n`);
  const totalBody   = Buffer.concat([partHeader, zipBuf, partFooter]);
  const totalBytes  = totalBody.length;
  let   sentBytes   = 0;

  return new Promise((resolve) => {
    const req = http.request({
      hostname: ip, port: 80, path: '/plugin_install', method: 'POST', timeout: 120000,
      headers: {
        'Authorization':  `Basic ${auth}`,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalBytes,
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end',  () => {
        const ok = res.statusCode === 200;
        resolve({ success: ok, status: res.statusCode, bytes: sentBytes,
          reason: ok ? undefined : `HTTP ${res.statusCode}`, body: body.substring(0, 500) });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ success: false, reason: 'upload_timeout' }); });
    req.on('error',   (e) => { resolve({ success: false, reason: e.message }); });

    const CHUNK = 65536;
    let offset = 0;
    function writeChunk() {
      if (offset >= totalBody.length) { req.end(); return; }
      const slice = totalBody.slice(offset, offset + CHUNK);
      offset    += slice.length;
      sentBytes += slice.length;
      const pct = Math.round((sentBytes / totalBytes) * 100);
      if (sideloadWindow && !sideloadWindow.isDestroyed()) {
        sideloadWindow.webContents.send('sideload-progress', {
          percent:     pct / 100,
          transferred: `${sideloadFmtBytes(sentBytes)} / ${sideloadFmtBytes(totalBytes)}`,
        });
      }
      const ok = req.write(slice);
      if (ok) setImmediate(writeChunk);
      else req.once('drain', writeChunk);
    }
    writeChunk();
  });
});

// ── Sideload helpers ──────────────────────────────────────────────────────────

function sideloadGatherScenes(projectRoot) {
  const seen    = new Map();
  const scenesDir = path.join(projectRoot, 'assets', 'scenes');
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(rkscene|json)$/i.test(entry.name)) continue;
      try {
        const doc   = JSON.parse(fs.readFileSync(full, 'utf8'));
        const sName = doc.sceneState?.scene?.name || path.basename(entry.name, path.extname(entry.name));
        if (!seen.has(sName)) seen.set(sName, { filePath: full, sceneName: sName, doc });
      } catch (_) { /* skip malformed */ }
    }
  };
  walk(scenesDir);
  walk(projectRoot);
  return [...seen.values()];
}

function sideloadCopyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) sideloadCopyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function sideloadRmrf(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (_) {
    for (const e of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, e.name);
      if (e.isDirectory()) sideloadRmrf(full);
      else fs.unlinkSync(full);
    }
    fs.rmdirSync(dirPath);
  }
}

function sideloadZip(srcDir, destZip) {
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip);
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${destZip}'`,
    ], { timeout: 60000 });
  } else {
    execFileSync('zip', ['-r', destZip, '.'], { cwd: srcDir, timeout: 60000 });
  }
}

function sideloadFmtBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024)    return Math.round(b / 1024) + ' KB';
  return b + ' B';
}



/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
