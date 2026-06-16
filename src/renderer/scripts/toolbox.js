import { toast } from './toast.js';

let toolboxData = { commands: [], snippets: [] };
let activeTab = 'tb-commands';
let activeFormatter = 'fmt-json';
let selectedSnippetId = null;
let currentConsoleCommandId = null;
let snippetSearchQuery = '';
let isInitialized = false;

// Set to track currently running command IDs
const runningCommands = new Set();
const commandLogs = {}; // commandId -> string

export async function startToolboxView() {
  if (!isInitialized) {
    setupToolboxListeners();
    isInitialized = true;
  }

  // Load toolbox commands and snippets from storage
  try {
    toolboxData = await window.electronAPI.loadToolboxData();
  } catch (e) {
    console.error('Failed to load toolbox data:', e);
    toast('Failed to load toolbox data', 'error');
  }

  renderCommands();
  renderSnippets();
  updateConsoleDrawer();
}

export function stopToolboxView() {
  // Teardown logic if needed in the future
}

// IPC Listener for incoming terminal data streams from toolbox command processes
window.electronAPI.onToolboxData(({ commandId, data }) => {
  if (!commandLogs[commandId]) {
    commandLogs[commandId] = '';
  }
  commandLogs[commandId] += data;

  // Detect process completion or termination
  if (data.includes('[Process exited with code') || 
      data.includes('Failed to execute') || 
      data.includes('Terminal runner not available')) {
    runningCommands.delete(commandId);
    renderCommands();
  }

  // If the drawer is currently open and viewing this command, append the data and auto-scroll
  if (currentConsoleCommandId === commandId) {
    const outputEl = document.getElementById('tb-console-output');
    if (outputEl) {
      outputEl.textContent = commandLogs[commandId];
      outputEl.scrollTop = outputEl.scrollHeight;
    }
  }
});

function renderCommands() {
  const grid = document.getElementById('tb-commands-grid');
  if (!grid) return;

  if (!toolboxData.commands || toolboxData.commands.length === 0) {
    grid.innerHTML = `
      <div class="git-empty-state" style="grid-column: 1 / -1; padding: 40px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
        <p>No actions defined</p>
        <small>Click "+ Add Custom Action" to create a custom command.</small>
      </div>
    `;
    return;
  }

  grid.innerHTML = toolboxData.commands.map(cmd => {
    const isRunning = runningCommands.has(cmd.id);
    const hasLogs = !!commandLogs[cmd.id];

    return `
      <div class="tb-cmd-card ${isRunning ? 'running' : ''}" data-id="${cmd.id}">
        <div class="tb-cmd-card-header">
          <h4 class="tb-cmd-card-title">${esc(cmd.name)}</h4>
          <div class="tb-cmd-card-menu">
            <button class="tb-cmd-menu-btn btn-edit" title="Edit Action">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="tb-cmd-menu-btn btn-delete" style="color:var(--error);" title="Delete Action">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>
        <p class="tb-cmd-card-desc">${esc(cmd.desc || 'No description')}</p>
        <div class="tb-cmd-card-command" title="${esc(cmd.command)}">${esc(cmd.command)}</div>
        <div class="tb-cmd-card-footer">
          <div class="tb-cmd-status">
            <div class="tb-cmd-status-dot"></div>
            <span>${isRunning ? 'Running' : 'Idle'}</span>
          </div>
          <div class="tb-cmd-actions">
            ${hasLogs ? `
              <button class="tb-cmd-ctrl-btn btn-console" title="View Logs">
                Console
              </button>
            ` : ''}
            ${isRunning ? `
              <button class="tb-cmd-ctrl-btn btn-stop" title="Stop execution">
                Stop
              </button>
            ` : `
              <button class="tb-cmd-ctrl-btn btn-run" title="Run command">
                ⚡ Run
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSnippets() {
  const listEl = document.getElementById('tb-snippets-list');
  if (!listEl) return;

  if (!toolboxData.snippets || toolboxData.snippets.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted-foreground);font-size:12px;">No snippets defined</div>`;
    showSnippetDetails(null);
    return;
  }

  const query = snippetSearchQuery.toLowerCase();
  const filtered = toolboxData.snippets.filter(snip => {
    return snip.name.toLowerCase().includes(query) || 
           (snip.desc || '').toLowerCase().includes(query) ||
           (snip.lang || '').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted-foreground);font-size:12px;">No snippets match filter</div>`;
    showSnippetDetails(null);
    return;
  }

  listEl.innerHTML = filtered.map(snip => {
    const isActive = snip.id === selectedSnippetId;
    return `
      <div class="tb-snippet-item ${isActive ? 'active' : ''}" data-id="${snip.id}">
        <div class="tb-snippet-item-title">${esc(snip.name)}</div>
        <div class="tb-snippet-item-meta">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${esc(snip.desc || 'No description')}</span>
          ${snip.lang ? `<span class="tb-snippet-item-lang">${esc(snip.lang)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Auto-select first matching or active snippet
  if (selectedSnippetId && filtered.some(s => s.id === selectedSnippetId)) {
    showSnippetDetails(selectedSnippetId);
  } else if (filtered.length > 0) {
    selectedSnippetId = filtered[0].id;
    // Highlight the selected element
    const items = listEl.querySelectorAll('.tb-snippet-item');
    items.forEach(el => el.classList.toggle('active', el.dataset.id === selectedSnippetId));
    showSnippetDetails(selectedSnippetId);
  } else {
    showSnippetDetails(null);
  }
}

function showSnippetDetails(id) {
  selectedSnippetId = id;
  const viewer = document.getElementById('tb-snippet-viewer');
  const emptyState = document.getElementById('tb-snippet-empty');

  if (!id) {
    if (viewer) viewer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  const snip = toolboxData.snippets.find(s => s.id === id);
  if (!snip) {
    if (viewer) viewer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (viewer) viewer.style.display = 'flex';

  const title = document.getElementById('tbsv-title');
  const desc = document.getElementById('tbsv-desc');
  const code = document.getElementById('tbsv-code');

  if (title) title.textContent = snip.name;
  if (desc) desc.textContent = snip.desc || 'No description';
  if (code) {
    code.textContent = snip.code;
  }
}

function updateConsoleDrawer() {
  const drawer = document.getElementById('tb-console-drawer');
  const title = document.getElementById('tb-console-title');
  const output = document.getElementById('tb-console-output');

  if (!drawer || !output) return;

  if (!currentConsoleCommandId) {
    drawer.style.display = 'none';
    return;
  }

  const cmd = toolboxData.commands.find(c => c.id === currentConsoleCommandId);
  if (!cmd) {
    drawer.style.display = 'none';
    currentConsoleCommandId = null;
    return;
  }

  drawer.style.display = 'flex';
  title.textContent = `Console Output: ${cmd.name}`;
  output.textContent = commandLogs[currentConsoleCommandId] || '';
  output.scrollTop = output.scrollHeight;
}

// Formatter: JSON Validation and Prettifier
function prettifyJSON() {
  const input = document.getElementById('tb-json-input');
  const errorBanner = document.getElementById('tb-json-error');
  if (!input) return;

  const value = input.value.trim();
  if (!value) {
    if (errorBanner) errorBanner.style.display = 'none';
    return;
  }

  try {
    const parsed = JSON.parse(value);
    input.value = JSON.stringify(parsed, null, 2);
    if (errorBanner) errorBanner.style.display = 'none';
    toast('JSON prettified', 'success');
  } catch (err) {
    if (errorBanner) {
      errorBanner.textContent = `JSON Error: ${err.message}`;
      errorBanner.style.display = 'block';
    }
    toast('Invalid JSON syntax', 'error');
  }
}

function minifyJSON() {
  const input = document.getElementById('tb-json-input');
  const errorBanner = document.getElementById('tb-json-error');
  if (!input) return;

  const value = input.value.trim();
  if (!value) {
    if (errorBanner) errorBanner.style.display = 'none';
    return;
  }

  try {
    const parsed = JSON.parse(value);
    input.value = JSON.stringify(parsed);
    if (errorBanner) errorBanner.style.display = 'none';
    toast('JSON minified', 'success');
  } catch (err) {
    if (errorBanner) {
      errorBanner.textContent = `JSON Error: ${err.message}`;
      errorBanner.style.display = 'block';
    }
    toast('Invalid JSON syntax', 'error');
  }
}

// Converter: Base64 Encoder & Decoder
function encodeBase64() {
  const input = document.getElementById('tb-b64-input');
  const output = document.getElementById('tb-b64-output');
  if (!input || !output) return;

  const text = input.value;
  if (!text) {
    output.value = '';
    return;
  }

  try {
    const encoded = btoa(new TextEncoder().encode(text).reduce((data, byte) => data + String.fromCharCode(byte), ''));
    output.value = encoded;
    toast('Text encoded successfully', 'success');
  } catch (err) {
    console.error(err);
    toast('Base64 encoding failed', 'error');
  }
}

function decodeBase64() {
  const input = document.getElementById('tb-b64-input');
  const output = document.getElementById('tb-b64-output');
  if (!input || !output) return;

  const text = input.value.trim();
  if (!text) {
    output.value = '';
    return;
  }

  try {
    const binString = atob(text);
    const bytes = Uint8Array.from(binString, c => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    output.value = decoded;
    toast('Base64 decoded successfully', 'success');
  } catch (err) {
    console.error(err);
    toast('Invalid Base64 format', 'error');
  }
}

// Command Modal Logic
function openCommandModal(mode, id = null) {
  const overlay = document.getElementById('tb-cmd-modal-overlay');
  const title = document.getElementById('tb-cmd-modal-title');
  const formId = document.getElementById('tb-cmd-form-id');
  const formName = document.getElementById('tb-cmd-form-name');
  const formDesc = document.getElementById('tb-cmd-form-desc');
  const formCommand = document.getElementById('tb-cmd-form-command');

  if (!overlay) return;

  if (mode === 'edit' && id) {
    const cmd = toolboxData.commands.find(c => c.id === id);
    if (!cmd) return;
    title.textContent = 'Edit Command Action';
    formId.value = cmd.id;
    formName.value = cmd.name;
    formDesc.value = cmd.desc || '';
    formCommand.value = cmd.command;
  } else {
    title.textContent = 'Add Command Action';
    formId.value = '';
    formName.value = '';
    formDesc.value = '';
    formCommand.value = '';
  }

  overlay.style.display = 'flex';
}

function closeCommandModal() {
  const overlay = document.getElementById('tb-cmd-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function saveCommandAction() {
  const id = document.getElementById('tb-cmd-form-id').value;
  const name = document.getElementById('tb-cmd-form-name').value.trim();
  const desc = document.getElementById('tb-cmd-form-desc').value.trim();
  const command = document.getElementById('tb-cmd-form-command').value.trim();

  if (!name || !command) {
    toast('Action Name and Command Line are required', 'error');
    return;
  }

  if (id) {
    const idx = toolboxData.commands.findIndex(c => c.id === id);
    if (idx !== -1) {
      toolboxData.commands[idx] = { ...toolboxData.commands[idx], name, desc, command };
    }
  } else {
    const newId = 'cmd_' + Date.now();
    toolboxData.commands.push({ id: newId, name, desc, command });
  }

  try {
    await window.electronAPI.saveToolboxData(toolboxData);
    renderCommands();
    closeCommandModal();
    toast(id ? 'Action updated' : 'Action added', 'success');
  } catch (e) {
    console.error(e);
    toast('Failed to save action', 'error');
  }
}

// Snippet Modal Logic
function openSnippetModal(mode, id = null) {
  const overlay = document.getElementById('tb-snip-modal-overlay');
  const title = document.getElementById('tb-snip-modal-title');
  const formId = document.getElementById('tb-snip-form-id');
  const formName = document.getElementById('tb-snip-form-name');
  const formDesc = document.getElementById('tb-snip-form-desc');
  const formLang = document.getElementById('tb-snip-form-lang');
  const formCode = document.getElementById('tb-snip-form-code');

  if (!overlay) return;

  if (mode === 'edit' && id) {
    const snip = toolboxData.snippets.find(s => s.id === id);
    if (!snip) return;
    title.textContent = 'Edit Code Snippet';
    formId.value = snip.id;
    formName.value = snip.name;
    formDesc.value = snip.desc || '';
    formLang.value = snip.lang || '';
    formCode.value = snip.code;
  } else {
    title.textContent = 'Add Code Snippet';
    formId.value = '';
    formName.value = '';
    formDesc.value = '';
    formLang.value = '';
    formCode.value = '';
  }

  overlay.style.display = 'flex';
}

function closeSnippetModal() {
  const overlay = document.getElementById('tb-snip-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function saveSnippetAction() {
  const id = document.getElementById('tb-snip-form-id').value;
  const name = document.getElementById('tb-snip-form-name').value.trim();
  const desc = document.getElementById('tb-snip-form-desc').value.trim();
  const lang = document.getElementById('tb-snip-form-lang').value.trim().toLowerCase();
  const code = document.getElementById('tb-snip-form-code').value;

  if (!name || !code) {
    toast('Snippet Name and Code Content are required', 'error');
    return;
  }

  if (id) {
    const idx = toolboxData.snippets.findIndex(s => s.id === id);
    if (idx !== -1) {
      toolboxData.snippets[idx] = { ...toolboxData.snippets[idx], name, desc, lang, code };
    }
  } else {
    const newId = 'snip_' + Date.now();
    toolboxData.snippets.push({ id: newId, name, desc, lang, code });
    selectedSnippetId = newId;
  }

  try {
    await window.electronAPI.saveToolboxData(toolboxData);
    renderSnippets();
    closeSnippetModal();
    toast(id ? 'Snippet updated' : 'Snippet added', 'success');
  } catch (e) {
    console.error(e);
    toast('Failed to save snippet', 'error');
  }
}

// JWT Decoder & Inspector logic
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(escape(atob(base64)));
}

function formatDuration(diffMs) {
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ${min % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function decodeJWT() {
  const token = document.getElementById('tb-jwt-input')?.value.trim() || '';
  const banner = document.getElementById('tb-jwt-status-banner');
  const headerArea = document.getElementById('tb-jwt-header');
  const payloadArea = document.getElementById('tb-jwt-payload');

  if (!banner || !headerArea || !payloadArea) return;

  if (!token) {
    banner.style.display = 'none';
    headerArea.value = '';
    payloadArea.value = '';
    return;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    banner.style.display = 'block';
    banner.className = 'tb-jwt-status-banner invalid';
    banner.textContent = 'Invalid JWT format: Must have 3 parts separated by dots';
    headerArea.value = '';
    payloadArea.value = '';
    return;
  }

  try {
    const headerDecoded = base64UrlDecode(parts[0]);
    const payloadDecoded = base64UrlDecode(parts[1]);

    headerArea.value = JSON.stringify(JSON.parse(headerDecoded), null, 2);
    const payloadObj = JSON.parse(payloadDecoded);
    payloadArea.value = JSON.stringify(payloadObj, null, 2);

    if (payloadObj && typeof payloadObj.exp === 'number') {
      const expMs = payloadObj.exp * 1000;
      const now = Date.now();
      const diff = expMs - now;

      banner.style.display = 'block';
      if (diff > 0) {
        banner.className = 'tb-jwt-status-banner valid';
        banner.textContent = `Valid Token (Expires in ${formatDuration(diff)})`;
      } else {
        banner.className = 'tb-jwt-status-banner invalid';
        banner.textContent = `Expired Token (Expired ${formatDuration(Math.abs(diff))} ago)`;
      }
    } else {
      banner.style.display = 'block';
      banner.className = 'tb-jwt-status-banner valid';
      banner.textContent = 'Decoded successfully (No exp claim found)';
    }
  } catch (err) {
    banner.style.display = 'block';
    banner.className = 'tb-jwt-status-banner invalid';
    banner.textContent = `Decoding Error: ${err.message}`;
    headerArea.value = '';
    payloadArea.value = '';
  }
}

// Regex Tester logic
function testRegex() {
  const pattern = document.getElementById('tb-regex-pattern')?.value.trim() || '';
  const flags = document.getElementById('tb-regex-flags')?.value.trim() || '';
  const input = document.getElementById('tb-regex-input')?.value || '';
  const output = document.getElementById('tb-regex-output');
  const groupsBox = document.getElementById('tb-regex-groups');

  if (!output || !groupsBox) return;

  if (!pattern) {
    output.textContent = input;
    groupsBox.style.display = 'none';
    return;
  }

  try {
    const regex = new RegExp(pattern, flags);
    
    if (flags.includes('g')) {
      let match;
      const matches = [];
      let lastIdx = 0;
      let html = '';
      let matchCount = 0;
      let lastMatchIndex = -1;

      while ((match = regex.exec(input)) !== null) {
        if (match.index === lastMatchIndex) {
          regex.lastIndex++; // force advance
          continue;
        }
        lastMatchIndex = match.index;

        const matchText = match[0];
        const beforeText = input.substring(lastIdx, match.index);
        
        html += esc(beforeText);
        const isEven = matchCount % 2 === 0;
        html += `<span class="${isEven ? 'regex-match' : 'regex-match-even'}">${esc(matchText)}</span>`;
        
        matches.push(match);
        lastIdx = regex.lastIndex;
        matchCount++;
      }

      html += esc(input.substring(lastIdx));
      output.innerHTML = html || esc(input);

      if (matches.length > 0) {
        groupsBox.style.display = 'block';
        let groupsHtml = `<div style="font-weight:600;margin-bottom:6px;color:var(--foreground)">Matches & Groups Found (${matches.length})</div>`;
        
        matches.forEach((m, idx) => {
          groupsHtml += `<div class="tb-regex-group-item">`;
          groupsHtml += `<strong>Match #${idx + 1}:</strong> "${esc(m[0])}" (Index: ${m.index})<br/>`;
          if (m.length > 1) {
            for (let i = 1; i < m.length; i++) {
              groupsHtml += `  <span style="color:var(--muted-foreground); margin-left:12px;">Group ${i}:</span> "${esc(m[i])}"<br/>`;
            }
          }
          groupsHtml += `</div>`;
        });
        groupsBox.innerHTML = groupsHtml;
      } else {
        groupsBox.style.display = 'none';
      }
    } else {
      const match = regex.exec(input);
      if (match) {
        const beforeText = input.substring(0, match.index);
        const matchText = match[0];
        const afterText = input.substring(match.index + matchText.length);

        output.innerHTML = esc(beforeText) + `<span class="regex-match">${esc(matchText)}</span>` + esc(afterText);
        
        groupsBox.style.display = 'block';
        let groupsHtml = `<div style="font-weight:600;margin-bottom:6px;color:var(--foreground)">Match & Groups Found</div>`;
        groupsHtml += `<div class="tb-regex-group-item">`;
        groupsHtml += `<strong>Match:</strong> "${esc(match[0])}" (Index: ${match.index})<br/>`;
        if (match.length > 1) {
          for (let i = 1; i < match.length; i++) {
            groupsHtml += `  <span style="color:var(--muted-foreground); margin-left:12px;">Group ${i}:</span> "${esc(match[i])}"<br/>`;
          }
        }
        groupsHtml += `</div>`;
        groupsBox.innerHTML = groupsHtml;
      } else {
        output.textContent = input;
        groupsBox.style.display = 'none';
      }
    }
  } catch (err) {
    output.innerHTML = `<span style="color:var(--error)">Regex Compile Error: ${err.message}</span>`;
    groupsBox.style.display = 'none';
  }
}

function setupToolboxListeners() {
  // 1. Horizontal Tab Switcher
  document.querySelectorAll('.toolbox-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      activeTab = tabId;
      document.querySelectorAll('.toolbox-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tb-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
    });
  });

  // 2. Command Grid Actions (Delegate)
  document.getElementById('tb-commands-grid')?.addEventListener('click', async e => {
    const btn = e.target.closest('button, .tb-cmd-menu-btn, .tb-cmd-ctrl-btn');
    if (!btn) return;

    const card = btn.closest('.tb-cmd-card');
    if (!card || !card.dataset.id) return;
    const id = card.dataset.id;

    if (btn.classList.contains('btn-run')) {
      const cmd = toolboxData.commands.find(c => c.id === id);
      if (cmd) {
        runningCommands.add(id);
        commandLogs[id] = `[Running command: ${cmd.command}]\r\n`;
        window.electronAPI.runToolboxCommand({ commandId: id, command: cmd.command });
        currentConsoleCommandId = id;
        updateConsoleDrawer();
        renderCommands();
      }
    } else if (btn.classList.contains('btn-stop')) {
      window.electronAPI.stopToolboxCommand({ commandId: id });
      renderCommands();
    } else if (btn.classList.contains('btn-console')) {
      currentConsoleCommandId = id;
      updateConsoleDrawer();
    } else if (btn.closest('.btn-edit')) {
      openCommandModal('edit', id);
    } else if (btn.closest('.btn-delete')) {
      if (confirm('Are you sure you want to delete this action?')) {
        if (runningCommands.has(id)) {
          window.electronAPI.stopToolboxCommand({ commandId: id });
          runningCommands.delete(id);
        }
        toolboxData.commands = toolboxData.commands.filter(c => c.id !== id);
        try {
          await window.electronAPI.saveToolboxData(toolboxData);
          if (currentConsoleCommandId === id) {
            currentConsoleCommandId = null;
            updateConsoleDrawer();
          }
          renderCommands();
          toast('Action deleted', 'success');
        } catch (err) {
          console.error(err);
          toast('Failed to delete action', 'error');
        }
      }
    }
  });

  // 3. Command Console Drawer buttons
  document.getElementById('tb-console-clear')?.addEventListener('click', () => {
    if (currentConsoleCommandId) {
      commandLogs[currentConsoleCommandId] = '';
      updateConsoleDrawer();
    }
  });

  document.getElementById('tb-console-close')?.addEventListener('click', () => {
    currentConsoleCommandId = null;
    updateConsoleDrawer();
  });

  // 4. Command modal save & dismiss listeners
  document.getElementById('tb-add-cmd-btn')?.addEventListener('click', () => openCommandModal('add'));
  document.getElementById('tb-cmd-modal-close')?.addEventListener('click', closeCommandModal);
  document.getElementById('tb-cmd-modal-cancel')?.addEventListener('click', closeCommandModal);
  document.getElementById('tb-cmd-modal-save')?.addEventListener('click', saveCommandAction);
  document.getElementById('tb-cmd-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCommandModal();
  });

  // 5. Snippets Search Filter
  document.getElementById('tb-snippets-search')?.addEventListener('input', e => {
    snippetSearchQuery = e.target.value;
    renderSnippets();
  });

  // 6. Snippets list click (Delegate)
  document.getElementById('tb-snippets-list')?.addEventListener('click', e => {
    const item = e.target.closest('.tb-snippet-item');
    if (item && item.dataset.id) {
      selectedSnippetId = item.dataset.id;
      document.querySelectorAll('.tb-snippet-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === selectedSnippetId);
      });
      showSnippetDetails(selectedSnippetId);
    }
  });

  // 7. Snippet Actions Buttons (Copy, Edit, Delete)
  document.getElementById('tb-snippet-copy-btn')?.addEventListener('click', () => {
    if (selectedSnippetId) {
      const snip = toolboxData.snippets.find(s => s.id === selectedSnippetId);
      if (snip) {
        navigator.clipboard.writeText(snip.code).then(() => {
          toast('Snippet copied to clipboard!', 'success');
        }).catch(err => {
          console.error('Copy failed:', err);
          toast('Failed to copy to clipboard', 'error');
        });
      }
    }
  });

  document.getElementById('tb-snippet-edit-btn')?.addEventListener('click', () => {
    if (selectedSnippetId) {
      openSnippetModal('edit', selectedSnippetId);
    }
  });

  document.getElementById('tb-snippet-delete-btn')?.addEventListener('click', async () => {
    if (selectedSnippetId) {
      if (confirm('Are you sure you want to delete this snippet?')) {
        const id = selectedSnippetId;
        toolboxData.snippets = toolboxData.snippets.filter(s => s.id !== id);
        try {
          await window.electronAPI.saveToolboxData(toolboxData);
          selectedSnippetId = null;
          renderSnippets();
          toast('Snippet deleted', 'success');
        } catch (err) {
          console.error(err);
          toast('Failed to delete snippet', 'error');
        }
      }
    }
  });

  // 8. Snippets modal save & dismiss listeners
  document.getElementById('tb-add-snip-btn')?.addEventListener('click', () => openSnippetModal('add'));
  document.getElementById('tb-snip-modal-close')?.addEventListener('click', closeSnippetModal);
  document.getElementById('tb-snip-modal-cancel')?.addEventListener('click', closeSnippetModal);
  document.getElementById('tb-snip-modal-save')?.addEventListener('click', saveSnippetAction);
  document.getElementById('tb-snip-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSnippetModal();
  });

  // 9. Formatters Left Navigation buttons
  document.querySelectorAll('.tb-formatter-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fmtId = btn.dataset.fmt;
      activeFormatter = fmtId;
      document.querySelectorAll('.tb-formatter-nav-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tb-formatter-pane').forEach(p => p.classList.toggle('active', p.id === fmtId));
    });
  });

  // 10. JSON Prettifier Actions
  document.getElementById('tb-json-format')?.addEventListener('click', prettifyJSON);
  document.getElementById('tb-json-minify')?.addEventListener('click', minifyJSON);
  document.getElementById('tb-json-clear')?.addEventListener('click', () => {
    const input = document.getElementById('tb-json-input');
    const errorBanner = document.getElementById('tb-json-error');
    if (input) input.value = '';
    if (errorBanner) errorBanner.style.display = 'none';
  });

  // 11. Base64 Actions
  document.getElementById('tb-b64-encode')?.addEventListener('click', encodeBase64);
  document.getElementById('tb-b64-decode')?.addEventListener('click', decodeBase64);
  document.getElementById('tb-b64-clear')?.addEventListener('click', () => {
    const input = document.getElementById('tb-b64-input');
    const output = document.getElementById('tb-b64-output');
    if (input) input.value = '';
    if (output) output.value = '';
  });

  // 12. JWT Decoder Actions
  document.getElementById('tb-jwt-input')?.addEventListener('input', decodeJWT);
  document.getElementById('tb-jwt-clear')?.addEventListener('click', () => {
    const input = document.getElementById('tb-jwt-input');
    const header = document.getElementById('tb-jwt-header');
    const payload = document.getElementById('tb-jwt-payload');
    const banner = document.getElementById('tb-jwt-status-banner');
    if (input) input.value = '';
    if (header) header.value = '';
    if (payload) payload.value = '';
    if (banner) banner.style.display = 'none';
  });

  // 13. Regex Tester Actions
  document.getElementById('tb-regex-pattern')?.addEventListener('input', testRegex);
  document.getElementById('tb-regex-flags')?.addEventListener('input', testRegex);
  document.getElementById('tb-regex-input')?.addEventListener('input', testRegex);
  document.getElementById('tb-regex-clear')?.addEventListener('click', () => {
    const pattern = document.getElementById('tb-regex-pattern');
    const flags = document.getElementById('tb-regex-flags');
    const input = document.getElementById('tb-regex-input');
    const output = document.getElementById('tb-regex-output');
    const groups = document.getElementById('tb-regex-groups');
    if (pattern) pattern.value = '';
    if (flags) flags.value = 'gi';
    if (input) input.value = '';
    if (output) output.textContent = '';
    if (groups) groups.style.display = 'none';
  });
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
