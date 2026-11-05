window.__ModuleLoader__.load({
  id: '@local/computer-use',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState } = React
    const NS = 'computer-use'

    const STRINGS = {
      zh: {
        nav: '電腦',
        title: '電腦操作',
        intro: '已經開住。Agent 會自己睇畫面同操作，你唔使先擷取。想停就關閉下面個開關。',
        arm: '允許 Agent 操作',
        armOn: '已開啟。Agent 會自己觀察視窗，輸入只會先試背景方式。',
        armOff: '已關閉。Agent 暫時唔可以操作。',
        start: '啟動 driver',
        stop: '停止 driver',
        refresh: '重新整理視窗',
        capture: '擷取',
        loading: '載入中…',
        failed: '操作失敗：',
        daemonOn: 'Driver 運行中',
        daemonOff: 'Driver 未啟動',
        missing: '搵唔到 cua-driver。',
        empty: '未有可見視窗。',
        pick: '預覽可選。Agent 會自己觀察，你唔使先擷取。',
        preview: '最近擷取',
        log: '最近動作',
        noLog: '未有動作。',
        mode: '標準模式',
        windows: '個視窗',
      },
      en: {
        nav: 'Computer',
        title: 'Computer use',
        intro: 'Already on. The agent looks at the screen and acts itself; you do not capture first. Turn the switch off to stop it.',
        arm: 'Let the agent operate',
        armOn: 'On. The agent observes windows itself, and input tries the background path first.',
        armOff: 'Off. The agent cannot operate until you turn this back on.',
        start: 'Start driver',
        stop: 'Stop driver',
        refresh: 'Refresh windows',
        capture: 'Capture',
        loading: 'Loading…',
        failed: 'Could not complete that: ',
        daemonOn: 'Driver running',
        daemonOff: 'Driver stopped',
        missing: 'cua-driver was not found.',
        empty: 'No visible windows.',
        pick: 'Preview is optional. The agent observes by itself.',
        preview: 'Latest capture',
        log: 'Recent actions',
        noLog: 'No actions yet.',
        mode: 'Standard mode',
        windows: 'windows',
      },
    }

    function Icon({ size = 16, active }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 1.9 : 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      h('rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 }),
      h('path', { d: 'M8 20h8' }),
      h('path', { d: 'M12 16v4' }),
      h('path', { d: 'M13 8l4 2.2-1.6.3 1 2-1 .4-1-2-1.3 1z', fill: 'currentColor', stroke: 'none' }))
    }

    function api(pathname, body) {
      return fetch(pathname, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }).then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.ok === false) {
          const error = new Error(payload.error || `HTTP ${response.status}`)
          error.payload = payload
          throw error
        }
        return payload
      })
    }

    function Page({ t, subscribe }) {
      const [state, setState] = useState(null)
      const [windows, setWindows] = useState([])
      const [selected, setSelected] = useState('')
      const [preview, setPreview] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState('')
      const [, setLocaleRev] = useState(0)

      useEffect(() => subscribe ? subscribe(() => setLocaleRev(value => value + 1)) : undefined, [subscribe])

      async function load() {
        const next = await api('/computer-use/api/state')
        setState(next)
      }

      useEffect(() => {
        let stop = false
        async function ready() {
          await api('/computer-use/api/run', { action: 'daemon', running: true })
          await api('/computer-use/api/run', { action: 'arm', armed: true })
          const listed = await api('/computer-use/api/run', { action: 'windows', onScreenOnly: true })
          if (stop) return
          if (listed.windows) setWindows(listed.windows)
          await load()
        }
        ready().catch(cause => {
          if (!stop) setError(`${t('failed')}${cause instanceof Error ? cause.message : String(cause)}`)
        })
        return () => { stop = true }
      }, [])

      async function act(body, key) {
        setBusy(key)
        setError('')
        try {
          const result = await api('/computer-use/api/run', body)
          if (result.armed != null || result.daemon != null) setState(result)
          if (result.windows) setWindows(result.windows)
          if (result.previewId) setPreview(`/computer-use/api/preview?id=${encodeURIComponent(result.previewId)}`)
          await load()
        } catch (cause) {
          setError(`${t('failed')}${cause instanceof Error ? cause.message : String(cause)}`)
        } finally {
          setBusy('')
        }
      }

      const armed = Boolean(state?.armed)
      const daemon = Boolean(state?.daemon)
      const selectedWindow = windows.find(item => `${item.pid}:${item.windowId}` === selected)

      return h('div', { className: 'cu-page' },
        h('style', null, CSS),
        h('header', { className: 'cu-head' },
          h('div', null,
            h('h1', { className: 'cu-title' }, t('title')),
            h('p', { className: 'cu-intro' }, t('intro'))),
          h('div', { className: 'cu-tools' },
            h('button', {
              type: 'button',
              className: 'cu-btn',
              disabled: busy !== '',
              onClick: () => act({ action: 'daemon', running: !daemon }, 'daemon'),
            }, busy === 'daemon' ? t('loading') : daemon ? t('stop') : t('start')),
            h('button', {
              type: 'button',
              className: 'cu-btn',
              disabled: busy !== '',
              onClick: () => act({ action: 'windows', onScreenOnly: true }, 'windows'),
            }, busy === 'windows' ? t('loading') : t('refresh')))),
        error ? h('p', { className: 'cu-error', role: 'alert' }, error) : null,
        h('section', { className: 'cu-card' },
          h('div', { className: 'cu-row' },
            h('button', {
              type: 'button',
              className: armed ? 'cu-switch on' : 'cu-switch',
              role: 'switch',
              'aria-checked': armed,
              disabled: busy !== '',
              onClick: () => act({ action: 'arm', armed: !armed }, 'arm'),
            }, h('span', { className: 'cu-knob', 'aria-hidden': true })),
            h('div', null,
              h('strong', null, t('arm')),
              h('p', null, armed ? t('armOn') : t('armOff')))),
          h('p', { className: 'cu-meta' },
            daemon ? t('daemonOn') : t('daemonOff'),
            ' · ',
            t('mode'),
            state?.driverFound ? '' : ` · ${t('missing')}`)),
        h('div', { className: 'cu-body' },
          h('section', { className: 'cu-list', 'aria-label': t('refresh') },
            h('div', { className: 'cu-list-head' },
              h('span', null, `${windows.length} ${t('windows')}`),
              h('button', {
                type: 'button',
                className: 'cu-btn',
                disabled: !selectedWindow || busy !== '',
                onClick: () => act({
                  action: 'observe',
                  pid: selectedWindow.pid,
                  windowId: selectedWindow.windowId,
                }, 'capture'),
              }, busy === 'capture' ? t('loading') : t('capture'))),
            windows.length === 0
              ? h('p', { className: 'cu-muted' }, t('empty'))
              : h('ul', null, windows.map(item => {
                const id = `${item.pid}:${item.windowId}`
                return h('li', { key: id },
                  h('button', {
                    type: 'button',
                    className: id === selected ? 'cu-window on' : 'cu-window',
                    onClick: () => setSelected(id),
                  },
                  h('strong', null, item.title || item.app || String(item.pid)),
                  h('em', null, item.app)))
              }))),
          h('section', { className: 'cu-stage' },
            h('h2', null, t('preview')),
            preview
              ? h('img', { src: preview, alt: t('preview') })
              : h('p', { className: 'cu-muted' }, t('pick')),
            h('h2', null, t('log')),
            state?.log?.length
              ? h('ol', null, state.log.map(item => h('li', { key: `${item.at}-${item.action}` },
                h('b', null, item.action),
                ' ',
                item.detail)))
              : h('p', { className: 'cu-muted' }, t('noLog'))))
      )
    }

    const CSS = `
      .cu-page { box-sizing: border-box; height: 100%; overflow: auto; padding: calc(var(--dsh-frame-top-clearance, 20px) + 12px) 28px 48px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font-size: 14px; line-height: 1.45; }
      .cu-head, .cu-row, .cu-tools, .cu-list-head { display: flex; gap: 12px; align-items: center; }
      .cu-head { justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
      .cu-title { margin: 0 0 6px; font-size: 22px; font-weight: 640; }
      .cu-intro, .cu-muted, .cu-meta, .cu-row p { margin: 0; color: var(--dsw-alias-label-secondary); max-width: 68ch; }
      .cu-card, .cu-list, .cu-stage { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 14px; }
      .cu-card { padding: 14px 16px; margin-bottom: 16px; }
      .cu-row { align-items: flex-start; }
      .cu-meta { margin-top: 10px; font-size: 12px; }
      .cu-btn, .cu-window { font: inherit; color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
      .cu-btn { border-radius: 999px; padding: 6px 12px; cursor: pointer; }
      .cu-btn:hover, .cu-window:hover { background: var(--dsw-alias-bg-layer-2); }
      .cu-btn:disabled { opacity: 0.55; cursor: default; }
      .cu-btn:focus-visible, .cu-window:focus-visible, .cu-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cu-switch { width: 42px; height: 24px; flex: 0 0 auto; border: 0; border-radius: 999px; padding: 3px; background: var(--dsw-alias-state-idle-primary); cursor: pointer; }
      .cu-switch.on { background: var(--dsw-alias-brand-primary); }
      .cu-knob { display: block; width: 18px; height: 18px; border-radius: 999px; background: var(--dsw-alias-bg-base); transition: transform 160ms ease; }
      .cu-switch.on .cu-knob { transform: translateX(18px); }
      .cu-body { display: grid; grid-template-columns: minmax(240px, 320px) minmax(0, 1fr); gap: 16px; align-items: start; }
      .cu-list, .cu-stage { padding: 12px; min-width: 0; }
      .cu-list-head { justify-content: space-between; margin-bottom: 8px; }
      .cu-list ul, .cu-stage ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      .cu-window { width: 100%; text-align: left; border-radius: 10px; padding: 8px 10px; cursor: pointer; }
      .cu-window.on { border-color: var(--dsw-alias-brand-primary); }
      .cu-window strong, .cu-window em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cu-window em { font-style: normal; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cu-stage h2 { margin: 0 0 8px; font-size: 14px; font-weight: 640; }
      .cu-stage img { display: block; width: 100%; max-height: 420px; object-fit: contain; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); margin-bottom: 16px; }
      .cu-stage li { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cu-stage b { color: var(--dsw-alias-label-primary); font-weight: 640; }
      .cu-error { color: var(--dsw-alias-state-error-primary); }
      @media (max-width: 800px) {
        .cu-head, .cu-body { display: block; }
        .cu-tools, .cu-list { margin-top: 12px; }
      }
    `

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.get('locale')
        let t = key => STRINGS.zh[key] ?? STRINGS.en[key] ?? key
        let subscribe
        if (locale) {
          ctx.effect(() => {
            try {
              return locale.register(NS, { zh: STRINGS.zh, en: STRINGS.en })
            } catch {
              const dispose = []
              for (const id of ['zh', 'en']) {
                try { dispose.push(locale.register(NS, id, STRINGS[id])) } catch { /* local text remains */ }
              }
              return () => { for (const fn of dispose) fn() }
            }
          }, 'computer-use: dictionaries')
          try { t = locale.bind(NS) } catch { /* local text remains */ }
          subscribe = typeof locale.subscribe === 'function' ? fn => locale.subscribe(fn) : undefined
        }
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'computer-use',
          order: 14,
          label: () => t('nav'),
          locale: NS,
        }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'computer-use',
          locale: NS,
        }, () => h(Page, { t, subscribe })))
      },
    }
  },
})
