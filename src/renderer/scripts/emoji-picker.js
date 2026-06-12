import { EMOJI_CATS, COLORS, selectedEmoji, selectedColor, setSelectedEmoji, setSelectedColor } from './state.js'

export function renderEmojiPicker() {
  const wrap = document.getElementById('emoji-picker')
  wrap.innerHTML = EMOJI_CATS.map(cat => `
    <div class="emoji-cat">${cat.label}</div>
    <div class="emoji-row">${cat.items.map(e =>
      `<button class="emoji-btn ${e === selectedEmoji ? 'selected' : ''}" data-emoji="${e}">${e}</button>`
    ).join('')}</div>
  `).join('')
  wrap.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => selectEmoji(btn.dataset.emoji))
  })
}

function selectEmoji(e) {
  setSelectedEmoji(e)
  renderEmojiPicker()
}

export function renderColorPicker() {
  const wrap = document.getElementById('color-picker')
  wrap.innerHTML = COLORS.map(c =>
    `<div class="color-dot ${c === selectedColor ? 'selected' : ''}" style="background:${c}" data-color="${c}"></div>`
  ).join('')
  wrap.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => selectColor(dot.dataset.color))
  })
}

function selectColor(c) {
  setSelectedColor(c)
  renderColorPicker()
}
