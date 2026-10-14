// Ordnet Dokploy-Dienste ihrem GitHub-Repo zu. Nutzt die Bibliothek der installierten CLI,
// damit API-Keys nie im Mod landen; ausgegeben werden nur die Felder unten.
const api = require('/opt/homebrew/lib/node_modules/dokploy-cli/dist/api.js')

const repoOf = u => (u || '').trim().toLowerCase().replace(/\.git$/, '').match(/github\.com[:/]([^/]+\/[^/]+)$/)?.[1] ?? ''

async function one(inst, proc, idKey, id) {
  const input = encodeURIComponent(JSON.stringify({ json: { [idKey]: id } }))
  const res = await fetch(`${inst.baseUrl}/api/trpc/${proc}?input=${input}`, { headers: { 'x-api-key': inst.apiKey } })
  if (!res.ok) throw new Error(`${proc} ${res.status}`)
  return (await res.json()).result.data.json
}

async function panel(inst) {
  const out = []
  const jobs = []
  for (const p of await api.fetchProjects(inst))
    for (const env of p.environments ?? []) {
      const add = (kind, list) =>
        (list ?? []).forEach(s => {
          const id = s[`${kind}Id`]
          jobs.push(
            one(inst, `${kind}.one`, `${kind}Id`, id)
              .then(d => {
                const git = d.sourceType === 'github' ? [`github.com/${d.owner}/${d.repository}`, d.branch] : d.sourceType === 'git' ? [d.customGitUrl, d.customGitBranch] : null
                const repo = git && repoOf(git[0])
                if (repo) out.push({ panel: inst.name, app: s.name, kind, repo, branch: git[1] || 'main', watchPaths: d.watchPaths ?? [], url: `${inst.baseUrl}/dashboard/project/${p.projectId}/environment/${env.environmentId}/services/${kind}/${id}` })
              })
              .catch(e => console.error(`${inst.name}/${s.name}: ${e.message}`)),
          )
        })
      add('application', env.applications)
      add('compose', env.compose)
    }
  await Promise.all(jobs)
  return out
}

Promise.all(
  api.loadInstances().map(i => panel(i).catch(e => (console.error(`${i.name}: ${e.message}`), []))),
).then(r => console.log(JSON.stringify(r.flat())))
