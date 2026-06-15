import { projects, statuses } from './state.js'
import { ansiToHtml, esc } from './terminal.js'

export const shellBuffers = {}
let openShells = new Set()
let activeShellId = null

export function getActiveShellId() { return activeShellId }

export function handleShellData(projectId, data) {
  if (!shellBuffers[projectId]) shellBuffers[projectId] = ''
  shellBuffers[projectId] += data
  if (shellBuffers[projectId].length > 50000) shellBuffers[projectId] = shellBuffers[projectId].slice(-10000)

  if (projectId === activeShellId) {
    const output = document.getElementById(`shell-output-${projectId}`)
    if (output) {
      output.insertAdjacentHTML('beforeend', ansiToHtml(data))
      output.scrollTop = output.scrollHeight
    }
  }
}

function openShell(projectId) {
  const pObj = projects.find(pr => pr.id === projectId)
  if (!pObj) return

  if (openShells.has(projectId)) {
    switchShell(projectId)
    return
  }

  openShells.add(projectId)

  // Spawn via IPC
  window.electronAPI.shellSpawn({ projectId, cwd: pObj.path || '' })

  // Create tab
  const tabs = document.getElementById('shell-tabs')
  const tab = document.createElement('button')
  tab.className = 'shell-tab'
  tab.dataset.id = projectId
  tab.innerHTML = `${esc(pObj.icon || '🚀')} ${esc(pObj.name)} <span class="shell-tab-close" data-close="${projectId}">✕</span>`
  tabs.appendChild(tab)

  // Create terminal body
  const body = document.getElementById('shell-body')
  const termDiv = document.createElement('div')
  termDiv.className = 'shell-term'
  termDiv.id = `shell-term-${projectId}`
  termDiv.innerHTML = `
    <div class="shell-output" id="shell-output-${projectId}"></div>
    <div class="shell-input-row">
      <span class="shell-prompt">$</span>
      <input class="shell-input" id="shell-input-${projectId}" type="text" autofocus spellcheck="false" />
    </div>
  `

  // Insert before picker overlay
  const pickerOverlay = document.getElementById('shell-picker-overlay')
  if (pickerOverlay) {
    body.insertBefore(termDiv, pickerOverlay)
  } else {
    body.appendChild(termDiv)
  }

  // If there was a placeholder, hide it
  const placeholder = document.getElementById('shell-placeholder')
  if (placeholder) placeholder.style.display = 'none'

  // Tab click
  tab.addEventListener('click', (e) => {
    if (e.target.closest('.shell-tab-close')) return
    switchShell(projectId)
  })

  // Close button
  tab.querySelector('.shell-tab-close').addEventListener('click', (e) => {
    e.stopPropagation()
    closeShell(projectId)
  })

  // Input handler
  const input = document.getElementById(`shell-input-${projectId}`)
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = input.value
        input.value = ''
        const ptyData = cmd + '\n'
        // Echo the command in the output
        const output = document.getElementById(`shell-output-${projectId}`)
        if (output) {
          output.insertAdjacentHTML('beforeend', `<span style="color:#6b6b7a">$ ${esc(cmd)}</span>\n`)
          output.scrollTop = output.scrollHeight
        }
        window.electronAPI.shellInput({ projectId, data: ptyData })
      }
    })
  }

  switchShell(projectId)
}

function closeShell(projectId) {
  if (!openShells.has(projectId)) return
  openShells.delete(projectId)

  window.electronAPI.shellKill(projectId)
  delete shellBuffers[projectId]

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

function switchShell(projectId) {
  if (!openShells.has(projectId)) return
  activeShellId = projectId

  document.querySelectorAll('.shell-tab').forEach(t => t.classList.toggle('active', t.dataset.id === projectId))
  document.querySelectorAll('.shell-term').forEach(t => t.classList.toggle('active', t.id === `shell-term-${projectId}`))

  const input = document.getElementById(`shell-input-${projectId}`)
  if (input) setTimeout(() => input.focus(), 50)

  const output = document.getElementById(`shell-output-${projectId}`)
  if (output && shellBuffers[projectId]) {
    output.innerHTML = ansiToHtml(shellBuffers[projectId])
    output.scrollTop = output.scrollHeight
  }
}

function showProjectPicker() {
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

  list.querySelectorAll('.shell-picker-item').forEach(btn => {
    btn.addEventListener('click', () => {
      openShell(btn.dataset.id)
      overlay.style.display = 'none'
    })
  })

  overlay.style.display = 'block'
}

let listenersSetup = false

function setupShellListeners() {
  if (listenersSetup) return
  listenersSetup = true
  document.getElementById('shell-add-btn')?.addEventListener('click', showProjectPicker)

  document.addEventListener('click', (e) => {
    const overlay = document.getElementById('shell-picker-overlay')
    if (overlay && overlay.style.display === 'block' && !e.target.closest('#shell-picker-overlay') && !e.target.closest('#shell-add-btn')) {
      overlay.style.display = 'none'
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('shell-picker-overlay')
      if (overlay) overlay.style.display = 'none'
    }
  })
}

export function startShellView() {
  setupShellListeners()

  const placeholder = document.getElementById('shell-placeholder')
  if (!placeholder) return

  // Rebuild tabs from existing open shells
  for (const id of openShells) {
    if (document.querySelector(`.shell-tab[data-id="${id}"]`)) continue
    const pObj = projects.find(pr => pr.id === id)
    if (!pObj) continue

    const tabs = document.getElementById('shell-tabs')
    const tab = document.createElement('button')
    tab.className = 'shell-tab'
    tab.dataset.id = id
    tab.innerHTML = `${esc(pObj.icon || '🚀')} ${esc(pObj.name)} <span class="shell-tab-close" data-close="${id}">✕</span>`
    tabs.appendChild(tab)

    const body = document.getElementById('shell-body')
    const termDiv = document.createElement('div')
    termDiv.className = 'shell-term'
    termDiv.id = `shell-term-${id}`
    termDiv.innerHTML = `
      <div class="shell-output" id="shell-output-${id}"></div>
      <div class="shell-input-row">
        <span class="shell-prompt">$</span>
        <input class="shell-input" id="shell-input-${id}" type="text" autofocus spellcheck="false" />
      </div>
    `
    const pickerOverlay = document.getElementById('shell-picker-overlay')
    if (pickerOverlay) body.insertBefore(termDiv, pickerOverlay)
    else body.appendChild(termDiv)

    tab.addEventListener('click', (e) => {
      if (e.target.closest('.shell-tab-close')) return
      switchShell(id)
    })
    tab.querySelector('.shell-tab-close').addEventListener('click', (e) => {
      e.stopPropagation()
      closeShell(id)
    })

    const input = document.getElementById(`shell-input-${id}`)
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const cmd = input.value
          input.value = ''
          const output = document.getElementById(`shell-output-${id}`)
          if (output) {
            output.insertAdjacentHTML('beforeend', `<span style="color:#6b6b7a">$ ${esc(cmd)}</span>\n`)
            output.scrollTop = output.scrollHeight
          }
          window.electronAPI.shellInput({ projectId: id, data: cmd + '\n' })
        }
      })
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
  // Keep shells alive — data still buffers via handleShellData
}
