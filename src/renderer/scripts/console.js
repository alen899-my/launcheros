import { projects, statuses } from './state.js'
import { consoleBuffers } from './terminal.js'

let activeFilter = 'all'
let conInterval = null

const LEVEL_COLORS = {
  error: '#e06c75',
  warn: '#d19a66',
  info: '#61afef',
  debug: '#6b6b7a',
  trace: '#6b6b7a',
  fatal: '#e06c75',
}

export function startConsoleView() {
  if (conInterval) return
  renderConsoleView()
  conInterval = setInterval(renderConsoleView, 2000)
}

export function stopConsoleView() {
  if (conInterval) {
    clearInterval(conInterval)
    conInterval = null
  }
}

export function setConsoleFilter(id) {
  activeFilter = id
  renderConsoleView()
}

export function doClearConsole(id) {
  if (consoleBuffers[id]) {
    consoleBuffers[id].length = 0
    renderConsoleView()
  }
}

function buildFilterBar() {
  const bar = document.getElementById('console-filter-bar')
  if (!bar) return

  const runningIds = Object.entries(statuses).filter(([, s]) => s === 'running').map(([id]) => id)
  const hasEntries = runningIds.some(id => consoleBuffers[id] && consoleBuffers[id].length > 0)

  if (!hasEntries) {
    bar.innerHTML = ''
    bar.style.display = 'none'
    return
  }

  bar.style.display = 'flex'

  let html = `<button class="con-filter-btn${activeFilter === 'all' ? ' active' : ''}" data-filter="all">All</button>`

  for (const id of runningIds) {
    if (!consoleBuffers[id] || consoleBuffers[id].length === 0) continue
    const pObj = projects.find(pr => pr.id === id)
    const name = pObj ? esc(pObj.name || id) : id
    html += `<button class="con-filter-btn${activeFilter === id ? ' active' : ''}" data-filter="${id}">${esc(name)}</button>`
  }

  bar.innerHTML = html
}

export function renderConsoleView() {
  const container = document.getElementById('console-output-container')
  const empty = document.getElementById('console-empty')
  if (!container || !empty) return

  buildFilterBar()

  const runningIds = Object.entries(statuses).filter(([, s]) => s === 'running').map(([id]) => id)
  let targetIds = activeFilter === 'all' ? runningIds : [activeFilter]
  targetIds = targetIds.filter(id => consoleBuffers[id] && consoleBuffers[id].length > 0)

  if (targetIds.length === 0) {
    container.innerHTML = ''
    container.style.display = 'none'
    empty.style.display = 'flex'
    return
  }

  container.style.display = 'block'
  empty.style.display = 'none'

  let html = ''
  for (const id of targetIds) {
    const entries = consoleBuffers[id]
    if (!entries || entries.length === 0) continue

    const pObj = projects.find(pr => pr.id === id)
    const name = pObj ? esc(pObj.name || id) : id

    html += `<div class="con-view-card">
      <div class="con-view-header">${pObj ? esc(pObj.icon || '🚀') : ''} ${esc(name)} <span class="con-view-count">${entries.length} logs</span>
        <button class="con-view-clear" data-clear="${id}" title="Clear">✕</button>
      </div>
      <div class="con-view-entries">`

    const show = entries.slice(-200)
    for (const entry of show) {
      const color = LEVEL_COLORS[entry.level] || '#c4c4cf'
      const time = new Date(entry.time).toLocaleTimeString()
      html += `<div class="con-view-entry con-view-entry-${entry.level}">
        <span class="con-view-time">${time}</span>
        <span class="con-view-level" style="color:${color}">${entry.level.toUpperCase()}</span>
        <span class="con-view-msg">${esc(entry.msg)}</span>
      </div>`
    }

    html += `</div></div>`
  }

  container.innerHTML = html
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
