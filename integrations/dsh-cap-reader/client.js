// CAP browser face in the public DSH ModuleLoader wire format.
window.__ModuleLoader__.load({
  id: 'dsh-cap-reader',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var createElement = react.createElement
    var useEffect = react.useEffect
    var useState = react.useState

    var CLIENT_VERSION = '0.1.0-p0'
    var BUILD_LABEL = 'cap-reader-p0-01'

    function surfaceOf(search) {
      var params = new URLSearchParams(search)
      var mode = params.get('dsh-desktop-mode')
      var platform = params.get('dsh-desktop-platform')
      if (mode === 'compatibility' || mode === 'advanced') {
        return 'desktop:' + mode + ':' + (platform === null ? 'unknown' : platform)
      }
      return 'dsh-web'
    }

    function ReaderOverlay(props) {
      var connection = props.connection
      var hostSource = connection === undefined ? undefined : connection.hostDescription
      var initialHost = hostSource === undefined ? undefined : hostSource.getSnapshot()
      var hostState = useState(initialHost)
      var hostSnapshot = hostState[0]
      var setHostSnapshot = hostState[1]
      var openState = useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var summaryState = useState(undefined)
      var summary = summaryState[0]
      var setSummary = summaryState[1]
      var errorState = useState(undefined)
      var summaryError = errorState[0]
      var setSummaryError = errorState[1]

      useEffect(function () {
        if (hostSource === undefined) return undefined
        function update() {
          setHostSnapshot(hostSource.getSnapshot())
        }
        return hostSource.subscribe(update)
      }, [])

      var connected = hostSnapshot !== undefined
      useEffect(function () {
        if (!open || !connected) return undefined
        var controller = new AbortController()
        setSummaryError(undefined)
        fetch('/cap/knowledge-summary', {
          method: 'GET',
          signal: controller.signal,
          headers: { accept: 'application/json' },
        }).then(function (response) {
          if (!response.ok) throw new Error('知识概览请求失败：HTTP ' + response.status)
          return response.json()
        }).then(function (payload) {
          setSummary(payload.summary)
        }).catch(function (error) {
          if (controller.signal.aborted) return
          setSummaryError(error instanceof Error ? error.message : String(error))
        })
        return function () { controller.abort() }
      }, [open, connected])

      var status = connected
        ? '已连接 DSH ' + hostSnapshot.version
        : '等待 DSH Host 握手'

      var children = [
        createElement('button', {
          key: 'launcher',
          type: 'button',
          'data-testid': 'dsh-cap-reader-launcher',
          'aria-expanded': open ? 'true' : 'false',
          onClick: function () { setOpen(!open) },
          style: {
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: '999px',
            background: '#172033',
            color: '#f8fafc',
            padding: '8px 12px',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.25)',
          },
        }, 'CAP 阅读器 · ' + status),
      ]

      if (open) {
        var summaryContent = summary === undefined
          ? createElement('p', { key: 'loading' }, summaryError === undefined ? '正在读取真实知识概览…' : summaryError)
          : createElement('dl', { key: 'summary', 'data-testid': 'dsh-cap-reader-summary' }, [
            createElement('div', { key: 'core' }, '核心材料 ' + summary.coreMaterials + ' · 核心关系 ' + summary.coreEdges),
            createElement('div', { key: 'extended' }, '扩展材料 ' + summary.extendedMaterials + ' · 扩展关系 ' + summary.extendedEdges),
            createElement('div', { key: 'candidate' }, '候选假设 ' + summary.candidates + ' · 非退化证据 ' + summary.evidencePairs),
          ])
        children.push(createElement('section', {
          key: 'panel',
          role: 'dialog',
          'aria-label': 'CAP 材料文献阅读器',
          'data-testid': 'dsh-cap-reader-panel',
          style: {
            width: 'min(420px, calc(100vw - 32px))',
            marginTop: '8px',
            padding: '16px',
            borderRadius: '14px',
            background: '#ffffff',
            color: '#172033',
            boxShadow: '0 16px 48px rgba(15, 23, 42, 0.24)',
          },
        }, [
          createElement('strong', { key: 'title' }, '材料证据链（CAP）'),
          createElement('p', { key: 'status' }, status + '。知识概览由当前 DSH Host 的只读路由提供。'),
          summaryContent,
          createElement('small', { key: 'meta' }, [
            CLIENT_VERSION,
            ' · ',
            BUILD_LABEL,
            ' · ',
            props.surface,
          ]),
        ]))
      }

      return createElement('div', {
        'data-testid': 'dsh-cap-reader-root',
        'data-build': BUILD_LABEL,
        'data-surface': props.surface,
        'data-host': connected ? hostSnapshot.version : '',
        style: {
          position: 'fixed',
          right: '16px',
          bottom: '16px',
          zIndex: 2147483000,
          font: '13px/1.5 system-ui, sans-serif',
          pointerEvents: 'auto',
        },
      }, children)
    }

    exports.name = 'dsh-cap-reader'
    exports.inject = ['slots']
    exports.apply = function apply(ctx) {
      var connection = ctx.get('connection')
      var surface = surfaceOf(globalThis.location.search)
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-cap-reader-launcher',
          order: 900,
        }, function CapReaderOverlay() {
          return createElement(ReaderOverlay, {
            connection,
            surface,
          })
        })
      })
    }

    return module.exports
  },
})
