import { setProjects, setGroups, setStatuses, setTerminalBuffers, setSearchQuery, setSelectedFilter, statuses, terminalBuffers, activeTermTab, groups } from './state.js'
import { renderSidebar, updateStats } from './sidebar.js'
import { renderCards, stopProject, doRunProject } from './cards.js'
import { appendTermOutput, updateTermTabStatus } from './terminal.js'
import { openModal, closeModal, saveProject, renderGroupSelect } from './modal.js'
import { openGroupsModal, closeGroupsModal, addGroup, saveGroups } from './groups.js'
import { toast } from './toast.js'
import { startMonitoring, stopMonitoring } from './monitor.js'

let currentView = 'projects'

async function init() {
  const [loaded, loadedGroups] = await Promise.all([
    window.electronAPI.loadProjects(),
    window.electronAPI.loadGroups()
  ])
  const st = {}
  const buf = {}
  loaded.forEach(p => { st[p.id] = 'idle'; buf[p.id] = '' })
  setProjects(loaded)
  setGroups(loadedGroups)
  setStatuses(st)
  setTerminalBuffers(buf)
  buildUI()
  setupListeners()
  setupIPCListeners()
}

function setupIPCListeners() {
  window.electronAPI.onTerminalData(({ projectId, data }) => {
    if (!terminalBuffers[projectId]) terminalBuffers[projectId] = ''
    terminalBuffers[projectId] += data
    if (activeTermTab === projectId) {
      appendTermOutput(projectId, data)
    }
    updateTermTabStatus(projectId)
  })

  window.electronAPI.onStatusChange(({ projectId, status, message }) => {
    statuses[projectId] = status
    updateProjectStatus(projectId, status)
    if (status === 'running') toast('▶ Started', 'success')
    if (status === 'stopped') toast('◼ Stopped')
    if (status === 'error') toast('Failed', 'error')
  })
}

function buildUI() {
  renderSidebar()
  renderCards()
  updateStats()
}

function updateProjectStatus(id, status) {
  statuses[id] = status
  buildUI()
  updateStats()
  updateTermTabStatus(id)
}

function switchView(view) {
  currentView = view
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view))
  document.querySelectorAll('#content-area > .view-panel').forEach(p => p.classList.toggle('active', p.id === view || (p.id === 'cards-area' && view === 'projects') || (p.id === 'monitor-view' && view === 'monitor')))

  document.getElementById('view-title').textContent = view === 'projects' ? 'All Projects' : 'Monitor'
  document.querySelector('.filter-tabs').style.display = view === 'projects' ? 'flex' : 'none'
  document.getElementById('search-wrap').style.display = view === 'projects' ? '' : 'none'

  if (view === 'monitor') {
    startMonitoring()
  } else {
    stopMonitoring()
  }
}

function setupListeners() {
  document.getElementById('add-project-btn').addEventListener('click', () => openModal('add'))
  document.getElementById('modal-close-btn').addEventListener('click', closeModal)
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal)
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
  document.getElementById('modal-save-btn').addEventListener('click', saveProject)

  document.getElementById('manage-groups-btn').addEventListener('click', openGroupsModal)
  document.getElementById('groups-close-btn').addEventListener('click', closeGroupsModal)
  document.getElementById('groups-cancel-btn').addEventListener('click', closeGroupsModal)
  document.getElementById('groups-add-btn').addEventListener('click', () => { addGroup(); renderGroupSelect() })
  document.getElementById('groups-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeGroupsModal() })
  document.getElementById('groups-save-btn').addEventListener('click', () => {
    window.electronAPI.saveGroups(groups)
    renderGroupSelect()
    closeGroupsModal()
  })
  // Press Enter to add group
  document.getElementById('groups-input').addEventListener('keydown', e => { if (e.key === 'Enter') { addGroup(); renderGroupSelect() } })

  document.getElementById('browse-btn').addEventListener('click', async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) document.getElementById('form-path').value = folder
  })

  document.getElementById('search-input').addEventListener('input', e => {
    setSearchQuery(e.target.value.toLowerCase())
    renderSidebar()
    renderCards()
  })

  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelectedFilter(btn.dataset.filter)
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderCards()
    })
  })

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view))
  })

  document.querySelectorAll('.cmd-hint').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('form-cmd').value = btn.dataset.cmd
    })
  })

  document.getElementById('term-toggle-btn').addEventListener('click', () => {
    const panel = document.getElementById('terminal-panel')
    const btn = document.getElementById('term-toggle-btn')
    panel.classList.toggle('collapsed')
    btn.textContent = panel.classList.contains('collapsed') ? '▲ Terminal' : '▼ Terminal'
  })

  document.getElementById('term-clear-btn').addEventListener('click', () => {
    if (activeTermTab) {
      terminalBuffers[activeTermTab] = ''
      const output = document.getElementById(`term-output-${activeTermTab}`)
      if (output) output.innerHTML = ''
    }
  })

  // Conflict modal
  const conflictOverlay = document.getElementById('conflict-overlay')
  function closeConflictOverlay() {
    conflictOverlay.classList.remove('open')
    window.__pendingRunId = null
  }
  document.getElementById('conflict-close-btn').addEventListener('click', closeConflictOverlay)
  document.getElementById('conflict-cancel-btn').addEventListener('click', closeConflictOverlay)
  conflictOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeConflictOverlay() })

  document.getElementById('conflict-stop-btn').addEventListener('click', async () => {
    const items = conflictOverlay.querySelectorAll('.conflict-item')
    const portEl = document.getElementById('conflict-port')
    for (const item of items) {
      const cid = item.dataset.id
      if (cid === '__external__') {
        await window.electronAPI.killPort(parseInt(portEl.textContent))
      } else {
        stopProject(cid)
      }
    }
    const runId = window.__pendingRunId
    conflictOverlay.classList.remove('open')
    window.__pendingRunId = null
    if (runId) setTimeout(() => doRunProject(runId), 300)
  })

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); openModal('add') }
    if (e.key === 'Escape') {
      if (document.getElementById('groups-overlay').classList.contains('open')) closeGroupsModal()
      else if (conflictOverlay.classList.contains('open')) closeConflictOverlay()
      else closeModal()
    }
  })
}

document.addEventListener('DOMContentLoaded', init)

// Global error handling
window.addEventListener('error', e => {
  toast(`JS Error: ${e.message}`, 'error')
})
window.addEventListener('unhandledrejection', e => {
  toast(`Error: ${e.reason?.message || e.reason || 'Unknown'}`, 'error')
})

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
