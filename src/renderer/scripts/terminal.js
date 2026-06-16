import { projects, statuses, activeTermTab, setActiveTermTab } from './state.js'

const terminalInstances = new Map() // projectId -> { term, fitAddon }
const terminalBuffers = new Map() // projectId -> string (stashed before open)

export const consoleBuffers = {}

const CONSOLE_PREFIX = '\x00CONSOLE:'
const CONSOLE_LOG_PATTERNS = [
  /^\[?(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL)\]?:?\s+/i,
  /^\d{2}:\d{2}:\d{2}\s+\[?(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL)\]?:?\s+/i,
  /^(error|warning|info|debug|trace):\s+/i,
]

// Initialize a real xterm.js instance
function initTerminalInstance(id, container) {
  if (terminalInstances.has(id)) return terminalInstances.get(id)

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
  
  // Fit to screen delay to let layout compute
  setTimeout(() => {
    try {
      fitAddon.fit()
      window.electronAPI.projectResize({ projectId: id, cols: term.cols, rows: term.rows })
    } catch (e) {}
  }, 100)

  // Pass keystrokes straight to back-end shell!
  term.onData(data => {
    window.electronAPI.sendInput({ projectId: id, data })
  })

  // Hook resize to xterm fit
  term.onResize(({ cols, rows }) => {
    window.electronAPI.projectResize({ projectId: id, cols, rows })
  })

  terminalInstances.set(id, { term, fitAddon })

  // Write any stashed data
  if (terminalBuffers.has(id)) {
    term.write(terminalBuffers.get(id))
    terminalBuffers.delete(id)
  }

  return { term, fitAddon }
}

export function writeToTerminal(id, data) {
  const instance = terminalInstances.get(id)
  if (instance) {
    instance.term.write(data)
  } else {
    // Stash data until container mounts terminal
    const existing = terminalBuffers.get(id) || ''
    terminalBuffers.set(id, existing + data)
  }
}

export function clearTerminalBuffer(id) {
  const instance = terminalInstances.get(id)
  if (instance) {
    instance.term.clear()
  }
}

export function toggleTerminalPanel() {
  const panel = document.getElementById('terminal-panel')
  if (!panel) return
  panel.classList.toggle('collapsed')
  
  const svg = document.querySelector('#term-toggle-btn svg')
  const wasCollapsed = panel.classList.contains('collapsed')
  if (svg) {
    svg.style.transform = wasCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'
    svg.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
  }
  
  if (!wasCollapsed && activeTermTab) {
    setTimeout(() => {
      const instance = terminalInstances.get(activeTermTab)
      if (instance) {
        instance.fitAddon.fit()
        instance.term.focus()
      }
    }, 50)
  }
}

export function openTerminal(id) {
  const panel = document.getElementById('terminal-panel')
  if (!panel) return
  panel.classList.remove('collapsed')
  
  const svg = document.querySelector('#term-toggle-btn svg')
  if (svg) {
    svg.style.transform = 'rotate(180deg)'
    svg.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
  }
  ensureTerminalElements(id)
  switchTermTab(id)
}

export function ensureTerminalElements(id) {
  const p = projects.find(x => x.id === id)
  const name = p ? p.name : id
  
  const tabRow = document.getElementById('term-tabs')
  const bodies = document.getElementById('term-bodies')
  if (!tabRow || !bodies) return

  const tabId = `term-tab-${id}`
  const bodyId = `term-body-${id}`
  const mountId = `term-xterm-${id}`

  if (!document.getElementById(tabId)) {
    const tab = document.createElement('div')
    tab.className = 'term-tab'
    tab.id = tabId
    tab.dataset.id = id
    tab.classList.toggle('running', (statuses[id] || 'idle') === 'running')
    tab.innerHTML = `<div class="tt-dot"></div><span class="tt-name">${esc(name)}</span><div class="tt-close" data-close="${id}">✕</div>`
    tabRow.appendChild(tab)
  }

  if (!document.getElementById(bodyId)) {
    const body = document.createElement('div')
    body.className = 'term-body'
    body.id = bodyId
    body.innerHTML = `<div class="term-xterm-mount" id="${mountId}" style="height: 100%; width: 100%;"></div>`
    bodies.appendChild(body)
    
    const container = document.getElementById(mountId)
    if (container) {
      initTerminalInstance(id, container)
    }
  }

  const placeholder = document.getElementById('term-placeholder')
  if (placeholder) placeholder.style.display = 'none'
}

export function switchTermTab(id) {
  setActiveTermTab(id)
  
  document.querySelectorAll('.term-tab').forEach(t => t.classList.toggle('active', t.dataset.id === id))
  document.querySelectorAll('.term-body').forEach(b => b.classList.toggle('active', b.id === `term-body-${id}`))
  
  const instance = terminalInstances.get(id)
  if (instance) {
    setTimeout(() => {
      try {
        instance.fitAddon.fit()
        instance.term.focus()
      } catch (e) {}
    }, 50)
  }
  
  document.querySelectorAll('.btn-term').forEach(btn => {
    const row = btn.closest('.table-row')
    if (row) btn.classList.toggle('active', id === row.dataset.id)
  })
}

export function closeTermTab(id) {
  document.getElementById(`term-tab-${id}`)?.remove()
  document.getElementById(`term-body-${id}`)?.remove()
  
  const instance = terminalInstances.get(id)
  if (instance) {
    instance.term.dispose()
    terminalInstances.delete(id)
  }
  terminalBuffers.delete(id)

  if (activeTermTab !== id) {
    updateTerminalBtnStates()
    return
  }
  
  setActiveTermTab(null)
  const remaining = document.querySelectorAll('.term-tab')
  if (remaining.length > 0) {
    switchTermTab(remaining[remaining.length - 1].dataset.id)
    return
  }
  
  const panel = document.getElementById('terminal-panel')
  if (panel) panel.classList.add('collapsed')
  
  const svg = document.querySelector('#term-toggle-btn svg')
  if (svg) {
    svg.style.transform = 'rotate(0deg)'
    svg.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
  }
  
  const placeholder = document.getElementById('term-placeholder')
  if (placeholder) placeholder.style.display = 'flex'
  
  updateTerminalBtnStates()
}

function updateTerminalBtnStates() {
  document.querySelectorAll('.btn-term').forEach(btn => {
    const row = btn.closest('.table-row')
    if (row) btn.classList.toggle('active', activeTermTab === row.dataset.id)
  })
}

export function extractConsoleData(data) {
  const results = { clean: data, entries: [] }
  if (!data) return results

  if (data.indexOf(CONSOLE_PREFIX) !== -1) {
    const parts = data.split(CONSOLE_PREFIX)
    results.clean = parts[0] || ''
    for (let i = 1; i < parts.length; i++) {
      const entry = parts[i]
      const newlineIdx = entry.indexOf('\n')
      const line = newlineIdx !== -1 ? entry.substring(0, newlineIdx) : entry
      const rest = newlineIdx !== -1 ? entry.substring(newlineIdx) : ''
      results.clean += rest
      const colonIdx = line.indexOf(':')
      if (colonIdx !== -1) {
        const level = line.substring(0, colonIdx)
        const msg = line.substring(colonIdx + 1)
        results.entries.push({ level, msg })
      }
    }
    return results
  }

  const lines = data.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of CONSOLE_LOG_PATTERNS) {
      const match = lines[i].match(pattern)
      if (match) {
        const level = match[1].toLowerCase().replace(/ing$/, '')
        results.entries.push({ level, msg: lines[i] })
        break
      }
    }
  }

  return results
}

export function appendConsoleOutput(id, level, msg) {
  if (!consoleBuffers[id]) consoleBuffers[id] = []
  const entry = { level, msg, time: Date.now() }
  consoleBuffers[id].push(entry)
  if (consoleBuffers[id].length > 500) consoleBuffers[id].shift()
}

export function clearConsoleBuffer(id) {
  delete consoleBuffers[id]
}

export function updateTermTabStatus(id) {
  const tab = document.getElementById(`term-tab-${id}`)
  if (tab) tab.classList.toggle('running', (statuses[id] || 'idle') === 'running')
}

// Window resize listener
window.addEventListener('resize', () => {
  if (activeTermTab) {
    const instance = terminalInstances.get(activeTermTab)
    if (instance) {
      try { instance.fitAddon.fit() } catch (e) {}
    }
  }
})

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
