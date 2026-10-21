// Neuestes Deployment mehrerer Dienste eines Panels in einem Prozess (ein Infisical-Abruf statt einem je Dienst).
// Aufruf: `dokploy-panel <panel> exec node poll.cjs <kind>:<id> …`; Ausgabe: JSON-Liste { id, status, title, createdAt, deploymentId }.
const { query } = require('./dokploy-api.cjs')

const latest = async spec => {
  const [kind, id] = spec.split(':')
  try {
    const list = kind === 'compose' ? await query('deployment.allByCompose', { composeId: id }) : await query('deployment.all', { applicationId: id })
    const d = [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
    return d ? { id, status: d.status, title: d.title ?? '', createdAt: d.createdAt, deploymentId: d.deploymentId } : { id, error: 'keine Deployments' }
  } catch (e) {
    return { id, error: e.message }
  }
}

Promise.all(process.argv.slice(2).map(latest)).then(r => console.log(JSON.stringify(r)))
