(function () {
  'use strict';
  const key = 'roku-editor-theme';
  const themes = ['dark', 'light', 'mid'];
  const api = window.electronAPI;
  let revision = 0;
  function apply(theme) {
    const value = themes.includes(theme) ? theme : 'dark';
    document.documentElement.dataset.editorTheme = value;
    try { localStorage.setItem(key, value); } catch (_) {}
    const select = document.getElementById('editor-theme');
    if (select) select.value = value;
  }
  let cached = 'dark';
  try { cached = localStorage.getItem(key); } catch (_) {}
  apply(cached);
  api?.onEditorThemeUpdated?.(theme => { revision++; apply(theme); });
  const initialRevision = revision;
  api?.getEditorTheme?.().then(result => {
    if (result.success && revision === initialRevision) apply(result.theme);
  }).catch(() => {});
  window.addEventListener('storage', event => {
    if (event.key === key) { revision++; apply(event.newValue); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('editor-theme');
    if (!select) return;
    select.value = document.documentElement.dataset.editorTheme;
    select.addEventListener('change', async () => {
      const previous = document.documentElement.dataset.editorTheme;
      const theme = select.value, change = ++revision;
      const status = document.getElementById('editor-theme-status');
      apply(theme);
      try {
        const result = api?.setEditorTheme ? await api.setEditorTheme(theme) : { success: true };
        if (!result.success) throw new Error(result.reason || 'Could not save appearance.');
        if (status) status.textContent = 'Appearance saved. Applies to all projects.';
      } catch (error) {
        if (revision === change) apply(previous);
        if (status) status.textContent = error.message;
      }
    });
  });
})();
