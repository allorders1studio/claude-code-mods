// Ordnet die Dokploy-Dienste eines Panels ihrem GitHub-Repo zu. Läuft unter
// `dokploy-panel <panel> exec node discover.cjs`; ausgegeben werden nur die Felder unten, nie Keys.
const { query, baseUrl, panel } = require('./dokploy-api.cjs')

const repoOf = u => (u || '').trim().toLowerCase().replace(/\.git$/, '').match(/github\.com[:/]([^/]+\/[^/]+)$/)?.[1] ?? ''

async function main() {
  const url = baseUrl()
  const out = []
  const jobs = []
  for (const p of await query('project.all'))
    for (const env of p.environments ?? []) {
      const add = (kind, list) =>
        (list ?? []).forEach(s => {
          const id = s[`${kind}Id`]
          jobs.push(
            query(`${kind}.one`, { [`${kind}Id`]: id })
              .then(d => {
                const git = d.sourceType === 'github' ? [`github.com/${d.owner}/${d.repository}`, d.branch] : d.sourceType === 'git' ? [d.customGitUrl, d.customGitBranch] : null
                const repo = git && repoOf(git[0])
                if (repo) out.push({ panel: panel(), app: s.name, kind, id, repo, branch: git[1] || 'main', watchPaths: d.watchPaths ?? [], url: `${url}/dashboard/project/${p.projectId}/environment/${env.environmentId}/services/${kind}/${id}` })
              })
              .catch(e => console.error(`${panel()}/${s.name}: ${e.message}`)),
          )
        })
      add('application', env.applications)
      add('compose', env.compose)
    }
  await Promise.all(jobs)
  console.log(JSON.stringify(out))
}

main().catch(e => {
  console.error(`${panel()}: ${e.message}`)
  process.exit(1)
})
