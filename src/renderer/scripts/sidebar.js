import { projects, groups, statuses, searchQuery, COLORS } from './state.js'

export function renderSidebar() {
  const list = document.getElementById('project-list')
  const filtered = projects.filter(p => p.name.toLowerCase().includes(searchQuery))
  list.innerHTML = filtered.map(p => {
    const st = statuses[p.id] || 'idle'
    const label = st === 'running' ? 'running' : st === 'error' ? 'error' : ''
    const pc = p.color || COLORS[0]
    const id = p.id.replace(/'/g, "\\'")
    return `<div class="sidebar-item ${label}" data-id="${p.id}">
      <div class="si-icon" style="background:${pc}18">${p.icon || '🚀'}</div>
      <div class="si-icon-dot"></div>
      <span class="si-name">${esc(p.name)}</span>
      ${label ? `<span class="si-tag">${label}</span>` : ''}
    </div>`
  }).join('')
  list.querySelectorAll('.sidebar-item').forEach(el => {
    el.addEventListener('click', () => {
      import('./cards.js').then(m => m.selectProject(el.dataset.id))
    })
  })
}

export function updateStats() {
  const running = Object.values(statuses).filter(s => s === 'running').length
  document.getElementById('stat-total').textContent = projects.length
  document.getElementById('stat-running').textContent = running
  document.getElementById('stat-stopped').textContent = projects.length - running
  const btn = document.getElementById('stop-all-btn')
  if (btn) btn.classList.toggle('visible', running > 0)
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
