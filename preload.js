globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('window-close'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  openImageFile: (payload) => ipcRenderer.invoke('open-image-file', payload),
  saveScene: (payload) => ipcRenderer.invoke('save-scene', payload),
  saveSceneDirect: (payload) => ipcRenderer.invoke('save-scene-direct', payload),
  openScene: () => ipcRenderer.invoke('open-scene'),
  openSceneFile: (filePath) => ipcRenderer.invoke('open-scene-file', filePath),
  getStartupState: () => ipcRenderer.invoke('get-startup-state'),
  writeAutosave: (payload) => ipcRenderer.invoke('write-autosave', payload),
  loadRecovery: (recoveryId) => ipcRenderer.invoke('load-recovery', recoveryId),
  discardRecovery: (recoveryId) => ipcRenderer.invoke('discard-recovery', recoveryId),
  listProjectFiles: (rootPath) => ipcRenderer.invoke('list-project-files', rootPath),
  chooseProjectFolder: () => ipcRenderer.invoke('choose-project-folder'),
  openInExplorer: (targetPath) => ipcRenderer.invoke('open-in-explorer', targetPath),
  createProject: () => ipcRenderer.invoke('create-project'),
  getLaunchProject: () => ipcRenderer.invoke('get-launch-project'),
  getProjectManagerState: () => ipcRenderer.invoke('get-project-manager-state'),
  scanProjectsFolder: () => ipcRenderer.invoke('scan-projects-folder'),
  importProject: () => ipcRenderer.invoke('import-project'),
  openProjectInEditor: (projectRoot) => ipcRenderer.invoke('open-project-in-editor', projectRoot),
  renameProjectFolder: (payload) => ipcRenderer.invoke('rename-project-folder', payload),
  duplicateProjectFolder: (payload) => ipcRenderer.invoke('duplicate-project-folder', payload),
  removeProjectFromManager: (projectRoot) => ipcRenderer.invoke('remove-project-from-manager', projectRoot),
  setProjectTags: (payload) => ipcRenderer.invoke('set-project-tags', payload),
  returnToProjectManager: () => ipcRenderer.invoke('return-to-project-manager'),

  openProjectSettings: () => ipcRenderer.invoke('open-project-settings'),
  getProjectSettings: (projectRoot) => ipcRenderer.invoke('get-project-settings', projectRoot),
  saveProjectSettings: (payload) => ipcRenderer.invoke('save-project-settings', payload),
  onProjectSettingsUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('project-settings-updated', listener);
    return () => ipcRenderer.removeListener('project-settings-updated', listener);
  },
  exportRokuProject: (payload) => ipcRenderer.invoke('export-roku-project', payload),
  testInSimulator: (payload) => ipcRenderer.invoke('test-in-simulator', payload),
  importProjectAsset: (payload) => ipcRenderer.invoke('import-project-asset', payload),
  createProjectItem: (payload) => ipcRenderer.invoke('create-project-item', payload),
  renameProjectItem: (payload) => ipcRenderer.invoke('rename-project-item', payload),
  deleteProjectItem: (payload) => ipcRenderer.invoke('delete-project-item', payload),
  readTextFile: (payload) => ipcRenderer.invoke('read-text-file', payload),
  scriptEditorFile: (payload) => ipcRenderer.invoke('script-editor-file', payload),
  resolveSceneResource: (payload) => ipcRenderer.invoke('resolve-scene-resource', payload),
  readProjectAsset: (payload) => ipcRenderer.invoke('read-project-asset', payload),
  onProjectFilesChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('project-files-changed', listener);
    return () => ipcRenderer.removeListener('project-files-changed', listener);
  },

  // ── Sideload ──────────────────────────────────────────────────────────────
  openSideloadWindow: () => ipcRenderer.invoke('open-sideload-window'),
  sideloadPing:   (payload) => ipcRenderer.invoke('sideload-ping',   payload),
  sideloadRestart: payload => ipcRenderer.invoke('sideload-restart', payload),
  sideloadDebugConnect: payload => ipcRenderer.invoke('sideload-debug-connect', payload),
  sideloadDebugDisconnect: () => ipcRenderer.invoke('sideload-debug-disconnect'),
  sideloadScreenshot: payload => ipcRenderer.invoke('sideload-screenshot', payload),
  sideloadBuild:  (payload) => ipcRenderer.invoke('sideload-build',  payload),
  sideloadDelete: (payload) => ipcRenderer.invoke('sideload-delete', payload),
  sideloadUpload: (payload) => ipcRenderer.invoke('sideload-upload', payload),
  onSideloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sideload-progress', listener);
    return () => ipcRenderer.removeListener('sideload-progress', listener);
  },
});

/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
