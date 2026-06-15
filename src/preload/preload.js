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
});
