export type ConsoleHistoryMovePosition = 'before' | 'after'

export type ConsoleHistoryOrderItem = {
  id?: string
  command?: string
  commandKey?: string
}

const getHistoryItemKey = (item: ConsoleHistoryOrderItem) => (
  item.id || item.commandKey || item.command || ''
)

export const moveConsoleHistoryItem = <T extends ConsoleHistoryOrderItem>(
  history: readonly T[],
  draggedKey: string,
  targetKey: string,
  position: ConsoleHistoryMovePosition,
) => {
  if (!draggedKey || !targetKey || draggedKey === targetKey) {
    return [...history]
  }

  const nextHistory = [...history]
  const draggedIndex = nextHistory.findIndex((item) => getHistoryItemKey(item) === draggedKey)
  const targetIndex = nextHistory.findIndex((item) => getHistoryItemKey(item) === targetKey)
  if (draggedIndex < 0 || targetIndex < 0) {
    return nextHistory
  }

  const [draggedItem] = nextHistory.splice(draggedIndex, 1)
  if (!draggedItem) {
    return nextHistory
  }

  const targetIndexAfterRemoval = nextHistory.findIndex((item) => getHistoryItemKey(item) === targetKey)
  if (targetIndexAfterRemoval < 0) {
    return [...history]
  }

  const insertIndex = position === 'after' ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval
  nextHistory.splice(insertIndex, 0, draggedItem)
  return nextHistory
}
