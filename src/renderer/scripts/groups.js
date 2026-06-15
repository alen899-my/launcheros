import { projects, groups, setGroups, currentUser } from './state.js'
import { renderSidebar } from './sidebar.js'
import { renderCards } from './cards.js'
import { toast } from './toast.js'

export function openGroupsModal() {
  const overlay = document.getElementById('groups-overlay')
  overlay.classList.add('open')
  renderGroupList()
}

export function closeGroupsModal() {
  document.getElementById('groups-overlay').classList.remove('open')
}

function renderGroupList() {
  const list = document.getElementById('groups-list')
  list.innerHTML = groups.map(g => `
    <div class="group-item" data-id="${g.id}">
      <span class="group-item-icon">${g.icon || '📁'}</span>
      <div class="group-item-info">
        <div class="group-item-name">${esc(g.name)}</div>
        <div class="group-item-desc">${esc(g.desc || '')}</div>
      </div>
      <button class="group-del-btn" title="Delete group">✕</button>
    </div>
  `).join('')

  list.querySelectorAll('.group-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.group-item')
      if (!item) return
      const id = item.dataset.id
      const usedBy = projects.filter(p => p.groupId === id).length
      if (usedBy > 0) {
        toast(`Cannot delete — ${usedBy} project(s) use this group`, 'error')
        return
      }
      const idx = groups.findIndex(g => g.id === id)
      if (idx !== -1) groups.splice(idx, 1)
      renderGroupList()
      renderSidebar()
    })
  })
}

export function addGroup() {
  const input = document.getElementById('groups-input')
  const name = input.value.trim()
  if (!name) { toast('Group name is required', 'error'); return }
  const id = `grp_${Date.now()}`
  groups.push({ id, name, desc: '', icon: '📁', color: '#3b82f6', userId: currentUser?.id || null, createdAt: Date.now() })
  input.value = ''
  renderGroupList()
  renderSidebar()
  toast(`Group "${name}" added`)
}

export function saveGroups() {
  window.electronAPI.saveGroups(groups)
  closeGroupsModal()
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
