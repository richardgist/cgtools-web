import assert from 'node:assert/strict'

const {
  buildConsoleCommandSuggestions,
  getConsoleCommandPrefix,
  shouldShowConsoleSuggestions,
} = await import(new URL('../consoleCommandSuggestions.js', import.meta.url).href)

const commands = [
  { name: 'stat startfile' },
  { name: 'stat startfile <Filename>' },
  { name: 'stat startfilelua' },
  { name: 'r.FSOC.MinDiffViewLocation' },
]

const acceptedCommand = 'stat startfile'
const acceptedPrefix = getConsoleCommandPrefix(acceptedCommand, acceptedCommand.length)

assert.equal(acceptedPrefix, 'stat startfile')
assert.deepEqual(
  buildConsoleCommandSuggestions(commands, acceptedPrefix).map((item) => item.name),
  ['stat startfile', 'stat startfile <Filename>', 'stat startfilelua'],
)
assert.equal(
  shouldShowConsoleSuggestions({
    focused: true,
    prefix: acceptedPrefix,
    dismissedPrefix: acceptedPrefix,
  }),
  false,
)
assert.equal(
  shouldShowConsoleSuggestions({
    focused: true,
    prefix: `${acceptedPrefix}l`,
    dismissedPrefix: acceptedPrefix,
  }),
  true,
)
assert.equal(
  getConsoleCommandPrefix('stat unit; r.FSOC.Min', 'stat unit; r.FSOC.Min'.length),
  'r.FSOC.Min',
)
