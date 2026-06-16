import { projects } from './state.js'

const shellInstances = new Map() // projectId -> { term, fitAddon }
const shellBuffers = new Map() // projectId -> string (stashed data)
const openShells = new Set()
let activeShellId = null

export function getActiveShellId() { return activeShellId }

export function writeToShell(projectId, data) {
  const instance = shellInstances.get(projectId)
  if (instance) {
    instance.term.write(data)
  } else {
    const existing = shellBuffers.get(projectId) || ''
    shellBuffers.set(projectId, existing + data)
  }
}

function initShellInstance(id, container) {
  if (shellInstances.has(id)) return shellInstances.get(id)

  const term = new window.Terminal({
    theme: {
      background: '#09090b', // --card color
      foreground: '#fafafa', // --foreground
      cursor: '#3b82f6', // --accent-blue
      selectionBackground: 'rgba(59, 130, 246, 0.3)',
      black: '#000000',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#eab308',
      blue: '#3b82f6',
      magenta: '#c678dd',
      cyan: '#06b6d4',
      white: '#fafafa',
      brightBlack: '#4f4f56',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#eab308',
      brightBlue: '#3b82f6',
      brightMagenta: '#c678dd',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff'
    },
    cursorBlink: true,
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
    fontSize: 12,
    allowProposedApi: true
  })

  const FitAddonClass = window.FitAddon?.FitAddon || window.FitAddon
  const fitAddon = new FitAddonClass()
  term.loadAddon(fitAddon)

  term.open(container)
  
  setTimeout(() => {
    try {
      fitAddon.fit()
      window.electronAPI.shellResize({ projectId: id, cols: term.cols, rows: term.rows })
    } catch (e) {}
  }, 100)

  // Send keystrokes directly to shell pty stream
  term.onData(data => {
    window.electronAPI.shellInput({ projectId: id, data })
  })

  // Resize pty on terminal bounds change
  term.onResize(({ cols, rows }) => {
    window.electronAPI.shellResize({ projectId: id, cols, rows })
  })

  shellInstances.set(id, { term, fitAddon })

  if (shellBuffers.has(id)) {
    term.write(shellBuffers.get(id))
    shellBuffers.delete(id)
  }

  return { term, fitAddon }
}

export function openShell(projectId) {
  const pObj = projects.find(pr => pr.id === projectId)
  if (!pObj) return

  if (openShells.has(projectId)) {
    switchShell(projectId)
    return
  }

  openShells.add(projectId)

  // Spawn backend shell pty
  window.electronAPI.shellSpawn({ projectId, cwd: pObj.path || '' })

  // Build Tab
  const tabs = document.getElementById('shell-tabs')
  if (tabs) {
    const tab = document.createElement('button')
    tab.className = 'shell-tab'
    tab.dataset.id = projectId
    tab.innerHTML = `${esc(pObj.icon || '🚀')} ${esc(pObj.name)} <span class="shell-tab-close" data-close="${projectId}">✕</span>`
    tabs.appendChild(tab)
  }

  // Create terminal mount body
  const body = document.getElementById('shell-body')
  if (body) {
    const termDiv = document.createElement('div')
    termDiv.className = 'shell-term'
    termDiv.id = `shell-term-${projectId}`
    termDiv.innerHTML = `<div class="shell-xterm-mount" id="shell-xterm-${projectId}" style="height:100%; width:100%;"></div>`
    
    const pickerOverlay = document.getElementById('shell-picker-overlay')
    if (pickerOverlay) {
      body.insertBefore(termDiv, pickerOverlay)
    } else {
      body.appendChild(termDiv)
    }
    
    const container = document.getElementById(`shell-xterm-${projectId}`)
    if (container) {
      initShellInstance(projectId, container)
    }
  }

  const placeholder = document.getElementById('shell-placeholder')
  if (placeholder) placeholder.style.display = 'none'

  switchShell(projectId)
}

export function closeShell(projectId) {
  if (!openShells.has(projectId)) return
  openShells.delete(projectId)

  window.electronAPI.shellKill(projectId)
  
  const instance = shellInstances.get(projectId)
  if (instance) {
    instance.term.dispose()
    shellInstances.delete(projectId)
  }
  shellBuffers.delete(projectId)

  document.getElementById(`shell-term-${projectId}`)?.remove()
  const tab = document.querySelector(`.shell-tab[data-id="${projectId}"]`)
  if (tab) tab.remove()

  if (activeShellId === projectId) {
    activeShellId = null
    const remaining = document.querySelectorAll('.shell-tab')
    if (remaining.length > 0) {
      switchShell(remaining[remaining.length - 1].dataset.id)
    } else {
      const placeholder = document.getElementById('shell-placeholder')
      if (placeholder) placeholder.style.display = 'flex'
    }
  }
}

export function switchShell(projectId) {
  if (!openShells.has(projectId)) return
  activeShellId = projectId

  document.querySelectorAll('.shell-tab').forEach(t => t.classList.toggle('active', t.dataset.id === projectId))
  document.querySelectorAll('.shell-term').forEach(t => t.classList.toggle('active', t.id === `shell-term-${projectId}`))

  const instance = shellInstances.get(projectId)
  if (instance) {
    setTimeout(() => {
      try {
        instance.fitAddon.fit()
        instance.term.focus()
      } catch (e) {}
    }, 50)
  }
}

export function showProjectPicker() {
  const overlay = document.getElementById('shell-picker-overlay')
  const list = document.getElementById('shell-picker-list')
  if (!overlay || !list) return

  if (overlay.style.display === 'block') {
    overlay.style.display = 'none'
    return
  }

  let html = ''
  for (const p of projects) {
    if (openShells.has(p.id)) continue
    html += `<button class="shell-picker-item" data-id="${p.id}">${esc(p.icon || '🚀')} ${esc(p.name)}</button>`
  }

  if (!html) {
    html = '<div class="shell-picker-empty">All projects already open</div>'
  }

  list.innerHTML = html
  overlay.style.display = 'block'
}

export function startShellView() {
  const placeholder = document.getElementById('shell-placeholder')
  if (!placeholder) return

  // Sync tabs UI with state
  for (const id of openShells) {
    if (document.querySelector(`.shell-tab[data-id="${id}"]`)) continue
    const pObj = projects.find(pr => pr.id === id)
    if (!pObj) continue

    const tabs = document.getElementById('shell-tabs')
    if (tabs) {
      const tab = document.createElement('button')
      tab.className = 'shell-tab'
      tab.dataset.id = id
      tab.innerHTML = `${esc(pObj.icon || '🚀')} ${esc(pObj.name)} <span class="shell-tab-close" data-close="${id}">✕</span>`
      tabs.appendChild(tab)
    }

    const body = document.getElementById('shell-body')
    if (body) {
      const termDiv = document.createElement('div')
      termDiv.className = 'shell-term'
      termDiv.id = `shell-term-${id}`
      termDiv.innerHTML = `<div class="shell-xterm-mount" id="shell-xterm-${id}" style="height:100%; width:100%;"></div>`
      
      const pickerOverlay = document.getElementById('shell-picker-overlay')
      if (pickerOverlay) body.insertBefore(termDiv, pickerOverlay)
      else body.appendChild(termDiv)

      const container = document.getElementById(`shell-xterm-${id}`)
      if (container) {
        initShellInstance(id, container)
      }
    }
  }

  placeholder.style.display = openShells.size > 0 ? 'none' : 'flex'

  if (openShells.size > 0) {
    const target = activeShellId && openShells.has(activeShellId) ? activeShellId : [...openShells][openShells.size - 1]
    switchShell(target)
  }
}

export function stopShellView() {
  activeShellId = null
}

// Window resize listener
window.addEventListener('resize', () => {
  if (activeShellId) {
    const instance = shellInstances.get(activeShellId)
    if (instance) {
      try { instance.fitAddon.fit() } catch (e) {}
    }
  }
})

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
