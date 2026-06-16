import { projects } from './state.js'
import { toast } from './toast.js'

let selectedGitProjectId = null
let currentGitStatus = null
let gitSearchQuery = ''
let githubToken = ''
let isInitialized = false
let gitPage = 1
let gitCommitsList = []
let gitRepoIds = []

export async function startGitView() {
  if (!isInitialized) {
    setupGitListeners()
    isInitialized = true
  }

  // Pre-load saved token from backend settings
  try {
    githubToken = await window.electronAPI.gitGetToken()
    const patInput = document.getElementById('git-pat-input')
    if (patInput) patInput.value = githubToken
  } catch (e) {}

  // Check which projects are Git repositories
  gitRepoIds = []
  const checks = projects.map(async p => {
    try {
      const status = await window.electronAPI.gitGetStatus({ projectPath: p.path })
      if (status.isGit) gitRepoIds.push(p.id)
    } catch (e) {}
  })
  await Promise.all(checks)

  renderProjectsList()

  // Auto-select first git repository if none is active or if current active is no longer a git repo
  if (gitRepoIds.length > 0) {
    if (!selectedGitProjectId || !gitRepoIds.includes(selectedGitProjectId)) {
      selectedGitProjectId = gitRepoIds[0]
      renderProjectsList()
      loadGitDetails(selectedGitProjectId)
    } else {
      loadGitDetails(selectedGitProjectId)
    }
  } else {
    // Show empty state
    selectedGitProjectId = null
    const detailsPane = document.getElementById('git-project-details')
    const noProjState = document.getElementById('git-no-project')
    const notGitState = document.getElementById('git-not-git-repo')
    if (detailsPane) detailsPane.style.display = 'none'
    if (notGitState) notGitState.style.display = 'none'
    if (noProjState) {
      noProjState.style.display = 'flex'
      noProjState.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
        <p>No Git repositories found</p>
        <small>Add a Git project or run git init inside a project directory to get started.</small>
      `
    }
  }
}

export function stopGitView() {
  // Clear any timers if needed
}

function renderProjectsList() {
  const container = document.getElementById('git-projects-list')
  if (!container) return

  const filtered = projects.filter(p => {
    if (!gitRepoIds.includes(p.id)) return false
    const q = gitSearchQuery.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q)
  })

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted-foreground);font-size:12px;">No Git projects found</div>`
    return
  }

  container.innerHTML = filtered.map(p => {
    const isActive = p.id === selectedGitProjectId
    return `
      <div class="git-project-item ${isActive ? 'active' : ''}" data-id="${p.id}">
        <span class="gpi-icon">${p.icon || '🚀'}</span>
        <span class="gpi-name">${esc(p.name)}</span>
      </div>
    `
  }).join('')

  container.querySelectorAll('.git-project-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedGitProjectId = item.dataset.id
      renderProjectsList()
      loadGitDetails(selectedGitProjectId)
    })
  })
}


async function loadGitDetails(projectId) {
  const p = projects.find(x => x.id === projectId)
  const detailsPane = document.getElementById('git-project-details')
  const noProjState = document.getElementById('git-no-project')
  const notGitState = document.getElementById('git-not-git-repo')
  const timeline = document.getElementById('git-commits-timeline')

  if (!p || !detailsPane || !noProjState || !notGitState) return

  // Reset pagination state
  gitPage = 1
  gitCommitsList = []

  // Show loading
  noProjState.style.display = 'none'
  notGitState.style.display = 'none'
  detailsPane.style.display = 'block'
  if (timeline) timeline.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted-foreground);font-size:12px;">Loading Git Repository details...</div>`

  try {
    const status = await window.electronAPI.gitGetStatus({ projectPath: p.path })
    currentGitStatus = status

    if (!status.isGit) {
      detailsPane.style.display = 'none'
      notGitState.style.display = 'flex'
      const pathEl = document.getElementById('git-not-git-path')
      if (pathEl) pathEl.textContent = p.path
      return
    }

    // Populate header details
    const iconEl = document.getElementById('git-active-proj-icon')
    const nameEl = document.getElementById('git-active-proj-name')
    const branchNameEl = document.getElementById('git-active-branch-name')
    const repoBadge = document.getElementById('git-active-repo-url')
    const repoNameEl = document.getElementById('git-active-repo-name')

    if (iconEl) iconEl.textContent = p.icon || '🚀'
    if (nameEl) nameEl.textContent = p.name
    if (branchNameEl) branchNameEl.textContent = status.branch

    if (status.github) {
      if (repoBadge) {
        repoBadge.style.display = 'inline-flex'
        repoBadge.href = status.remoteUrl.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/')
      }
      if (repoNameEl) repoNameEl.textContent = `${status.github.owner}/${status.github.repo}`
    } else {
      if (repoBadge) repoBadge.style.display = 'none'
    }

    // Load commit logs
    await fetchAndRenderCommits(p.path, status)
  } catch (err) {
    if (timeline) timeline.innerHTML = `<div style="padding:24px;text-align:center;color:var(--error);font-size:12px;">Failed to load Git details: ${esc(err.message)}</div>`
  }
}

async function fetchAndRenderCommits(projectPath, status, append = false) {
  const timeline = document.getElementById('git-commits-timeline')
  if (!timeline) return

  const limit = 15
  let newCommits = []

  // Attempt GitHub API sync if connected online and repo matches
  let githubCommits = null
  if (status.github) {
    try {
      const headers = {
        'Accept': 'application/vnd.github.v3+json'
      }
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`
      }

      const url = `https://api.github.com/repos/${status.github.owner}/${status.github.repo}/commits?sha=${status.branch}&per_page=${limit}&page=${gitPage}`
      const res = await fetch(url, { headers })
      if (res.ok) {
        githubCommits = await res.json()
      }
    } catch (e) {
      console.warn('Failed to fetch from GitHub API:', e)
    }
  }

  if (githubCommits && githubCommits.length > 0) {
    // Map GitHub commits to our timeline list format
    newCommits = githubCommits.map(gh => {
      return {
        hash: gh.sha,
        message: gh.commit.message.split('\n')[0],
        author: gh.commit.author.name,
        email: gh.commit.author.email,
        date: gh.commit.author.date,
        githubUser: gh.author ? {
          login: gh.author.login,
          avatarUrl: gh.author.avatar_url,
          htmlUrl: gh.author.html_url
        } : null
      }
    })
  } else {
    // Render local logs
    try {
      const localCommits = await window.electronAPI.gitGetCommits({ projectPath, page: gitPage, limit })
      newCommits = localCommits.map(c => ({
        hash: c.hash,
        message: c.message,
        author: c.author,
        email: c.email,
        date: c.date,
        githubUser: null
      }))
    } catch (e) {
      newCommits = []
    }
  }

  if (append) {
    gitCommitsList = [...gitCommitsList, ...newCommits]
  } else {
    gitCommitsList = newCommits
  }

  renderTimeline(gitCommitsList, status.github, newCommits.length === limit)
}

function renderTimeline(commits, github, hasMore) {
  const timeline = document.getElementById('git-commits-timeline')
  if (!timeline) return

  if (commits.length === 0) {
    timeline.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted-foreground);font-size:12px;">No commits found on this branch.</div>`
    return
  }

  let html = commits.map(c => {
    const shortHash = c.hash.slice(0, 7)
    let hashHtml = `<span class="gcn-hash-link">${shortHash}</span>`
    if (github) {
      const repoBase = currentGitStatus.remoteUrl.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/')
      const commitUrl = `${repoBase}/commit/${c.hash}`
      hashHtml = `<a href="${commitUrl}" target="_blank" class="gcn-hash-link" title="View commit on GitHub">${shortHash} ↗</a>`
    }

    const initials = getInitials(c.author)
    let avatarHtml = `<div class="gcn-avatar" title="${esc(c.author)}">${initials}</div>`
    let authorHtml = `<span class="gcn-author-name">${esc(c.author)}</span>`

    if (c.githubUser) {
      avatarHtml = `<img src="${c.githubUser.avatarUrl}" class="gcn-avatar" alt="${esc(c.githubUser.login)}" title="${esc(c.githubUser.login)}" />`
      authorHtml = `<a href="${c.githubUser.htmlUrl}" target="_blank" class="gcn-author-name" title="View profile on GitHub">${esc(c.githubUser.login)}</a>`
    }

    const relTime = formatRelativeTime(c.date)

    return `
      <div class="git-commit-node">
        <div class="gcn-dot"></div>
        <div class="gcn-content">
          <div class="gcnc-top">
            <span class="gcn-message">${esc(c.message)}</span>
            ${hashHtml}
          </div>
          <div class="gcnc-bottom">
            <span class="gcn-author-wrap">
              ${avatarHtml}
              ${authorHtml}
            </span>
            &bull;
            <span>commited ${relTime}</span>
          </div>
        </div>
      </div>
    `
  }).join('')

  if (hasMore) {
    html += `
      <div class="git-load-more-wrap" style="display:flex;justify-content:center;padding:12px 0 20px 0;position:relative;">
        <button id="git-load-more-btn" class="btn-secondary-sm" style="width:160px;z-index:2;">Load More Commits</button>
      </div>
    `
  }

  timeline.innerHTML = html

  // Bind clicks to commit link clicks in system default browser
  timeline.querySelectorAll('.gcn-hash-link[href], .gcn-author-name[href]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault()
      const href = link.getAttribute('href')
      if (href) window.electronAPI.openExternal(href)
    })
  })

  // Bind Load More button
  const loadMoreBtn = document.getElementById('git-load-more-btn')
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      loadMoreBtn.disabled = true
      loadMoreBtn.textContent = 'Loading...'
      
      gitPage++
      const p = projects.find(x => x.id === selectedGitProjectId)
      if (p && currentGitStatus) {
        await fetchAndRenderCommits(p.path, currentGitStatus, true)
      }
    })
  }
}

function getInitials(name) {
  return String(name || '').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function formatRelativeTime(dateStr) {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSecs < 60) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 30) return `${diffDays}d ago`
    
    // Fallback standard format
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch (e) {
    return dateStr
  }
}

function setupGitListeners() {
  // Search project filter
  const searchInput = document.getElementById('git-project-search')
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      gitSearchQuery = e.target.value
      renderProjectsList()
    })
  }

  // Pull Button
  document.getElementById('git-pull-btn')?.addEventListener('click', async () => {
    if (!selectedGitProjectId) return
    const p = projects.find(x => x.id === selectedGitProjectId)
    if (!p) return

    const btn = document.getElementById('git-pull-btn')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Pulling...'
    }

    const res = await window.electronAPI.gitPull({ projectPath: p.path })
    
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Pull'
    }

    if (res.ok) {
      toast('Git pull completed successfully', 'success')
      loadGitDetails(selectedGitProjectId)
    } else {
      toast(`Pull failed: ${res.error}`, 'error')
    }
  })

  // Fetch Button
  document.getElementById('git-fetch-btn')?.addEventListener('click', async () => {
    if (!selectedGitProjectId) return
    const p = projects.find(x => x.id === selectedGitProjectId)
    if (!p) return

    const btn = document.getElementById('git-fetch-btn')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Fetching...'
    }

    const res = await window.electronAPI.gitFetch({ projectPath: p.path })

    if (btn) {
      btn.disabled = false
      btn.textContent = 'Fetch'
    }

    if (res.ok) {
      toast('Git fetch completed', 'success')
      loadGitDetails(selectedGitProjectId)
    } else {
      toast(`Fetch failed: ${res.error}`, 'error')
    }
  })

  // Sync / Refresh from GitHub API Button
  document.getElementById('git-refresh-btn')?.addEventListener('click', () => {
    if (selectedGitProjectId) {
      loadGitDetails(selectedGitProjectId)
      toast('Synced with GitHub repository', 'success')
    }
  })

  // Save PAT Token Button
  document.getElementById('git-pat-save-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('git-pat-input')
    if (!input) return
    const token = input.value.trim()

    const btn = document.getElementById('git-pat-save-btn')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Saving...'
    }

    const res = await window.electronAPI.gitSaveToken({ token })

    if (btn) {
      btn.disabled = false
      btn.textContent = 'Save Token'
    }

    if (res.ok) {
      githubToken = token
      toast('GitHub token saved successfully', 'success')
      if (selectedGitProjectId) loadGitDetails(selectedGitProjectId)
    } else {
      toast(`Failed to save token: ${res.error}`, 'error')
    }
  })
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
