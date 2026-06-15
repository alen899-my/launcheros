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

export function setProjects(val) { projects = val }
export function setGroups(val) { groups = val }
export function setStatuses(val) { statuses = val }
export function setTerminalBuffers(val) { terminalBuffers = val }
export function setActiveTermTab(val) { activeTermTab = val }
export function setSelectedFilter(val) { selectedFilter = val }
export function setSearchQuery(val) { searchQuery = val }
export function setEditingId(val) { editingId = val }
export function setSelectedEmoji(val) { selectedEmoji = val }
export function setSelectedColor(val) { selectedColor = val }
export function setCurrentUser(val) { currentUser = val }
