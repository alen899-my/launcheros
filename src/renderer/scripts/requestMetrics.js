export const MAX_POINTS = 90
const HEALTH_TIMEOUT_MS = 30000
const ERROR_THRESHOLD = 0.3

const metrics = new Map()

const REQUEST_PATTERNS = [
  // METHOD /path STATUS TIMEms  (Express morgan, many Node.js frameworks)
  /(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\s+(\/\S*)\s+(\d{3})\s+([\d.]+)\s*ms/gi,
  // "METHOD /path HTTP/1.1" STATUS  (Apache/Nginx combined, no time)
  /"\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+HTTP\/[\d.]+\s*"\s+(\d{3})/gi,
  // --> STATUS in TIMEms  (Spring Boot)
  /(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+-->\s+(\d{3})\s+in\s+([\d.]+)\s*ms/gi,
  // [STATUS] METHOD /path TIMEms  (Go frameworks)
  /\[?(\d{3})\]?\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+([\d.]+)\s*ms/gi,
  // METHOD /path STATUS in TIMEms
  /(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+(\d{3})\s+in\s+([\d.]+)\s*ms/gi,
  // METHOD /path STATUS (simple, no time)
  /(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+(\d{3})\s*$/gim,
  // Spring Boot format: /path METHOD mapped -> STATUS TIMEms
  /Mapped\s+"(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)"\s+(\/\S*)\s+->\s+(\d{3})\s+([\d.]+)\s*ms/gi,
  // Error patterns without status code
  /(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+(error|failed|timeout|5\d{2})/gi,
]

function createEmptyMetrics() {
  return {
    latency: [],
    rate: [],
    errors: [],
    requestTimestamps: [],
    lastRequestTime: null,
    health: 'healthy',
    totalRequests: 0,
    totalErrors: 0,
    recentRequests: [],
    windowLatencies: [],
    windowErrors: 0,
    windowCount: 0,
    lastTickTime: Date.now(),
  }
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[\?0-9;]*[A-Za-z]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

export function getMetrics(projectId) {
  if (!metrics.has(projectId)) {
    metrics.set(projectId, createEmptyMetrics())
  }
  return metrics.get(projectId)
}

export function getAllMetrics() {
  return metrics
}

export function clearProjectMetrics(projectId) {
  metrics.delete(projectId)
}

export function parseRequestData(projectId, rawData) {
  if (!rawData) return
  const m = getMetrics(projectId)
  const clean = stripAnsi(rawData)
  const lines = clean.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    parseLine(m, trimmed)
  }
}

function parseLine(m, line) {
  for (const pattern of REQUEST_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(line)) !== null) {
      const groups = match.slice(1)

      if (groups.length === 4 && /^\d{3}$/.test(groups[0])) {
        const status = parseInt(groups[0], 10)
        const method = groups[1]
        const path = groups[2]
        const timeMs = parseFloat(groups[3]) || 0
        recordRequest(m, method, path, status, timeMs)
      } else if (groups.length === 4) {
        const method = groups[0]
        const path = groups[1]
        const status = parseInt(groups[2], 10)
        const timeMs = parseFloat(groups[3]) || 0
        recordRequest(m, method, path, status, timeMs)
      } else if (groups.length === 3) {
        const method = groups[0]
        const path = groups[1]

        if (/^(error|failed|timeout|5\d{2})$/i.test(groups[2])) {
          recordRequest(m, method, path, 500, 0)
        } else {
          const status = parseInt(groups[2], 10)
          if (!isNaN(status)) {
            recordRequest(m, method, path, status, 0)
          }
        }
      }
    }
  }
}

function recordRequest(m, method, path, status, timeMs) {
  const now = Date.now()
  const isError = status >= 400

  m.totalRequests++
  if (isError) m.totalErrors++
  m.lastRequestTime = now
  m.requestTimestamps.push(now)

  m.windowLatencies.push(timeMs)
  m.windowCount++
  if (isError) m.windowErrors++

  m.recentRequests.push({ method, path, status, timeMs, time: now })
  if (m.recentRequests.length > 200) m.recentRequests.shift()
}

export function tickMetrics(projectIds) {
  const now = Date.now()
  for (const projectId of projectIds) {
    const m = getMetrics(projectId)

    if (m.windowCount > 0) {
      const avgLatency = m.windowLatencies.reduce((a, b) => a + b, 0) / m.windowCount
      const maxLatency = Math.max(...m.windowLatencies)
      const weightedLatency = avgLatency * 0.5 + maxLatency * 0.5
      m.latency.push(Math.round(weightedLatency * 10) / 10)

      const rate = m.windowCount / 2
      m.rate.push(Math.round(rate * 10) / 10)

      m.errors.push(m.windowErrors)
    } else {
      m.latency.push(0)
      m.rate.push(0)
      m.errors.push(0)
    }

    m.health = computeHealth(m, now)

    if (m.latency.length > MAX_POINTS) m.latency.shift()
    if (m.rate.length > MAX_POINTS) m.rate.shift()
    if (m.errors.length > MAX_POINTS) m.errors.shift()

    const cutoff = now - 120000
    m.requestTimestamps = m.requestTimestamps.filter(t => t > cutoff)

    m.windowLatencies = []
    m.windowErrors = 0
    m.windowCount = 0
    m.lastTickTime = now
  }
}

function computeHealth(m, now) {
  if (m.lastRequestTime === null) return 'healthy'
  if (now - m.lastRequestTime > HEALTH_TIMEOUT_MS) return 'down'

  const recent = m.recentRequests.filter(r => now - r.time < 60000)
  if (recent.length > 5) {
    const errRecent = recent.filter(r => r.status >= 400).length
    const errRate = errRecent / recent.length
    if (errRate > ERROR_THRESHOLD) return 'degraded'
  }

  return 'healthy'
}

export function cleanupMetrics(runningIds) {
  const runningSet = new Set(runningIds)
  for (const [id] of metrics) {
    if (!runningSet.has(id)) {
      metrics.delete(id)
    }
  }
}

export function getProjectHealth(projectId) {
  const m = metrics.get(projectId)
  if (!m) return 'healthy'
  return m.health
}
