import assert from 'node:assert/strict'
import test from 'node:test'

import { __internal } from './index.js'

const { plain, sessionEnded } = __internal

test('plain drops undefined at every depth so DSH gets lossless JSON', () => {
  const value = {
    ok: true,
    armed: false,
    provider: undefined,
    log: [{ at: 1, action: 'windows', detail: '', ok: true }],
    windows: [{ windowId: 7, pid: 12, app: '', title: 'x', onScreen: true, minimized: false }],
    observation: { error: undefined, previewId: 'p', elements: [] },
  }
  const result = plain(value)
  assert.equal('provider' in result, false)
  assert.equal('error' in result.observation, false)
  assert.deepEqual(result, {
    ok: true,
    armed: false,
    log: [{ at: 1, action: 'windows', detail: '', ok: true }],
    windows: [{ windowId: 7, pid: 12, app: '', title: 'x', onScreen: true, minimized: false }],
    observation: { previewId: 'p', elements: [] },
  })
  assert.doesNotThrow(() => JSON.stringify(result))
  assert.equal(JSON.parse(JSON.stringify(result)).ok, true)
})

test('plain keeps null, zero and false instead of flattening them', () => {
  assert.deepEqual(plain({ a: null, b: 0, c: false, d: '' }), { a: null, b: 0, c: false, d: '' })
})

test('sessionEnded recognises the driver message that asks for start_session', () => {
  assert.equal(
    sessionEnded("session 'dsh-computer-use' has ended; tool call 'list_windows' was rejected. Call start_session with this id to revive it before issuing further actions, or use a new session id."),
    true,
  )
  assert.equal(sessionEnded('Call start_session with this id to revive it'), true)
})

test('sessionEnded leaves unrelated failures alone', () => {
  assert.equal(sessionEnded('cua-driver was not found'), false)
  assert.equal(sessionEnded('list_windows timed out'), false)
  assert.equal(sessionEnded('session is not allowed to click'), false)
})
