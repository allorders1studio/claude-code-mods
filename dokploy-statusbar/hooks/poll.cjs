// Latest deployment per service of ONE panel, in a single process (one key lookup per cycle):
//   dokploy-panel <panel> exec node poll.cjs <kind>:<id>…     kind = application | compose
//   dokploy-panel <panel> exec node poll.cjs log <deploymentId> [tail]
// Poll output: [{ id, deploymentId, status, title, createdAt } | { id, error }]
const { get } = require('./api.cjs')

const PROC = { application: ['deployment.all', 'applicationId'], compose: ['deployment.allByCompose', 'composeId'] }

async function latest(spec) {
  const [kind, id] = spec.split(':')
  try {
    const [proc, key] = PROC[kind] ?? (() => { throw new Error(`unknown kind ${kind}`) })()
    const list = await get(proc, { [key]: id })
    // Newest first per API; sorted anyway so a changed order cannot show a stale deploy.
    const d = [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
    return d ? { id, deploymentId: d.deploymentId, status: d.status, title: d.title ?? '', createdAt: d.createdAt } : { id, error: 'no deployments' }
  } catch (e) {
    return { id, error: e.message }
  }
}

async function main() {
  const [first, ...rest] = process.argv.slice(2)
  if (first === 'log') {
    const log = await get('deployment.readLogs', { deploymentId: rest[0], ...(rest[1] ? { tail: Number(rest[1]) } : {}) })
    console.log(typeof log === 'string' ? log : Array.isArray(log) ? log.join('\n') : JSON.stringify(log))
    return
  }
  console.log(JSON.stringify(await Promise.all([first, ...rest].filter(Boolean).map(latest))))
}

main().catch(e => (console.error(e.message), process.exit(1)))
