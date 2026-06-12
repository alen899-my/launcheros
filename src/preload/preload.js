const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Projects
  loadProjects: () => ipcRenderer.invoke('projects:load'),
  saveProjects: (projects) => ipcRenderer.invoke('projects:save', projects),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  openFolder: (p) => ipcRenderer.invoke('shell:openFolder', p),

  // Groups
  loadGroups: () => ipcRenderer.invoke('groups:load'),
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

  // Port conflict detection
  getUsedPorts: () => ipcRenderer.invoke('project:getUsedPorts'),
  killPort: (port) => ipcRenderer.invoke('project:killPort', port),

  // Monitoring
  getSystemStats: () => ipcRenderer.invoke('monitor:getSystemStats'),
  getProcessStats: () => ipcRenderer.invoke('monitor:getProcessStats'),
  getLogs: (projectId, limit) => ipcRenderer.invoke('monitor:getLogs', projectId, limit),
  getAllLogs: (limit) => ipcRenderer.invoke('monitor:getAllLogs', limit),
});
