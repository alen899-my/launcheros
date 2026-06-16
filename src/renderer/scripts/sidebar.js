import { projects, groups, statuses, selectedGroupId, COLORS } from './state.js'

const editSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
const delSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'

export function renderSidebar() {
  const allProjEl = document.getElementById('menu-all-projects')
  const groupsMenuEl = document.getElementById('menu-groups')
  const toolboxMenuEl = document.getElementById('menu-toolbox')
  const apiMenuEl = document.getElementById('menu-api-client')
  const dbMenuEl = document.getElementById('menu-db-explorer')
  const mockMenuEl = document.getElementById('menu-mock-server')
  const cardsArea = document.getElementById('cards-area')
  const groupsArea = document.getElementById('groups-area')
  const toolboxArea = document.getElementById('toolbox-area')
  const apiArea = document.getElementById('api-client-view')
  const dbArea = document.getElementById('db-explorer-view')
  const mockArea = document.getElementById('mock-server-view')

  const isProjectsActive = cardsArea && cardsArea.classList.contains('active')
  const isGroupsActive = groupsArea && groupsArea.classList.contains('active')
  const isToolboxActive = toolboxArea && toolboxArea.classList.contains('active')
  const isApiActive = apiArea && apiArea.classList.contains('active')
  const isDbActive = dbArea && dbArea.classList.contains('active')
  const isMockActive = mockArea && mockArea.classList.contains('active')

  if (allProjEl) {
    allProjEl.classList.toggle('active', isProjectsActive && selectedGroupId === null)
  }
  if (groupsMenuEl) {
    groupsMenuEl.classList.toggle('active', isGroupsActive)
  }
  if (toolboxMenuEl) {
    toolboxMenuEl.classList.toggle('active', isToolboxActive)
  }
  if (apiMenuEl) {
    apiMenuEl.classList.toggle('active', isApiActive)
  }
  if (dbMenuEl) {
    dbMenuEl.classList.toggle('active', isDbActive)
  }
  if (mockMenuEl) {
    mockMenuEl.classList.toggle('active', isMockActive)
  }
}

export function updateStats() {
  const running = Object.values(statuses).filter(s => s === 'running').length
  
  const totalEl = document.getElementById('stat-total')
  const runningEl = document.getElementById('stat-running')
  const stoppedEl = document.getElementById('stat-stopped')
  const btn = document.getElementById('stop-all-btn')
  
  if (totalEl) totalEl.textContent = projects.length
  if (runningEl) runningEl.textContent = running
  if (stoppedEl) stoppedEl.textContent = projects.length - running
  if (btn) btn.classList.toggle('visible', running > 0)
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
