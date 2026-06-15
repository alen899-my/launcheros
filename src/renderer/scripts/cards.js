import { projects, groups, statuses, terminalBuffers, activeTermTab, selectedFilter, searchQuery, setActiveTermTab } from './state.js'
import { renderSidebar, updateStats } from './sidebar.js'
import { toast } from './toast.js'
import { openTerminal } from './terminal.js'

export function renderCards() {
  const area = document.getElementById('cards-area')
  const emptyState = document.getElementById('empty-state')
  const tbody = document.getElementById('table-body')

  let visible = projects.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery) ||
      (p.desc || '').toLowerCase().includes(searchQuery) ||
      (p.tags || []).some(t => t.toLowerCase().includes(searchQuery))
    const st = statuses[p.id] || 'idle'
    if (selectedFilter === 'running') return matchSearch && st === 'running'
    if (selectedFilter === 'stopped') return matchSearch && st !== 'running'
    return matchSearch
  })

  if (visible.length === 0) {
    emptyState.style.display = 'flex'
    tbody.innerHTML = ''
    return
  }
  emptyState.style.display = 'none'
  tbody.innerHTML = ''
  visible.forEach(p => {
    tbody.appendChild(createRow(p))
  })
}

const playSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>'
const stopSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>'
const restartSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>'
const termSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>'
const editSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
const delSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'

function createRow(p) {
  const st = statuses[p.id] || 'idle'
  const isRunning = st === 'running'
  const isError = st === 'error'
  const badgeClass = isRunning ? 'badge-running' : isError ? 'badge-error' : 'badge-idle'
  const badgeText = isRunning ? '● Running' : isError ? '✕ Error' : '○ Idle'

  const row = document.createElement('div')
  row.className = 'table-row'
  row.dataset.id = p.id

  const tagsHtml = p.tags && p.tags.length > 0
    ? `<span class="td-tags">${p.tags.map(t => `<span class="td-tag">${esc(t)}</span>`).join('')}</span>`
    : ''
  const group = p.groupId ? groups.find(g => g.id === p.groupId) : null
  const groupHtml = group
    ? `<span class="td-group">${group.icon || '📁'} ${esc(group.name)}</span>`
    : ''

  row.innerHTML = `
    <div class="td td-name">
      <span class="td-icon">${p.icon || '🚀'}</span>
      <div class="td-title-wrap">
        <div class="td-title">${esc(p.name)}${groupHtml}${tagsHtml}</div>
        <div class="td-desc">${esc(p.desc || '')}</div>
      </div>
    </div>
    <div class="td td-status"><span class="status-badge ${badgeClass}">${badgeText}</span></div>
    <div class="td td-path">${esc(p.path || '')}</div>
    <div class="td td-cmd"><span class="cmd-prefix">$</span>${esc(p.command || '')}</div>
    <div class="td td-actions">
      ${!isRunning
        ? `<button class="btn-action-icon btn-play" data-action="run" title="Run">${playSvg}</button>`
        : `<button class="btn-action-icon btn-stop-icon" data-action="stop" title="Stop">${stopSvg}</button>
           <button class="btn-action-icon btn-restart" data-action="restart" title="Restart">${restartSvg}</button>`
      }
      <button class="btn-action-icon btn-term ${activeTermTab === p.id ? 'active' : ''}" data-action="terminal" title="Terminal">${termSvg}</button>
      <button class="btn-action-icon" data-action="edit" title="Edit">${editSvg}</button>
      <button class="btn-action-icon btn-del" data-action="delete" title="Delete">${delSvg}</button>
    </div>
  `

  const pathEl = row.querySelector('.td-path')
  if (pathEl) {
    pathEl.addEventListener('click', () => {
      if (p.path) window.electronAPI.openFolder(p.path)
    })
  }

  return row
}

function handleTableClick(e) {
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  e.stopPropagation()
  const row = btn.closest('.table-row')
  if (!row) return
  const id = row.dataset.id
  const action = btn.dataset.action
  if (action === 'run') runProject(id)
  else if (action === 'stop') stopProject(id)
  else if (action === 'restart') restartProject(id)
  else if (action === 'terminal') openTerminal(id)
  else if (action === 'edit') editProject(id)
  else if (action === 'delete') deleteProject(id)
}

if (typeof cardsInit === 'undefined') {
  window.cardsInit = true
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('table-body')?.addEventListener('click', handleTableClick)
  })
}

export function selectProject(id) {
  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id)
  })
  const row = document.querySelector(`.table-row[data-id="${id}"]`)
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function findConflictingProjects(id, port) {
  port = String(port).trim()
  if (!port) return []
  return projects.filter(x => {
    if (x.id === id) return false
    if (statuses[x.id] !== 'running') return false
    // Check explicit port field
    if (x.port && String(x.port).trim() === port) return true
    // Check inferred port from command
    const inferred = inferPort(x)
    if (inferred && String(inferred).trim() === port) return true
    return false
  })
}

let pendingRunId = null

export function openConflictModal(conflicts, port) {
  window.__pendingRunId = pendingRunId
  const overlay = document.getElementById('conflict-overlay')
  if (!overlay) { toast('Conflict overlay not found!', 'error'); return }
  document.getElementById('conflict-port').textContent = port
  const list = document.getElementById('conflict-list')
  list.innerHTML = conflicts.map(c => `
    <div class="conflict-item" data-id="${c.id}">
      <span class="ci-icon">${c.icon || '🚀'}</span>
      <div class="ci-info">
        <div class="ci-name">${esc(c.name)}</div>
        <div class="ci-port">port ${esc(port)}</div>
      </div>
      <button class="ci-stop-btn">Stop</button>
    </div>
  `).join('')

  function runAfterStop() {
    overlay.classList.remove('open')
    const runId = window.__pendingRunId
    window.__pendingRunId = null
    if (runId) setTimeout(() => doRunProject(runId), 300)
  }

  // Attach click handler to each stop button directly
  list.querySelectorAll('.ci-stop-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.conflict-item')
      if (!item) return
      const cid = item.dataset.id
      if (cid === '__external__') {
        await window.electronAPI.killPort(parseInt(port))
      } else {
        stopProject(cid)
      }
      item.remove()
      const remaining = list.querySelectorAll('.conflict-item')
      if (remaining.length === 0) runAfterStop()
    })
  })

  overlay.classList.add('open')
}

export function doRunProject(id) {
  const p = projects.find(x => x.id === id)
  if (!p) return
  statuses[id] = 'running'
  terminalBuffers[id] = ''
  renderCards()
  renderSidebar()
  updateStats()
  openTerminal(id)
  window.electronAPI.runProject({ projectId: id, command: p.command, cwd: p.path })
}

const COMMON_PORTS = [
  { pattern: /--port\s+(\d{3,5})/, extract: true },
  { pattern: /-p\s+(\d{3,5})/, extract: true },
  { pattern: /PORT=(\d{3,5})/, extract: true },
  { pattern: /:(\d{3,5})\b/, extract: true },
  // Framework defaults (command keywords)
  { match: /(npm run dev|yarn dev|pnpm dev|npm start|yarn start|pnpm start)/, port: '3000' },
  { match: /(next|nuxt|remix|svelte|vite|express)/, port: '3000' },
  { match: /(react|create-react-app|npx\s)/, port: '3000' },
  { match: /(vue|quasar)/, port: '8080' },
  { match: /(angular|ng\s)/, port: '4200' },
  { match: /(django|python.*manage\.py|python.*http\.server)/, port: '8000' },
  { match: /(flask|fastapi)/, port: '5000' },
  { match: /(spring|gradlew|mvn|java)/, port: '8080' },
  { match: /(cargo|rust)/, port: '8080' },
  { match: /(go\s|golang)/, port: '8080' },
  { match: /(rails)/, port: '3000' },
  { match: /(docker-compose)/, port: '8080' },
]

function inferPort(p) {
  // Try explicit port field first
  if (p.port) return p.port
  // Build search text from command + name + description + tags
  const searchText = [
    p.command || '',
    p.name || '',
    p.desc || '',
    ...(p.tags || [])
  ].join(' ').toLowerCase()
  // Try command extraction patterns first
  for (const rule of COMMON_PORTS) {
    if (rule.extract) {
      const m = (p.command || '').match(rule.pattern)
      if (m) return m[1]
    }
  }
  // Try match patterns against combined search text
  for (const rule of COMMON_PORTS) {
    if (rule.match) {
      const m = searchText.match(rule.match)
      if (m) return rule.port
    }
  }
  // Final fallback: common dev commands default to 3000
  if (/\b(npm|yarn|pnpm|bun|npx)\s+(run\s+)?(dev|start|serve)\b/.test(p.command || '')) return '3000'
  return null
}

export async function runProject(id) {
  const p = projects.find(x => x.id === id)
  if (!p) return
  if (!p.command) { toast('No command configured', 'error'); return }

  const port = inferPort(p)

  if (port) {
    // 1. Check other running projects on the same port (explicit + inferred)
    const conflicts = findConflictingProjects(id, port)
    if (conflicts.length > 0) {
      pendingRunId = id
      openConflictModal(conflicts, port)
      return
    }

    // 2. Check system-level — is the port already in use by an external process?
    try {
      const usedPorts = await window.electronAPI.getUsedPorts()
      if (usedPorts.includes(parseInt(port))) {
        pendingRunId = id
        openConflictModal([{ id: '__external__', name: `Unknown process on port ${port}`, icon: '🔌' }], port)
        return
      }
    } catch (e) {
      // Backend not available — proceed to run
    }
  }

  doRunProject(id)
}

export function stopProject(id) {
  window.electronAPI.stopProject({ projectId: id })
  statuses[id] = 'stopped'
  renderCards()
  renderSidebar()
  updateStats()
}

export function restartProject(id) {
  const p = projects.find(x => x.id === id)
  if (!p) return
  stopProject(id)
  setTimeout(() => doRunProject(id), 300)
}

export function deleteProject(id) {
  if (!confirm('Delete this project?')) return
  if (statuses[id] === 'running') stopProject(id)

  const idx = projects.findIndex(p => p.id === id)
  if (idx !== -1) projects.splice(idx, 1)
  delete statuses[id]
  delete terminalBuffers[id]

  document.getElementById(`term-tab-${id}`)?.remove()
  document.getElementById(`term-body-${id}`)?.remove()

  if (activeTermTab === id) {
    setActiveTermTab(null)
    const remaining = document.querySelectorAll('.term-tab')
    if (remaining.length > 0) {
      import('./terminal.js').then(m => m.switchTermTab(remaining[0].dataset.id))
    } else {
      document.getElementById('term-placeholder').style.display = 'flex'
    }
  }

  window.electronAPI.saveProjects(projects)
  renderCards()
  renderSidebar()
  updateStats()
  toast('Project deleted')
}

function editProject(id) {
  import('./modal.js').then(m => m.openModal('edit', id))
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
