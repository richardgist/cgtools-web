export const getConsoleCommandPrefix = (command, cursorIndex) => {
  const text = String(command || '')
  const cursor = Number.isFinite(Number(cursorIndex))
    ? Math.max(0, Math.min(text.length, Number(cursorIndex)))
    : text.length
  const beforeCursor = text.slice(0, cursor)
  const segment = beforeCursor.split(/[;\r\n]/).pop() || ''
  return segment.trimStart()
}

export const buildConsoleCommandSuggestions = (commands, prefix, limit = 16) => {
  const normalizedPrefix = String(prefix || '').toLowerCase()
  if (!normalizedPrefix || !Array.isArray(commands)) return []

  const startsWith = []
  const contains = []
  for (const command of commands) {
    const name = String(command?.name || '').toLowerCase()
    if (!name) continue

    if (name.startsWith(normalizedPrefix)) {
      startsWith.push(command)
    } else if (name.includes(normalizedPrefix)) {
      contains.push(command)
    }
  }

  return [...startsWith, ...contains].slice(0, limit)
}

export const shouldShowConsoleSuggestions = ({ focused, prefix, dismissedPrefix }) => {
  return Boolean(focused && prefix && prefix !== dismissedPrefix)
}
