import type { Ci, HandTest, LoopData, MergePr, QueueItem, Question, Routine } from '../types'

type Label = { name: string }
type Check = { status?: string; conclusion?: string; state?: string }
export type RawPr = {
  number: number
  title: string
  url: string
  isDraft?: boolean
  headRefName?: string
  body?: string
  labels?: Label[]
  statusCheckRollup?: Check[]
  mergedAt?: string
}
export type RawIssue = { number: number; title: string; url: string; labels?: Label[]; body?: string }

export const repoOf = (remoteUrl: string) =>
  remoteUrl.trim().toLowerCase().replace(/\.git$/, '').match(/github\.com[:/]([^/]+\/[^/]+)$/)?.[1] ?? ''

// Nur der Repo-Name zählt (Owner egal); `oms-2.0` ist ein anderes Repo.
export const isOmsRepo = (remoteUrl: string) => repoOf(remoteUrl).split('/')[1] === 'oms'

const has = (labels: Label[] | undefined, name: string) => (labels ?? []).some(l => l.name === name)

const BAD = ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED']
const BAD_STATE = ['FAILURE', 'ERROR']

// Rot vor läuft vor grün; ohne Checks `keine`.
export const ciOf = (checks: Check[] | undefined): Ci => {
  if (!checks?.length) return 'keine'
  if (checks.some(c => BAD.includes(c.conclusion ?? '') || BAD_STATE.includes(c.state ?? ''))) return 'rot'
  if (checks.some(c => (c.status !== undefined && c.status !== 'COMPLETED') || c.state === 'PENDING')) return 'läuft'
  return 'grün'
}

export const isFirstTest = (title: string) => /^\[erst testen\]/i.test(title.trim())

export const parsePrs = (prs: RawPr[]): MergePr[] =>
  prs
    .filter(p => has(p.labels, 'fix-loop'))
    .map(p => ({ number: p.number, title: p.title, url: p.url, draft: !!p.isDraft, ci: ciOf(p.statusCheckRollup), first: isFirstTest(p.title) }))
    .sort((a, b) => Number(a.draft) - Number(b.draft) || a.number - b.number)

// Offene `- [ ] `-Zeilen im Abschnitt ab `**C. Handtests` bis zur nächsten `## `-Zeile.
export const openHandTests = (body: string): string[] => {
  const out: string[] = []
  let inside = false
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('**C. Handtests')) inside = true
    else if (line.startsWith('## ')) inside = false
    else if (inside) {
      const m = line.match(/^- \[ \] (.+)$/)
      if (m?.[1]) out.push(m[1].trim())
    }
  }
  return out
}

const DAY = 86400000
export const parseTests = (merged: RawPr[], now: Date): HandTest[] =>
  merged
    .filter(p => p.mergedAt && now.getTime() - new Date(p.mergedAt).getTime() <= 14 * DAY)
    .map(p => ({ number: p.number, title: p.title, url: p.url, items: openHandTests(p.body ?? '') }))
    .filter(t => t.items.length > 0)

// Routinen schreiben „Frage an Nam:“ (Übertragungsfehler) oder „Frage an dich:“ (GlitchTip).
export const countQuestions = (body: string) => (body.match(/\*\*Frage an (?:Nam|dich):\*\*/g) ?? []).length

export const parseQuestions = (issues: RawIssue[]): Question[] =>
  issues
    .filter(i => has(i.labels, 'zu-pruefen'))
    .map(i => ({ number: i.number, title: i.title, url: i.url, count: countQuestions(i.body ?? '') }))
    .sort((a, b) => a.number - b.number)

const ORDER = ['beheben', 'sicherheit', 'bug', 'performance']
const SKIP = ['manuell', 'zu-pruefen', 'routinen']

// Issue-Nummern, für die ein offener PR existiert: Branch `fix/issue-<nr>` oder `Closes/Fixes #<nr>` im Body.
export const coveredIssues = (openPrs: RawPr[]): Set<number> => {
  const set = new Set<number>()
  for (const p of openPrs) {
    const b = p.headRefName?.match(/^fix\/issue-(\d+)$/)
    if (b?.[1]) set.add(Number(b[1]))
    for (const m of (p.body ?? '').matchAll(/\b(?:closes|fixes)\s+#(\d+)(?!\d)/gi)) set.add(Number(m[1]))
  }
  return set
}

export const parseQueue = (issues: RawIssue[], openPrs: RawPr[]): QueueItem[] => {
  const covered = coveredIssues(openPrs)
  const items: QueueItem[] = []
  for (const i of issues) {
    const label = ORDER.find(l => has(i.labels, l))
    if (!label || SKIP.some(l => has(i.labels, l)) || covered.has(i.number)) continue
    items.push({ number: i.number, title: i.title, url: i.url, label })
  }
  return items.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label) || a.number - b.number)
}

// Tabelle zwischen den Statusmarkern; Kopf- und Trennzeile fallen weg.
export const parseRoutines = (body: string): Routine[] => {
  const m = body.match(/<!-- routinen-status:start -->([\s\S]*?)<!-- routinen-status:ende -->/)
  if (!m?.[1]) return []
  const rows: Routine[] = []
  for (const line of m[1].split(/\r?\n/)) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    const cells = t.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    const [name, at, ...rest] = cells
    if (!name || at === undefined || !rest.length || name === 'Routine' || /^:?-+:?$/.test(name)) continue
    rows.push({ name, at, result: rest.join(' | ') })
  }
  return rows
}

export const buildLoop = (openPrs: RawPr[], merged: RawPr[], issues: RawIssue[], now: Date): LoopData => ({
  prs: parsePrs(openPrs),
  questions: parseQuestions(issues),
  tests: parseTests(merged, now),
  queue: parseQueue(issues, openPrs),
  routines: parseRoutines(issues.find(i => has(i.labels, 'routinen'))?.body ?? ''),
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Text und Farbe des Leisten-Eintrags: nur, was auf Nam wartet (Entwürfe zählen nicht).
export const summary = (d: LoopData) => {
  const prs = d.prs.filter(p => !p.draft)
  const q = d.questions.reduce((s, x) => s + x.count, 0)
  const t = d.tests.reduce((s, x) => s + x.items.length, 0)
  const parts = [prs.length && plural(prs.length, 'PR', 'PRs'), q && plural(q, 'Frage', 'Fragen'), t && plural(t, 'Test', 'Tests')].filter(Boolean)
  const color = prs.some(p => p.ci === 'rot') ? 'error' : prs.some(p => p.first) ? 'warning' : parts.length ? undefined : 'subtle'
  return { text: parts.length ? `Loop: ${parts.join(' · ')}` : 'Loop: nichts offen', color }
}

const link = (n: number, url: string) => `[#${n}](${url})`
const list = (rows: string[]) => (rows.length ? rows : ['- keine'])

// Lagebild als Markdown für Oberflächen, die das Pane nicht zeichnen (z. B. Fernverbindung der Desktop-App).
export const toText = (d: LoopData | null, error: string, inRepo: boolean): string => {
  if (error) return `Fehler-Loop: ${error}`
  if (!inRepo) return 'Nicht im OMS-Repo'
  if (!d) return 'Fehler-Loop: keine Daten'
  const prs = d.prs.map(p => {
    const marks = [`CI ${p.ci}`, p.draft && 'Entwurf', p.first && 'erst testen'].filter(Boolean)
    return `- ${link(p.number, p.url)} ${p.title} (${marks.join(', ')})`
  })
  const questions = d.questions.map(q => `- ${link(q.number, q.url)} ${q.title} (${plural(q.count, 'Frage', 'Fragen')})`)
  const tests = d.tests.flatMap(t => [`- ${link(t.number, t.url)} ${t.title}`, ...t.items.map(x => `  - [ ] ${x}`)])
  const queue = d.queue.map(q => `- ${link(q.number, q.url)} ${q.title} (${q.label})`)
  const routines = d.routines.map(r => `- **${r.name}** ${r.at}: ${r.result}`)
  return [
    `## ${summary(d).text}`,
    '### Wartet auf dich – PRs zum Mergen',
    ...list(prs),
    '### Sammelfragen',
    ...list(questions),
    '### Offene Handtests',
    ...list(tests),
    '### Warteschlange',
    ...list(queue),
    '### Routinen',
    ...list(routines),
    '',
    'Beheben: `/xx-fehler-loop behebe #<nr>` · Routine starten: `/xx-fehler-loop jetzt <name>`',
  ].join('\n')
}
