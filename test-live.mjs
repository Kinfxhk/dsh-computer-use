import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { apply } from './index.js'

const DRIVER = fileURLToPath(new URL('./driver/cua-driver.exe', import.meta.url))

/** @type {any} */
let tool
const disposers = []

const child = {
  effect(fn) {
    disposers.push(fn())
  },
  computerUse: { register: () => () => {} },
  webServer: { register: () => () => {} },
  tools: {
    register(definition) {
      tool = definition
      return () => {}
    },
  },
}

const ctx = {
  effect(fn) {
    disposers.push(fn())
  },
  inject(names, cb) {
    cb(child)
  },
}

apply(ctx)
assert.ok(tool, 'computer_use tool should be registered')
assert.equal(typeof tool.execute, 'function')

/** @param {unknown} value @param {string} path */
function assertNoUndefined(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefined(entry, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assert.notEqual(entry, undefined, `${path}.${key} is undefined`)
      assertNoUndefined(entry, `${path}.${key}`)
    }
  }
}

const status = await tool.execute({ action: 'status' })
assertNoUndefined(status)
assert.equal(status.ok, true)
console.log('status ok:', JSON.stringify({ armed: status.armed, daemon: status.daemon, driverFound: status.driverFound }))

const windows = await tool.execute({ action: 'windows' })
assertNoUndefined(windows)
assert.equal(windows.ok, true)
assert.ok(Array.isArray(windows.windows), 'windows should be an array')
console.log('windows ok:', windows.windows.length, 'visible windows')

// Force the driver to end the named session, then prove the tool revives it
// instead of surfacing "session 'dsh-computer-use' has ended".
const { existsSync } = await import('node:fs')
if (!existsSync(DRIVER)) {
  console.log('skip revive check: cua-driver.exe is not present in this checkout')
  process.exit(0)
}
const { spawnSync } = await import('node:child_process')
const ended = spawnSync(
  DRIVER,
  ['call', '--socket', '\\\\.\\pipe\\dsh-computer-use', 'end_session', JSON.stringify({ session: 'dsh-computer-use' })],
  { encoding: 'utf8' },
)
console.log('end_session exit:', ended.status)

const recovered = await tool.execute({ action: 'windows' })
assertNoUndefined(recovered)
assert.equal(recovered.ok, true)
assert.ok(Array.isArray(recovered.windows), 'windows should be an array after revive')
const after = await tool.execute({ action: 'status' })
const recoveredEntry = (after.log ?? []).find(entry => entry.action === 'recover')
assert.ok(recoveredEntry, 'the log should record the revive')
console.log('revive ok:', JSON.stringify(recoveredEntry))

for (const dispose of disposers.reverse()) {
  try {
    dispose?.()
  } catch {}
}

process.exit(0)
