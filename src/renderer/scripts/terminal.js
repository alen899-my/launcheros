import { projects, statuses, terminalBuffers, activeTermTab, setActiveTermTab } from './state.js'

const inputHistories = {}
const MAX_HISTORY = 50

export const consoleBuffers = {}

const CONSOLE_PREFIX = '\x00CONSOLE:'
const CONSOLE_LOG_PATTERNS = [
  /^\[?(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL)\]?:?\s+/i,
  /^\d{2}:\d{2}:\d{2}\s+\[?(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL)\]?:?\s+/i,
  /^(error|warning|info|debug|trace):\s+/i,
]

const FG = {
  30: '#3f3f50', 31: '#e06c75', 32: '#98c379', 33: '#d19a66',
  34: '#61afef', 35: '#c678dd', 36: '#56b6c2', 37: '#c4c4cf',
  90: '#6b6b7a', 91: '#e06c75', 92: '#98c379', 93: '#d19a66',
  94: '#61afef', 95: '#c678dd', 96: '#56b6c2', 97: '#e8e8ed',
}

function closeTag(stack, tag) {
  const idx = stack.lastIndexOf(tag)
  if (idx !== -1) { stack.splice(idx, 1); return tag }
  return ''
}

export function ansiToHtml(str) {
  str = str
    .replace(/\x1b\[[\?0-9;]*[A-Za-ln-z]/g, '')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const stack = []
  let html = ''
  let i = 0

  while (i < str.length) {
    if (str[i] === '\x1b' && str[i + 1] === '[') {
      const end = str.indexOf('m', i + 2)
      if (end !== -1) {
        const parts = str.slice(i + 2, end).split(';')
        for (const p of parts) {
          const n = parseInt(p, 10)
          if (isNaN(n)) continue
          if (n === 0) { while (stack.length) html += stack.pop() }
          else if (n === 1) { stack.push('</b>'); html += '<b>' }
          else if (n === 3) { stack.push('</i>'); html += '<i>' }
          else if (n === 4) { stack.push('</u>'); html += '<u>' }
          else if (n === 22) { html += closeTag(stack, '</b>') }
          else if (n === 23) { html += closeTag(stack, '</i>') }
          else if (n === 24) { html += closeTag(stack, '</u>') }
          else if (n === 39 || n === 49) { html += closeTag(stack, '</span>') }
          else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) {
            const c = FG[n]
            if (c) { stack.push('</span>'); html += `<span style="color:${c}">` }
          }
        }
        i = end + 1
        continue
      }
    }

    const c = str[i]
    if (c === '&') html += '&amp;'
    else if (c === '<') html += '&lt;'
    else if (c === '>') html += '&gt;'
    else if (c === '\t' || c === '\n') html += c
    else if (c >= ' ' && c <= '~') html += c
    else if (c >= '\xa0') html += c
    i++
  }

  while (stack.length) html += stack.pop()

  html = html.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" class="term-link">$1</a>'
  )
  return html
}

document.addEventListener('click', e => {
  const link = e.target.closest('.term-link')
  if (link) {
    e.preventDefault()
    window.electronAPI.openExternal(link.getAttribute('href'))
  }
})

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

export function toggleTerminalPanel() {
  const panel = document.getElementById('terminal-panel')
  if (!panel) return
  panel.classList.toggle('collapsed')
  const svg = document.querySelector('#term-toggle-btn svg')
  if (!svg) return
  const wasCollapsed = panel.classList.contains('collapsed')
  svg.style.transform = wasCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'
  svg.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
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
  updateTerminalBtnStates()
}

export function ensureTerminalElements(id) {
  const p = projects.find(x => x.id === id)
  const name = p ? p.name : id
  const tabRow = document.getElementById('term-tabs')
  const bodies = document.getElementById('term-bodies')
  if (!tabRow || !bodies) return

  if (!inputHistories[id]) {
    inputHistories[id] = { items: [], index: -1, saved: '' }
  }

  const tabId = `term-tab-${id}`
  const bodyId = `term-body-${id}`
  const outputId = `term-output-${id}`
  const inputId = `term-input-${id}`

  if (!document.getElementById(tabId)) {
    const tab = document.createElement('div')
    tab.className = 'term-tab'
    tab.id = tabId
    tab.dataset.id = id
    tab.classList.toggle('running', (statuses[id] || 'idle') === 'running')
    tab.innerHTML =
      `<div class="tt-dot"></div><span class="tt-name">${esc(name)}</span><div class="tt-close" data-close="${id}">✕</div>`
    tab.querySelector('.tt-close')?.addEventListener('click', e => { e.stopPropagation(); closeTermTab(id) })
    tab.addEventListener('click', () => switchTermTab(id))
    tabRow.appendChild(tab)
  }

  if (!document.getElementById(bodyId)) {
    const body = document.createElement('div')
    body.className = 'term-body'
    body.id = bodyId
    body.innerHTML =
      `<div class="term-output" id="${outputId}"></div>` +
      `<div class="term-input-row">` +
      `<span class="term-prompt">$</span>` +
      `<input class="term-input" id="${inputId}" placeholder="Type a command..." spellcheck="false" autocomplete="off" />` +
      `</div>`
    bodies.appendChild(body)

    const input = document.getElementById(inputId)
    if (input) {
      input.addEventListener('keydown', e => {
        const hist = inputHistories[id]
        if (e.key === 'Enter') {
          const val = input.value
          input.value = ''
          if (val.trim()) {
            hist.items.push(val)
            if (hist.items.length > MAX_HISTORY) hist.items.shift()
          }
          hist.index = -1
          hist.saved = ''
          window.electronAPI.sendInput({ projectId: id, data: val + '\n' })
          appendTermOutput(id, `\x1b[90m$ ${val}\x1b[0m\n`)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (!hist.items.length) return
          if (hist.index === -1) hist.saved = input.value
          if (hist.index < hist.items.length - 1) {
            hist.index++
            input.value = hist.items[hist.items.length - 1 - hist.index]
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (hist.index > 0) { hist.index--; input.value = hist.items[hist.items.length - 1 - hist.index] }
          else if (hist.index === 0) { hist.index = -1; input.value = hist.saved }
        }
      })
    }
  }

  const placeholder = document.getElementById('term-placeholder')
  if (placeholder) placeholder.style.display = 'none'
}

export function switchTermTab(id) {
  setActiveTermTab(id)
  document.querySelectorAll('.term-tab').forEach(t => t.classList.toggle('active', t.dataset.id === id))
  document.querySelectorAll('.term-body').forEach(b => b.classList.toggle('active', b.id === `term-body-${id}`))
  const output = document.getElementById(`term-output-${id}`)
  if (output && terminalBuffers[id]) output.innerHTML = ansiToHtml(terminalBuffers[id])
  const el = document.getElementById(`term-output-${id}`)
  if (el) el.scrollTop = el.scrollHeight
  updateTerminalBtnStates()
}

function closeTermTab(id) {
  document.getElementById(`term-tab-${id}`)?.remove()
  document.getElementById(`term-body-${id}`)?.remove()
  delete inputHistories[id]
  if (activeTermTab !== id) { updateTerminalBtnStates(); return }
  setActiveTermTab(null)
  const remaining = document.querySelectorAll('.term-tab')
  if (remaining.length > 0) { switchTermTab(remaining[remaining.length - 1].dataset.id); return }
  const panel = document.getElementById('terminal-panel')
  if (panel) panel.classList.add('collapsed')
  const svg = document.querySelector('#term-toggle-btn svg')
  if (svg) { svg.style.transform = 'rotate(0deg)'; svg.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }
  const placeholder = document.getElementById('term-placeholder')
  if (placeholder) placeholder.style.display = 'flex'
  updateTerminalBtnStates()
}

export function appendTermOutput(id, raw) {
  const output = document.getElementById(`term-output-${id}`)
  if (!output) return
  const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 40
  output.insertAdjacentHTML('beforeend', ansiToHtml(raw))
  if (atBottom) output.scrollTop = output.scrollHeight
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

function updateTerminalBtnStates() {
  document.querySelectorAll('.btn-term').forEach(btn => {
    const row = btn.closest('.table-row')
    if (row) btn.classList.toggle('active', activeTermTab === row.dataset.id)
  })
}

export function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
