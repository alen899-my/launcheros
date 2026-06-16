import { 
  setProjects, 
  setGroups, 
  setStatuses, 
  setTerminalBuffers, 
  setSearchQuery, 
  setSelectedFilter, 
  statuses, 
  terminalBuffers, 
  activeTermTab, 
  groups, 
  currentUser,
  subscribe,
  setSelectedGroupId
} from './state.js'
import { renderSidebar, updateStats } from './sidebar.js'
import { renderCards, stopProject, doRunProject, selectProject, runProject, restartProject, editProject, deleteProject, renderSkeleton } from './cards.js'
import { 
  writeToTerminal, 
  clearTerminalBuffer, 
  updateTermTabStatus, 
  ensureTerminalElements, 
  toggleTerminalPanel, 
  switchTermTab, 
  closeTermTab,
  appendConsoleOutput,
  clearConsoleBuffer,
  extractConsoleData
} from './terminal.js'
import { openModal, closeModal, saveProject, renderGroupSelect } from './modal.js'
import { openGroupModal, closeGroupModal, saveGroup, doDeleteGroup, renderGroupsTable } from './groups.js'
import { toast } from './toast.js'
import { startMonitoring, stopMonitoring } from './monitor.js'
import { startConsoleView, stopConsoleView, setConsoleFilter, doClearConsole } from './console.js'
import { startShellView, stopShellView, writeToShell, openShell, closeShell, switchShell, showProjectPicker } from './shell.js'
import { parseRequestData, tickMetrics, clearProjectMetrics } from './requestMetrics.js'
import { setupAuth, initAuthUI, logout, hideAuth } from './auth.js'
import { startGitView, stopGitView } from './git.js'
import { startToolboxView, stopToolboxView } from './toolbox.js'
import { startApiClientView, stopApiClientView } from './api-client.js'
import { startDbExplorerView, stopDbExplorerView } from './db-explorer.js'
import { startMockServerView, stopMockServerView } from './mock-server.js'


let currentView = 'projects'

async function init() {
  const user = setupAuth()
  if (!user) {
    initAuthUI(onAuthSuccess)
    return
  }
  hideAuth()
  await loadUserData(user)
  setupReactiveUI()
  setupListeners()
  setupIPCListeners()
  startMetricsInterval()
}

async function loadUserData(user) {
  renderSkeleton()
  const [loaded, loadedGroups] = await Promise.all([
    window.electronAPI.loadProjects(user.id),
    window.electronAPI.loadGroups(user.id)
  ])
  const st = {}
  const buf = {}
  loaded.forEach(p => { 
    st[p.id] = 'idle'
    buf[p.id] = '' 
  })
  setProjects(loaded)
  setGroups(loadedGroups)
  setStatuses(st)
  setTerminalBuffers(buf)
}

function onAuthSuccess(user) {
  hideAuth()
  loadUserData(user).then(() => {
    setupReactiveUI()
    setupListeners()
    setupIPCListeners()
    startMetricsInterval()
  })
}

function startMetricsInterval() {
  setInterval(() => {
    const runningIds = Object.entries(statuses)
      .filter(([, s]) => s === 'running')
      .map(([id]) => id)
    tickMetrics(runningIds)
  }, 2000)
}

// Reactive UI subscription to state updates
function setupReactiveUI() {
  buildUI()
  subscribe(() => {
    buildUI()
  })
}

function buildUI() {
  renderSidebar()
  renderCards()
  updateStats()
  renderGroupsTable()
}

function setupIPCListeners() {
  window.electronAPI.onTerminalData(({ projectId, data }) => {
    parseRequestData(projectId, data)

    const { clean, entries } = extractConsoleData(data)
    
    for (const entry of entries) {
      appendConsoleOutput(projectId, entry.level, entry.msg)
    }

    // Ensure elements & tab exist in panel
    ensureTerminalElements(projectId)
    writeToTerminal(projectId, clean)
    updateTermTabStatus(projectId)
  })

  window.electronAPI.onShellData(({ projectId, data }) => {
    writeToShell(projectId, data)
  })

  window.electronAPI.onStatusChange(({ projectId, status, message }) => {
    statuses[projectId] = status
    buildUI()
    updateTermTabStatus(projectId)
    
    if (status === 'running') {
      toast('▶ Started', 'success')
    } else if (status === 'stopped' || status === 'error') {
      toast(status === 'stopped' ? '◼ Stopped' : 'Failed', 'error')
      clearProjectMetrics(projectId)
      clearConsoleBuffer(projectId)
      clearTerminalBuffer(projectId)
    }
  })
}

function switchView(view) {
  currentView = view
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view))
  
  const panels = ['cards-area', 'monitor-view', 'console-view', 'shell-view', 'groups-area', 'git-view', 'toolbox-area', 'api-client-view', 'db-explorer-view', 'mock-server-view']
  panels.forEach(id => {
    const p = document.getElementById(id)
    if (!p) return
    const isTarget = (id === 'cards-area' && view === 'projects') ||
                     (id === 'monitor-view' && view === 'monitor') ||
                     (id === 'console-view' && view === 'console') ||
                     (id === 'shell-view' && view === 'shell') ||
                     (id === 'groups-area' && view === 'groups') ||
                     (id === 'git-view' && view === 'git') ||
                     (id === 'toolbox-area' && view === 'toolbox') ||
                     (id === 'api-client-view' && view === 'api-client') ||
                     (id === 'db-explorer-view' && view === 'db-explorer') ||
                     (id === 'mock-server-view' && view === 'mock-server')
    p.classList.toggle('active', isTarget)
  })

  const titleEl = document.getElementById('view-title')
  if (titleEl) {
    titleEl.textContent = view === 'projects' ? 'All Projects' : view === 'monitor' ? 'Monitor' : view === 'console' ? 'Console' : view === 'shell' ? 'Shell' : view === 'git' ? 'Git Logs' : view === 'toolbox' ? 'Developer Toolbox' : view === 'api-client' ? 'API Client (Request Tester)' : view === 'db-explorer' ? 'SQL Explorer' : view === 'mock-server' ? 'Mock Server & Webhook Inspector' : 'Groups'
  }
  
  const filterTabs = document.querySelector('.filter-tabs')
  if (filterTabs) filterTabs.style.display = view === 'projects' ? 'flex' : 'none'
  
  const searchWrap = document.getElementById('search-wrap')
  if (searchWrap) searchWrap.style.display = view === 'projects' ? '' : 'none'

  if (view === 'monitor') {
    startMonitoring()
    stopConsoleView()
    stopShellView()
    stopGitView()
    stopToolboxView()
    stopApiClientView()
    stopDbExplorerView()
    stopMockServerView()
  } else if (view === 'console') {
    startConsoleView()
    stopMonitoring()
    stopShellView()
    stopGitView()
    stopToolboxView()
    stopApiClientView()
    stopDbExplorerView()
    stopMockServerView()
  } else if (view === 'shell') {
    startShellView()
    stopMonitoring()
    stopConsoleView()
    stopGitView()
    stopToolboxView()
    stopApiClientView()
    stopDbExplorerView()
    stopMockServerView()
  } else if (view === 'git') {
    startGitView()
    stopMonitoring()
    stopConsoleView()
    stopShellView()
    stopToolboxView()
    stopApiClientView()
    stopDbExplorerView()
    stopMockServerView()
  } else if (view === 'toolbox') {
    startToolboxView()
    stopMonitoring()
    stopConsoleView()
    stopShellView()
    stopGitView()
    stopApiClientView()
    stopDbExplorerView()
    stopMockServerView()
  } else if (view === 'api-client') {
    startApiClientView()
    stopMonitoring()
    stopConsoleView()
    stopShellView()
    stopGitView()
    stopToolboxView()
    stopDbExplorerView()
    stopMockServerView()
  } else if (view === 'db-explorer') {
    startDbExplorerView()
    stopMonitoring()
    stopConsoleView()
    stopShellView()
    stopGitView()
    stopToolboxView()
    stopApiClientView()
    stopMockServerView()
  } else if (view === 'mock-server') {
    startMockServerView()
    stopMonitoring()
    stopConsoleView()
    stopShellView()
    stopGitView()
    stopToolboxView()
    stopApiClientView()
    stopDbExplorerView()
  } else {
    stopMonitoring()
    stopConsoleView()
    stopShellView()
    stopGitView()
    stopToolboxView()
    stopApiClientView()
    stopDbExplorerView()
    stopMockServerView()
  }
  
  buildUI()
}

function setupListeners() {
  // Static buttons & inputs
  document.getElementById('add-project-btn')?.addEventListener('click', () => openModal('add'))
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal)
  document.getElementById('modal-overlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
  document.getElementById('modal-save-btn')?.addEventListener('click', saveProject)

  document.getElementById('group-create-btn')?.addEventListener('click', () => openGroupModal('add'))
  document.getElementById('group-modal-close-btn')?.addEventListener('click', closeGroupModal)
  document.getElementById('group-modal-cancel-btn')?.addEventListener('click', closeGroupModal)
  document.getElementById('group-modal-save-btn')?.addEventListener('click', () => {
    saveGroup()
    renderGroupSelect()
  })
  document.getElementById('group-modal-overlay')?.addEventListener('click', e => { 
    if (e.target === e.currentTarget) closeGroupModal() 
  })

  document.getElementById('browse-btn')?.addEventListener('click', async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) document.getElementById('form-path').value = folder
  })

  document.getElementById('search-input')?.addEventListener('input', e => {
    setSearchQuery(e.target.value.toLowerCase())
  })

  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelectedFilter(btn.dataset.filter)
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view))
  })

  document.querySelectorAll('.cmd-hint').forEach(btn => {
    btn.addEventListener('click', () => {
      const formCmd = document.getElementById('form-cmd')
      if (formCmd) formCmd.value = btn.dataset.cmd
    })
  })

  document.getElementById('stop-all-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('stop-all-btn')
    if (!btn) return
    btn.textContent = '■ Stopping...'
    btn.disabled = true
    await window.electronAPI.stopAll()
    btn.textContent = '■ Stop All'
    btn.disabled = false
  })

  document.getElementById('term-toggle-btn')?.addEventListener('click', toggleTerminalPanel)

  document.getElementById('term-clear-btn')?.addEventListener('click', () => {
    if (activeTermTab) {
      clearTerminalBuffer(activeTermTab)
    }
  })

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    logout(() => {
      window.electronAPI.stopAll()
      setProjects([])
      setGroups([])
      setStatuses({})
      setTerminalBuffers({})
      document.getElementById('project-list').innerHTML = ''
      document.getElementById('table-body').innerHTML = ''
      document.getElementById('term-tabs').innerHTML = ''
      document.getElementById('term-bodies').innerHTML = '<div class="term-placeholder" id="term-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg><span>Run a project to see its terminal output here</span></div>'
    })
  })

  // Conflict Modal
  const conflictOverlay = document.getElementById('conflict-overlay')
  const closeConflictOverlay = () => {
    if (conflictOverlay) conflictOverlay.classList.remove('open')
    window.__pendingRunId = null
  }
  document.getElementById('conflict-close-btn')?.addEventListener('click', closeConflictOverlay)
  document.getElementById('conflict-cancel-btn')?.addEventListener('click', closeConflictOverlay)
  conflictOverlay?.addEventListener('click', e => { if (e.target === e.currentTarget) closeConflictOverlay() })

  document.getElementById('conflict-stop-btn')?.addEventListener('click', async () => {
    const items = conflictOverlay?.querySelectorAll('.conflict-item') || []
    const portEl = document.getElementById('conflict-port')
    const port = portEl ? parseInt(portEl.textContent) : 0
    for (const item of items) {
      const cid = item.dataset.id
      if (cid === '__external__') {
        if (port) await window.electronAPI.killPort(port)
      } else {
        stopProject(cid)
      }
    }
    const runId = window.__pendingRunId
    if (conflictOverlay) conflictOverlay.classList.remove('open')
    window.__pendingRunId = null
    if (runId) setTimeout(() => doRunProject(runId), 300)
  })

  // Env modal listeners
  document.getElementById('env-modal-close-btn')?.addEventListener('click', closeEnvModal)
  document.getElementById('env-modal-cancel-btn')?.addEventListener('click', closeEnvModal)
  document.getElementById('env-modal-save-btn')?.addEventListener('click', saveEnvVars)
  document.getElementById('env-add-var-btn')?.addEventListener('click', () => {
    currentEnvList.push({ key: '', value: '' })
    renderEnvList()
  })

  // Close overlays when clicking outside env modal
  document.getElementById('env-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEnvModal()
  })

  // ─── Event Delegation setups for dynamic areas ──────────────────────

  // 1. Sidebar Menu Clicks
  document.getElementById('sidebar-menu')?.addEventListener('click', e => {
    const item = e.target.closest('.sidebar-item')
    if (!item) return
    if (item.id === 'menu-all-projects') {
      setSelectedGroupId(null)
      switchView('projects')
    } else if (item.id === 'menu-groups') {
      switchView('groups')
    } else if (item.id === 'menu-toolbox') {
      switchView('toolbox')
    } else if (item.id === 'menu-api-client') {
      switchView('api-client')
    } else if (item.id === 'menu-db-explorer') {
      switchView('db-explorer')
    } else if (item.id === 'menu-mock-server') {
      switchView('mock-server')
    }
  })

  // 1b. Groups Table Action Clicks
  document.getElementById('groups-table-body')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    e.stopPropagation()
    const id = btn.dataset.id
    const action = btn.dataset.action

    if (action === 'view-projects') {
      setSelectedGroupId(id)
      switchView('projects')
    } else if (action === 'edit-group') {
      openGroupModal('edit', id)
    } else if (action === 'delete-group') {
      doDeleteGroup(id)
    }
  })

  // 2. Table Row Action Clicks
  document.getElementById('table-body')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    e.stopPropagation()
    const row = btn.closest('.table-row')
    if (!row || !row.dataset.id) return
    const id = row.dataset.id
    const action = btn.dataset.action

    if (action === 'run') runProject(id)
    else if (action === 'stop') stopProject(id)
    else if (action === 'restart') restartProject(id)
    else if (action === 'terminal') switchTermTab(id)
    else if (action === 'env') openEnvModal(id)
    else if (action === 'edit') editProject(id)
    else if (action === 'delete') deleteProject(id)
  })

  // 3. Shell tabs and closures
  document.getElementById('shell-tabs')?.addEventListener('click', e => {
    const closeBtn = e.target.closest('.shell-tab-close')
    if (closeBtn && closeBtn.dataset.close) {
      e.stopPropagation()
      closeShell(closeBtn.dataset.close)
      return
    }
    const tab = e.target.closest('.shell-tab')
    if (tab && tab.dataset.id) {
      switchShell(tab.dataset.id)
    }
  })

  // 4. Shell project picker
  document.getElementById('shell-add-btn')?.addEventListener('click', showProjectPicker)
  document.getElementById('shell-picker-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.shell-picker-item')
    if (btn && btn.dataset.id) {
      openShell(btn.dataset.id)
      const overlay = document.getElementById('shell-picker-overlay')
      if (overlay) overlay.style.display = 'none'
    }
  })

  // 5. Terminal tabs and closures
  document.getElementById('term-tabs')?.addEventListener('click', e => {
    const closeBtn = e.target.closest('.tt-close')
    if (closeBtn && closeBtn.dataset.close) {
      e.stopPropagation()
      closeTermTab(closeBtn.dataset.close)
      return
    }
    const tab = e.target.closest('.term-tab')
    if (tab && tab.dataset.id) {
      switchTermTab(tab.dataset.id)
    }
  })

  // 6. Console filters
  document.getElementById('console-filter-bar')?.addEventListener('click', e => {
    const btn = e.target.closest('.con-filter-btn')
    if (btn && btn.dataset.filter) {
      setConsoleFilter(btn.dataset.filter)
    }
  })

  // 7. Console cards clear log
  document.getElementById('console-output-container')?.addEventListener('click', e => {
    const btn = e.target.closest('.con-view-clear')
    if (btn && btn.dataset.clear) {
      doClearConsole(btn.dataset.clear)
    }
  })

  // Global document events
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'n') { 
      e.preventDefault()
      openModal('add') 
    }
    if (e.key === 'Escape') {
      if (document.getElementById('group-modal-overlay')?.classList.contains('open')) {
        closeGroupModal()
      } else if (document.getElementById('env-modal-overlay')?.classList.contains('open')) {
        closeEnvModal()
      } else if (conflictOverlay?.classList.contains('open')) {
        closeConflictOverlay()
      } else {
        closeModal()
      }
    }
  })

  // Close overlays when clicking outside
  document.addEventListener('click', e => {
    const overlay = document.getElementById('shell-picker-overlay')
    if (overlay && overlay.style.display === 'block' && 
        !e.target.closest('#shell-picker-overlay') && 
        !e.target.closest('#shell-add-btn')) {
      overlay.style.display = 'none'
    }
  })
}

document.addEventListener('DOMContentLoaded', init)

window.addEventListener('error', e => {
  toast(`JS Error: ${e.message}`, 'error')
})

window.addEventListener('unhandledrejection', e => {
  toast(`Error: ${e.reason?.message || e.reason || 'Unknown'}`, 'error')
})

// ─── .env Variable Manager ────────────────────────────────────────────────────
let currentEnvProjectId = null
let currentEnvList = []

async function openEnvModal(projectId) {
  const p = projects.find(x => x.id === projectId)
  if (!p) return
  currentEnvProjectId = projectId
  
  const overlay = document.getElementById('env-modal-overlay')
  const title = document.getElementById('env-modal-title')
  if (!overlay || !title) return

  title.innerHTML = `.env Manager &middot; <span style="font-weight:400;color:var(--muted-foreground)">${esc(p.name)}</span>`
  overlay.classList.add('open')

  try {
    currentEnvList = await window.electronAPI.readEnv({ projectPath: p.path })
  } catch (e) {
    currentEnvList = []
  }

  renderEnvList()
}

function closeEnvModal() {
  const overlay = document.getElementById('env-modal-overlay')
  if (overlay) overlay.classList.remove('open')
  currentEnvProjectId = null
  currentEnvList = []
}

function renderEnvList() {
  const container = document.getElementById('env-variables-list')
  if (!container) return

  if (currentEnvList.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted-foreground);font-size:12px">No variables configured. Click "+ Add Variable" to add one.</div>`
    return
  }

  const trashSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'

  let html = ''
  currentEnvList.forEach((item, index) => {
    html += `
      <div class="env-var-row" data-index="${index}">
        <input type="text" class="env-input-key" value="${esc(item.key)}" placeholder="KEY" />
        <input type="text" class="env-input-val" value="${esc(item.value)}" placeholder="value" />
        <button class="btn-remove-var" data-index="${index}" title="Remove Variable">${trashSvg}</button>
      </div>
    `
  })
  container.innerHTML = html

  container.querySelectorAll('.env-var-row').forEach(row => {
    const idx = parseInt(row.dataset.index)
    const keyInput = row.querySelector('.env-input-key')
    const valInput = row.querySelector('.env-input-val')
    keyInput.addEventListener('input', () => {
      currentEnvList[idx].key = keyInput.value.toUpperCase().replace(/[^A-Z0-9_]/g, '')
      if (keyInput.value !== currentEnvList[idx].key) {
        keyInput.value = currentEnvList[idx].key
      }
    })
    valInput.addEventListener('input', () => {
      currentEnvList[idx].value = valInput.value
    })
  })

  container.querySelectorAll('.btn-remove-var').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index)
      currentEnvList.splice(idx, 1)
      renderEnvList()
    })
  })
}

async function saveEnvVars() {
  if (!currentEnvProjectId) return
  const p = projects.find(x => x.id === currentEnvProjectId)
  if (!p) return

  const validVars = currentEnvList.filter(item => item.key && item.key.trim())

  const saveBtn = document.getElementById('env-modal-save-btn')
  if (saveBtn) {
    saveBtn.disabled = true
    saveBtn.textContent = 'Saving...'
  }

  const result = await window.electronAPI.writeEnv({ projectPath: p.path, envVars: validVars })
  
  if (saveBtn) {
    saveBtn.disabled = false
    saveBtn.textContent = 'Save Changes'
  }

  if (result.ok) {
    toast('.env file updated', 'success')
    closeEnvModal()
  } else {
    toast(`Failed to save: ${result.error}`, 'error')
  }
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
