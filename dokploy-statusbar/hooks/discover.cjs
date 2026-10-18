// Maps the Dokploy services of ONE panel to their Git repo. Run per panel:
//   dokploy-panel <panel> exec node discover.cjs
// Prints a JSON array with public fields only, never the API key.
const { baseUrl, panel, get } = require('./api.cjs')

const repoOf = u => (u || '').trim().toLowerCase().replace(/\.git$/, '').match(/github\.com[:/]([^/]+\/[^/]+)$/)?.[1] ?? ''

async function main() {
  const out = []
  const jobs = []
  for (const p of await get('project.all'))
    for (const env of p.environments ?? []) {
      const add = (kind, list) =>
        (list ?? []).forEach(s => {
          const id = s[`${kind}Id`]
          jobs.push(
            get(`${kind}.one`, { [`${kind}Id`]: id })
              .then(d => {
                const git = d.sourceType === 'github' ? [`github.com/${d.owner}/${d.repository}`, d.branch] : d.sourceType === 'git' ? [d.customGitUrl, d.customGitBranch] : null
                const repo = git && repoOf(git[0])
                if (repo) out.push({ panel, app: s.name, kind, id, repo, branch: git[1] || 'main', watchPaths: d.watchPaths ?? [], url: `${baseUrl}/dashboard/project/${p.projectId}/environment/${env.environmentId}/services/${kind}/${id}` })
              })
              .catch(e => console.error(`${panel}/${s.name}: ${e.message}`)),
          )
        })
      add('application', env.applications)
      add('compose', env.compose)
    }
  await Promise.all(jobs)
  return out
}

main().then(
  r => console.log(JSON.stringify(r)),
  e => (console.error(`${panel}: ${e.message}`), console.log('[]')),
)
