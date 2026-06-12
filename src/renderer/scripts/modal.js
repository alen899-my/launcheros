import { projects, groups, statuses, terminalBuffers, editingId, setEditingId, selectedEmoji, selectedColor, setSelectedEmoji, setSelectedColor } from './state.js'
import { renderEmojiPicker, renderColorPicker } from './emoji-picker.js'
import { renderSidebar, updateStats } from './sidebar.js'
import { renderCards } from './cards.js'
import { toast } from './toast.js'

export function openModal(mode, id) {
  setEditingId(mode === 'edit' ? id : null)
  const modal = document.getElementById('modal-overlay')
  const title = document.getElementById('modal-title')
  modal.classList.add('open')
  title.textContent = mode === 'edit' ? 'Edit Project' : 'Add Project'

  const portField = document.getElementById('form-port')
  renderGroupSelect()
  if (mode === 'edit' && id) {
    const p = projects.find(x => x.id === id)
    if (p) {
      document.getElementById('form-id').value = p.id
      document.getElementById('form-name').value = p.name || ''
      document.getElementById('form-desc').value = p.desc || ''
      document.getElementById('form-path').value = p.path || ''
      document.getElementById('form-cmd').value = p.command || ''
      portField.value = p.port || ''
      document.getElementById('form-group').value = p.groupId || ''
      document.getElementById('form-tags').value = (p.tags || []).join(', ')
      setSelectedEmoji(p.icon || '🚀')
      setSelectedColor(p.color || '#3b82f6')
    }
  } else {
    document.getElementById('form-id').value = ''
    document.getElementById('form-name').value = ''
    document.getElementById('form-desc').value = ''
    document.getElementById('form-path').value = ''
    document.getElementById('form-cmd').value = ''
    portField.value = ''
    document.getElementById('form-group').value = ''
    document.getElementById('form-tags').value = ''
    setSelectedEmoji('🚀')
    setSelectedColor('#3b82f6')
  }
  const cmdInput = document.getElementById('form-cmd')
  const onCmdInput = () => {
    const val = cmdInput.value
    const existing = portField.value
    if (existing && mode !== 'edit') return
    const m = val.match(/(?:--port\s+|-p\s+|=|:)(\d{3,5})(?:\s|$|,)/)
    if (m) portField.value = m[1]
    else if (val === '') portField.value = ''
  }
  cmdInput.removeEventListener('input', onCmdInput)
  cmdInput.addEventListener('input', onCmdInput)
  renderGroupSelect()
  renderEmojiPicker()
  renderColorPicker()
}

export function renderGroupSelect() {
  const sel = document.getElementById('form-group')
  const current = sel.value
  sel.innerHTML = '<option value="">— No group —</option>' +
    groups.map(g => `<option value="${g.id}">${g.icon || '📁'} ${esc(g.name)}</option>`).join('')
  sel.value = current || ''
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open')
  setEditingId(null)
}

export function saveProject() {
  const name = document.getElementById('form-name').value.trim()
  const cmd = document.getElementById('form-cmd').value.trim()
  const path_ = document.getElementById('form-path').value.trim()

  if (!name) { toast('Project name is required', 'error'); return }
  if (!cmd) { toast('Start command is required', 'error'); return }

  const tagsRaw = document.getElementById('form-tags').value
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)

  const id = editingId || `proj_${Date.now()}`
  const portRaw = document.getElementById('form-port').value.trim()
  const groupId = document.getElementById('form-group').value || null
  const proj = {
    id,
    name,
    desc: document.getElementById('form-desc').value.trim(),
    path: path_,
    command: cmd,
    port: portRaw || null,
    groupId,
    tags,
    icon: selectedEmoji,
    color: selectedColor,
    createdAt: editingId ? (projects.find(p => p.id === editingId)?.createdAt || Date.now()) : Date.now(),
  }

  if (editingId) {
    const idx = projects.findIndex(p => p.id === editingId)
    if (idx !== -1) projects[idx] = proj
    toast('Project updated', 'success')
  } else {
    projects.push(proj)
    statuses[id] = 'idle'
    terminalBuffers[id] = ''
    toast('Project added', 'success')
  }

  window.electronAPI.saveProjects(projects)
  closeModal()
  renderSidebar()
  renderCards()
  updateStats()
}
