import { projects, statuses } from './state.js'
import { getMetrics, getAllMetrics, getProjectHealth } from './requestMetrics.js'

// ─── History Buffers ──────────────────────────────────────
const MAX_POINTS = 90
const cpuHistory = []
const memHistory = []
const procHist = new Map()

let monInterval = null
let canvasSizes = {}

const COLORS = {
  cpu: '#3b82f6',
  mem: '#22c55e',
  grid: 'rgba(255,255,255,0.06)',
  bg: 'rgba(255,255,255,0.02)',
}

export function startMonitoring() {
  if (monInterval) return
  fetchAll()
  monInterval = setInterval(fetchAll, 2000)
}

export function stopMonitoring() {
  if (monInterval) {
    clearInterval(monInterval)
    monInterval = null
  }
}

async function fetchAll() {
  try {
    const [sys, procs] = await Promise.all([
      window.electronAPI.getSystemStats(),
      window.electronAPI.getProcessStats(),
    ])
    updateSystem(sys)
    updateProcesses(procs)
    getSystemStatElements(sys)
    renderSystemGraphs()
    renderRequestGraphs()
    renderProcessPulse(procs)
    renderProcessTable(procs)
  } catch (e) {}
}

function updateSystem(sys) {
  cpuHistory.push(sys.cpuPercent)
  memHistory.push(sys.memoryPercent)
  if (cpuHistory.length > MAX_POINTS) cpuHistory.shift()
  if (memHistory.length > MAX_POINTS) memHistory.shift()
}

function updateProcesses(procs) {
  for (const p of procs) {
    let h = procHist.get(p.projectId)
    if (!h) {
      h = { cpu: [], mem: [] }
      procHist.set(p.projectId, h)
    }
    h.cpu.push(p.cpu)
    h.mem.push(p.memory)
    if (h.cpu.length > MAX_POINTS) h.cpu.shift()
    if (h.mem.length > MAX_POINTS) h.mem.shift()
  }
  const runningIds = new Set(procs.map(p => p.projectId))
  for (const [id] of procHist) {
    if (!runningIds.has(id)) procHist.delete(id)
  }
}

function getSystemStatElements(s) {
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

// ─── Canvas Helpers ──────────────────────────────────────
function ensureCanvas(ctx, canvas) {
  const dpr = window.devicePixelRatio || 1
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const key = canvas.id || Math.random()
  const cached = canvasSizes[key]
  if (!cached || cached.w !== cw || cached.h !== ch) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
    canvasSizes[key] = { w: cw, h: ch }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { w: cw, h: ch }
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 0.5
  for (let i = 1; i <= 3; i++) {
    const y = (h / 4) * i
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
}

function plotGraph(ctx, w, h, history, color, labelMax) {
  if (history.length < 2) return

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, w, h)
  drawGrid(ctx, w, h)

  const max = labelMax || Math.max(...history, 1)
  const effMax = max * 1.1 || 1
  const stepX = w / (MAX_POINTS - 1)
  const startX = w - (history.length - 1) * stepX

  ctx.beginPath()
  for (let i = 0; i < history.length; i++) {
    const x = startX + i * stepX
    const y = h - (history[i] / effMax) * (h - 8) - 4
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  const lastX = startX + (history.length - 1) * stepX
  ctx.lineTo(lastX, h)
  ctx.lineTo(startX, h)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, color + '33')
  grad.addColorStop(1, color + '05')
  ctx.fillStyle = grad
  ctx.fill()

  ctx.beginPath()
  for (let i = 0; i < history.length; i++) {
    const x = startX + i * stepX
    const y = h - (history[i] / effMax) * (h - 8) - 4
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
}

// ─── System Pulse Graphs ────────────────────────────────
function renderSystemGraphs() {
  const cpuCanvas = document.getElementById('pulse-cpu-canvas')
  const memCanvas = document.getElementById('pulse-mem-canvas')
  if (!cpuCanvas || !memCanvas) return

  const cpuCtx = cpuCanvas.getContext('2d')
  const memCtx = memCanvas.getContext('2d')
  const cSize = ensureCanvas(cpuCtx, cpuCanvas)
  ensureCanvas(memCtx, memCanvas)

  const cpuVal = cpuHistory.length > 0 ? cpuHistory[cpuHistory.length - 1] : 0
  const memVal = memHistory.length > 0 ? memHistory[memHistory.length - 1] : 0

  document.getElementById('pulse-cpu-current').textContent = `${cpuVal}%`
  document.getElementById('pulse-mem-current').textContent = `${memVal}%`

  plotGraph(cpuCtx, cSize.w, cSize.h, cpuHistory, COLORS.cpu, 100)
  plotGraph(memCtx, cSize.w, cSize.h, memHistory, COLORS.mem, 100)
}

// ─── Request Activity Pulse Graphs ──────────────────────
function renderRequestGraphs() {
  const title = document.getElementById('req-pulse-title')
  const container = document.getElementById('req-pulse-graphs')
  const countEl = document.getElementById('req-pulse-count')
  const latencyCanvas = document.getElementById('pulse-latency-canvas')
  const rateCanvas = document.getElementById('pulse-rate-canvas')

  const runningIds = Object.entries(statuses).filter(([, s]) => s === 'running').map(([id]) => id)
  const allMetrics = getAllMetrics()
  const hasData = runningIds.some(id => {
    const m = allMetrics.get(id)
    return m && m.totalRequests > 0
  })

  if (!hasData) {
    title.style.display = 'none'
    container.style.display = 'none'
    return
  }

  title.style.display = 'flex'
  container.style.display = 'grid'

  // Aggregate metrics across all running projects
  let maxLen = 0
  for (const id of runningIds) {
    const m = allMetrics.get(id)
    if (m && m.latency.length > maxLen) maxLen = m.latency.length
  }

  let latencyHistory = maxLen > 0 ? new Array(maxLen).fill(0) : []
  let rateHistory = maxLen > 0 ? new Array(maxLen).fill(0) : []
  let totalRate = 0
  let totalLatency = 0
  let latencyCount = 0

  for (const id of runningIds) {
    const m = allMetrics.get(id)
    if (!m) continue

    const latOffset = maxLen - m.latency.length
    for (let i = 0; i < m.latency.length; i++) {
      latencyHistory[latOffset + i] += m.latency[i]
    }

    const rateOffset = maxLen - m.rate.length
    for (let i = 0; i < m.rate.length; i++) {
      rateHistory[rateOffset + i] += m.rate[i]
    }

    totalRate += m.rate.length > 0 ? m.rate[m.rate.length - 1] : 0
    if (m.latency.length > 0) {
      totalLatency += m.latency[m.latency.length - 1]
      latencyCount++
    }
  }

  const avgLatency = latencyCount > 0 ? Math.round((totalLatency / latencyCount) * 10) / 10 : 0

  countEl.textContent = `${Math.round(totalRate * 10) / 10} req/s`
  document.getElementById('pulse-latency-current').textContent = `${avgLatency}ms`
  document.getElementById('pulse-rate-current').textContent = `${Math.round(totalRate * 10) / 10}/s`

  if (latencyCanvas) {
    const ctx = latencyCanvas.getContext('2d')
    const cSize = ensureCanvas(ctx, latencyCanvas)
    plotGraph(ctx, cSize.w, cSize.h, latencyHistory.length > 0 ? latencyHistory : [0], '#f59e0b', null)
  }

  if (rateCanvas) {
    const ctx = rateCanvas.getContext('2d')
    const cSize = ensureCanvas(ctx, rateCanvas)
    plotGraph(ctx, cSize.w, cSize.h, rateHistory.length > 0 ? rateHistory : [0], '#8b5cf6', null)
  }
}

// ─── Per-Process Pulse Graphs ────────────────────────────
function renderProcessPulse(procs) {
  const container = document.getElementById('proc-pulse-container')
  const title = document.getElementById('proc-pulse-title')
  const count = document.getElementById('proc-pulse-count')

  const running = procs.filter(p => {
    const pObj = projects.find(pr => pr.id === p.projectId)
    return pObj && statuses[p.projectId] === 'running'
  })

  if (running.length === 0) {
    title.style.display = 'none'
    container.innerHTML = ''
    return
  }

  title.style.display = 'flex'
  count.textContent = `${running.length} running`

  let html = ''
  for (const p of running) {
    const pObj = projects.find(pr => pr.id === p.projectId)
    const name = pObj ? esc(pObj.name) : p.projectId
    const h = procHist.get(p.projectId)
    const lastCpu = h && h.cpu.length > 0 ? h.cpu[h.cpu.length - 1] : 0
    const lastMem = h && h.mem.length > 0 ? h.mem[h.mem.length - 1] : 0
    const health = getProjectHealth(p.projectId)
    const m = getMetrics(p.projectId)
    const lastLatency = m && m.latency && m.latency.length > 0 ? m.latency[m.latency.length - 1] : null
    const latencyHtml = lastLatency !== null && lastLatency > 0
      ? ` · <span class="${lastLatency > 500 ? 'latency-peak' : ''}">${lastLatency}ms</span>`
      : ''
    html += `<div class="proc-pulse-card">
      <div class="proc-pulse-header">
        <span class="proc-pulse-name"><span class="pp-dot ${health}"></span>${name}</span>
        <span class="proc-pulse-stats">CPU ${lastCpu}% · Mem ${lastMem}%${latencyHtml}</span>
      </div>
      <canvas class="proc-pulse-canvas" data-proc-id="${p.projectId}" width="400" height="56"></canvas>
    </div>`
  }
  container.innerHTML = html

  // Draw per-process sparklines
  for (const p of running) {
    const canvas = container.querySelector(`canvas[data-proc-id="${p.projectId}"]`)
    if (!canvas) continue
    const h = procHist.get(p.projectId)
    if (!h) continue
    const ctx = canvas.getContext('2d')
    const { w, h: ch } = ensureCanvas(ctx, canvas)
    const maxCpu = Math.max(...h.cpu, 1)
    // Draw CPU line in blue, memory line in green
    const cpuColor = '#3b82f6'
    const memColor = '#22c55e'

    ctx.clearRect(0, 0, w, ch)
    ctx.fillStyle = 'rgba(255,255,255,0.01)'
    ctx.fillRect(0, 0, w, ch)
    drawGrid(ctx, w, ch)

    const effMax = Math.max(maxCpu * 1.2, 10)

    if (h.cpu.length >= 2) {
      const stepX = w / (MAX_POINTS - 1)
      const startX = w - (h.cpu.length - 1) * stepX

      // CPU line
      ctx.beginPath()
      for (let i = 0; i < h.cpu.length; i++) {
        const x = startX + i * stepX
        const y = ch - (h.cpu[i] / effMax) * (ch - 6) - 3
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.strokeStyle = cpuColor
      ctx.lineWidth = 1.2
      ctx.stroke()

      // CPU fill
      const lastCpuX = startX + (h.cpu.length - 1) * stepX
      ctx.lineTo(lastCpuX, ch)
      ctx.lineTo(startX, ch)
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, 0, 0, ch)
      grad.addColorStop(0, cpuColor + '22')
      grad.addColorStop(1, cpuColor + '02')
      ctx.fillStyle = grad
      ctx.fill()

      // Memory line
      if (h.mem.length >= 2) {
        ctx.beginPath()
        for (let i = 0; i < h.mem.length; i++) {
          const x = startX + i * stepX
          const y = ch - (h.mem[i] / effMax) * (ch - 6) - 3
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = memColor
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    }
  }
}

// ─── Process Table ───────────────────────────────────────
function renderProcessTable(procs) {
  const tbody = document.getElementById('proc-table-body')
  const running = projects.filter(p => statuses[p.id] === 'running')
  const other = projects.filter(p => statuses[p.id] !== 'running')

  let html = ''
  for (const p of running) {
    const ps = procs.find(s => s.projectId === p.id)
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
  const pid = ps ? ps.pid : '\u2014'
  const cpu = ps ? `${ps.cpu}%` : '\u2014'
  const mem = ps ? `${ps.memory}%` : '\u2014'
  const uptime = ps ? formatUptime(ps.elapsed) : '\u2014'
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
  if (!seconds || seconds <= 0) return '\u2014'
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
