import type { Deploy, PollEntry, Target } from '../types'

// Eintrag aus poll.cjs (neuester Deploy des Dienstes) → Deploy; fehlender oder fehlerhafter Eintrag → Status '?'.
export const parseLatest = (t: Target, entry: PollEntry | undefined): Deploy =>
  entry && !entry.error && entry.status
    ? { ...t, status: entry.status, when: entry.createdAt ?? '', title: (entry.title ?? '').split('\n')[0].trim(), deploymentId: entry.deploymentId }
    : { ...t, status: '?', when: '', title: '', error: entry?.error || 'keine Ausgabe' }

// Wohin ein Klick führt: bei Fehler direkt zu den Deployments mit dem Build-Log, sonst auf die Dienst-Seite.
export const linkOf = (d: Deploy) => (d.status === 'error' || d.error ? `${d.url}?tab=deployments` : d.url)

export const repoOf = (remoteUrl: string) =>
  remoteUrl.trim().toLowerCase().replace(/\.git$/, '').match(/github\.com[:/]([^/]+\/[^/]+)$/)?.[1] ?? ''

// Dienste (Ausgabe von discover.cjs) zum Remote. Am Remote statt am Ordnernamen, weil OMS / OMS-2.0 sich sonst verwechseln.
// Nur der Repo-Name zählt, nicht der Owner: Dokploy behält nach einer Umbenennung des GitHub-Accounts den alten Owner.
const nameOf = (repo: string) => repo.toLowerCase().split('/')[1] ?? ''
export const targetsFor = (services: (Target & { repo: string })[], remoteUrl: string): Target[] => {
  const name = nameOf(repoOf(remoteUrl))
  return name ? services.filter(s => nameOf(s.repo) === name).sort((a, b) => a.app.localeCompare(b.app)) : []
}

// Tolerant, weil Dokploy den Titel evtl. kürzt: getrimmt, gleich oder Präfix in eine Richtung.
const sameTitle = (a: string, b: string) => {
  const x = a.trim()
  const y = b.trim()
  return x !== '' && y !== '' && (x.startsWith(y) || y.startsWith(x))
}

// Hash des deployten Commits: erster Eintrag aus `git log --format=%H%x09%s` mit passendem Betreff; '' wenn keiner passt.
export const deployedCommit = (logOut: string, title: string) => {
  for (const line of logOut.split('\n')) {
    const [hash, ...rest] = line.split('\t')
    if (hash && sameTitle(rest.join('\t'), title)) return hash
  }
  return ''
}

// watchPaths → Git-Pathspecs; leer = jeder Commit deployt, also kein `--`.
export const pathspecs = (watchPaths: string[]) => (watchPaths.length ? ['--', ...watchPaths.map(w => `:(glob)${w}`)] : [])

// ISO-Zeitstempel → ms; NaN, wenn er sich nicht lesen lässt.
export const parseWhen = (when: string) => Date.parse(when)

// HH:MM in lokaler Zeit; '' bei ungültiger Angabe.
export const clockOf = (when: string) => {
  const t = parseWhen(when)
  return Number.isNaN(t) ? '' : new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// m:ss; negative oder ungültige Spannen als 0:00 (Uhrenabweichung zum Server).
export const elapsed = (ms: number) => {
  const s = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Letzte `n` Zeilen ohne ANSI-Farbcodes.
export const tailLog = (out: string, n = 80) =>
  out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trimEnd().split('\n').slice(-n).join('\n')
