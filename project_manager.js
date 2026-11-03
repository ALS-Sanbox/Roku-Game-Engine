globalThis.RGE_ROOT = globalThis.RGE_ROOT || ((typeof window !== 'undefined') ? window : globalThis);
var RGE_ROOT = globalThis.RGE_ROOT;
const state = {
  engineName: 'RokuEngine',
  engineVersion: 'v24',
  projects: [],
  sortMode: 'lastEdited',
  selectedProjectRootPath: ''
};

const listEl = document.getElementById('pm-project-list');
const emptyEl = document.getElementById('pm-empty-state');
const statusEl = document.getElementById('pm-status');
const countEl = document.getElementById('pm-project-count');
const sortEl = document.getElementById('pm-sort-select');
const sideEmptyEl = document.getElementById('pm-side-empty');
const sideContentEl = document.getElementById('pm-side-content');
const selectedNameEl = document.getElementById('pm-selected-name');
const selectedPathEl = document.getElementById('pm-selected-path');
const selectedFactsEl = document.getElementById('pm-selected-facts');
const selectedTagsEl = document.getElementById('pm-selected-tags');

function setStatus(text) {
  if (statusEl) statusEl.textContent = String(text || 'Ready.');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function sortProjects(projects) {
  const items = [...projects];
  const mode = state.sortMode;
  items.sort((a, b) => {
    if (mode === 'name') return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    if (mode === 'path') return String(a.path || '').localeCompare(String(b.path || ''), undefined, { sensitivity: 'base' });
    return new Date(b.lastEditedAt || 0) - new Date(a.lastEditedAt || 0);
  });
  return items;
}

function getSelectedProject(projects = state.projects) {
  if (!projects.length) return null;
  const selected = projects.find((project) => project.rootPath === state.selectedProjectRootPath);
  return selected || projects[0] || null;
}

function ensureValidSelection(projects = state.projects) {
  const selected = getSelectedProject(projects);
  state.selectedProjectRootPath = selected?.rootPath || '';
  return selected;
}

function renderSelectionPanel() {
  const project = ensureValidSelection();
  const hasProject = Boolean(project);
  sideEmptyEl.classList.toggle('hidden', hasProject);
  sideContentEl.classList.toggle('hidden', !hasProject);
  if (!hasProject) {
    selectedNameEl.textContent = 'Untitled Project';
    selectedPathEl.textContent = '';
    selectedFactsEl.innerHTML = '';
    selectedTagsEl.innerHTML = '';
    return;
  }

  const tags = Array.isArray(project.tags) ? project.tags : [];
  selectedNameEl.textContent = project.name || 'Untitled Project';
  selectedPathEl.textContent = project.path || project.rootPath || '';
  selectedFactsEl.innerHTML = `
    <div>Engine <strong>${escapeHtml(project.engineVersion || state.engineVersion)}</strong></div>
    <div>Last saved <strong>${escapeHtml(formatDateTime(project.lastEditedAt))}</strong></div>
  `;
  selectedTagsEl.innerHTML = tags.length
    ? tags.map((tag) => `<span class="pm-tag">${escapeHtml(tag)}</span>`).join('')
    : '<span class="pm-tag">No tags</span>';
}

function renderProjects() {
  const projects = sortProjects(state.projects || []);
  ensureValidSelection(projects);
  listEl.innerHTML = '';
  countEl.textContent = `${projects.length} project${projects.length === 1 ? '' : 's'}`;
  emptyEl.classList.toggle('hidden', projects.length > 0);
  if (projects.length) {
    const fragment = document.createDocumentFragment();
    projects.forEach((project) => fragment.appendChild(renderProjectRow(project)));
    listEl.appendChild(fragment);
  }
  renderSelectionPanel();
}

function renderProjectRow(project) {
  const row = document.createElement('article');
  const isSelected = project.rootPath === state.selectedProjectRootPath;
  row.className = `pm-project-row${isSelected ? ' is-selected' : ''}`;
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  const tags = Array.isArray(project.tags) ? project.tags : [];
  row.innerHTML = `
    <div class="pm-project-main">
      <div class="pm-project-logo">${escapeHtml(project.logoText || 'P')}</div>
      <div class="pm-project-meta">
        <div class="pm-project-name">${escapeHtml(project.name || 'Untitled Project')}</div>
        <div class="pm-project-path">${escapeHtml(project.path || project.rootPath || '')}</div>
        <div class="pm-project-facts">
          <span><strong>${escapeHtml(project.engineVersion || state.engineVersion)}</strong></span>
          <span>Last saved <strong>${escapeHtml(formatDateTime(project.lastEditedAt))}</strong></span>
        </div>
        ${tags.length ? `<div class="pm-tag-row">${tags.map((tag) => `<span class="pm-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  `;

  const selectProject = () => {
    if (state.selectedProjectRootPath === project.rootPath) return;
    state.selectedProjectRootPath = project.rootPath;
    renderProjects();
  };

  row.addEventListener('click', selectProject);
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectProject();
    }
  });
  row.addEventListener('dblclick', () => {
    state.selectedProjectRootPath = project.rootPath;
    void handleProjectAction(project, 'edit');
  });
  return row;
}

function upsertProject(project) {
  if (!project || !project.rootPath) return;
  const index = state.projects.findIndex((item) => item.rootPath === project.rootPath);
  if (index >= 0) state.projects[index] = project;
  else state.projects.push(project);
  state.selectedProjectRootPath = project.rootPath;
  renderProjects();
}

function removeProject(rootPath) {
  state.projects = state.projects.filter((project) => project.rootPath !== rootPath);
  if (state.selectedProjectRootPath === rootPath) state.selectedProjectRootPath = '';
  renderProjects();
}

async function loadManagerState() {
  setStatus('Loading projects…');
  const result = await window.electronAPI.getProjectManagerState();
  if (!result?.success) {
    setStatus(`Could not load project manager: ${result?.reason || 'Unknown error'}`);
    return;
  }
  state.engineName = result.engineName || state.engineName;
  state.engineVersion = result.engineVersion || state.engineVersion;
  state.projects = Array.isArray(result.projects) ? result.projects : [];
  ensureValidSelection(state.projects);
  document.getElementById('engine-title').textContent = state.engineName;
  document.getElementById('engine-version').textContent = state.engineVersion;
  renderProjects();
  setStatus(`Loaded ${state.projects.length} project${state.projects.length === 1 ? '' : 's'}.`);
}

async function createProject() {
  setStatus('Creating project…');
  const result = await window.electronAPI.createProject();
  if (!result?.success || !result.rootPath) {
    setStatus(result?.reason === 'canceled' ? 'Create project canceled.' : `Could not create project: ${result?.reason || 'Unknown error'}`);
    return;
  }
  await window.electronAPI.openProjectInEditor(result.rootPath);
}

async function importProject() {
  setStatus('Importing project…');
  const result = await window.electronAPI.importProject();
  if (!result?.success || !result.project) {
    setStatus(result?.reason === 'canceled' ? 'Import canceled.' : `Could not import project: ${result?.reason || 'Unknown error'}`);
    return;
  }
  upsertProject(result.project);
  setStatus(`Imported ${result.project.name}.`);
}

async function scanProjects() {
  setStatus('Scanning folder for projects…');
  const result = await window.electronAPI.scanProjectsFolder();
  if (!result?.success) {
    setStatus(result?.reason === 'canceled' ? 'Scan canceled.' : `Could not scan folder: ${result?.reason || 'Unknown error'}`);
    return;
  }
  state.projects = Array.isArray(result.allProjects) ? result.allProjects : state.projects;
  ensureValidSelection(state.projects);
  renderProjects();
  const found = Array.isArray(result.projects) ? result.projects.length : 0;
  setStatus(`Scan complete. Found ${found} project${found === 1 ? '' : 's'} in ${result.folderPath}.`);
}

async function handleProjectAction(project, action) {
  if (!project?.rootPath) return;
  if (action === 'edit') {
    setStatus(`Opening ${project.name}…`);
    const result = await window.electronAPI.openProjectInEditor(project.rootPath);
    if (!result?.success) setStatus(`Could not open project: ${result?.reason || 'Unknown error'}`);
    return;
  }
  if (action === 'export') {
    setStatus(`Exporting ${project.name}…`);
    const result = await window.electronAPI.exportRokuProject({ projectRoot: project.rootPath, projectTitle: project.name });
    setStatus(result?.success ? `Exported ${project.name} to ${result.exportRoot}.` : `Export failed: ${result?.reason || 'Unknown error'}`);
    return;
  }
  if (action === 'rename') {
    const nextName = window.prompt('Rename project folder to:', project.name || '');
    if (!nextName || nextName.trim() === project.name) {
      setStatus('Rename canceled.');
      return;
    }
    const result = await window.electronAPI.renameProjectFolder({ rootPath: project.rootPath, nextName: nextName.trim() });
    if (!result?.success || !result.project) {
      setStatus(`Could not rename project: ${result?.reason || 'Unknown error'}`);
      return;
    }
    removeProject(project.rootPath);
    upsertProject(result.project);
    setStatus(`Renamed project to ${result.project.name}.`);
    return;
  }
  if (action === 'duplicate') {
    setStatus(`Duplicating ${project.name}…`);
    const result = await window.electronAPI.duplicateProjectFolder({ rootPath: project.rootPath });
    if (!result?.success || !result.project) {
      setStatus(`Could not duplicate project: ${result?.reason || 'Unknown error'}`);
      return;
    }
    upsertProject(result.project);
    setStatus(`Duplicated project as ${result.project.name}.`);
    return;
  }
  if (action === 'tags') {
    const existingTags = Array.isArray(project.tags) ? project.tags.join(', ') : '';
    const response = window.prompt('Enter project tags separated by commas:', existingTags);
    if (response === null) {
      setStatus('Tag update canceled.');
      return;
    }
    const tags = response.split(',').map((tag) => tag.trim()).filter(Boolean);
    const result = await window.electronAPI.setProjectTags({ rootPath: project.rootPath, tags });
    if (!result?.success || !result.project) {
      setStatus(`Could not update tags: ${result?.reason || 'Unknown error'}`);
      return;
    }
    upsertProject(result.project);
    setStatus(`Updated tags for ${result.project.name}.`);
    return;
  }
  if (action === 'remove') {
    const confirmed = window.confirm(`Remove ${project.name} from the Project Manager list?\n\nThis does not delete the project folder.`);
    if (!confirmed) {
      setStatus('Remove canceled.');
      return;
    }
    const result = await window.electronAPI.removeProjectFromManager(project.rootPath);
    if (!result?.success) {
      setStatus(`Could not remove project: ${result?.reason || 'Unknown error'}`);
      return;
    }
    removeProject(project.rootPath);
    setStatus(`Removed ${project.name} from the Project Manager.`);
  }
}


function openSettingsPanel() {
  // Remove any existing panel
  const existing = document.getElementById('pm-settings-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'pm-settings-panel';
  panel.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'background:var(--panel-bg,#1e2130)',
    'border:1px solid var(--border-color,#3a3f55)',
    'border-radius:8px',
    'padding:24px 28px',
    'min-width:320px',
    'z-index:9999',
    'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
    'color:var(--text-primary,#d4d8f0)',
    'font-family:inherit',
  ].join(';');

  const sortMode  = state.sortMode || 'lastEdited';
  const maxRecent = state.maxRecent ?? 20;

  panel.innerHTML = `
    <h3 style="margin:0 0 16px;font-size:15px;font-weight:600">Project Manager Settings</h3>
    <label style="display:block;margin-bottom:12px;font-size:13px">
      Default sort order
      <select id="pm-cfg-sort" style="display:block;margin-top:4px;width:100%;background:var(--input-bg,#141620);border:1px solid var(--border-color,#3a3f55);color:inherit;border-radius:4px;padding:5px 8px">
        <option value="lastEdited" ${sortMode === 'lastEdited' ? 'selected' : ''}>Last edited</option>
        <option value="name"       ${sortMode === 'name'       ? 'selected' : ''}>Name (A–Z)</option>
        <option value="created"    ${sortMode === 'created'    ? 'selected' : ''}>Date created</option>
      </select>
    </label>
    <label style="display:block;margin-bottom:20px;font-size:13px">
      Recent projects limit
      <input id="pm-cfg-max" type="number" min="5" max="100" value="${maxRecent}"
        style="display:block;margin-top:4px;width:100%;background:var(--input-bg,#141620);border:1px solid var(--border-color,#3a3f55);color:inherit;border-radius:4px;padding:5px 8px;box-sizing:border-box">
    </label>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="pm-cfg-cancel" style="padding:6px 16px;border-radius:4px;border:1px solid var(--border-color,#3a3f55);background:transparent;color:inherit;cursor:pointer">Cancel</button>
      <button id="pm-cfg-save"   style="padding:6px 16px;border-radius:4px;border:none;background:var(--accent,#478cbf);color:#fff;cursor:pointer;font-weight:600">Save</button>
    </div>`;

  document.body.appendChild(panel);

  document.getElementById('pm-cfg-cancel').addEventListener('click', () => panel.remove());

  document.getElementById('pm-cfg-save').addEventListener('click', () => {
    const newSort  = document.getElementById('pm-cfg-sort').value;
    const newLimit = Math.max(5, Math.min(100, parseInt(document.getElementById('pm-cfg-max').value, 10) || 20));
    state.sortMode  = newSort;
    state.maxRecent = newLimit;
    renderProjects();
    setStatus(`Settings saved. Sort: ${newSort}, limit: ${newLimit}.`);
    panel.remove();
  });

  // Close on backdrop click
  const onBackdrop = (e) => { if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('mousedown', onBackdrop); } };
  setTimeout(() => document.addEventListener('mousedown', onBackdrop), 0);
}

function bindUI() {
  document.getElementById('pm-close-btn').addEventListener('click', () => window.electronAPI.closeWindow());
  document.getElementById('pm-create-btn').addEventListener('click', () => void createProject());
  document.getElementById('pm-import-btn').addEventListener('click', () => void importProject());
  document.getElementById('pm-scan-btn').addEventListener('click', () => void scanProjects());
  document.getElementById('pm-settings-btn').addEventListener('click', () => {
    openSettingsPanel();
  });
  sortEl.addEventListener('change', () => {
    state.sortMode = sortEl.value || 'lastEdited';
    renderProjects();
    setStatus(`Sorted projects by ${state.sortMode}.`);
  });

  document.querySelectorAll('[data-panel-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const project = getSelectedProject();
      if (!project) {
        setStatus('Select a project first.');
        return;
      }
      void handleProjectAction(project, button.getAttribute('data-panel-action'));
    });
  });
}

bindUI();
void loadManagerState();


/* V145 Renderer Consolidation */
RGE_ROOT.RGEFrameBudget = RGE_ROOT.RGEFrameBudget || {
    maxDrawCalls: 500,
    maxBatches: 100
};
