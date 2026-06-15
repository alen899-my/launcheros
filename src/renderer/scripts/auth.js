import { setCurrentUser } from './state.js'

export function showAuth() {
  document.getElementById('auth-overlay').classList.add('open')
  document.getElementById('app').style.display = 'none'
  showLogin()
}

export function hideAuth() {
  document.getElementById('auth-overlay').classList.remove('open')
  document.getElementById('app').style.display = ''
}

function showLogin() {
  document.getElementById('auth-signup-form').classList.add('hidden')
  document.getElementById('auth-login-form').classList.remove('hidden')
  document.getElementById('auth-error').textContent = ''
  document.getElementById('auth-error').style.display = 'none'
}

function showSignup() {
  document.getElementById('auth-login-form').classList.add('hidden')
  document.getElementById('auth-signup-form').classList.remove('hidden')
  document.getElementById('auth-error').textContent = ''
  document.getElementById('auth-error').style.display = 'none'
}

function setError(msg) {
  const el = document.getElementById('auth-error')
  el.textContent = msg
  el.style.color = ''
  el.style.display = 'block'
}

function setSuccess(msg) {
  const el = document.getElementById('auth-error')
  el.textContent = msg
  el.style.color = 'var(--success)'
  el.style.display = 'block'
}

function setLoading(formId, loading) {
  const btn = document.querySelector(`#${formId} .auth-btn`)
  if (loading) {
    btn.disabled = true
    btn.textContent = 'Please wait...'
  } else {
    btn.disabled = false
    btn.textContent = formId === 'auth-login-form' ? 'Login' : 'Create Account'
  }
}

export function setupAuth() {
  const session = localStorage.getItem('devlaunch_session')
  if (session) {
    try {
      const user = JSON.parse(session)
      if (user && user.id && user.username) {
        setCurrentUser(user)
        return true
      }
    } catch (e) {}
  }
  return false
}

export function initAuthUI(callback) {
  const toSignup = document.getElementById('auth-to-signup')
  const toLogin = document.getElementById('auth-to-login')

  if (toSignup) {
    toSignup.addEventListener('click', (e) => {
      e.preventDefault()
      showSignup()
    })
  }

  if (toLogin) {
    toLogin.addEventListener('click', (e) => {
      e.preventDefault()
      showLogin()
    })
  }

  document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const username = document.getElementById('login-username').value.trim()
    const password = document.getElementById('login-password').value
    if (!username || !password) { setError('Please fill in all fields'); return }
    setLoading('auth-login-form', true)
    const result = await window.electronAPI.login(username, password)
    setLoading('auth-login-form', false)
    if (result.ok) {
      setCurrentUser(result.user)
      localStorage.setItem('devlaunch_session', JSON.stringify(result.user))
      hideAuth()
      callback(result.user)
    } else {
      setError(result.error)
    }
  })

  document.getElementById('auth-signup-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const username = document.getElementById('signup-username').value.trim()
    const password = document.getElementById('signup-password').value
    const confirm = document.getElementById('signup-confirm').value
    if (!username || !password || !confirm) { setError('Please fill in all fields'); return }
    if (username.length < 3) { setError('Username must be at least 3 characters'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading('auth-signup-form', true)
    const result = await window.electronAPI.register(username, password)
    setLoading('auth-signup-form', false)
    if (result.ok) {
      document.getElementById('signup-username').value = ''
      document.getElementById('signup-password').value = ''
      document.getElementById('signup-confirm').value = ''
      document.getElementById('login-username').value = username
      document.getElementById('login-password').value = ''
      setSuccess('Account created! You can now log in.')
      showLogin()
    } else {
      setError(result.error)
    }
  })

  showAuth()
}

export function logout(callback) {
  localStorage.removeItem('devlaunch_session')
  setCurrentUser(null)
  document.getElementById('login-username').value = ''
  document.getElementById('login-password').value = ''
  document.getElementById('signup-username').value = ''
  document.getElementById('signup-password').value = ''
  document.getElementById('signup-confirm').value = ''
  showLogin()
  showAuth()
  if (callback) callback()
}
