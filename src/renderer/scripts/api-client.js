import { toast } from './toast.js';

let isInitialized = false;
let apiHistory = [];
let headersList = [{ key: '', value: '' }];
let activeRequestTab = 'req-headers';

export async function startApiClientView() {
  if (!isInitialized) {
    setupApiListeners();
    isInitialized = true;
  }

  // Load request history
  try {
    apiHistory = await window.electronAPI.loadApiHistory();
  } catch (e) {
    console.error('Failed to load API history:', e);
  }

  renderHistory();
  renderHeaders();
  toggleBodyVisibility();
}

export function stopApiClientView() {
  // Teardown if necessary
}

function renderHistory() {
  const container = document.getElementById('api-history-list');
  if (!container) return;

  if (apiHistory.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted-foreground);font-size:12px;">No requests in history</div>`;
    return;
  }

  container.innerHTML = apiHistory.map((item, idx) => {
    const methodClass = `method-${item.method.toLowerCase()}`;
    return `
      <div class="api-history-item" data-index="${idx}">
        <div class="api-history-meta">
          <span class="api-history-method ${methodClass}">${item.method}</span>
          <span class="api-history-time">${formatTime(item.timestamp)}</span>
        </div>
        <div class="api-history-url" title="${esc(item.url)}">${esc(item.url)}</div>
      </div>
    `;
  }).join('');
}

function renderHeaders() {
  const container = document.getElementById('api-headers-list');
  if (!container) return;

  container.innerHTML = headersList.map((header, idx) => {
    return `
      <div class="api-header-row" data-index="${idx}">
        <input type="text" placeholder="Key" class="form-input header-key-input" value="${esc(header.key)}" />
        <input type="text" placeholder="Value" class="form-input header-value-input" value="${esc(header.value)}" />
        <button class="tb-cmd-menu-btn api-remove-header-btn" style="color:var(--error); margin: 0 auto;" title="Remove Header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
  }).join('');

  // Re-bind listeners for change on inputs
  container.querySelectorAll('.api-header-row').forEach(row => {
    const idx = parseInt(row.dataset.index);
    const keyInput = row.querySelector('.header-key-input');
    const valInput = row.querySelector('.header-value-input');

    keyInput?.addEventListener('input', e => {
      headersList[idx].key = e.target.value;
    });

    valInput?.addEventListener('input', e => {
      headersList[idx].value = e.target.value;
    });

    row.querySelector('.api-remove-header-btn')?.addEventListener('click', () => {
      headersList.splice(idx, 1);
      if (headersList.length === 0) {
        headersList.push({ key: '', value: '' });
      }
      renderHeaders();
    });
  });
}

function toggleBodyVisibility() {
  const method = document.getElementById('api-method')?.value || 'GET';
  const bodyTabBtn = document.querySelector('.api-req-tab-btn[data-reqtab="req-body"]');

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (bodyTabBtn) bodyTabBtn.style.display = 'block';
  } else {
    if (bodyTabBtn) bodyTabBtn.style.display = 'none';
    // If body was selected tab, switch to headers
    if (activeRequestTab === 'req-body') {
      switchRequestTab('req-headers');
    }
  }
}

function switchRequestTab(tabId) {
  activeRequestTab = tabId;
  document.querySelectorAll('.api-req-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.reqtab === tabId);
  });

  const headersPane = document.getElementById('req-headers');
  const bodyPane = document.getElementById('req-body');

  if (headersPane) headersPane.style.display = tabId === 'req-headers' ? 'flex' : 'none';
  if (bodyPane) bodyPane.style.display = tabId === 'req-body' ? 'block' : 'none';
}

async function sendRequest() {
  const methodSelect = document.getElementById('api-method');
  const urlInput = document.getElementById('api-url');
  const sendBtn = document.getElementById('api-send-btn');
  const respEmpty = document.getElementById('api-resp-empty');
  const respContainer = document.getElementById('api-resp-container');
  const respText = document.getElementById('api-resp-text');
  const respMeta = document.getElementById('api-resp-meta');

  if (!urlInput || !methodSelect || !sendBtn) return;

  let url = urlInput.value.trim();
  if (!url) {
    toast('URL is required', 'error');
    return;
  }

  // Auto-prepend http if not present
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
    urlInput.value = url;
  }

  const method = methodSelect.value;
  const body = document.getElementById('api-body')?.value || '';

  // Collect non-empty headers
  const headers = {};
  headersList.forEach(h => {
    const k = h.key.trim();
    const v = h.value.trim();
    if (k) headers[k] = v;
  });

  // UI loading state
  sendBtn.textContent = 'Sending...';
  sendBtn.disabled = true;

  if (respEmpty) respEmpty.style.display = 'none';
  if (respContainer) respContainer.style.display = 'none';
  if (respMeta) respMeta.style.display = 'none';

  try {
    const response = await window.electronAPI.sendApiRequest({ method, url, headers, body });
    
    sendBtn.textContent = 'Send Request';
    sendBtn.disabled = false;

    if (respContainer && respText && respMeta) {
      respContainer.style.display = 'flex';
      respMeta.style.display = 'flex';

      if (response.ok) {
        // Status Badge classing
        const statusEl = document.getElementById('api-resp-status');
        const timeEl = document.getElementById('api-resp-time');
        const sizeEl = document.getElementById('api-resp-size');

        if (statusEl) {
          statusEl.textContent = `${response.status} ${response.statusText || ''}`;
          statusEl.className = 'api-status-badge';
          
          if (response.status >= 200 && response.status < 300) {
            statusEl.classList.add('status-2xx');
          } else if (response.status >= 300 && response.status < 400) {
            statusEl.classList.add('status-3xx');
          } else if (response.status >= 400 && response.status < 500) {
            statusEl.classList.add('status-4xx');
          } else {
            statusEl.classList.add('status-5xx');
          }
        }

        if (timeEl) timeEl.textContent = `${response.duration}ms`;
        if (sizeEl) sizeEl.textContent = formatBytes(response.body ? response.body.length : 0);

        // Prettify response body if JSON
        try {
          const parsed = JSON.parse(response.body);
          respText.textContent = JSON.stringify(parsed, null, 2);
        } catch (e) {
          respText.textContent = response.body || '[Empty Response]';
        }

        // Add to history
        await saveRequestToHistory({ method, url, headers, body });
      } else {
        // Fetch failed completely (e.g. DNS failure, connection refused)
        respText.textContent = `Error: ${response.error || 'Connection failed'}`;
        const statusEl = document.getElementById('api-resp-status');
        if (statusEl) {
          statusEl.textContent = 'FAILED';
          statusEl.className = 'api-status-badge status-5xx';
        }
      }
    }
  } catch (err) {
    sendBtn.textContent = 'Send Request';
    sendBtn.disabled = false;
    toast(`Request failed: ${err.message}`, 'error');
  }
}

async function saveRequestToHistory(req) {
  // Prevent duplicate consecutive entries with same parameters
  if (apiHistory.length > 0) {
    const last = apiHistory[0];
    if (last.method === req.method && last.url === req.url) {
      return; // Skip adding duplicates
    }
  }

  const newEntry = {
    ...req,
    timestamp: Date.now()
  };

  apiHistory.unshift(newEntry);
  
  // Cap history size
  if (apiHistory.length > 50) {
    apiHistory = apiHistory.slice(0, 50);
  }

  renderHistory();
  try {
    await window.electronAPI.saveApiHistory(apiHistory);
  } catch (e) {
    console.error('Failed to save history on disk:', e);
  }
}

function restoreHistoryRequest(item) {
  const methodSelect = document.getElementById('api-method');
  const urlInput = document.getElementById('api-url');
  const bodyText = document.getElementById('api-body');

  if (methodSelect) {
    methodSelect.value = item.method;
    toggleBodyVisibility();
  }

  if (urlInput) {
    urlInput.value = item.url;
  }

  if (bodyText) {
    bodyText.value = item.body || '';
  }

  // Restore headers
  headersList = [];
  if (item.headers && Object.keys(item.headers).length > 0) {
    Object.entries(item.headers).forEach(([k, v]) => {
      headersList.push({ key: k, value: v });
    });
  } else {
    headersList.push({ key: '', value: '' });
  }
  renderHeaders();
  toast('Request parameters restored', 'success');
}

function setupApiListeners() {
  // 1. Send Request Click
  document.getElementById('api-send-btn')?.addEventListener('click', sendRequest);

  // 2. Clear History Click
  document.getElementById('api-clear-hist-btn')?.addEventListener('click', async () => {
    if (confirm('Clear entire API request history?')) {
      apiHistory = [];
      renderHistory();
      try {
        await window.electronAPI.saveApiHistory([]);
        toast('History cleared', 'success');
      } catch (e) {}
    }
  });

  // 3. Tab Switches (Headers vs Body)
  document.querySelectorAll('.api-req-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchRequestTab(btn.dataset.reqtab));
  });

  // 4. Headers Add Click
  document.getElementById('api-add-header-btn')?.addEventListener('click', () => {
    headersList.push({ key: '', value: '' });
    renderHeaders();
  });

  // 5. Method change list visibility checks
  document.getElementById('api-method')?.addEventListener('change', toggleBodyVisibility);

  // 6. History lists selection
  document.getElementById('api-history-list')?.addEventListener('click', e => {
    const item = e.target.closest('.api-history-item');
    if (item && item.dataset.index) {
      const idx = parseInt(item.dataset.index);
      const entry = apiHistory[idx];
      if (entry) {
        document.querySelectorAll('.api-history-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        restoreHistoryRequest(entry);
      }
    }
  });
}

// Helper Utilities
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
