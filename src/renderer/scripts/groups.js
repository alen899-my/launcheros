import { 
  projects, 
  groups, 
  currentUser, 
  notify, 
  selectedEmoji, 
  selectedColor, 
  setSelectedEmoji, 
  setSelectedColor, 
  EMOJI_CATS, 
  COLORS 
} from './state.js'
import { toast } from './toast.js'

let groupEditingId = null

export function openGroupModal(mode, id) {
  groupEditingId = mode === 'edit' ? id : null
  const overlay = document.getElementById('group-modal-overlay')
  const title = document.getElementById('group-modal-title')
  if (!overlay || !title) return

  overlay.classList.add('open')
  title.textContent = mode === 'edit' ? 'Edit Group' : 'Add Group'

  if (mode === 'edit' && id) {
    const g = groups.find(x => x.id === id)
    if (g) {
      document.getElementById('group-form-id').value = g.id
      document.getElementById('group-form-name').value = g.name || ''
      document.getElementById('group-form-desc').value = g.desc || ''
      setSelectedEmoji(g.icon || '📁')
      setSelectedColor(g.color || '#3b82f6')
    }
  } else {
    document.getElementById('group-form-id').value = ''
    document.getElementById('group-form-name').value = ''
    document.getElementById('group-form-desc').value = ''
    setSelectedEmoji('📁')
    setSelectedColor('#3b82f6')
  }

  renderGroupEmojiPicker()
  renderGroupColorPicker()
}

export function closeGroupModal() {
  const overlay = document.getElementById('group-modal-overlay')
  if (overlay) overlay.classList.remove('open')
  groupEditingId = null
}

export function renderGroupEmojiPicker() {
  const wrap = document.getElementById('group-emoji-picker')
  if (!wrap) return
  wrap.innerHTML = EMOJI_CATS.map(cat => `
    <div class="emoji-cat">${cat.label}</div>
    <div class="emoji-row">${cat.items.map(e =>
      `<button class="emoji-btn ${e === selectedEmoji ? 'selected' : ''}" data-emoji="${e}">${e}</button>`
    ).join('')}</div>
  `).join('')
  wrap.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelectedEmoji(btn.dataset.emoji)
      renderGroupEmojiPicker()
    })
  })
}

export function renderGroupColorPicker() {
  const wrap = document.getElementById('group-color-picker')
  if (!wrap) return
  wrap.innerHTML = COLORS.map(c =>
    `<div class="color-dot ${c === selectedColor ? 'selected' : ''}" style="background:${c}" data-color="${c}"></div>`
  ).join('')
  wrap.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      setSelectedColor(dot.dataset.color)
      renderGroupColorPicker()
    })
  })
}

export function saveGroup() {
  const name = document.getElementById('group-form-name').value.trim()
  const desc = document.getElementById('group-form-desc').value.trim()
  if (!name) { toast('Group name is required', 'error'); return }

  const id = groupEditingId || `grp_${Date.now()}`
  const group = {
    id,
    name,
    desc,
    icon: selectedEmoji,
    color: selectedColor,
    userId: currentUser?.id || null,
    createdAt: groupEditingId ? (groups.find(g => g.id === groupEditingId)?.createdAt || Date.now()) : Date.now()
  }

  if (groupEditingId) {
    const idx = groups.findIndex(g => g.id === groupEditingId)
    if (idx !== -1) groups[idx] = group
    toast('Group updated', 'success')
  } else {
    groups.push(group)
    toast(`Group "${name}" added`, 'success')
  }

  window.electronAPI.saveGroups(groups)
  closeGroupModal()
  notify()
}

export function doDeleteGroup(id) {
  const usedBy = projects.filter(p => p.groupId === id).length
  if (usedBy > 0) {
    toast(`Cannot delete — ${usedBy} project(s) use this group`, 'error')
    return
  }
  
  if (!confirm('Delete this group?')) return

  const idx = groups.findIndex(g => g.id === id)
  if (idx !== -1) {
    const name = groups[idx].name
    groups.splice(idx, 1)
    window.electronAPI.saveGroups(groups)
    notify()
    toast(`Group "${name}" deleted`)
  }
}

export function renderGroupsTable() {
  const tbody = document.getElementById('groups-table-body')
  const emptyState = document.getElementById('groups-empty-state')
  const tableWrap = document.getElementById('groups-table')
  if (!tbody || !emptyState || !tableWrap) return

  if (groups.length === 0) {
    emptyState.style.display = 'flex'
    tableWrap.style.display = 'none'
    tbody.innerHTML = ''
    return
  }

  emptyState.style.display = 'none'
  tableWrap.style.display = 'block'

  const playProjectsSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
  const editSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
  const delSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'

  tbody.innerHTML = groups.map(g => {
    const color = g.color || '#3b82f6'
    const projCount = projects.filter(p => p.groupId === g.id).length
    return `
      <div class="table-row group-table-row" data-id="${g.id}">
        <div class="td td-group-icon">
          <div class="group-icon-avatar" style="background:${color}18; border: 1px solid ${color}30">
            ${g.icon || '📁'}
          </div>
        </div>
        <div class="td td-group-name">
          <div class="group-row-name">${esc(g.name)}</div>
          <div class="group-row-count">${projCount} project(s) linked</div>
        </div>
        <div class="td td-group-desc">${esc(g.desc || '—')}</div>
        <div class="td td-group-actions">
          <button class="btn-action-icon btn-view-projects" data-action="view-projects" data-id="${g.id}" title="View projects in this group">${playProjectsSvg}</button>
          <button class="btn-action-icon" data-action="edit-group" data-id="${g.id}" title="Edit Group">${editSvg}</button>
          <button class="btn-action-icon btn-del" data-action="delete-group" data-id="${g.id}" title="Delete Group">${delSvg}</button>
        </div>
      </div>
    `
  }).join('')
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
