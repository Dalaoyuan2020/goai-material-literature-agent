import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = fileURLToPath(new URL('../', import.meta.url))
const pluginName = 'dsh-cap-reader'
const buildLabel = 'cap-reader-p0-01'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readDshRoot() {
  const index = process.argv.indexOf('--dsh-root')
  const value = index === -1 ? process.env.DSH_DESKTOP_ROOT : process.argv[index + 1]
  if (!value) {
    throw new Error('Pass --dsh-root <desktop repository> or set DSH_DESKTOP_ROOT.')
  }
  return resolve(value)
}

function readCapRoot() {
  const index = process.argv.indexOf('--cap-root')
  const value = index === -1 ? process.env.CAP_REPOSITORY_ROOT : process.argv[index + 1]
  if (!value) throw new Error('Pass --cap-root <competition repository> or set CAP_REPOSITORY_ROOT.')
  return resolve(value)
}

function fileSpec(path) {
  const normalized = path.replace(/\\/gu, '/')
  return `file:${normalized.endsWith('/') ? normalized.slice(0, -1) : normalized}`
}

function runNode(args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      resolvePromise({ code, signal, stdout, stderr })
    })
  })
}

function startWeb({ cwd, dshBin, home, environment }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [dshBin, 'web', '--host', '127.0.0.1', '--port', '0'], {
      cwd,
      env: { ...environment, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`dsh web did not print a URL in time\n${stderr}`))
    }, 30000)
    child.stdout.on('data', chunk => {
      stdout += String(chunk)
      const match = stdout.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/u)
      if (!settled && match) {
        settled = true
        clearTimeout(timer)
        resolvePromise({ child, url: match[1] })
      }
    })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`dsh web exited before URL (code=${String(code)} signal=${String(signal)})\n${stderr}`))
    })
  })
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill()
  await new Promise(resolvePromise => child.once('close', resolvePromise))
}

async function fetchGraph(url) {
  const response = await fetch(url)
  assert(response.ok, `GET ${url} -> HTTP ${String(response.status)}`)
  const html = await response.text()
  const match = html.match(/window\.__DSH_BOOT__ = (\{.*?\})<\/script>/u)
  assert(match !== null, 'DSH page did not expose window.__DSH_BOOT__.')
  return JSON.parse(match[1])
}

function containsPlugin(graph) {
  return graph.entries.some(entry => entry.id === pluginName)
}

async function inspectRunning(instance, expectedPresent) {
  const graph = await fetchGraph(instance.url)
  assert(containsPlugin(graph) === expectedPresent, expectedPresent
    ? `${pluginName} is missing from the DSH boot graph.`
    : `${pluginName} remained in the disabled DSH boot graph.`)
  if (!expectedPresent) return
  const response = await fetch(new URL(`/plugins/${pluginName}/client.js`, instance.url))
  assert(response.ok, `Client bundle returned HTTP ${String(response.status)}.`)
  const bundle = await response.text()
  assert(bundle.includes(buildLabel), `Client bundle is missing ${buildLabel}.`)
}

async function fetchSummary(instance) {
  const response = await fetch(new URL('/cap/knowledge-summary', instance.url))
  assert(response.ok, `Knowledge summary returned HTTP ${String(response.status)}.`)
  const payload = await response.json()
  const summary = payload.summary
  for (const key of ['coreMaterials', 'coreEdges', 'extendedMaterials', 'extendedEdges', 'candidates', 'evidencePairs']) {
    assert(Number.isFinite(summary?.[key]), `Knowledge summary is missing numeric ${key}.`)
  }
  return summary
}

async function main() {
  const dshRoot = readDshRoot()
  const capRoot = readCapRoot()
  const dshBin = join(dshRoot, 'dsh-plugin-desktop', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const pnpmBin = join(dshRoot, 'dsh-plugin-desktop', 'node_modules', '.bin')
  assert(existsSync(dshBin), `DSH CLI not found: ${dshBin}`)
  assert(existsSync(pnpmBin), `Bundled package-manager bin not found: ${pnpmBin}`)

  const home = mkdtempSync(join(tmpdir(), 'cap-dsh-web-'))
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'Path'
  const environment = {
    ...process.env,
    DSH_HOME: home,
    CAP_REPOSITORY_ROOT: capRoot,
    [pathKey]: [pnpmBin, process.env[pathKey]].filter(Boolean).join(delimiter),
  }
  let running
  try {
    const installed = await runNode([
      dshBin,
      'plugin',
      '--profile',
      'web',
      'add',
      fileSpec(pluginRoot),
    ], { cwd: dshRoot, env: environment })
    assert(installed.code === 0, `dsh plugin add failed (${String(installed.code)})\n${installed.stderr}`)

    running = await startWeb({ cwd: dshRoot, dshBin, home, environment })
    await inspectRunning(running, true)
    const summary = await fetchSummary(running)
    await stopChild(running.child)
    running = undefined

    const profilePatch = join(home, 'profiles', 'web', 'cordis.patch.yml')
    writeFileSync(profilePatch, `- id: ${pluginName}\n  disabled: true\n`, 'utf8')
    running = await startWeb({ cwd: dshRoot, dshBin, home, environment })
    await inspectRunning(running, false)
    await stopChild(running.child)
    running = undefined

    writeFileSync(profilePatch, '[]\n', 'utf8')
    running = await startWeb({ cwd: dshRoot, dshBin, home, environment })
    await inspectRunning(running, true)

    process.stdout.write(`${JSON.stringify({
      plugin: pluginName,
      build: buildLabel,
      profile: 'web',
      loaded: true,
      disabled: true,
      reenabled: true,
      summary,
    }, null, 2)}\n`)
  } finally {
    if (running) await stopChild(running.child)
    rmSync(home, { recursive: true, force: true })
  }
}

await main()
