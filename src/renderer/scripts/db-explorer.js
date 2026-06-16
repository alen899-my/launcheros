import { toast } from './toast.js';

let isInitialized = false;
let activeConnectionString = '';
let databaseTables = [];

export function startDbExplorerView() {
  if (!isInitialized) {
    setupDbListeners();
    isInitialized = true;
  }

  // Restore connection string from localStorage
  const savedConn = localStorage.getItem('db_explorer_conn_string');
  const connStringTextarea = document.getElementById('db-conn-string');
  if (connStringTextarea && savedConn) {
    connStringTextarea.value = savedConn;
  }

  // Auto-connect if already connected in main process (handled gracefully on connect attempts)
}

export function stopDbExplorerView() {
  // Teardown if necessary
}

async function connectDatabase() {
  const connStringTextarea = document.getElementById('db-conn-string');
  const connectBtn = document.getElementById('db-connect-btn');
  const setupForm = document.getElementById('db-setup-form');
  const connectedPane = document.getElementById('db-connected-pane');
  const sqlInput = document.getElementById('db-sql-input');
  const queryRunBtn = document.getElementById('db-query-run');

  if (!connStringTextarea || !connectBtn || !setupForm || !connectedPane || !sqlInput || !queryRunBtn) return;

  const connStr = connStringTextarea.value.trim();
  if (!connStr) {
    toast('Connection string is required', 'error');
    return;
  }

  connectBtn.textContent = 'Connecting...';
  connectBtn.disabled = true;

  try {
    const res = await window.electronAPI.dbConnect(connStr);
    
    if (res.ok) {
      activeConnectionString = connStr;
      localStorage.setItem('db_explorer_conn_string', connStr);
      toast('Database connected successfully', 'success');

      // Update UI panels
      setupForm.style.display = 'none';
      connectedPane.style.display = 'flex';
      sqlInput.removeAttribute('disabled');
      queryRunBtn.removeAttribute('disabled');

      // Load Tables list
      await fetchTables();
    } else {
      connectBtn.textContent = 'Connect Database';
      connectBtn.disabled = false;
      toast(`Connection failed: ${res.error}`, 'error');
    }
  } catch (err) {
    connectBtn.textContent = 'Connect Database';
    connectBtn.disabled = false;
    toast(`Connection error: ${err.message}`, 'error');
  }
}

async function fetchTables() {
  const listContainer = document.getElementById('db-tables-list');
  if (!listContainer) return;

  listContainer.innerHTML = `<div style="padding:8px;color:var(--muted-foreground);font-size:11px;">Loading tables...</div>`;

  try {
    const res = await window.electronAPI.dbGetTables();
    if (res.ok) {
      databaseTables = res.tables || [];
      renderTables();
    } else {
      listContainer.innerHTML = `<div style="padding:8px;color:var(--error);font-size:11px;">Error loading tables</div>`;
    }
  } catch (err) {
    listContainer.innerHTML = `<div style="padding:8px;color:var(--error);font-size:11px;">Error: ${err.message}</div>`;
  }
}

function renderTables() {
  const container = document.getElementById('db-tables-list');
  if (!container) return;

  if (databaseTables.length === 0) {
    container.innerHTML = `<div style="padding:8px;color:var(--muted-foreground);font-size:11px;">No public tables found</div>`;
    return;
  }

  container.innerHTML = databaseTables.map(t => {
    return `
      <div class="db-table-item" data-table="${t}">
        <span class="db-table-icon">📁</span>
        <span class="db-table-name">${esc(t)}</span>
      </div>
    `;
  }).join('');
}

async function executeQuery(customSql = null) {
  const sqlInput = document.getElementById('db-sql-input');
  const runBtn = document.getElementById('db-query-run');
  const resultsEmpty = document.getElementById('db-results-empty');
  const resultsTableWrap = document.getElementById('db-results-table-wrap');
  const resultsError = document.getElementById('db-results-error');
  const resultsMeta = document.getElementById('db-results-meta');

  if (!sqlInput || !runBtn) return;

  const sql = customSql || sqlInput.value.trim();
  if (!sql) {
    toast('SQL Query is empty', 'error');
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = 'Running...';
  
  if (resultsEmpty) resultsEmpty.style.display = 'none';
  if (resultsTableWrap) resultsTableWrap.style.display = 'none';
  if (resultsError) resultsError.style.display = 'none';
  if (resultsMeta) resultsMeta.style.display = 'none';

  try {
    const res = await window.electronAPI.dbExecuteQuery(sql);
    
    runBtn.disabled = false;
    runBtn.textContent = 'Run Query';

    if (res.ok) {
      toast('Query executed successfully', 'success');

      // Update Results Meta
      if (resultsMeta) {
        resultsMeta.style.display = 'flex';
        const statusEl = document.getElementById('db-results-status');
        const countEl = document.getElementById('db-results-count');
        const timeEl = document.getElementById('db-results-time');

        if (statusEl) {
          statusEl.textContent = `${res.command || 'OK'} OK`;
          statusEl.className = 'api-status-badge status-2xx';
        }
        if (countEl) {
          countEl.textContent = typeof res.rowCount === 'number' ? `${res.rowCount} rows` : '';
        }
        if (timeEl) {
          timeEl.textContent = `${res.duration}ms`;
        }
      }

      // Render Dynamic Grid
      if (res.fields && res.fields.length > 0) {
        if (resultsTableWrap) resultsTableWrap.style.display = 'block';
        renderResultsGrid(res.fields, res.rows);
      } else {
        // Command completed but returned no fields (like UPDATE, CREATE TABLE)
        if (resultsError) {
          resultsError.style.display = 'block';
          resultsError.className = 'tb-jwt-status-banner valid';
          resultsError.innerHTML = `Query completed successfully. Affected rows: ${res.rowCount || 0}`;
        }
      }
    } else {
      // Database query threw syntax error or database exception
      if (resultsError) {
        resultsError.style.display = 'block';
        resultsError.className = 'tb-error-banner';
        resultsError.textContent = `Database Error: ${res.error}`;
      }
    }
  } catch (err) {
    runBtn.disabled = false;
    runBtn.textContent = 'Run Query';
    toast(`Query execution failed: ${err.message}`, 'error');
  }
}

function renderResultsGrid(fields, rows) {
  const thead = document.getElementById('db-results-thead');
  const tbody = document.getElementById('db-results-tbody');

  if (!thead || !tbody) return;

  // Render headers
  thead.innerHTML = `
    <tr>
      ${fields.map(f => `<th style="text-transform: capitalize;">${esc(f)}</th>`).join('')}
    </tr>
  `;

  // Render rows
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${fields.length}" style="text-align:center;color:var(--muted-foreground);padding:16px;">
          No rows returned
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    return `
      <tr>
        ${fields.map(f => {
          const val = row[f];
          const displayVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val === null || val === undefined ? 'NULL' : val);
          return `<td title="${esc(displayVal)}">${esc(displayVal)}</td>`;
        }).join('')}
      </tr>
    `;
  }).join('');
}

async function disconnectDatabase() {
  const setupForm = document.getElementById('db-setup-form');
  const connectedPane = document.getElementById('db-connected-pane');
  const sqlInput = document.getElementById('db-sql-input');
  const queryRunBtn = document.getElementById('db-query-run');
  const resultsEmpty = document.getElementById('db-results-empty');
  const resultsTableWrap = document.getElementById('db-results-table-wrap');
  const resultsError = document.getElementById('db-results-error');
  const resultsMeta = document.getElementById('db-results-meta');

  if (!setupForm || !connectedPane || !sqlInput || !queryRunBtn) return;

  try {
    await window.electronAPI.dbDisconnect();
    activeConnectionString = '';
    databaseTables = [];
    toast('Database disconnected', 'success');

    // UI Reset
    setupForm.style.display = 'flex';
    connectedPane.style.display = 'none';
    
    const connectBtn = document.getElementById('db-connect-btn');
    if (connectBtn) {
      connectBtn.textContent = 'Connect Database';
      connectBtn.disabled = false;
    }

    sqlInput.value = '';
    sqlInput.setAttribute('disabled', 'true');
    queryRunBtn.setAttribute('disabled', 'true');

    if (resultsEmpty) resultsEmpty.style.display = 'flex';
    if (resultsTableWrap) resultsTableWrap.style.display = 'none';
    if (resultsError) resultsError.style.display = 'none';
    if (resultsMeta) resultsMeta.style.display = 'none';
  } catch (e) {
    toast(`Failed to disconnect: ${e.message}`, 'error');
  }
}

function setupDbListeners() {
  // 1. Connect
  document.getElementById('db-connect-btn')?.addEventListener('click', connectDatabase);

  // 2. Disconnect
  document.getElementById('db-disconnect-btn')?.addEventListener('click', disconnectDatabase);

  // 3. Clear Query input
  document.getElementById('db-query-clear')?.addEventListener('click', () => {
    const input = document.getElementById('db-sql-input');
    if (input) input.value = '';
  });

  // 4. Run custom SQL query
  document.getElementById('db-query-run')?.addEventListener('click', () => executeQuery());

  // 5. Table Clicks (Delegate)
  document.getElementById('db-tables-list')?.addEventListener('click', e => {
    const item = e.target.closest('.db-table-item');
    if (item && item.dataset.table) {
      const tableName = item.dataset.table;
      
      // Update highlights
      document.querySelectorAll('.db-table-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');

      // Autofill query and execute
      const sqlInput = document.getElementById('db-sql-input');
      if (sqlInput) {
        const query = `SELECT * FROM ${tableName} LIMIT 50;`;
        sqlInput.value = query;
        executeQuery(query);
      }
    }
  });
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
