import { 
  projects, 
  groups, 
  statuses, 
  terminalBuffers, 
  activeTermTab, 
  selectedFilter, 
  searchQuery, 
  setActiveTermTab,
  notify,
  selectedGroupId
} from './state.js'
import { toast } from './toast.js'
import { openTerminal } from './terminal.js'

export function renderSkeleton() {
  const emptyState = document.getElementById('empty-state')
  const tbody = document.getElementById('table-body')
  if (!tbody || !emptyState) return

  emptyState.style.display = 'none'
  
  let html = ''
  for (let i = 0; i < 4; i++) {
    html += `
      <div class="table-row skeleton-row">
        <div class="td td-name">
          <div class="skeleton-icon skeleton-shimmer"></div>
          <div class="td-title-wrap">
            <div class="skeleton-text skeleton-title skeleton-shimmer"></div>
            <div class="skeleton-text skeleton-desc skeleton-shimmer"></div>
          </div>
        </div>
        <div class="td td-status">
          <div class="skeleton-badge skeleton-shimmer"></div>
        </div>
        <div class="td td-path">
          <div class="skeleton-text skeleton-path skeleton-shimmer"></div>
        </div>
        <div class="td td-cmd">
          <div class="skeleton-text skeleton-cmd skeleton-shimmer"></div>
        </div>
        <div class="td td-actions">
          <div class="skeleton-action-btn skeleton-shimmer"></div>
          <div class="skeleton-action-btn skeleton-shimmer"></div>
          <div class="skeleton-action-btn skeleton-shimmer"></div>
        </div>
      </div>
    `
  }
  tbody.innerHTML = html
}

export function renderCards() {
  const emptyState = document.getElementById('empty-state')
  const tbody = document.getElementById('table-body')
  if (!tbody || !emptyState) return

  // Dynamically update view title based on selected group
  const titleEl = document.getElementById('view-title')
  if (titleEl) {
    if (selectedGroupId) {
      const g = groups.find(x => x.id === selectedGroupId)
      titleEl.innerHTML = g ? `${g.icon || '📁'} <span>${esc(g.name)}</span>` : 'All Projects'
    } else {
      titleEl.textContent = 'All Projects'
    }
  }

  let visible = projects.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery) ||
      (p.desc || '').toLowerCase().includes(searchQuery) ||
      (p.tags || []).some(t => t.toLowerCase().includes(searchQuery))
    const st = statuses[p.id] || 'idle'
    const matchGroup = !selectedGroupId || p.groupId === selectedGroupId
    if (selectedFilter === 'running') return matchSearch && matchGroup && st === 'running'
    if (selectedFilter === 'stopped') return matchSearch && matchGroup && st !== 'running'
    return matchSearch && matchGroup
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

  const appUrlHtml = p.appUrl
    ? `<button class="btn-url-badge btn-app-url" data-url="${p.appUrl}" title="Open App URL: ${p.appUrl}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg> App</button>`
    : ''
  const repoUrlHtml = p.repoUrl
    ? `<button class="btn-url-badge btn-repo-url" data-url="${p.repoUrl}" title="Open Repo URL: ${p.repoUrl}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg> Repo</button>`
    : ''
  const urlsHtml = (appUrlHtml || repoUrlHtml)
    ? `<span class="td-urls">${appUrlHtml}${repoUrlHtml}</span>`
    : ''

  const envSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>'

  row.innerHTML = `
    <div class="td td-name">
      <span class="td-icon">${p.icon || '🚀'}</span>
      <div class="td-title-wrap">
        <div class="td-title">${esc(p.name)}${groupHtml}${tagsHtml}${urlsHtml}</div>
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
      <button class="btn-action-icon btn-env" data-action="env" title="Manage .env Variables">${envSvg}</button>
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

  row.querySelectorAll('.btn-url-badge').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const url = btn.dataset.url
      if (url) window.electronAPI.openExternal(url)
    })
  })

  return row
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
    if (x.port && String(x.port).trim() === port) return true
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
  
  const portEl = document.getElementById('conflict-port')
  if (portEl) portEl.textContent = port
  
  const list = document.getElementById('conflict-list')
  if (list) {
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
    
    // Internal conflict stopping
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
        if (remaining.length === 0) {
          overlay.classList.remove('open')
          const runId = window.__pendingRunId
          window.__pendingRunId = null
          if (runId) setTimeout(() => doRunProject(runId), 300)
        }
      })
    })
  }

  overlay.classList.add('open')
}

export function doRunProject(id) {
  const p = projects.find(x => x.id === id)
  if (!p) return
  statuses[id] = 'running'
  terminalBuffers[id] = ''
  notify()
  openTerminal(id)
  window.electronAPI.runProject({ projectId: id, command: p.command, cwd: p.path })
}

const COMMON_PORTS = [
  // 1. Explicit port extraction (highest priority)
  { pattern: /--port\s+(\d{3,5})/, extract: true },
  { pattern: /-p\s+(\d{3,5})/, extract: true },
  { pattern: /PORT=(\d{3,5})/, extract: true },
  { pattern: /:(\d{3,5})\b/, extract: true },
  
  // 2. Specific stacks / frameworks
  { match: /\bvite\b|\bsvelte\b/, port: '5173' },
  { match: /\bnext\b|\bnuxt\b|\bremix\b/, port: '3000' },
  { match: /\b(react-scripts|cra|create-react-app)\b/, port: '3000' },
  { match: /\bvue\b/, port: '8080' },
  { match: /\bangular\b|\bng\s+serve\b/, port: '4200' },
  { match: /\bdjango\b|\bpython.*manage\.py\b/, port: '8000' },
  { match: /\bfastapi\b|\buvicorn\b/, port: '8000' },
  { match: /\bflask\b/, port: '5000' },
  { match: /\bspring|bootRun\b|\bjava\b/, port: '8080' },
  { match: /\brails\b/, port: '3000' },
  { match: /\bexpress\b/, port: '3000' },
  { match: /\bjekyll\b/, port: '4000' },
  { match: /\bhugo\b/, port: '1313' },
  { match: /\b(laravel|artisan)\b/, port: '8000' },
  { match: /\b(docker-compose|docker\s+run)\b/, port: '8080' },
  { match: /\b(go\s+run|golang)\b/, port: '8080' },

  // 3. Fallbacks based on generic runner keywords
  { match: /\b(npm|yarn|pnpm|bun|npx)\s+(run\s+)?(dev|start|serve)\b/, port: '3000' },
]

function inferPort(p) {
  if (p.port) return p.port
  const searchText = [
    p.command || '',
    p.name || '',
    p.desc || '',
    ...(p.tags || [])
  ].join(' ').toLowerCase()
  for (const rule of COMMON_PORTS) {
    if (rule.extract) {
      const m = (p.command || '').match(rule.pattern)
      if (m) return m[1]
    }
  }
  for (const rule of COMMON_PORTS) {
    if (rule.match) {
      const m = searchText.match(rule.match)
      if (m) return rule.port
    }
  }
  return null // Do not assume 3000 unless matched
}

export async function runProject(id) {
  const p = projects.find(x => x.id === id)
  if (!p) return
  if (!p.command) { toast('No command configured', 'error'); return }

  const port = inferPort(p)

  if (port) {
    const conflicts = findConflictingProjects(id, port)
    if (conflicts.length > 0) {
      pendingRunId = id
      toast(`Port ${port} is already in use by ${conflicts[0].name}`, 'error')
      openConflictModal(conflicts, port)
      return
    }

    try {
      const usedPorts = await window.electronAPI.getUsedPorts()
      if (usedPorts.includes(parseInt(port))) {
        pendingRunId = id
        toast(`Port ${port} is in use by an external application`, 'error')
        openConflictModal([{ id: '__external__', name: `Unknown process on port ${port}`, icon: '🔌' }], port)
        return
      }
    } catch (e) {
      // Ignore
    }
  }

  doRunProject(id)
}

export function stopProject(id) {
  window.electronAPI.stopProject({ projectId: id })
  statuses[id] = 'stopped'
  notify()
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
      const p = document.getElementById('term-placeholder')
      if (p) p.style.display = 'flex'
    }
  }

  window.electronAPI.saveProjects(projects)
  notify()
  toast('Project deleted')
}

export function editProject(id) {
  import('./modal.js').then(m => m.openModal('edit', id))
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
