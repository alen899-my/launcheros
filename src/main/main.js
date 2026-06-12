const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

// ─── PostgreSQL Connection ────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        path TEXT DEFAULT '',
        command TEXT DEFAULT '',
        tags TEXT[] DEFAULT '{}',
        icon TEXT DEFAULT '🚀',
        color TEXT DEFAULT '#4F6EF7',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
      )
    `);
    // Migrate any missing columns from older schema versions
    const migrates = [
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS path TEXT DEFAULT ''`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS command TEXT DEFAULT ''`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🚀'`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#4F6EF7'`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS port TEXT DEFAULT ''`,
    ];
    for (const sql of migrates) {
      try { await client.query(sql); } catch (e) { /* column may already exist */ }
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📁',
        color TEXT DEFAULT '#3b82f6',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
      )
    `);
    // Add group_id to projects if missing
    try { await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS group_id TEXT DEFAULT ''`); } catch (e) {}
    await client.query(`
      CREATE TABLE IF NOT EXISTS process_logs (
        id SERIAL PRIMARY KEY,
        project_id TEXT NOT NULL,
        timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
        message TEXT NOT NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_logs_project_id ON process_logs(project_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON process_logs(timestamp DESC)`);
    console.log('Database connected and schema ready');
  } finally {
    client.release();
  }
}

async function loadProjects() {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY created_at ASC');
    return result.rows.map(r => ({
      id: r.id,
      name: r.name,
      desc: r.description || '',
      path: r.path || '',
      command: r.command || '',
      port: r.port || null,
      groupId: r.group_id || null,
      tags: r.tags || [],
      icon: r.icon || '🚀',
      color: r.color || '#4F6EF7',
      createdAt: Number(r.created_at),
    }));
  } catch (e) { console.error('Load error:', e); }
  return [];
}

async function saveProjects(projects) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM projects');
    for (const p of projects) {
      await client.query(
        `INSERT INTO projects (id, name, description, path, command, port, group_id, tags, icon, color, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [p.id, p.name, p.desc || '', p.path || '', p.command || '', p.port || '', p.groupId || '', p.tags || [], p.icon || '🚀', p.color || '#4F6EF7', p.createdAt || Date.now()]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Save error:', e);
  } finally {
    client.release();
  }
}

async function loadGroups() {
  try {
    const result = await pool.query('SELECT * FROM project_groups ORDER BY created_at ASC');
    return result.rows.map(r => ({
      id: r.id,
      name: r.name,
      desc: r.description || '',
      icon: r.icon || '📁',
      color: r.color || '#3b82f6',
      createdAt: Number(r.created_at),
    }));
  } catch (e) { console.error('Load groups error:', e); }
  return [];
}

async function saveGroups(groups) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM project_groups');
    for (const g of groups) {
      await client.query(
        `INSERT INTO project_groups (id, name, description, icon, color, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [g.id, g.name, g.desc || '', g.icon || '📁', g.color || '#3b82f6', g.createdAt || Date.now()]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Save groups error:', e);
  } finally {
    client.release();
  }
}

// ─── Running Processes Registry ───────────────────────────────────────────────
const runningProcesses = new Map(); // projectId → { proc, pid }

function killProcessGroup(pid) {
  if (!pid) return
  try {
    // Kill the entire process group (negative PID)
    process.kill(-pid, 'SIGTERM')
    setTimeout(() => {
      try { process.kill(-pid, 'SIGKILL') } catch (e) {}
    }, 1500)
  } catch (e) {
    // Process group may already be dead
  }
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
    // Kill all running processes and their children on close
    for (const [id, { pid }] of runningProcesses) {
      killProcessGroup(pid);
    }
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initDB();
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
ipcMain.handle('projects:load', () => loadProjects());

ipcMain.handle('projects:save', async (_e, projects) => {
  await saveProjects(projects);
  return true;
});

// ─── IPC: Groups CRUD ─────────────────────────────────────────────────────────
ipcMain.handle('groups:load', () => loadGroups());

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

// ─── IPC: Run Project ─────────────────────────────────────────────────────────
ipcMain.on('project:run', (event, { projectId, command, cwd }) => {
  // Kill existing if running (kill whole process group)
  if (runningProcesses.has(projectId)) {
    const existing = runningProcesses.get(projectId);
    killProcessGroup(existing.pid);
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
  const shellArgs = isWindows ? ['/c', command] : ['-c', command];

  let workDir = cwd;
  if (!workDir || !fs.existsSync(workDir)) {
    workDir = os.homedir();
  }

  let proc;
  try {
    proc = spawn(shell_, shellArgs, {
      cwd: workDir,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true, // Own process group so we can kill all children
    });
    proc.unref(); // Don't block parent exit
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

  proc.stdout.on('data', (data) => {
    const msg = data.toString();
    event.sender.send('terminal:data', { projectId, data: msg });
    pool.query('INSERT INTO process_logs (project_id, message) VALUES ($1, $2)', [projectId, msg])
      .catch(() => {});
  });

  let stderrBuf = '';
  proc.stderr.on('data', (data) => {
    const msg = data.toString();
    stderrBuf += msg;
    event.sender.send('terminal:data', { projectId, data: `\x1b[33m${msg}\x1b[0m` });
    pool.query('INSERT INTO process_logs (project_id, message) VALUES ($1, $2)', [projectId, `[stderr] ${msg}`])
      .catch(() => {});
  });

  proc.on('close', (code) => {
    // Kill any remaining child processes in the group
    killProcessGroup(proc.pid);
    runningProcesses.delete(projectId);
    // code is null when killed by signal (user stop) — treat as stopped
    const isError = code !== null && code !== 0 && code !== undefined;
    const color = isError ? '\x1b[31m' : '\x1b[32m';
    const exitMsg = isError ? (stderrBuf.slice(0, 200).replace(/\n/g, ' ').trim() || `Exit code ${code}`) : '';
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

  proc.on('error', (err) => {
    killProcessGroup(proc.pid);
    runningProcesses.delete(projectId);
    event.sender.send('terminal:data', { projectId, data: `\r\n\x1b[31m❌ Error: ${err.message}\x1b[0m\r\n` });
    event.sender.send('project:status', { projectId, status: 'error', message: err.message });
  });
});

// ─── IPC: Stop Project ────────────────────────────────────────────────────────
ipcMain.on('project:stop', (event, { projectId }) => {
  if (runningProcesses.has(projectId)) {
    const { proc, pid } = runningProcesses.get(projectId);
    if (process.platform === 'win32') {
      try {
        require('child_process').execSync(`taskkill /pid ${pid} /f /t`, { timeout: 3000 });
      } catch (e) {}
    } else {
      killProcessGroup(pid);
    }
    runningProcesses.delete(projectId);
    event.sender.send('project:status', { projectId, status: 'stopped' });
    event.sender.send('terminal:data', { projectId, data: '\r\n\x1b[33m⚡ Process stopped by user\x1b[0m\r\n' });
  }
});

// ─── IPC: Terminal Input ──────────────────────────────────────────────────────
ipcMain.on('terminal:input', (_e, { projectId, data }) => {
  const entry = runningProcesses.get(projectId);
  if (entry && entry.proc && entry.proc.stdin) {
    try { entry.proc.stdin.write(data); } catch (e) {}
  }
});

// ─── IPC: Status Check ────────────────────────────────────────────────────────
ipcMain.handle('project:isRunning', (_e, projectId) => {
  return runningProcesses.has(projectId);
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

ipcMain.handle('monitor:getProcessStats', () => {
  const results = [];
  for (const [projectId, { proc, pid }] of runningProcesses) {
    let cpu = 0, mem = 0, rss = 0, elapsed = 0;
    try {
      const isWin = process.platform === 'win32';
      if (isWin) {
        const out = require('child_process').execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 2000 });
        const m = out.match(/"([^"]+)"/g);
        if (m && m.length >= 5) {
          mem = parseInt(m[4]?.replace(/[,\s]/g, '')) || 0;
        }
      } else {
        const out = require('child_process').execFileSync('ps', ['-p', String(pid), '-o', '%cpu,%mem,rss,etime', '--no-headers'], { encoding: 'utf8', timeout: 2000 });
        const parts = out.trim().split(/\s+/);
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
    } catch (e) {}
    results.push({
      projectId,
      pid,
      cpu: Math.round(cpu * 10) / 10,
      memory: Math.round(mem * 10) / 10,
      rss,
      elapsed,
    });
  }
  return results;
});

ipcMain.handle('monitor:getLogs', async (_e, projectId, limit = 200) => {
  try {
    const result = await pool.query(
      'SELECT * FROM process_logs WHERE project_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [projectId, limit]
    );
    return result.rows.reverse();
  } catch (e) { return []; }
});

ipcMain.handle('monitor:getAllLogs', async (_e, limit = 500) => {
  try {
    const result = await pool.query(
      'SELECT * FROM process_logs ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return result.rows.reverse();
  } catch (e) { return []; }
});
