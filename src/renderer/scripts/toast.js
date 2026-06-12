export function toast(msg, type = '') {
  const c = document.getElementById('toast-container')
  const el = document.createElement('div')
  el.className = `toast ${type}`
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'
  el.innerHTML = `<span>${icon}</span> ${esc(msg)}`
  c.appendChild(el)
  setTimeout(() => el.remove(), 3100)
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
