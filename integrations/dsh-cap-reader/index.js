import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

/** Stable Cordis plugin name. */
export const name = 'dsh-cap-reader'

export const inject = ['webServer']

function projectRoot(config) {
  const candidate = config?.repositoryRoot ?? process.env.CAP_REPOSITORY_ROOT
  if (typeof candidate !== 'string' || candidate.length === 0) return undefined
  if (candidate.includes('\0') || !isAbsolute(candidate)) return undefined
  return resolve(candidate)
}

function numberField(value, field) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`invalid ${field}`)
  return parsed
}

async function readSummary(root) {
  const report = JSON.parse(await readFile(join(root, 'outputs', 'pipeline_report.json'), 'utf8'))
  const structure = report.L2_structure ?? {}
  const application = report.L4_application ?? {}
  return Object.freeze({
    coreMaterials: numberField(structure.core_materials_count, 'core_materials_count'),
    coreEdges: numberField(structure.core_edges_count, 'core_edges_count'),
    extendedMaterials: numberField(structure.extended_nodes_count, 'extended_nodes_count'),
    extendedEdges: numberField(structure.extended_edges_count, 'extended_edges_count'),
    candidates: numberField(application.candidates_generated, 'candidates_generated'),
    evidencePairs: Array.isArray(report.L3_rules?.parallel_evidence)
      ? report.L3_rules.parallel_evidence.length
      : numberField(
        report.L3_rules?.non_degenerate_evidence
          ?? report.L3_rules?.non_degenerate_parallel_evidence_count,
        'non_degenerate_evidence',
      ),
  })
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** Register one read-only route in the existing DSH Host web server. */
export function apply(ctx, config = {}) {
  const root = projectRoot(config)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/cap/knowledge-summary',
    async handler(req, res) {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return
      }
      if (root === undefined) {
        sendJson(res, 503, { error: 'cap_repository_not_configured' })
        return
      }
      try {
        sendJson(res, 200, { summary: await readSummary(root) })
      } catch (error) {
        ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        sendJson(res, 503, { error: 'cap_knowledge_unavailable' })
      }
    },
  }), 'dsh-cap-reader knowledge summary route')
}
