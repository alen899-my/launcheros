const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Auth
  register: (username, password) => ipcRenderer.invoke('auth:register', username, password),
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),

  // Projects
  loadProjects: (userId) => ipcRenderer.invoke('projects:load', userId),
  saveProjects: (projects) => ipcRenderer.invoke('projects:save', projects),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  openFolder: (p) => ipcRenderer.invoke('shell:openFolder', p),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Groups
  loadGroups: (userId) => ipcRenderer.invoke('groups:load', userId),
  saveGroups: (groups) => ipcRenderer.invoke('groups:save', groups),

  // Process control
  runProject: (opts) => ipcRenderer.send('project:run', opts),
  stopProject: (opts) => ipcRenderer.send('project:stop', opts),
  isRunning: (projectId) => ipcRenderer.invoke('project:isRunning', projectId),
  sendInput: (opts) => ipcRenderer.send('terminal:input', opts),
  projectResize: (opts) => ipcRenderer.send('project:resize', opts),
  readEnv: (opts) => ipcRenderer.invoke('project:readEnv', opts),
  writeEnv: (opts) => ipcRenderer.invoke('project:writeEnv', opts),

  // Listeners
  onTerminalData: (cb) => ipcRenderer.on('terminal:data', (_e, v) => cb(v)),
  onStatusChange: (cb) => ipcRenderer.on('project:status', (_e, v) => cb(v)),
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch),

  // Stop all running processes
  stopAll: () => ipcRenderer.invoke('project:stopAll'),

  // Port conflict detection
  getUsedPorts: () => ipcRenderer.invoke('project:getUsedPorts'),
  killPort: (port) => ipcRenderer.invoke('project:killPort', port),

  // Shell sessions
  shellSpawn: (opts) => ipcRenderer.send('shell:spawn', opts),
  shellInput: (opts) => ipcRenderer.send('shell:input', opts),
  shellKill: (projectId) => ipcRenderer.send('shell:kill', projectId),
  shellResize: (opts) => ipcRenderer.send('shell:resize', opts),
  onShellData: (cb) => ipcRenderer.on('shell:data', (_e, v) => cb(v)),

  // Monitoring
  getSystemStats: () => ipcRenderer.invoke('monitor:getSystemStats'),
  getProcessStats: () => ipcRenderer.invoke('monitor:getProcessStats'),
  getLogs: (projectId, limit) => ipcRenderer.invoke('monitor:getLogs', projectId, limit),
  getAllLogs: (limit) => ipcRenderer.invoke('monitor:getAllLogs', limit),
  getListeningPorts: () => ipcRenderer.invoke('monitor:getListeningPorts'),
  killProcess: (pid) => ipcRenderer.invoke('monitor:killProcess', pid),

  // Git & GitHub
  gitGetStatus: (opts) => ipcRenderer.invoke('git:getStatus', opts),
  gitGetCommits: (opts) => ipcRenderer.invoke('git:getCommits', opts),
  gitPull: (opts) => ipcRenderer.invoke('git:pull', opts),
  gitFetch: (opts) => ipcRenderer.invoke('git:fetch', opts),
  gitSaveToken: (opts) => ipcRenderer.invoke('git:saveToken', opts),
  gitGetToken: () => ipcRenderer.invoke('git:getToken'),

  // Developer Toolbox
  runToolboxCommand: (opts) => ipcRenderer.send('toolbox:run', opts),
  stopToolboxCommand: (opts) => ipcRenderer.send('toolbox:stop', opts),
  loadToolboxData: () => ipcRenderer.invoke('toolbox:load'),
  saveToolboxData: (data) => ipcRenderer.invoke('toolbox:save', data),
  onToolboxData: (cb) => ipcRenderer.on('toolbox:data', (_e, v) => cb(v)),

  // API Client
  sendApiRequest: (opts) => ipcRenderer.invoke('api:request', opts),
  loadApiHistory: () => ipcRenderer.invoke('api:loadHistory'),
  saveApiHistory: (history) => ipcRenderer.invoke('api:saveHistory', history),

  // Database Explorer
  dbConnect: (connStr) => ipcRenderer.invoke('db:connect', connStr),
  dbGetTables: () => ipcRenderer.invoke('db:getTables'),
  dbExecuteQuery: (sql) => ipcRenderer.invoke('db:execute', sql),
  dbDisconnect: () => ipcRenderer.invoke('db:disconnect'),

  // Mock Server
  mockServerStart: (port, endpoints) => ipcRenderer.invoke('mock-server:start', port, endpoints),
  mockServerStop: () => ipcRenderer.invoke('mock-server:stop'),
  mockServerGetStatus: () => ipcRenderer.invoke('mock-server:status'),
  mockServerLoadData: () => ipcRenderer.invoke('mock-server:load'),
  mockServerSaveData: (data) => ipcRenderer.invoke('mock-server:save', data),
  onMockServerRequest: (cb) => ipcRenderer.on('mock-server:request', (_e, v) => cb(v)),
});

