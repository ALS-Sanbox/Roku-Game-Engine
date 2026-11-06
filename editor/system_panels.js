(function () {
  const root = globalThis.RGE_ROOT || window;
  let syncTimer = null, fingerprint = '';
  const memory = new root.RGEMemoryInspectorPanel.MemoryInspectorPanel();
  function snapshot() {
    return typeof window.getMemoryAssetSnapshot === 'function' ? window.getMemoryAssetSnapshot() : { assets: [] };
  }
  function syncAssets() {
    const data = snapshot(), signature = JSON.stringify(data);
    if (signature === fingerprint) return;
    fingerprint = signature;
    const registry = root.RGEAssetRegistry;
    const current = new Set(data.assets.map(asset => asset.path));
    for (const entry of registry.serialize().entries) if (!current.has(entry.path)) registry.unregister(entry.guid);
    for (const asset of data.assets) registry.register(asset);
  }
  root.RGESystemPanels = {
    syncAssets,
    requestSync() {
      if (!syncTimer) syncTimer = setTimeout(() => { syncTimer = null; syncAssets(); memory._refresh(); }, 200);
    }
  };
  new root.RGEDeploymentPanel.DeploymentPanel().mount(document.getElementById('deployment-panel'));
  root.RGERuntimeDebugConsole.console.mount(document.getElementById('runtime-debug-panel'));
  memory.mount(document.getElementById('memory-panel'));
  window.addEventListener('beforeunload', () => {
    clearTimeout(syncTimer); memory.unmount(); root.RGERuntimeDebugConsole.console.unmount(); root.RGEDeviceBridge.disconnect();
  });
})();
