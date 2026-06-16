import { setCurrentUser } from './state.js'
import { toast } from './toast.js'

export function showAuth() {
  const overlay = document.getElementById('auth-overlay')
  const app = document.getElementById('app')
  if (overlay) overlay.classList.add('open')
  if (app) app.style.display = 'none'
  showLogin()
}

export function hideAuth() {
  const overlay = document.getElementById('auth-overlay')
  const app = document.getElementById('app')
  if (overlay) overlay.classList.remove('open')
  if (app) app.style.display = ''
}

function showLogin() {
  document.getElementById('auth-signup-form')?.classList.add('hidden')
  document.getElementById('auth-login-form')?.classList.remove('hidden')
  const errEl = document.getElementById('auth-error')
  if (errEl) {
    errEl.textContent = ''
    errEl.style.display = 'none'
  }
}

function showSignup() {
  document.getElementById('auth-login-form')?.classList.add('hidden')
  document.getElementById('auth-signup-form')?.classList.remove('hidden')
  const errEl = document.getElementById('auth-error')
  if (errEl) {
    errEl.textContent = ''
    errEl.style.display = 'none'
  }
}

function setError(msg) {
  const el = document.getElementById('auth-error')
  if (el) {
    el.textContent = msg
    el.style.color = ''
    el.style.display = 'block'
  }
  toast(msg, 'error')
}

function setSuccess(msg) {
  const el = document.getElementById('auth-error')
  if (el) {
    el.textContent = msg
    el.style.color = 'var(--success)'
    el.style.display = 'block'
  }
  toast(msg, 'success')
}

function setLoading(formId, loading) {
  const btn = document.querySelector(`#${formId} .auth-btn`)
  if (!btn) return
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
        return user
      }
    } catch (e) {}
  }
  return null
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

  document.getElementById('auth-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const usernameInput = document.getElementById('login-username')
    const passwordInput = document.getElementById('login-password')
    if (!usernameInput || !passwordInput) return

    const username = usernameInput.value.trim()
    const password = passwordInput.value

    // Validation checks
    if (!username || !password) {
      setError('Please fill in all fields')
      return
    }
    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading('auth-login-form', true)
    const result = await window.electronAPI.login(username, password)
    setLoading('auth-login-form', false)

    if (result.ok) {
      setCurrentUser(result.user)
      localStorage.setItem('devlaunch_session', JSON.stringify(result.user))
      hideAuth()
      toast(`Welcome back, ${result.user.username}!`, 'success')
      callback(result.user)
    } else {
      setError(result.error || 'Invalid username or password')
    }
  })

  document.getElementById('auth-signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const usernameInput = document.getElementById('signup-username')
    const passwordInput = document.getElementById('signup-password')
    const confirmInput = document.getElementById('signup-confirm')
    if (!usernameInput || !passwordInput || !confirmInput) return

    const username = usernameInput.value.trim()
    const password = passwordInput.value
    const confirm = confirmInput.value

    // Validation checks
    if (!username || !password || !confirm) {
      setError('Please fill in all fields')
      return
    }
    if (username.length < 3 || username.length > 20) {
      setError('Username must be between 3 and 20 characters')
      return
    }
    
    // Alphanumeric and underscore validation
    const usernameRegex = /^[a-zA-Z0-9_]+$/
    if (!usernameRegex.test(username)) {
      setError('Username can only contain letters, numbers, and underscores')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    
    // Password complexity check: must contain at least one letter and one number
    const hasLetter = /[a-zA-Z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    if (!hasLetter || !hasNumber) {
      setError('Password must contain at least one letter and one number')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading('auth-signup-form', true)
    const result = await window.electronAPI.register(username, password)
    setLoading('auth-signup-form', false)

    if (result.ok) {
      usernameInput.value = ''
      passwordInput.value = ''
      confirmInput.value = ''
      
      const loginUser = document.getElementById('login-username')
      const loginPass = document.getElementById('login-password')
      if (loginUser) loginUser.value = username
      if (loginPass) loginPass.value = ''
      
      setSuccess('Account created! You can now log in.')
      showLogin()
    } else {
      setError(result.error || 'Failed to create account')
    }
  })

  showAuth()
}

export function logout(callback) {
  localStorage.removeItem('devlaunch_session')
  setCurrentUser(null)
  
  const loginUser = document.getElementById('login-username')
  const loginPass = document.getElementById('login-password')
  const signupUser = document.getElementById('signup-username')
  const signupPass = document.getElementById('signup-password')
  const signupConfirm = document.getElementById('signup-confirm')
  
  if (loginUser) loginUser.value = ''
  if (loginPass) loginPass.value = ''
  if (signupUser) signupUser.value = ''
  if (signupPass) signupPass.value = ''
  if (signupConfirm) signupConfirm.value = ''
  
  showLogin()
  showAuth()
  toast('Logged out successfully', 'success')
  if (callback) callback()
}
