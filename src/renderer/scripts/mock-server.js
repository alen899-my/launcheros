import { toast } from './toast.js';

let isInitialized = false;
let mockPort = 4000;
let mockEndpoints = [];
let incomingRequests = [];
let activeLogId = null;
let activeEndpointId = null; // null if adding

// Icons
const editSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const delSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

export async function startMockServerView() {
  if (!isInitialized) {
    setupMockListeners();
    // Register IPC callback for real-time incoming requests
    window.electronAPI.onMockServerRequest((request) => {
      handleIncomingRequest(request);
    });
    isInitialized = true;
  }

  // Load saved endpoints and configurations
  await loadMockData();
}

export function stopMockServerView() {
  // View paused/navigated away. Keep server running, but no view updates are needed.
}

async function loadMockData() {
  try {
    const data = await window.electronAPI.mockServerLoadData();
    mockPort = data.port || 4000;
    mockEndpoints = data.endpoints || [];

    const portInput = document.getElementById('mock-port-input');
    if (portInput) portInput.value = mockPort;

    renderEndpointsList();

    // Check active status
    const status = await window.electronAPI.mockServerGetStatus();
    updateServerUI(status.running, status.port || mockPort);
  } catch (err) {
    toast(`Failed to load mock server settings: ${err.message}`, 'error');
  }
}

function updateServerUI(isRunning, port) {
  const indicator = document.getElementById('mock-status-indicator');
  const statusText = document.getElementById('mock-status-text');
  const toggleBtn = document.getElementById('mock-server-toggle-btn');
  const portInput = document.getElementById('mock-port-input');

  if (!indicator || !statusText || !toggleBtn || !portInput) return;

  if (isRunning) {
    indicator.className = 'mock-indicator-dot running';
    statusText.textContent = `Running on port ${port}`;
    statusText.style.color = 'var(--success)';
    toggleBtn.textContent = 'Stop Mock Server';
    toggleBtn.className = 'btn-secondary';
    toggleBtn.style.color = 'var(--error)';
    portInput.setAttribute('disabled', 'true');
  } else {
    indicator.className = 'mock-indicator-dot stopped';
    statusText.textContent = 'Server Stopped';
    statusText.style.color = 'var(--muted-foreground)';
    toggleBtn.textContent = 'Start Mock Server';
    toggleBtn.className = 'btn-primary';
    toggleBtn.style.color = '';
    portInput.removeAttribute('disabled');
  }
}

async function handleServerToggle() {
  const toggleBtn = document.getElementById('mock-server-toggle-btn');
  const portInput = document.getElementById('mock-port-input');
  if (!toggleBtn || !portInput) return;

  const isRunning = toggleBtn.textContent.includes('Stop');
  
  if (isRunning) {
    toggleBtn.disabled = true;
    toggleBtn.textContent = 'Stopping...';
    try {
      const res = await window.electronAPI.mockServerStop();
      if (res.ok) {
        toast('Mock server stopped', 'success');
        updateServerUI(false, mockPort);
      } else {
        toast(`Error: ${res.error}`, 'error');
      }
    } catch (e) {
      toast(`Failed to stop server: ${e.message}`, 'error');
    } finally {
      toggleBtn.disabled = false;
    }
  } else {
    const port = parseInt(portInput.value, 10);
    if (!port || port < 1 || port > 65535) {
      toast('Invalid port number (1 - 65535)', 'error');
      return;
    }

    toggleBtn.disabled = true;
    toggleBtn.textContent = 'Starting...';

    try {
      // Save port first
      mockPort = port;
      await window.electronAPI.mockServerSaveData({ port: mockPort, endpoints: mockEndpoints });

      const res = await window.electronAPI.mockServerStart(mockPort, mockEndpoints);
      if (res.ok) {
        toast(`Mock server running on port ${mockPort}`, 'success');
        updateServerUI(true, mockPort);
      } else {
        toast(`Port conflict or start failed: ${res.error}`, 'error');
        updateServerUI(false, mockPort);
      }
    } catch (e) {
      toast(`Failed to start server: ${e.message}`, 'error');
      updateServerUI(false, mockPort);
    } finally {
      toggleBtn.disabled = false;
    }
  }
}

async function hotRestartServerIfRunning() {
  const toggleBtn = document.getElementById('mock-server-toggle-btn');
  if (toggleBtn && toggleBtn.textContent.includes('Stop')) {
    try {
      await window.electronAPI.mockServerStart(mockPort, mockEndpoints);
      toast('Mock endpoints reloaded live', 'success');
    } catch (e) {
      toast(`Live reload failed: ${e.message}`, 'error');
    }
  }
}

function renderEndpointsList() {
  const container = document.getElementById('mock-endpoints-list');
  if (!container) return;

  if (mockEndpoints.length === 0) {
    container.innerHTML = `<div style="padding:8px;color:var(--muted-foreground);font-size:11px;text-align:center;">No endpoints configured</div>`;
    return;
  }

  container.innerHTML = mockEndpoints.map(ep => {
    const pathText = ep.path.startsWith('/') ? ep.path : '/' + ep.path;
    return `
      <div class="mock-endpoint-item" data-id="${ep.id}">
        <div class="mei-top">
          <span class="method-badge ${ep.method.toLowerCase()}">${ep.method}</span>
          <span class="mei-path" title="${esc(pathText)}">${esc(pathText)}</span>
        </div>
        <div class="mei-bottom">
          <span>Status: ${ep.statusCode} &middot; ${ep.delay || 0}ms</span>
          <div class="mei-actions">
            <button class="mei-btn edit" data-id="${ep.id}" title="Edit Endpoint">${editSvg}</button>
            <button class="mei-btn delete" data-id="${ep.id}" title="Delete Endpoint">${delSvg}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openEndpointEditor(mode = 'add', id = null) {
  const editorBox = document.getElementById('mock-editor-box');
  const editorTitle = document.getElementById('mock-editor-title');
  const editorId = document.getElementById('mock-editor-id');
  const methodInput = document.getElementById('mock-editor-method');
  const pathInput = document.getElementById('mock-editor-path');
  const statusInput = document.getElementById('mock-editor-status');
  const delayInput = document.getElementById('mock-editor-delay');
  const headersList = document.getElementById('mock-editor-headers-list');
  const bodyInput = document.getElementById('mock-editor-body');

  if (!editorBox || !editorTitle || !editorId || !methodInput || !pathInput || !statusInput || !delayInput || !headersList || !bodyInput) return;

  editorBox.style.display = 'flex';
  activeEndpointId = id;

  if (mode === 'edit' && id) {
    editorTitle.textContent = 'Edit Mock Endpoint';
    const ep = mockEndpoints.find(x => x.id === id);
    if (ep) {
      editorId.value = ep.id;
      methodInput.value = ep.method;
      pathInput.value = ep.path;
      statusInput.value = ep.statusCode;
      delayInput.value = ep.delay || 0;
      bodyInput.value = ep.body || '';

      // Load headers
      headersList.innerHTML = '';
      if (Array.isArray(ep.headers)) {
        ep.headers.forEach(h => addHeaderRow(h.key, h.value));
      }
    }
  } else {
    editorTitle.textContent = 'Add Mock Endpoint';
    editorId.value = '';
    methodInput.value = 'GET';
    pathInput.value = '/';
    statusInput.value = '200';
    delayInput.value = '0';
    headersList.innerHTML = '';
    bodyInput.value = '';
    addHeaderRow('Content-Type', 'application/json');
  }
}

function closeEndpointEditor() {
  const editorBox = document.getElementById('mock-editor-box');
  if (editorBox) editorBox.style.display = 'none';
  activeEndpointId = null;
}

function addHeaderRow(key = '', value = '') {
  const container = document.getElementById('mock-editor-headers-list');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'mock-header-row';
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '1fr 1.5fr 24px';
  row.style.gap = '8px';
  row.style.alignItems = 'center';
  row.style.marginBottom = '4px';

  row.innerHTML = `
    <input type="text" class="form-input mono mock-header-key" placeholder="Header-Name" value="${esc(key)}" style="height:22px; font-size:10px; padding:2px 6px;" />
    <input type="text" class="form-input mono mock-header-value" placeholder="value" value="${esc(value)}" style="height:22px; font-size:10px; padding:2px 6px;" />
    <button class="mei-btn delete mock-header-remove-btn" style="height:22px; width:22px; justify-content:center;">✕</button>
  `;

  row.querySelector('.mock-header-remove-btn').addEventListener('click', () => {
    row.remove();
  });

  container.appendChild(row);
}

async function saveEndpoint() {
  const methodInput = document.getElementById('mock-editor-method');
  const pathInput = document.getElementById('mock-editor-path');
  const statusInput = document.getElementById('mock-editor-status');
  const delayInput = document.getElementById('mock-editor-delay');
  const bodyInput = document.getElementById('mock-editor-body');

  if (!methodInput || !pathInput || !statusInput || !delayInput || !bodyInput) return;

  const method = methodInput.value.toUpperCase();
  let path = pathInput.value.trim();
  const statusCode = parseInt(statusInput.value, 10) || 200;
  const delay = parseInt(delayInput.value, 10) || 0;
  const body = bodyInput.value;

  if (!path) {
    toast('Path is required', 'error');
    return;
  }
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  // Parse headers from DOM
  const headers = [];
  const rows = document.querySelectorAll('.mock-header-row');
  rows.forEach(r => {
    const kInput = r.querySelector('.mock-header-key');
    const vInput = r.querySelector('.mock-header-value');
    if (kInput && kInput.value.trim()) {
      headers.push({
        key: kInput.value.trim(),
        value: vInput ? vInput.value.trim() : ''
      });
    }
  });

  // Validate JSON body if JSON header is active
  const isJson = headers.some(h => h.key.toLowerCase() === 'content-type' && h.value.toLowerCase().includes('json'));
  if (isJson && body.trim()) {
    try {
      JSON.parse(body);
    } catch (e) {
      toast('Response body is not valid JSON', 'error');
      return;
    }
  }

  if (activeEndpointId) {
    // Edit mode
    const idx = mockEndpoints.findIndex(x => x.id === activeEndpointId);
    if (idx !== -1) {
      mockEndpoints[idx] = {
        id: activeEndpointId,
        method,
        path,
        statusCode,
        delay,
        headers,
        body
      };
      toast('Endpoint updated', 'success');
    }
  } else {
    // Add mode
    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    mockEndpoints.push({
      id: newId,
      method,
      path,
      statusCode,
      delay,
      headers,
      body
    });
    toast('Endpoint added', 'success');
  }

  // Save changes
  try {
    await window.electronAPI.mockServerSaveData({ port: mockPort, endpoints: mockEndpoints });
    closeEndpointEditor();
    renderEndpointsList();
    await hotRestartServerIfRunning();
  } catch (err) {
    toast(`Failed to save settings: ${err.message}`, 'error');
  }
}

async function deleteEndpoint(id) {
  if (!confirm('Are you sure you want to delete this endpoint?')) return;

  mockEndpoints = mockEndpoints.filter(x => x.id !== id);
  
  try {
    await window.electronAPI.mockServerSaveData({ port: mockPort, endpoints: mockEndpoints });
    renderEndpointsList();
    toast('Endpoint deleted', 'success');
    await hotRestartServerIfRunning();
  } catch (err) {
    toast(`Failed to delete endpoint: ${err.message}`, 'error');
  }
}

// ─── Incoming Requests Logs Inspector ────────────────────────────────────────

function handleIncomingRequest(request) {
  incomingRequests.unshift(request);
  if (incomingRequests.length > 100) {
    incomingRequests.pop();
  }
  renderLogsTimeline();
}

function renderLogsTimeline() {
  const container = document.getElementById('mock-logs-list');
  const emptyEl = document.getElementById('mock-logs-empty');
  if (!container || !emptyEl) return;

  if (incomingRequests.length === 0) {
    container.innerHTML = '';
    emptyEl.style.display = 'flex';
    return;
  }

  emptyEl.style.display = 'none';

  container.innerHTML = incomingRequests.map(req => {
    const timeStr = new Date(req.timestamp).toLocaleTimeString();
    const activeClass = activeLogId === req.id ? 'active' : '';
    const statusClass = req.statusCode >= 200 && req.statusCode < 300 ? 'status-2xx' : 'status-5xx';
    const isError = req.statusCode >= 400;

    return `
      <div class="mock-log-item ${activeClass}" data-id="${req.id}">
        <div class="mli-top">
          <span class="method-badge ${req.method.toLowerCase()}">${req.method}</span>
          <span class="mli-path" title="${esc(req.path)}">${esc(req.path)}</span>
        </div>
        <div class="mli-bottom" style="margin-top: 4px;">
          <span class="api-status-badge ${isError ? 'status-5xx' : 'status-2xx'}" style="font-size: 9px; padding:0 6px;">${req.statusCode}</span>
          <span style="font-size: 8px;">${timeStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

function selectRequestLog(id) {
  activeLogId = id;
  renderLogsTimeline(); // Redraw with highlights

  const req = incomingRequests.find(x => x.id === id);
  const placeholder = document.getElementById('mock-log-details-placeholder');
  const pane = document.getElementById('mock-log-details-pane');

  if (!req || !placeholder || !pane) return;

  placeholder.style.display = 'none';
  pane.style.display = 'flex';

  // Populate Details info
  const mldBadge = document.getElementById('mld-badge');
  const mldPath = document.getElementById('mld-path');
  const mldDuration = document.getElementById('mld-duration');
  const mldIp = document.getElementById('mld-ip');
  const mldTime = document.getElementById('mld-time');

  if (mldBadge) {
    mldBadge.textContent = req.method;
    mldBadge.className = `api-status-badge method-badge ${req.method.toLowerCase()}`;
  }
  if (mldPath) mldPath.textContent = req.url || req.path;
  if (mldDuration) mldDuration.textContent = `${req.duration}ms`;
  if (mldIp) mldIp.textContent = req.clientIp;
  if (mldTime) mldTime.textContent = new Date(req.timestamp).toLocaleTimeString();

  // Populate Tab codes
  const headersCode = document.getElementById('mld-headers-code');
  const queryCode = document.getElementById('mld-query-code');
  const bodyCode = document.getElementById('mld-body-code');

  if (headersCode) headersCode.textContent = JSON.stringify(req.headers || {}, null, 2);
  if (queryCode) queryCode.textContent = JSON.stringify(req.query || {}, null, 2);

  if (bodyCode) {
    const rawBody = req.body || '';
    try {
      // Try prettifying JSON if possible
      const json = JSON.parse(rawBody);
      bodyCode.textContent = JSON.stringify(json, null, 2);
    } catch (e) {
      bodyCode.textContent = rawBody || '(Empty Response Body)';
    }
  }
}

function clearLogs() {
  incomingRequests = [];
  activeLogId = null;

  const container = document.getElementById('mock-logs-list');
  const emptyEl = document.getElementById('mock-logs-empty');
  const placeholder = document.getElementById('mock-log-details-placeholder');
  const pane = document.getElementById('mock-log-details-pane');

  if (container) container.innerHTML = '';
  if (emptyEl) emptyEl.style.display = 'flex';
  if (placeholder) placeholder.style.display = 'flex';
  if (pane) pane.style.display = 'none';
}

function setupMockListeners() {
  // Toggle server
  document.getElementById('mock-server-toggle-btn')?.addEventListener('click', handleServerToggle);

  // Add endpoint
  document.getElementById('mock-endpoint-add-btn')?.addEventListener('click', () => openEndpointEditor('add'));

  // Close editor
  document.getElementById('mock-editor-close-btn')?.addEventListener('click', closeEndpointEditor);

  // Add header row
  document.getElementById('mock-editor-add-header')?.addEventListener('click', () => addHeaderRow());

  // Save endpoint
  document.getElementById('mock-editor-save-btn')?.addEventListener('click', saveEndpoint);

  // Clear request logs
  document.getElementById('mock-logs-clear-btn')?.addEventListener('click', clearLogs);

  // Endpoint item actions click delegation
  document.getElementById('mock-endpoints-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.mei-btn');
    if (btn && btn.dataset.id) {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.classList.contains('edit')) {
        openEndpointEditor('edit', id);
      } else if (btn.classList.contains('delete')) {
        deleteEndpoint(id);
      }
      return;
    }

    const item = e.target.closest('.mock-endpoint-item');
    if (item && item.dataset.id) {
      openEndpointEditor('edit', item.dataset.id);
    }
  });

  // Logs list click delegation
  document.getElementById('mock-logs-list')?.addEventListener('click', e => {
    const item = e.target.closest('.mock-log-item');
    if (item && item.dataset.id) {
      selectRequestLog(item.dataset.id);
    }
  });

  // Tab views within Inspector
  document.querySelectorAll('.mock-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mock-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.tab;
      document.querySelectorAll('.mock-tab-pane-content').forEach(pane => {
        pane.style.display = pane.id === target ? 'block' : 'none';
      });
    });
  });
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
