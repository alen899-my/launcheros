import { projects, statuses } from './state.js'

let monitoringInterval = null

export function startMonitoring() {
  if (monitoringInterval) return
  fetchSystemStats()
  fetchProcessStats()
  monitoringInterval = setInterval(() => {
    fetchSystemStats()
    fetchProcessStats()
  }, 2000)
}

export function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval)
    monitoringInterval = null
  }
}

async function fetchSystemStats() {
  try {
    const stats = await window.electronAPI.getSystemStats()
    renderSystemStats(stats)
  } catch (e) {}
}

async function fetchProcessStats() {
  try {
    const stats = await window.electronAPI.getProcessStats()
    renderProcessTable(stats)
  } catch (e) {}
}

function renderSystemStats(s) {
  document.getElementById('sys-cpu-value').textContent = `${s.cpuPercent}%`
  document.getElementById('sys-cpu-detail').textContent = `${s.cpuCount} cores`
  const cpuFill = document.getElementById('sys-cpu-fill')
  cpuFill.style.width = `${s.cpuPercent}%`
  cpuFill.className = 'sys-stat-bar-fill' + (s.cpuPercent > 80 ? ' critical' : s.cpuPercent > 50 ? ' high' : '')

  const memUsedGb = (s.memoryUsed / 1073741824).toFixed(1)
  const memTotalGb = (s.memoryTotal / 1073741824).toFixed(1)
  document.getElementById('sys-mem-value').innerHTML = `${memUsedGb} <span class="unit">GB</span>`
  document.getElementById('sys-mem-detail').textContent = `of ${memTotalGb} GB · ${s.memoryPercent}%`
  const memFill = document.getElementById('sys-mem-fill')
  memFill.style.width = `${s.memoryPercent}%`
  memFill.className = 'sys-stat-bar-fill' + (s.memoryPercent > 80 ? ' critical' : s.memoryPercent > 50 ? ' high' : '')

  const uptime = formatUptime(s.uptime)
  document.getElementById('sys-uptime-value').textContent = uptime
  document.getElementById('sys-uptime-detail').textContent = 'since last boot'

  const running = Object.values(statuses).filter(st => st === 'running').length
  document.getElementById('sys-procs-value').textContent = running
  document.getElementById('sys-procs-detail').textContent = `${projects.length} total projects`
}

function renderProcessTable(procStats) {
  const tbody = document.getElementById('proc-table-body')
  const running = projects.filter(p => statuses[p.id] === 'running')
  const other = projects.filter(p => statuses[p.id] !== 'running')

  let html = ''
  for (const p of running) {
    const ps = procStats.find(s => s.projectId === p.id)
    html += processRow(p, 'running', ps)
  }
  for (const p of other) {
    html += processRow(p, statuses[p.id] || 'idle', null)
  }

  document.getElementById('proc-count').textContent = projects.length

  if (html) {
    tbody.innerHTML = html
    tbody.querySelectorAll('.proc-action-btn[data-project]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.project
        import('./terminal.js').then(m => {
          const panel = document.getElementById('terminal-panel')
          if (panel.classList.contains('collapsed')) {
            document.getElementById('term-toggle-btn')?.click()
          }
          m.openTerminal(id)
        })
      })
    })
  }
}

function processRow(p, status, ps) {
  const dotClass = status === 'running' ? 'running' : status === 'error' ? 'error' : 'stopped'
  const name = esc(p.name)
  const pid = ps ? ps.pid : '—'
  const cpu = ps ? `${ps.cpu}%` : '—'
  const mem = ps ? `${ps.memory}%` : '—'
  const uptime = ps ? formatUptime(ps.elapsed) : '—'
  return `<tr>
    <td><div class="proc-status"><div class="proc-dot ${dotClass}"></div><span class="proc-name">${name}</span></div></td>
    <td class="proc-mono">${pid}</td>
    <td class="proc-mono">${cpu}</td>
    <td class="proc-mono">${mem}</td>
    <td><span style="font-size:12px;color:var(--muted-foreground)">${status === 'running' ? 'Running' : status === 'error' ? 'Error' : 'Stopped'}</span></td>
    <td class="proc-mono">${uptime}</td>
    <td><button class="proc-action-btn" data-project="${p.id}">Terminal</button></td>
  </tr>`
}

function formatUptime(seconds) {
  if (!seconds || seconds <= 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
