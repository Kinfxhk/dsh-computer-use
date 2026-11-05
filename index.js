/**
 * Computer Use.
 *
 * Owns one private standard-mode cua-driver and the operations both the
 * sidebar page and the agent tool call. Input stays refused until the user
 * arms the page. This plugin never attaches to another agent's driver pipe
 * and never selects unrestricted mode.
 *
 * @module @local/computer-use
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NS = 'computer-use'
const ROOT = '/computer-use'
const PIPE = '\\\\.\\pipe\\dsh-computer-use'
const SESSION = 'dsh-computer-use'
const MAX_BODY = 32_000
const LOG_LIMIT = 24
const WINDOW_LIMIT = 80
const ELEMENT_LIMIT = 60
const TEXT_LIMIT = 2_000
const KEYS = new Set([
  'return', 'tab', 'escape', 'up', 'down', 'left', 'right', 'space', 'delete',
  'home', 'end', 'pageup', 'pagedown',
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
])
const WRITE_ACTIONS = new Set(['click', 'type', 'key', 'scroll'])

export const name = NS
export const inject = ['webServer', 'tools']

/**
 * @param {unknown} value
 * @param {number} max
 */
function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * @param {unknown} error
 */
function reason(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message) return error.message
  return 'the operation failed'
}

/**
 * @param {unknown} value
 */
function integer(value) {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isSafeInteger(number) || number < 0) return undefined
  return number
}

/**
 * @param {string} key
 */
function allowedKey(key) {
  const name = clean(key, 16).toLowerCase()
  if (KEYS.has(name)) return name
  if (/^[a-z0-9]$/.test(name)) return name
  return ''
}

function driverCandidates() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const localApp = process.env.LOCALAPPDATA
  return [
    process.env.CUA_DRIVER_BIN,
    path.join(here, 'driver', 'cua-driver.exe'),
    localApp ? path.join(localApp, 'Programs', 'Cua', 'cua-driver', 'bin', 'cua-driver.exe') : '',
    path.resolve(here, '..', '_cua-probe', 'cua-driver.exe'),
  ].filter(Boolean)
}

function resolveDriver() {
  return driverCandidates().find(candidate => existsSync(candidate)) ?? ''
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} value
 */
function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > MAX_BODY) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (raw.trim() === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new Error('request body is not JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function sameOrigin(req, res) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    if (new URL(origin).host !== req.headers.host) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request denied' })
      return false
    }
  } catch {
    sendJson(res, 403, { ok: false, error: 'invalid origin' })
    return false
  }
  return true
}

function createRuntime() {
  /** @type {import('node:child_process').ChildProcess | undefined} */
  let child
  let armed = true
  let provider = ''
  let providerError = ''
  let lastError = ''
  let starting
  /** @type {{ at: number, action: string, detail: string, ok: boolean }[]} */
  const log = []
  /** @type {Map<string, string>} */
  const previews = new Map()
  const captureDir = path.join(tmpdir(), 'dsh-computer-use')

  function note(action, detail, ok) {
    log.unshift({ at: Date.now(), action, detail: clean(detail, 160), ok })
    if (log.length > LOG_LIMIT) log.pop()
  }

  function status() {
    return {
      ok: true,
      armed,
      daemon: Boolean(child && child.exitCode == null && !child.killed),
      driver: resolveDriver(),
      driverFound: Boolean(resolveDriver()),
      pipe: PIPE,
      permissionMode: 'standard',
      provider: provider || undefined,
      providerError: providerError || undefined,
      lastError: lastError || undefined,
      log,
    }
  }

  /**
   * @param {string} tool
   * @param {Record<string, unknown>} args
   * @param {number} timeoutMs
   */
  function call(tool, args, timeoutMs = 20_000) {
    const exe = resolveDriver()
    if (!exe) return Promise.reject(new Error('cua-driver was not found'))
    return new Promise((resolve, reject) => {
      const proc = spawn(exe, ['call', '--socket', PIPE, tool, JSON.stringify({ session: SESSION, ...args })], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        proc.kill()
        reject(new Error(`${tool} timed out`))
      }, timeoutMs)
      proc.stdout.setEncoding('utf8')
      proc.stderr.setEncoding('utf8')
      proc.stdout.on('data', chunk => {
        stdout += chunk
        if (stdout.length > 2_000_000) proc.kill()
      })
      proc.stderr.on('data', chunk => {
        stderr += chunk
      })
      proc.on('error', error => {
        clearTimeout(timer)
        reject(error)
      })
      proc.on('close', code => {
        clearTimeout(timer)
        const text = stdout.trim()
        if (!text) {
          const message = clean(stderr, 400) || `${tool} exited ${code}`
          lastError = message
          reject(new Error(message))
          return
        }
        try {
          resolve(JSON.parse(text))
        } catch {
          reject(new Error(clean(text, 400)))
        }
      })
    })
  }

  async function ensureDaemon() {
    if (child && child.exitCode == null && !child.killed) return
    if (starting) return starting
    starting = (async () => {
      try {
        await call('get_screen_size', {}, 4_000)
        return
      } catch {
        /* start our own daemon below */
      }
      const exe = resolveDriver()
      if (!exe) throw new Error('cua-driver was not found')
      child = spawn(exe, ['serve', '--socket', PIPE, '--permission-mode', 'standard'], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', chunk => {
        lastError = clean(chunk, 400)
      })
      child.on('exit', () => {
        child = undefined
      })
      const deadline = Date.now() + 8_000
      let last
      while (Date.now() < deadline) {
        if (!child || child.exitCode != null) break
        try {
          await call('get_screen_size', {}, 2_000)
          lastError = ''
          return
        } catch (error) {
          last = error
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      }
      throw last instanceof Error ? last : new Error('cua-driver did not become ready')
    })().finally(() => {
      starting = undefined
    })
    return starting
  }

  function stopDaemon() {
    const current = child
    child = undefined
    if (current && current.exitCode == null) current.kill()
  }

  /**
   * @param {Record<string, unknown>} raw
   */
  function windowsOf(raw) {
    const rows = Array.isArray(raw?.windows) ? raw.windows : []
    return rows.slice(0, WINDOW_LIMIT).map(row => ({
      windowId: row.window_id,
      pid: row.pid,
      app: clean(row.app_name, 80),
      title: clean(row.title, 120),
      onScreen: Boolean(row.is_on_screen),
      minimized: Boolean(row.minimized),
    }))
  }

  /**
   * @param {Record<string, unknown>} raw
   * @param {string} previewId
   * @param {string} screenshotPath
   */
  function observationOf(raw, previewId, screenshotPath) {
    const structured = raw?.structuredContent && typeof raw.structuredContent === 'object' ? raw.structuredContent : raw
    const rows = Array.isArray(structured?.elements) ? structured.elements : []
    return {
      ok: raw?.isError !== true,
      snapshotId: clean(structured?.snapshot_id ?? raw?.snapshot_id, 32),
      elementCount: Number(structured?.total_element_count ?? rows.length) || rows.length,
      truncated: rows.length > ELEMENT_LIMIT,
      elements: rows.slice(0, ELEMENT_LIMIT).map(row => ({
        index: row.element_index,
        token: clean(row.element_token, 80),
        role: clean(row.role, 40),
        label: clean(row.label, 80),
        enabled: row.enabled !== false,
      })),
      previewId,
      screenshotPath,
      error: raw?.isError ? clean(raw.error?.message ?? raw.message ?? raw.error, 240) : undefined,
    }
  }

  /**
   * @param {Record<string, unknown>} request
   * @param {{ user: boolean }} source
   */
  async function run(request, source) {
    const action = clean(request.action, 24)
    if (action === 'status') return status()
    if (action === 'arm') {
      if (!source.user) return { ok: false, error: 'only the Computer page can arm computer use' }
      armed = request.armed === true
      note('arm', armed ? 'armed' : 'disarmed', true)
      return status()
    }
    if (action === 'daemon') {
      if (!source.user) return { ok: false, error: 'only the Computer page can start the driver' }
      if (request.running === false) {
        stopDaemon()
        note('daemon', 'stopped', true)
        return status()
      }
      await ensureDaemon()
      note('daemon', 'started', true)
      return status()
    }
    if (action === 'preview') {
      const id = clean(request.id, 40)
      const file = previews.get(id)
      if (!file || !file.startsWith(captureDir)) return { ok: false, error: 'preview not found' }
      return { ok: true, file }
    }

    const needsArm = WRITE_ACTIONS.has(action) || (!source.user && action !== 'status')
    if (needsArm && !armed) {
      return {
        ok: false,
        armed: false,
        error: 'Computer use is turned off. Ask the user to open the Computer sidebar page and turn it back on. Do not retry until they do.',
      }
    }
    if (!['windows', 'observe', 'click', 'type', 'key', 'scroll'].includes(action)) {
      return { ok: false, error: 'action must be status, windows, observe, click, type, key, or scroll' }
    }

    await ensureDaemon()
    if (action === 'windows') {
      const raw = await call('list_windows', { on_screen_only: request.onScreenOnly !== false })
      const windows = windowsOf(raw)
      note('windows', `${windows.length} windows`, true)
      return { ok: true, windows }
    }

    const pid = integer(request.pid)
    const windowId = integer(request.windowId)
    if (pid == null || windowId == null) return { ok: false, error: 'pid and windowId are required' }
    const target = { kind: 'window', pid, window_id: windowId }

    if (action === 'observe') {
      await mkdir(captureDir, { recursive: true })
      const previewId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const screenshotPath = path.join(captureDir, `${previewId}.png`)
      const raw = await call('get_window_state', {
        pid,
        window_id: windowId,
        target,
        include_screenshot: true,
        screenshot_out_file: screenshotPath,
        max_elements: 80,
        max_depth: 8,
        query: clean(request.query, 80) || undefined,
      }, 45_000)
      previews.set(previewId, screenshotPath)
      while (previews.size > 8) {
        const oldest = previews.keys().next().value
        const file = previews.get(oldest)
        previews.delete(oldest)
        if (file) rm(file, { force: true }).catch(() => undefined)
      }
      const observation = observationOf(raw, previewId, screenshotPath)
      note('observe', observation.snapshotId || `${observation.elementCount} elements`, observation.ok !== false)
      return observation
    }

    const token = clean(request.elementToken, 80)
    const delivery = request.deliveryMode === 'foreground' ? 'foreground' : 'background'
    /** @type {Record<string, unknown>} */
    const args = { pid, window_id: windowId, target, delivery_mode: delivery }
    if (token) args.element_token = token

    if (action === 'click') {
      if (!token && (request.x == null || request.y == null)) {
        return { ok: false, error: 'click needs elementToken, or x and y from the latest observe screenshot' }
      }
      if (!token) {
        args.x = Number(request.x)
        args.y = Number(request.y)
      }
      if (request.button === 'right' || request.button === 'middle') args.button = request.button
      const raw = await call('click', args)
      note('click', token || `${args.x},${args.y}`, raw?.isError !== true)
      return { ok: raw?.isError !== true, effect: raw?.effect, path: raw?.path, verified: raw?.verified, error: raw?.isError ? clean(raw.message ?? raw.error, 240) : undefined }
    }
    if (action === 'type') {
      const text = String(request.text ?? '').slice(0, TEXT_LIMIT)
      if (!text) return { ok: false, error: 'text is required' }
      const raw = await call('type_text', { ...args, text })
      note('type', `${text.length} characters`, raw?.isError !== true)
      return { ok: raw?.isError !== true, effect: raw?.effect, path: raw?.path, verified: raw?.verified, error: raw?.isError ? clean(raw.message ?? raw.error, 240) : undefined }
    }
    if (action === 'key') {
      const key = allowedKey(request.key)
      if (!key) return { ok: false, error: 'key must be a letter, digit, or a named key such as return, tab, or escape' }
      const raw = await call('press_key', { ...args, key })
      note('key', key, raw?.isError !== true)
      return { ok: raw?.isError !== true, effect: raw?.effect, path: raw?.path, error: raw?.isError ? clean(raw.message ?? raw.error, 240) : undefined }
    }
    const direction = ['up', 'down', 'left', 'right'].includes(request.direction) ? request.direction : ''
    if (!direction) return { ok: false, error: 'direction must be up, down, left, or right' }
    const amount = integer(request.amount) ?? 3
    const raw = await call('scroll', { ...args, direction, amount: Math.min(amount, 20) })
    note('scroll', `${direction} ${Math.min(amount, 20)}`, raw?.isError !== true)
    return { ok: raw?.isError !== true, effect: raw?.effect, path: raw?.path, error: raw?.isError ? clean(raw.message ?? raw.error, 240) : undefined }
  }

  return {
    run,
    status,
    start: ensureDaemon,
    stop: stopDaemon,
    setProvider(name, error) {
      provider = name
      providerError = error
    },
  }
}

/**
 * @param {import('@cordisjs/core').Context} ctx
 */
export function apply(ctx) {
  const runtime = createRuntime()
  ctx.effect(() => {
    runtime.start().catch(() => undefined)
    return runtime.stop
  }, 'computer-use: driver')

  ctx.inject(['computerUse'], child => {
    child.effect(() => {
      try {
        const dispose = child.computerUse.register('local-computer-use')
        runtime.setProvider('local-computer-use', '')
        return () => {
          runtime.setProvider('', '')
          return dispose?.()
        }
      } catch (error) {
        runtime.setProvider('', reason(error))
      }
    }, 'computer-use: provider')
  })

  ctx.inject(['webServer'], child => {
    const handler = async (req, res) => {
      if (!sameOrigin(req, res)) return
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
      const route = url.pathname.slice(ROOT.length)
      const method = req.method ?? 'GET'
      try {
        if (method === 'GET' && route === '/api/state') {
          sendJson(res, 200, runtime.status())
          return
        }
        if (method === 'GET' && route === '/api/preview') {
          const found = await runtime.run({ action: 'preview', id: url.searchParams.get('id') }, { user: true })
          if (!found.ok) {
            sendJson(res, 404, found)
            return
          }
          const bytes = await readFile(found.file)
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
          res.end(bytes)
          return
        }
        if (method === 'POST' && route === '/api/run') {
          const body = await readBody(req)
          const result = await runtime.run(body, { user: true })
          sendJson(res, result.ok === false ? 400 : 200, result)
          return
        }
        sendJson(res, 404, { ok: false, error: 'not found' })
      } catch (error) {
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: reason(error) })
        else res.end()
      }
    }
    child.effect(() => child.webServer.register({ kind: 'prefix', path: ROOT, handler }), 'computer-use: http')
  })

  ctx.inject(['tools'], child => {
    child.effect(() => child.tools.register({
      name: 'computer_use',
      description: 'Operate one window through the user\'s CUA driver. It is on by default; the agent observes the screen itself, so do not ask the user to capture or scan. action is status, windows, observe, click, type, key, or scroll. A turned-off result means they switched it off on the Computer page; do not retry until they turn it back on. Observe the exact pid and windowId before clicking. Prefer elementToken from that observe. Omit deliveryMode unless the previous result says background is unavailable; foreground briefly takes focus and must not be guessed. Do not use this for passwords, payment, or permission dialogs. Clipboard, process kill, and desktop-wide input are not available.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'windows', 'observe', 'click', 'type', 'key', 'scroll'],
            description: 'status reads the arm and driver state. windows lists top-level windows. observe reads one window. click, type, key, and scroll act on that window.',
          },
          pid: { type: 'integer', description: 'Target process id from windows.' },
          windowId: { type: 'integer', description: 'Target window id from windows.' },
          query: { type: 'string', description: 'Optional observe filter.' },
          elementToken: { type: 'string', description: 'Element handle from the latest observe of this window.' },
          x: { type: 'number', description: 'Screenshot-pixel x, only when the element is not in the tree.' },
          y: { type: 'number', description: 'Screenshot-pixel y, paired with x.' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Click button. Default left.' },
          text: { type: 'string', description: 'Text to insert. It is not stored in the page log.' },
          key: { type: 'string', description: 'One key: letter, digit, return, tab, escape, arrows, or f1-f12.' },
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction.' },
          amount: { type: 'integer', description: 'Scroll ticks, 1 to 20. Default 3.' },
          deliveryMode: {
            type: 'string',
            enum: ['background', 'foreground'],
            description: 'Omit unless the previous result says background is unavailable.',
          },
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args) {
        return runtime.run(args && typeof args === 'object' ? args : {}, { user: false })
      },
    }), 'computer-use: tool')
  })
}
