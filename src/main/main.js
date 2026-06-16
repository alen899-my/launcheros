const electronPath = require.resolve('electron');
console.log('electron resolve:', electronPath);
const electron = require('electron');
console.log('electron module:', electron);
console.log('typeof electron:', typeof electron);
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = electron;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.error('Failed to load node-pty:', e.message);
  console.error('Run "npx @electron/rebuild" to rebuild native modules for Electron');
}
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ─── Storage Backend (PostgreSQL → JSON file fallback) ──────────────────────
let usePg = false;
let pool = null;

// JSON file helpers
function dataDir() {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function readJson(name) {
  try {
    const raw = fs.readFileSync(path.join(dataDir(), name), 'utf8');
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function writeJson(name, data) {
  fs.writeFileSync(path.join(dataDir(), name), JSON.stringify(data, null, 2), 'utf8');
}

async function initStorage() {
  // Try PostgreSQL first
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = require('pg');
      const p = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4000 });
      const client = await p.connect();
      await client.query(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', path TEXT DEFAULT '', command TEXT DEFAULT '', tags JSONB DEFAULT '[]'::jsonb, icon TEXT DEFAULT '🚀', color TEXT DEFAULT '#4F6EF7', created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000, port TEXT DEFAULT '', group_id TEXT DEFAULT '', user_id TEXT DEFAULT '', app_url TEXT DEFAULT '', repo_url TEXT DEFAULT '')`);
      const migrates = [
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS path TEXT DEFAULT ''`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS command TEXT DEFAULT ''`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🚀'`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#4F6EF7'`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS port TEXT DEFAULT ''`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT ''`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS app_url TEXT DEFAULT ''`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_url TEXT DEFAULT ''`,
      ];
      for (const sql of migrates) { try { await client.query(sql); } catch (e) {} }
      await client.query(`CREATE TABLE IF NOT EXISTS project_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '📁', color TEXT DEFAULT '#3b82f6', created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000, user_id TEXT DEFAULT '')`);
      try { await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS group_id TEXT DEFAULT ''`); } catch (e) {}
      try { await client.query(`ALTER TABLE project_groups ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT ''`); } catch (e) {}
      await client.query(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000)`);
      await client.query(`CREATE TABLE IF NOT EXISTS process_logs (id SERIAL PRIMARY KEY, project_id TEXT NOT NULL, timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000, message TEXT NOT NULL)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logs_project_id ON process_logs(project_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON process_logs(timestamp DESC)`);
      client.release();
      pool = p;
      usePg = true;
      console.log('Storage: PostgreSQL connected');
      return;
    } catch (e) {
      console.log('Storage: PostgreSQL unavailable, using JSON files (' + e.message + ')');
    }
  }
  console.log('Storage: JSON file storage at', dataDir());
}

// ─── Projects ──────────────────────────────────────────────────────────────────
async function loadProjects(userId) {
  if (usePg && pool) {
    try {
      const result = userId
        ? await pool.query('SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at ASC', [userId])
        : await pool.query('SELECT * FROM projects ORDER BY created_at ASC');
      return result.rows.map(r => ({
        id: r.id, name: r.name, desc: r.description || '', path: r.path || '',
        command: r.command || '', port: r.port || null, groupId: r.group_id || null,
        tags: r.tags || [], icon: r.icon || '🚀', color: r.color || '#4F6EF7',
        createdAt: Number(r.created_at), userId: r.user_id || null,
        appUrl: r.app_url || null, repoUrl: r.repo_url || null,
      }));
    } catch (e) { console.error('Load projects error:', e); }
  }
  const all = readJson('projects.json') || [];
  return userId ? all.filter(p => p.userId === userId) : all;
}

async function saveProjects(projects) {
  if (usePg && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Only delete and re-insert this user's projects
      const userId = projects[0]?.userId || '';
      if (userId) {
        await client.query('DELETE FROM projects WHERE user_id = $1', [userId]);
      } else {
        await client.query('DELETE FROM projects');
      }
      for (const p of projects) {
        await client.query(
          `INSERT INTO projects (id, name, description, path, command, port, group_id, tags, icon, color, created_at, user_id, app_url, repo_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [p.id, p.name, p.desc || '', p.path || '', p.command || '', p.port || '', p.groupId || '',
           JSON.stringify(p.tags || []), p.icon || '🚀', p.color || '#4F6EF7', p.createdAt || Date.now(), p.userId || '', p.appUrl || '', p.repoUrl || '']
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('Save error:', e); }
    finally { client.release(); }
  } else {
    // JSON: merge with existing data to preserve other users' projects
    const existing = readJson('projects.json') || [];
    const userId = projects[0]?.userId || '';
    const filtered = userId ? existing.filter(p => p.userId !== userId) : [];
    writeJson('projects.json', [...filtered, ...projects]);
  }
}

// ─── Groups ────────────────────────────────────────────────────────────────────
async function loadGroups(userId) {
  if (usePg && pool) {
    try {
      const result = userId
        ? await pool.query('SELECT * FROM project_groups WHERE user_id = $1 ORDER BY created_at ASC', [userId])
        : await pool.query('SELECT * FROM project_groups ORDER BY created_at ASC');
      return result.rows.map(r => ({
        id: r.id, name: r.name, desc: r.description || '',
        icon: r.icon || '📁', color: r.color || '#3b82f6', createdAt: Number(r.created_at),
        userId: r.user_id || null,
      }));
    } catch (e) { console.error('Load groups error:', e); }
  }
  const all = readJson('groups.json') || [];
  return userId ? all.filter(g => g.userId === userId) : all;
}

async function saveGroups(groups) {
  if (usePg && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = groups[0]?.userId || '';
      if (userId) {
        await client.query('DELETE FROM project_groups WHERE user_id = $1', [userId]);
      } else {
        await client.query('DELETE FROM project_groups');
      }
      for (const g of groups) {
        await client.query(
          `INSERT INTO project_groups (id, name, description, icon, color, created_at, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [g.id, g.name, g.desc || '', g.icon || '📁', g.color || '#3b82f6', g.createdAt || Date.now(), g.userId || '']
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('Save groups error:', e); }
    finally { client.release(); }
  } else {
    const existing = readJson('groups.json') || [];
    const userId = groups[0]?.userId || '';
    const filtered = userId ? existing.filter(g => g.userId !== userId) : [];
    writeJson('groups.json', [...filtered, ...groups]);
  }
}

// ─── Running Processes Registry ───────────────────────────────────────────────
const runningProcesses = new Map(); // projectId → { proc, pid }
const userStopped = new Set(); // projectIds where user requested stop

function killProcessTree(pid) {
  if (!pid) return
  let children = []
  try {
    const out = require('child_process').execSync(`ps -o pid= --ppid ${pid} 2>/dev/null`, { timeout: 2000, encoding: 'utf8' })
    children = out.trim().split('\n').filter(Boolean).map(c => parseInt(c, 10))
  } catch (e) {}
  for (const child of children) killProcessTree(child)
  try {
    process.kill(pid, 'SIGTERM')
    setTimeout(() => {
      try { process.kill(pid, 'SIGKILL') } catch (e) {}
    }, 1500)
  } catch (e) {}
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#F5F6FA',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    for (const [id, { proc, pid }] of runningProcesses) {
      userStopped.add(id);
      try { proc.kill(); } catch (e) {}
      killProcessTree(pid);
    }
    if (mockServerInstance) {
      for (const socket of mockServerSockets) {
        try { socket.destroy(); } catch (e) {}
      }
      mockServerSockets.clear();
      try { mockServerInstance.close(); } catch (e) {}
      mockServerInstance = null;
    }
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initStorage();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ─── IPC: Window Controls ──────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    const workArea = screen.getPrimaryDisplay().workArea;
    mainWindow.setBounds({ x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height });
  }
});
ipcMain.on('window-close', () => mainWindow?.close());

// ─── IPC: Projects CRUD ───────────────────────────────────────────────────────
ipcMain.handle('projects:load', (_e, userId) => loadProjects(userId));

ipcMain.handle('projects:save', async (_e, projects) => {
  await saveProjects(projects);
  return true;
});

// ─── IPC: Groups CRUD ─────────────────────────────────────────────────────────
ipcMain.handle('groups:load', (_e, userId) => loadGroups(userId));

ipcMain.handle('groups:save', async (_e, groups) => {
  await saveGroups(groups);
  return true;
});

ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('shell:openFolder', (_e, folderPath) => {
  shell.openPath(folderPath);
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  shell.openExternal(url);
});

// Helper to construct environment variables, auto-detecting and activating local virtual environments (venv)
function getProjectEnv(workDir, isWindows) {
  const projectEnv = { ...process.env };
  const pathsToSearch = ['.venv', 'venv'];
  for (const venvDir of pathsToSearch) {
    const venvPath = path.join(workDir, venvDir);
    if (fs.existsSync(venvPath)) {
      const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
      if (fs.existsSync(binDir)) {
        const pathKey = isWindows ? 'Path' : 'PATH';
        const sep = isWindows ? ';' : ':';
        let foundPathKey = pathKey;
        if (isWindows) {
          const keys = Object.keys(projectEnv);
          const matched = keys.find(k => k.toLowerCase() === 'path');
          if (matched) foundPathKey = matched;
        }
        const originalPath = projectEnv[foundPathKey] || '';
        projectEnv[foundPathKey] = binDir + sep + originalPath;
        projectEnv['VIRTUAL_ENV'] = venvPath;
        break;
      }
    }
  }
  return projectEnv;
}

// ─── IPC: Run Project ─────────────────────────────────────────────────────────
ipcMain.on('project:run', (event, { projectId, command, cwd }) => {
  // Kill existing if running (kill whole process group)
  if (runningProcesses.has(projectId)) {
    userStopped.add(projectId);
    const existing = runningProcesses.get(projectId);
    try { existing.proc.kill(); } catch (e) {}
    killProcessTree(existing.pid);
    runningProcesses.delete(projectId);
  }

  // Clean stale lock files from previous runs
  if (cwd) {
    try {
      const lockPath = path.join(cwd, '.next', 'dev', 'lock');
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch (e) {}
  }

  const isWindows = process.platform === 'win32';
  const shell_ = isWindows ? 'cmd.exe' : '/bin/bash';
  const shellArgs = isWindows ? ['/c', command] : ['-l', '-c', command];

  let workDir = cwd;
  if (!workDir || !fs.existsSync(workDir)) {
    workDir = os.homedir();
  }

  const injectPath = path.join(__dirname, 'console-inject.js');
  const nodeCommands = /\b(node|npm|npx|yarn|pnpm|bun|next|nuxt|vite|vue|ng|react-scripts|nx|tsx|ts-node)\b/;
  if (nodeCommands.test(command)) {
    const existingNodeOpts = process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + ' ' : '';
    const nodeFlag = existingNodeOpts + '--require "' + injectPath + '"';
    if (isWindows) {
      command = 'set NODE_OPTIONS=' + nodeFlag + ' && ' + command;
    } else {
      command = 'NODE_OPTIONS="' + nodeFlag + '" ' + command;
    }
  }

  const projectEnv = getProjectEnv(workDir, isWindows);

  // Load .env from project directory
  const envPath = path.join(workDir, '.env');
  try {
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        if (!key) continue;
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
          val = val.slice(1, -1);
        projectEnv[key] = val;
      }
    }
  } catch (e) {}

  if (!pty) {
    event.sender.send('terminal:data', { projectId, data: `\r\n❌ node-pty not available. Run "npx @electron/rebuild" and restart.\r\n` });
    event.sender.send('project:status', { projectId, status: 'error', message: 'node-pty not built for this Electron version' });
    return;
  }

  let proc;
  try {
    proc = pty.spawn(shell_, shellArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: workDir,
      env: projectEnv,
    });
  } catch (err) {
    event.sender.send('terminal:data', { projectId, data: `\r\n❌ Failed to start: ${err.message}\r\n` });
    event.sender.send('project:status', { projectId, status: 'error', message: err.message });
    return;
  }

  runningProcesses.set(projectId, { proc, pid: proc.pid });
  event.sender.send('project:status', { projectId, status: 'running', pid: proc.pid });
  event.sender.send('terminal:data', {
    projectId,
    data: `\r\n\x1b[36m▶ Running: ${command}\x1b[0m\r\n\x1b[90mCWD: ${workDir}\x1b[0m\r\n\x1b[90mPID: ${proc.pid}\x1b[0m\r\n${'─'.repeat(50)}\r\n`
  });

  let outputBuf = '';
  proc.onData((data) => {
    outputBuf += data;
    if (outputBuf.length > 2000) outputBuf = outputBuf.slice(-500);
    event.sender.send('terminal:data', { projectId, data });
    if (usePg && pool) {
      pool.query('INSERT INTO process_logs (project_id, message) VALUES ($1, $2)', [projectId, data]).catch(() => {});
    }
  });

  proc.on('exit', (exitCode, signal) => {
    runningProcesses.delete(projectId);
    if (userStopped.has(projectId)) {
      userStopped.delete(projectId);
      return;
    }
    const code = exitCode !== null && exitCode !== undefined ? exitCode : (signal !== null && signal !== undefined ? `signal ${signal}` : '?');
    const isError = exitCode !== null && exitCode !== 0 && exitCode !== undefined;
    const color = isError ? '\x1b[31m' : '\x1b[32m';
    const exitMsg = isError ? (outputBuf.slice(-200).replace(/\n/g, ' ').trim() || `Exit code ${code}`) : '';
    event.sender.send('terminal:data', {
      projectId,
      data: `\r\n${'─'.repeat(50)}\r\n${color}◼ Process exited with code ${code}\x1b[0m\r\n`
    });
    event.sender.send('project:status', {
      projectId,
      status: isError ? 'error' : 'stopped',
      message: exitMsg
    });
  });
});

// ─── IPC: Stop Project ────────────────────────────────────────────────────────
ipcMain.on('project:stop', (event, { projectId }) => {
  if (runningProcesses.has(projectId)) {
    userStopped.add(projectId);
    const { proc, pid } = runningProcesses.get(projectId);
    try { proc.kill(); } catch (e) {}
    killProcessTree(pid);
    runningProcesses.delete(projectId);
    event.sender.send('project:status', { projectId, status: 'stopped' });
    event.sender.send('terminal:data', { projectId, data: '\r\n\x1b[33m⚡ Process stopped by user\x1b[0m\r\n' });
  }
});

// ─── IPC: Stop All ─────────────────────────────────────────────────────────────
ipcMain.handle('project:stopAll', () => {
  for (const [projectId, { proc, pid }] of runningProcesses) {
    userStopped.add(projectId);
    try { proc.kill(); } catch (e) {}
    killProcessTree(pid);
    runningProcesses.delete(projectId);
    if (mainWindow) {
      mainWindow.webContents.send('project:status', { projectId, status: 'stopped' });
      mainWindow.webContents.send('terminal:data', { projectId, data: '\r\n\x1b[33m⚡ Stopped by user (batch)\x1b[0m\r\n' });
    }
  }
  return true;
});

// ─── IPC: Terminal Input ──────────────────────────────────────────────────────
ipcMain.on('terminal:input', (_e, { projectId, data }) => {
  const entry = runningProcesses.get(projectId);
  if (entry && entry.proc) {
    try { entry.proc.write(data); } catch (e) {}
  }
});

ipcMain.on('project:resize', (_e, { projectId, cols, rows }) => {
  const entry = runningProcesses.get(projectId);
  if (entry && entry.proc) {
    try { entry.proc.resize(cols, rows); } catch (e) {}
  }
});

// ─── IPC: Status Check ────────────────────────────────────────────────────────
ipcMain.handle('project:isRunning', (_e, projectId) => {
  return runningProcesses.has(projectId);
});

// ─── Shell Sessions (separate from running processes) ────────────────────────
const shellProcesses = new Map(); // projectId → { proc }

ipcMain.on('shell:spawn', (event, { projectId, cwd }) => {
  // Kill existing shell for this project
  if (shellProcesses.has(projectId)) {
    try { shellProcesses.get(projectId).proc.kill(); } catch (e) {}
    shellProcesses.delete(projectId);
  }

  let workDir = cwd;
  if (!workDir || !fs.existsSync(workDir)) workDir = os.homedir();

  const isWindows = process.platform === 'win32';
  const shell = isWindows ? 'cmd.exe' : '/bin/bash';
  const args = isWindows ? [] : ['-l'];

  if (!pty) {
    if (!event.sender.isDestroyed())
      event.sender.send('shell:data', { projectId, data: `\r\n\x1b[31mnode-pty not available. Run "npx @electron/rebuild" and restart.\x1b[0m\r\n` });
    return;
  }

  let proc;
  try {
    proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workDir,
      env: { ...getProjectEnv(workDir, isWindows), TERM: 'xterm-256color' },
    });
  } catch (err) {
    if (!event.sender.isDestroyed())
      event.sender.send('shell:data', { projectId, data: `\r\n\x1b[31mFailed to spawn shell: ${err.message}\x1b[0m\r\n` });
    return;
  }

  shellProcesses.set(projectId, { proc });
  if (!event.sender.isDestroyed())
    event.sender.send('shell:data', { projectId, data: `\x1b[36m┌─ Shell opened — ${workDir}\x1b[0m\r\n` });

  proc.onData((data) => {
    if (!event.sender.isDestroyed())
      event.sender.send('shell:data', { projectId, data });
  });

  proc.onExit(() => {
    shellProcesses.delete(projectId);
    if (!event.sender.isDestroyed())
      event.sender.send('shell:data', { projectId, data: '\r\n\x1b[33m└─ Shell closed\x1b[0m\r\n' });
  });
});

ipcMain.on('shell:input', (_e, { projectId, data }) => {
  const entry = shellProcesses.get(projectId);
  if (entry) try { entry.proc.write(data); } catch (e) {}
});

ipcMain.on('shell:kill', (_e, projectId) => {
  const entry = shellProcesses.get(projectId);
  if (entry) {
    try { entry.proc.kill(); } catch (e) {}
    shellProcesses.delete(projectId);
  }
});

ipcMain.on('shell:resize', (_e, { projectId, cols, rows }) => {
  const entry = shellProcesses.get(projectId);
  if (entry) try { entry.proc.resize(cols, rows); } catch (e) {}
});

// ─── Auth: User Storage ───────────────────────────────────────────────────────
async function loadUsers() {
  if (usePg && pool) {
    try {
      const result = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
      return result.rows.map(r => ({
        id: r.id, username: r.username, passwordHash: r.password_hash,
        salt: r.salt, createdAt: Number(r.created_at),
      }));
    } catch (e) { console.error('Load users error:', e); }
  }
  return readJson('users.json') || [];
}

async function saveUsers(users) {
  if (usePg && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM users');
      for (const u of users) {
        await client.query(
          `INSERT INTO users (id, username, password_hash, salt, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [u.id, u.username, u.passwordHash, u.salt, u.createdAt || Date.now()]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('Save users error:', e); }
    finally { client.release(); }
  } else {
    writeJson('users.json', users);
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// ─── IPC: Auth ─────────────────────────────────────────────────────────────────
ipcMain.handle('auth:register', async (_e, username, password) => {
  if (!username || username.length < 3) return { ok: false, error: 'Username must be at least 3 characters' };
  if (!password || password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' };
  const users = await loadUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: 'Username already taken' };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const user = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
    username, passwordHash, salt, createdAt: Date.now()
  };
  users.push(user);
  await saveUsers(users);
  return { ok: true, user: { id: user.id, username: user.username } };
});

ipcMain.handle('auth:login', async (_e, username, password) => {
  const users = await loadUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { ok: false, error: 'Invalid username or password' };
  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return { ok: false, error: 'Invalid username or password' };
  return { ok: true, user: { id: user.id, username: user.username } };
});

// ─── IPC: Monitoring ──────────────────────────────────────────────────────────
ipcMain.handle('monitor:getSystemStats', () => {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpuCount = cpus.length;

  // Calculate CPU usage from /proc/stat or load average
  let cpuPercent = 0;
  try {
    const procStat = fs.readFileSync('/proc/stat', 'utf8');
    const cpuLine = procStat.split('\n').find(l => l.startsWith('cpu '));
    if (cpuLine) {
      const parts = cpuLine.trim().split(/\s+/).slice(1).map(Number);
      const total = parts.reduce((a, b) => a + b, 0);
      const idle = parts[3] || 0;
      cpuPercent = Math.round((1 - idle / total) * 100);
    }
  } catch (e) {
    cpuPercent = Math.round((loadAvg[0] / cpuCount) * 100);
  }

  return {
    cpuPercent: Math.min(cpuPercent, 100),
    cpuCount,
    loadAvg: loadAvg[0],
    memoryUsed: usedMem,
    memoryTotal: totalMem,
    memoryPercent: Math.round((usedMem / totalMem) * 100),
    uptime: os.uptime(),
    freeMem,
  };
});

// ─── IPC: Kill processes on a port ─────────────────────────────────────────────
ipcMain.handle('project:killPort', async (_e, port) => {
  try {
    require('child_process').execSync(`fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9 2>/dev/null`, { timeout: 5000 });
    return true;
  } catch (e) { return false; }
});

// ─── IPC: Detect ports in use on the system ────────────────────────────────────
ipcMain.handle('project:getUsedPorts', () => {
  const ports = []
  try {
    const tcp = fs.readFileSync('/proc/net/tcp', 'utf8')
    const lines = tcp.split('\n').slice(1)
    for (const line of lines) {
      if (!line.trim()) continue
      const parts = line.trim().split(/\s+/)
      if (parts.length < 2) continue
      const localAddr = parts[1]
      if (!localAddr) continue
      const portHex = localAddr.split(':')[1]
      if (!portHex) continue
      const port = parseInt(portHex, 16)
      if (port > 0 && port <= 65535 && !ports.includes(port)) ports.push(port)
    }
  } catch (e) {}
  return ports
});

ipcMain.handle('monitor:getProcessStats', async () => {
  const results = [];
  const promises = [];
  for (const [projectId, { proc, pid }] of runningProcesses) {
    promises.push((async () => {
      let cpu = 0, mem = 0, rss = 0, elapsed = 0;
      try {
        const isWin = process.platform === 'win32';
        if (isWin) {
          const { stdout } = await execFileAsync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeout: 2000 });
          const m = stdout.match(/"([^"]+)"/g);
          if (m && m.length >= 5) {
            const kb = parseInt(m[4]?.replace(/[^0-9]/g, '')) || 0;
            rss = kb * 1024;
            mem = (rss / os.totalmem()) * 100;
          }
        } else {
          const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', '%cpu,%mem,rss,etime', '--no-headers'], { timeout: 2000 });
          const parts = stdout.trim().split(/\s+/);
          if (parts.length >= 3) {
            cpu = parseFloat(parts[0]) || 0;
            mem = parseFloat(parts[1]) || 0;
            rss = (parseInt(parts[2]) || 0) * 1024;
            if (parts[3]) {
              const et = parts[3];
              if (et.includes('-')) {
                const [d, hms] = et.split('-');
                elapsed = parseInt(d) * 86400 + hms.split(':').reduce((a, b) => a * 60 + parseInt(b), 0);
              } else {
                elapsed = et.split(':').reduce((a, b) => a * 60 + parseInt(b), 0);
              }
            }
          }
        }
      } catch (e) {}
      results.push({
        projectId,
        pid,
        cpu: Math.round(cpu * 10) / 10,
        memory: Math.round(mem * 10) / 10,
        rss,
        elapsed,
      });
    })());
  }
  await Promise.all(promises);
  return results;
});

ipcMain.handle('monitor:getLogs', async (_e, projectId, limit = 200) => {
  if (!usePg || !pool) return [];
  try {
    const result = await pool.query(
      'SELECT * FROM process_logs WHERE project_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [projectId, limit]
    );
    return result.rows.reverse();
  } catch (e) { return []; }
});

ipcMain.handle('monitor:getAllLogs', async (_e, limit = 500) => {
  if (!usePg || !pool) return [];
  try {
    const result = await pool.query(
      'SELECT * FROM process_logs ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return result.rows.reverse();
  } catch (e) { return []; }
});

// ─── IPC: .env Manager ────────────────────────────────────────────────────────
ipcMain.handle('project:readEnv', async (_e, { projectPath }) => {
  const envPath = path.join(projectPath, '.env');
  if (!fs.existsSync(envPath)) return [];
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const result = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key) result.push({ key, value: val });
      }
    }
    return result;
  } catch (e) {
    return [];
  }
});

ipcMain.handle('project:writeEnv', async (_e, { projectPath, envVars }) => {
  const envPath = path.join(projectPath, '.env');
  try {
    let content = '';
    for (const item of envVars) {
      if (item.key && item.key.trim()) {
        content += `${item.key.trim()}=${item.value || ''}\n`;
      }
    }
    fs.writeFileSync(envPath, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─── IPC: System Port Finder & Process Killer ───────────────────────────────────
async function getWindowsPorts() {
  const portsList = [];
  try {
    const procMap = new Map();
    const { stdout: tlOut } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 3000 });
    const tlLines = tlOut.split(/\r?\n/);
    for (const line of tlLines) {
      const m = line.match(/"([^"]+)"/g);
      if (m && m.length >= 2) {
        const name = m[0].replace(/"/g, '');
        const pidStr = m[1].replace(/"/g, '');
        const pid = parseInt(pidStr, 10);
        if (pid) procMap.set(pid, name);
      }
    }

    const { stdout: nsOut } = await execFileAsync('netstat', ['-ano'], { timeout: 3000 });
    const nsLines = nsOut.split(/\r?\n/);
    for (const line of nsLines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('TCP') && !trimmed.startsWith('UDP')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 5) continue;
      const proto = parts[0];
      const localAddr = parts[1];
      const state = parts[3];
      const pidStr = parts[4];
      const pid = parseInt(pidStr, 10);

      if (state !== 'LISTENING') continue;

      const colonIdx = localAddr.lastIndexOf(':');
      if (colonIdx === -1) continue;
      const portStr = localAddr.slice(colonIdx + 1);
      const port = parseInt(portStr, 10);
      if (!port) continue;

      const processName = procMap.get(pid) || 'Unknown';

      if (portsList.some(x => x.port === port && x.pid === pid)) continue;

      portsList.push({
        port,
        protocol: proto,
        processName,
        pid,
        status: state
      });
    }
  } catch (e) {
    console.error('Error listing Windows ports:', e);
  }
  return portsList.sort((a, b) => a.port - b.port);
}

async function getUnixPorts() {
  const portsList = [];
  try {
    const { stdout } = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'], { timeout: 3000 });
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('COMMAND')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 9) continue;
      const processName = parts[0];
      const pid = parseInt(parts[1], 10);
      const nameField = parts[8];

      const colonIdx = nameField.lastIndexOf(':');
      if (colonIdx === -1) continue;
      const portStr = nameField.slice(colonIdx + 1);
      const port = parseInt(portStr, 10);
      if (!port) continue;

      if (portsList.some(x => x.port === port && x.pid === pid)) continue;

      portsList.push({
        port,
        protocol: 'TCP',
        processName,
        pid,
        status: 'LISTENING'
      });
    }
  } catch (e) {
    console.error('Error listing Unix ports:', e);
  }
  return portsList.sort((a, b) => a.port - b.port);
}

ipcMain.handle('monitor:getListeningPorts', async () => {
  if (process.platform === 'win32') {
    return getWindowsPorts();
  } else {
    return getUnixPorts();
  }
});

ipcMain.handle('monitor:killProcess', async (_e, pid) => {
  try {
    if (process.platform === 'win32') {
      require('child_process').execSync(`taskkill /PID ${pid} /F`, { timeout: 3000 });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─── IPC: Git & GitHub ──────────────────────────────────────────────────────────
function parseGitHubUrl(url) {
  if (!url) return null;
  let clean = url.trim();
  if (clean.endsWith('.git')) clean = clean.slice(0, -4);
  const match = clean.match(/github\.com[\/:]([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

ipcMain.handle('git:getStatus', async (_e, { projectPath }) => {
  if (!projectPath || !fs.existsSync(projectPath) || !fs.existsSync(path.join(projectPath, '.git'))) {
    return { isGit: false };
  }
  try {
    const { stdout: branch } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectPath, timeout: 3000 });
    let remoteUrl = '';
    try {
      const { stdout: remote } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: projectPath, timeout: 3000 });
      remoteUrl = remote.trim();
    } catch (e) {}

    const gh = parseGitHubUrl(remoteUrl);
    return {
      isGit: true,
      branch: branch.trim(),
      remoteUrl,
      github: gh
    };
  } catch (err) {
    return { isGit: false, error: err.message };
  }
});

ipcMain.handle('git:getCommits', async (_e, { projectPath, page = 1, limit = 15 }) => {
  if (!projectPath || !fs.existsSync(projectPath) || !fs.existsSync(path.join(projectPath, '.git'))) {
    return [];
  }
  try {
    const skip = (page - 1) * limit;
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-n', String(limit), `--skip=${skip}`, '--pretty=format:%H|%an|%ae|%ad|%s', '--date=iso-strict'],
      { cwd: projectPath, timeout: 3000 }
    );
    const lines = stdout.split('\n');
    const commits = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('|');
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0],
          author: parts[1],
          email: parts[2],
          date: parts[3],
          message: parts.slice(4).join('|')
        });
      }
    }
    return commits;
  } catch (err) {
    return [];
  }
});

ipcMain.handle('git:pull', async (_e, { projectPath }) => {
  if (!projectPath || !fs.existsSync(projectPath)) return { ok: false, error: 'Path not found' };
  try {
    const { stdout, stderr } = await execFileAsync('git', ['pull'], { cwd: projectPath, timeout: 20000 });
    return { ok: true, stdout: stdout || '', stderr: stderr || '' };
  } catch (err) {
    return { ok: false, error: err.message, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
});

ipcMain.handle('git:fetch', async (_e, { projectPath }) => {
  if (!projectPath || !fs.existsSync(projectPath)) return { ok: false, error: 'Path not found' };
  try {
    const { stdout, stderr } = await execFileAsync('git', ['fetch'], { cwd: projectPath, timeout: 20000 });
    return { ok: true, stdout: stdout || '', stderr: stderr || '' };
  } catch (err) {
    return { ok: false, error: err.message, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
});

ipcMain.handle('git:saveToken', async (_e, { token }) => {
  try {
    const settings = readJson('settings.json') || {};
    settings.githubToken = token;
    writeJson('settings.json', settings);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('git:getToken', async () => {
  try {
    const settings = readJson('settings.json') || {};
    return settings.githubToken || '';
  } catch (e) {
    return '';
  }
});

// ─── IPC: Developer Toolbox Command Runner & Storage ─────────────────────────────────
const runningToolboxProcesses = new Map();

ipcMain.on('toolbox:run', (event, { commandId, command }) => {
  if (runningToolboxProcesses.has(commandId)) {
    const existing = runningToolboxProcesses.get(commandId);
    try { existing.proc.kill(); } catch (e) {}
    killProcessTree(existing.pid);
    runningToolboxProcesses.delete(commandId);
  }

  const isWindows = process.platform === 'win32';
  const shell_ = isWindows ? 'cmd.exe' : '/bin/bash';
  const shellArgs = isWindows ? ['/c', command] : ['-l', '-c', command];

  if (!pty) {
    event.sender.send('toolbox:data', { commandId, data: `\r\n❌ Terminal runner not available. Run "npx @electron/rebuild" and restart.\r\n` });
    return;
  }

  try {
    const proc = pty.spawn(shell_, shellArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    runningToolboxProcesses.set(commandId, { proc, pid: proc.pid });

    proc.onData(data => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('toolbox:data', { commandId, data });
      }
    });

    proc.onExit(({ exitCode }) => {
      runningToolboxProcesses.delete(commandId);
      if (!event.sender.isDestroyed()) {
        event.sender.send('toolbox:data', { commandId, data: `\r\n\r\n[Process exited with code ${exitCode}]\r\n` });
      }
    });
  } catch (err) {
    if (!event.sender.isDestroyed()) {
      event.sender.send('toolbox:data', { commandId, data: `\r\n❌ Failed to execute: ${err.message}\r\n` });
    }
  }
});

ipcMain.on('toolbox:stop', (_e, { commandId }) => {
  if (runningToolboxProcesses.has(commandId)) {
    const entry = runningToolboxProcesses.get(commandId);
    try { entry.proc.kill(); } catch (e) {}
    killProcessTree(entry.pid);
    runningToolboxProcesses.delete(commandId);
  }
});

ipcMain.handle('toolbox:load', async () => {
  try {
    const data = readJson('toolbox.json');
    if (data) return data;
    // Default commands and snippets
    const defaultData = {
      commands: [
        { id: 'cmd_docker_prune', name: 'Prune Docker System', desc: 'Clear unused docker containers, networks, and images.', command: 'docker system prune -f' },
        { id: 'cmd_npm_clear', name: 'Clear NPM Cache', desc: 'Flush npm cache to resolve build issues.', command: 'npm cache clean --force' },
        { id: 'cmd_dns_flush', name: 'Flush DNS Cache', desc: 'Clears system DNS resolver cache.', command: process.platform === 'win32' ? 'ipconfig /flushdns' : 'sudo dscacheutil -flushcache' },
        { id: 'cmd_check_ip', name: 'Check Local IP', desc: 'Display active network IP addresses.', command: process.platform === 'win32' ? 'ipconfig' : 'ifconfig' }
      ],
      snippets: [
        { id: 'snip_docker_compose', name: 'Docker Compose Node.js Template', desc: 'Basic docker-compose service configuration.', lang: 'yaml', code: `version: '3.8'\nservices:\n  app:\n    image: node:18-alpine\n    ports:\n      - "3000:3000"\n    volumes:\n      - .:/app\n    working_dir: /app\n    command: npm run dev` },
        { id: 'snip_gitignore', name: 'Standard Node.js .gitignore', desc: 'Typical gitignore rules for javascript projects.', lang: 'text', code: `node_modules/\n.env*\n.DS_Store\ndist/\nbuild/\nnpm-debug.log*` }
      ]
    };
    writeJson('toolbox.json', defaultData);
    return defaultData;
  } catch (e) {
    return { commands: [], snippets: [] };
  }
});

ipcMain.handle('toolbox:save', async (_e, data) => {
  try {
    writeJson('toolbox.json', data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─── IPC: API Client Request Tester ───────────────────────────────────────────
ipcMain.handle('api:request', async (_e, { method, url, headers, body }) => {
  try {
    const options = {
      method: method || 'GET',
      headers: headers || {},
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && body) {
      options.body = body;
    }

    const startTime = Date.now();
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    const responseText = await response.text();

    const respHeaders = {};
    response.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
      body: responseText,
      duration
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message
    };
  }
});

ipcMain.handle('api:loadHistory', async () => {
  try {
    const history = readJson('api_history.json');
    return history || [];
  } catch (e) {
    return [];
  }
});

ipcMain.handle('api:saveHistory', async (_e, history) => {
  try {
    writeJson('api_history.json', history);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─── IPC: Database SQL Explorer ──────────────────────────────────────────────
let explorerPool = null;

ipcMain.handle('db:connect', async (_e, connectionString) => {
  if (explorerPool) {
    try { await explorerPool.end(); } catch (e) {}
    explorerPool = null;
  }

  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
    });

    const client = await pool.connect();
    client.release();

    explorerPool = pool;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('db:getTables', async () => {
  if (!explorerPool) {
    return { ok: false, error: 'No active database connection' };
  }

  try {
    const res = await explorerPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    return { ok: true, tables: res.rows.map(r => r.table_name) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('db:execute', async (_e, sql) => {
  if (!explorerPool) {
    return { ok: false, error: 'No active database connection' };
  }

  try {
    const startTime = Date.now();
    const res = await explorerPool.query(sql);
    const duration = Date.now() - startTime;

    const rows = Array.isArray(res.rows) ? res.rows : [];
    const fields = Array.isArray(res.fields) ? res.fields.map(f => f.name) : [];

    return {
      ok: true,
      rows,
      fields,
      rowCount: res.rowCount,
      command: res.command,
      duration
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('db:disconnect', async () => {
  if (explorerPool) {
    try {
      await explorerPool.end();
    } catch (e) {}
    explorerPool = null;
  }
  return { ok: true };
});

// ─── IPC: Mock HTTP Server & Webhook Inspector ───────────────────────────
let mockServerInstance = null;
const mockServerSockets = new Set();

ipcMain.handle('mock-server:start', async (event, port, endpoints) => {
  if (mockServerInstance) {
    for (const socket of mockServerSockets) {
      try { socket.destroy(); } catch (e) {}
    }
    mockServerSockets.clear();
    try {
      await new Promise((resolve) => mockServerInstance.close(resolve));
    } catch (e) {}
    mockServerInstance = null;
  }

  const http = require('http');
  const url = require('url');

  mockServerInstance = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const reqPath = parsedUrl.pathname || '/';
    const reqMethod = req.method ? req.method.toUpperCase() : 'GET';

    // Find configured endpoint
    const match = endpoints.find(ep => {
      const epPath = ep.path.trim().startsWith('/') ? ep.path.trim() : '/' + ep.path.trim();
      const matchPath = reqPath.trim();
      return epPath.toLowerCase() === matchPath.toLowerCase() && ep.method.toUpperCase() === reqMethod;
    });

    let bodyChunks = [];
    req.on('data', chunk => {
      bodyChunks.push(chunk);
    });

    req.on('end', () => {
      const rawBody = Buffer.concat(bodyChunks).toString();
      const startTime = Date.now();

      const respond = () => {
        const duration = Date.now() - startTime;
        const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || '127.0.0.1';
        const statusCode = match ? parseInt(match.statusCode, 10) || 200 : 404;

        // Construct response headers
        let resHeaders = { 'Content-Type': 'application/json' };
        if (match && Array.isArray(match.headers)) {
          resHeaders = {};
          match.headers.forEach(h => {
            if (h.key && h.key.trim()) {
              resHeaders[h.key.trim()] = h.value || '';
            }
          });
        }

        // Send telemetry payload to renderer
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('mock-server:request', {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            timestamp: Date.now(),
            method: reqMethod,
            url: req.url,
            path: reqPath,
            query: parsedUrl.query || {},
            headers: req.headers || {},
            body: rawBody,
            clientIp,
            duration,
            statusCode,
          });
        }

        res.writeHead(statusCode, resHeaders);
        if (match) {
          res.end(match.body || '');
        } else {
          res.end(JSON.stringify({ error: `Mock endpoint for ${reqMethod} ${reqPath} not found` }));
        }
      };

      const delay = match ? parseInt(match.delay, 10) || 0 : 0;
      if (delay > 0) {
        setTimeout(respond, delay);
      } else {
        respond();
      }
    });
  });

  mockServerInstance.on('connection', socket => {
    mockServerSockets.add(socket);
    socket.on('close', () => {
      mockServerSockets.delete(socket);
    });
  });

  return new Promise((resolve) => {
    mockServerInstance.on('error', (err) => {
      mockServerInstance = null;
      resolve({ ok: false, error: err.message });
    });
    mockServerInstance.listen(port, () => {
      resolve({ ok: true, port });
    });
  });
});

ipcMain.handle('mock-server:stop', async () => {
  if (!mockServerInstance) return { ok: true };

  for (const socket of mockServerSockets) {
    try { socket.destroy(); } catch (e) {}
  }
  mockServerSockets.clear();

  return new Promise((resolve) => {
    mockServerInstance.close(() => {
      mockServerInstance = null;
      resolve({ ok: true });
    });
  });
});

ipcMain.handle('mock-server:status', () => {
  return {
    running: mockServerInstance !== null,
    port: mockServerInstance ? mockServerInstance.address()?.port : null
  };
});

ipcMain.handle('mock-server:load', () => {
  try {
    const data = readJson('mock_server.json');
    return data || { port: 4000, endpoints: [] };
  } catch (e) {
    return { port: 4000, endpoints: [] };
  }
});

ipcMain.handle('mock-server:save', (_e, data) => {
  try {
    writeJson('mock_server.json', data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});





