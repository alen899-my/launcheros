import { projects, statuses, terminalBuffers, activeTermTab, setActiveTermTab } from './state.js'
import { renderCards } from './cards.js'
import { renderSidebar } from './sidebar.js'
import { updateStats } from './sidebar.js'

export function openTerminal(id) {
  const panel = document.getElementById('terminal-panel')
  panel.classList.remove('collapsed')
  document.getElementById('term-toggle-btn').textContent = '▼ Terminal'

  if (!document.getElementById(`term-tab-${id}`)) {
    createTermTab(id)
    createTermBody(id)
    if (terminalBuffers[id]) {
      const output = document.querySelector(`#term-body-${id} .term-output`)
      if (output) output.textContent = terminalBuffers[id]
    }
  }

  switchTermTab(id)
  updateTerminalBtnStates()
}

function createTermTab(id) {
  const p = projects.find(x => x.id === id)
  const tabRow = document.getElementById('term-tabs')
  const tab = document.createElement('div')
  tab.className = 'term-tab'
  tab.id = `term-tab-${id}`
  tab.dataset.id = id
  const st = statuses[id] || 'idle'
  tab.classList.toggle('running', st === 'running')
  tab.innerHTML = `
    <div class="tt-dot"></div>
    <span class="tt-name">${esc(p ? p.name : id)}</span>
    <div class="tt-close" data-close="${id}">✕</div>
  `
  tab.querySelector('.tt-close').addEventListener('click', (e) => {
    e.stopPropagation()
    closeTermTab(id)
  })
  tab.addEventListener('click', () => switchTermTab(id))
  tabRow.appendChild(tab)
}

function createTermBody(id) {
  const p = projects.find(x => x.id === id)
  const bodies = document.getElementById('term-bodies')
  const body = document.createElement('div')
  body.className = 'term-body'
  body.id = `term-body-${id}`
  body.innerHTML = `
    <div class="term-output" id="term-output-${id}"></div>
    <div class="term-input-row">
      <span class="term-prompt">❯</span>
      <input class="term-input" id="term-input-${id}" placeholder="Send input to process..." />
    </div>
  `
  bodies.appendChild(body)
  document.getElementById('term-placeholder').style.display = 'none'

  const input = document.getElementById(`term-input-${id}`)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value
      input.value = ''
      window.electronAPI.sendInput({ projectId: id, data: val + '\n' })
      appendTermOutput(id, `\x1b[90m> ${val}\x1b[0m\n`)
    }
  })
}

export function switchTermTab(id) {
  setActiveTermTab(id)
  document.querySelectorAll('.term-tab').forEach(t => t.classList.toggle('active', t.dataset.id === id))
  document.querySelectorAll('.term-body').forEach(b => b.classList.toggle('active', b.id === `term-body-${id}`))

  const output = document.getElementById(`term-output-${id}`)
  if (output && terminalBuffers[id]) {
    renderTermOutput(id)
  }
  scrollTermToBottom(id)
  updateTerminalBtnStates()
}

function closeTermTab(id) {
  document.getElementById(`term-tab-${id}`)?.remove()
  document.getElementById(`term-body-${id}`)?.remove()
  if (activeTermTab === id) {
    setActiveTermTab(null)
    const remaining = document.querySelectorAll('.term-tab')
    if (remaining.length > 0) {
      switchTermTab(remaining[remaining.length - 1].dataset.id)
    } else {
      document.getElementById('term-placeholder').style.display = 'flex'
      document.getElementById('terminal-panel').classList.add('collapsed')
      document.getElementById('term-toggle-btn').textContent = '▲ Terminal'
    }
  }
  updateTerminalBtnStates()
}

export function appendTermOutput(id, raw) {
  const output = document.getElementById(`term-output-${id}`)
  if (!output) return
  const ansi = ansiToHtml(raw)
  const span = document.createElement('span')
  span.innerHTML = ansi
  output.appendChild(span)
  scrollTermToBottom(id)
}

function renderTermOutput(id) {
  const output = document.getElementById(`term-output-${id}`)
  if (!output) return
  output.innerHTML = ansiToHtml(terminalBuffers[id] || '')
}

function scrollTermToBottom(id) {
  const output = document.getElementById(`term-output-${id}`)
  if (output) output.scrollTop = output.scrollHeight
}

export function updateTermTabStatus(id) {
  const tab = document.getElementById(`term-tab-${id}`)
  if (tab) {
    const st = statuses[id] || 'idle'
    tab.classList.toggle('running', st === 'running')
  }
}

function updateTerminalBtnStates() {
  document.querySelectorAll('.btn-term').forEach(btn => {
    const row = btn.closest('.table-row')
    if (row) btn.classList.toggle('active', activeTermTab === row.dataset.id)
  })
}

function ansiToHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\x1b\[0m/g, '</span>')
    .replace(/\x1b\[36m/g, '<span style="color:var(--accent-blue)">')
    .replace(/\x1b\[32m/g, '<span style="color:var(--success)">')
    .replace(/\x1b\[33m/g, '<span style="color:var(--warning)">')
    .replace(/\x1b\[31m/g, '<span style="color:var(--error)">')
    .replace(/\x1b\[90m/g, '<span style="color:var(--muted-foreground)">')
    .replace(/\x1b\[1m/g, '<span style="font-weight:700">')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
