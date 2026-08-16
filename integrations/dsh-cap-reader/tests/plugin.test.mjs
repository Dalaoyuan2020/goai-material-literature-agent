import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { apply as applyHost, name } from '../index.js'

const clientPath = fileURLToPath(new URL('../client.js', import.meta.url))
const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))

const originalWindow = globalThis.window
const originalLocation = globalThis.location

afterEach(() => {
  globalThis.window = originalWindow
  globalThis.location = originalLocation
})

test('declares a DSH package with a Client face', async () => {
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.equal(name, 'dsh-cap-reader')
  assert.equal(typeof applyHost, 'function')
  assert.deepEqual(manifest.dsh.client.inject, ['@deepseek-ai/dsh-client-runtime'])
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
})

test('serves a real knowledge summary from the configured competition repository', async () => {
  const { mkdtemp, mkdir, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = await mkdtemp(join(tmpdir(), 'cap-reader-host-'))
  let route
  try {
    await mkdir(join(root, 'outputs'))
    await writeFile(join(root, 'outputs', 'pipeline_report.json'), JSON.stringify({
      L2_structure: {
        core_materials_count: 7,
        core_edges_count: 8,
        extended_nodes_count: 9,
        extended_edges_count: 10,
      },
      L3_rules: {
        non_degenerate_parallel_evidence_count: 11,
      },
      L4_application: {
        candidates_generated: 12,
      },
    }))
    const ctx = {
      logger: { warn() {} },
      effect(factory) { factory() },
      webServer: { register(value) { route = value; return () => {} } },
    }
    applyHost(ctx, { repositoryRoot: root })
    assert.equal(route.path, '/cap/knowledge-summary')

    let status
    let body
    await route.handler({ method: 'GET' }, {
      writeHead(value) { status = value },
      end(value) { body = value },
    })
    assert.equal(status, 200)
    assert.deepEqual(JSON.parse(body).summary, {
      coreMaterials: 7,
      coreEdges: 8,
      extendedMaterials: 9,
      extendedEdges: 10,
      candidates: 12,
      evidencePairs: 11,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('registers the CAP launcher through the public shell overlay slot', async () => {
  let descriptor
  let registration
  let registeredComponent

  globalThis.location = {
    search: '?dsh-desktop-mode=advanced&dsh-desktop-platform=win32',
  }
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        descriptor = value
      },
    },
  }

  const source = await readFile(clientPath, 'utf8')
  Function(source)()
  assert.equal(descriptor.id, 'dsh-cap-reader')

  const react = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
    useEffect(effect) {
      effect()
    },
    useState(initialValue) {
      return [initialValue, () => {}]
    },
  }
  const client = descriptor.factory((id) => {
    assert.equal(id, 'react')
    return react
  })
  const connection = {
    isLoopback: true,
    hostDescription: {
      getSnapshot: () => ({ version: '0.1.0-test' }),
      subscribe: () => () => {},
    },
  }
  const ctx = {
    get(service) {
      assert.equal(service, 'connection')
      return connection
    },
    slots: {
      inject(slot, callback) {
        assert.equal(slot, 'shell.overlay')
        callback()
      },
      register(value, component) {
        registration = value
        registeredComponent = component
        return () => {}
      },
    },
  }

  assert.deepEqual(client.inject, ['slots'])
  client.apply(ctx)
  assert.equal(registration.id, 'dsh-cap-reader-launcher')
  assert.equal(registration.name, 'shell.overlay')

  const readerElement = registeredComponent()
  assert.equal(typeof readerElement.type, 'function')
  const rendered = readerElement.type(readerElement.props)
  assert.equal(rendered.props['data-testid'], 'dsh-cap-reader-root')
  assert.equal(rendered.props['data-host'], '0.1.0-test')
  assert.equal(rendered.props['data-surface'], 'desktop:advanced:win32')
})

test('does not smuggle the legacy server or fixed science metrics into the client', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.doesNotMatch(source, /\/api\/v1/)
  assert.doesNotMatch(source, /setTimeout\s*\(/)
  assert.doesNotMatch(source, /94\s*个核心材料/)
  assert.match(source, /\/cap\/knowledge-summary/)
})
