export const EMOJI_CATS = [
  { label: 'Dev', items: ['💻','🚀','⚡','🔥','🌐','💡','🎯','🛠️','🔧','📡'] },
  { label: 'Code', items: ['📦','📊','📁','📂','🗂️','📋','📝','📌','🔗','🧩'] },
  { label: 'Stack', items: ['🐍','🦀','🐳','☕','📱','🎮','🌊','🔮','🏗️','🧪'] },
  { label: 'Tools', items: ['🐙','🐚','⚙️','🔨','🧰','🗄️','🖥️','📀','💾','📟'] },
  { label: 'AI', items: ['🤖','🧠','👁️','🎨','📈','🔬','🌀','💎','🎯','🌟'] },
]
export const COLORS = ['#3b82f6','#22c55e','#8b5cf6','#eab308','#ef4444','#06b6d4','#ec4899','#f97316']
export const EMOJIS = EMOJI_CATS.flatMap(c => c.items)

export let projects = []
export let groups = []
export let statuses = {}
export let terminalBuffers = {}
export let activeTermTab = null
export let selectedFilter = 'all'
export let searchQuery = ''
export let editingId = null
export let selectedEmoji = EMOJIS[0]
export let selectedColor = COLORS[0]
export let currentUser = null
export let selectedGroupId = null

const subscribers = new Set()

export function subscribe(callback) {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

let notifyPending = false
export function notify() {
  if (notifyPending) return
  notifyPending = true
  queueMicrotask(() => {
    notifyPending = false
    for (const callback of subscribers) {
      try {
        callback()
      } catch (err) {
        console.error('State listener error:', err)
      }
    }
  })
}

export function setProjects(val) { projects = val; notify() }
export function setGroups(val) { groups = val; notify() }
export function setStatuses(val) { statuses = val; notify() }
export function setTerminalBuffers(val) { terminalBuffers = val; notify() }
export function setActiveTermTab(val) { activeTermTab = val; notify() }
export function setSelectedFilter(val) { selectedFilter = val; notify() }
export function setSearchQuery(val) { searchQuery = val; notify() }
export function setEditingId(val) { editingId = val; notify() }
export function setSelectedEmoji(val) { selectedEmoji = val; notify() }
export function setSelectedColor(val) { selectedColor = val; notify() }
export function setCurrentUser(val) { currentUser = val; notify() }
export function setSelectedGroupId(val) { selectedGroupId = val; notify() }

