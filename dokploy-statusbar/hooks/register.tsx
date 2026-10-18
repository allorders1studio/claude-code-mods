import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Deploy, PollEntry, Target } from '../types'
import { addToBar } from './bar'
import { clockOf, deployedCommit, elapsed, pathspecs, linkOf, parseLatest, parseWhen, tailLog, targetsFor } from './parse'

const PANEL = '/opt/homebrew/bin/dokploy-panel'
const NODE = '/opt/homebrew/bin/node'
const deploys = atom({ plugin: 'dokploy-statusbar', key: 'deploys' } as const, [])
const checkedAt = atom({ plugin: 'dokploy-statusbar', key: 'checkedAt' } as const, '')
const services = atom({ plugin: 'dokploy-statusbar', key: 'services' } as const, [])
// Sekundentakt nur für die laufende Zeit; ohne Atom würde die Leiste zwischen zwei Polls stehen.
const now = atom({ plugin: 'dokploy-statusbar', key: 'now' } as const, 0)

const COLOR: Record<string, string> = { done: 'green', error: 'red', running: 'yellow', idle: 'gray' }
const SLOW = 30000
const FAST = 5000
const FAST_FOR = 120000
const DISCOVER_EVERY = 600000

// Modulzustand statt Atom: nur der Takt braucht ihn, gezeichnet wird er nicht.
let polling = false
let lastPoll = 0
let lastDiscover = 0
let fastUntil = 0

// Ein Wrapper-Aufruf holt den API-Key einmal aus Infisical, daher je Panel ein Prozess mit allen Abfragen.
const inPanel = ($: EngineInterface, panel: string, script: string, args: string[], timeoutMs: number) =>
  $.process.run([PANEL, panel, 'exec', NODE, `${$.plugin.root}/hooks/${script}`, ...args], { timeoutMs })

// Dienste samt Repo aus allen Dokploy-Panels; discover.cjs gibt nur öffentliche Felder aus, nie Keys.
// Ein Panel, das nicht antwortet, liefert [] und blockiert die anderen nicht.
async function discover($: EngineInterface) {
  lastDiscover = Date.now()
  try {
    const p = await $.process.run([PANEL, '--panels'], { timeoutMs: 10000 })
    if (p.exitCode !== 0) throw new Error((p.stderr || p.stdout).trim().split('\n')[0] || `Exit ${p.exitCode}`)
    const panels = p.stdout.split('\n').map(l => l.trim()).filter(Boolean)
    const lists = await Promise.all(
      panels.map(async panel => {
        try {
          const r = await inPanel($, panel, 'discover.cjs', [], 30000)
          return r.exitCode === 0 ? (JSON.parse(r.stdout) as (Target & { repo: string })[]) : []
        } catch {
          return []
        }
      }),
    )
    await update($, services, () => lists.flat())
  } catch (err) {
    void $.ui.toast(`Dokploy-Zuordnung fehlgeschlagen: ${err}`)
  }
}

// Neuester Deploy je Dienst, ein Prozess pro Panel; Schlüssel `panel/id`.
async function latestByService($: EngineInterface, targets: Target[]) {
  const out = new Map<string, PollEntry>()
  const panels = [...new Set(targets.map(t => t.panel))]
  await Promise.all(
    panels.map(async panel => {
      const mine = targets.filter(t => t.panel === panel)
      try {
        const r = await inPanel($, panel, 'poll.cjs', mine.map(t => `${t.kind}:${t.id}`), 20000)
        const entries: PollEntry[] = r.exitCode === 0 ? JSON.parse(r.stdout) : []
        const error = (r.stderr || r.stdout).trim().split('\n')[0] || `Exit ${r.exitCode}`
        for (const t of mine) out.set(`${panel}/${t.id}`, entries.find(e => e.id === t.id) ?? { id: t.id, error })
      } catch (err) {
        for (const t of mine) out.set(`${panel}/${t.id}`, { id: t.id, error: String(err) })
      }
    }),
  )
  return out
}

// Liest das Repo bei jedem Lauf neu, damit ein Projektwechsel in der Session sofort greift.
async function poll($: EngineInterface) {
  if (polling) return
  polling = true
  lastPoll = Date.now()
  try {
    const cwd = await $.session.cwd()
    const remote = await $.process.run(['git', 'remote', 'get-url', 'origin'], { cwd })
    const targets = targetsFor(await read($, services), remote.exitCode === 0 ? remote.stdout : '')
    const before = await read($, deploys)
    const latest = await latestByService($, targets)
    const next = await Promise.all(
      targets.map(async t => {
        try {
          const d = parseLatest(t, latest.get(`${t.panel}/${t.id}`))
          // Ohne `git fetch`: ein Push aktualisiert origin/<branch> lokal. Git-Fehler oder kein Treffer → keine Markierung.
          // Ausstehend heißt: seit dem deployten Commit kam einer, der die watchPaths des Dienstes berührt.
          let pending = false
          if (d.status === 'done') {
            const ref = `origin/${t.branch}`
            const g = await $.process.run(['git', 'log', '-200', '--format=%H%x09%s', ref], { cwd })
            const hash = g.exitCode === 0 ? deployedCommit(g.stdout, d.title) : ''
            if (hash) {
              const c = await $.process.run(['git', 'rev-list', '--count', `${hash}..${ref}`, ...pathspecs(t.watchPaths)], { cwd })
              pending = c.exitCode === 0 && Number(c.stdout) > 0
            }
          }
          return { ...d, pending }
        } catch (err) {
          return { ...t, status: '?', when: '', title: '', error: String(err) } as Deploy
        }
      }),
    )
    for (const d of next) {
      const old = before.find(b => b.panel === d.panel && b.app === d.app)
      if (old && old.status === 'running' && d.status !== 'running') void $.ui.toast(`${d.app}: Deploy ${d.status}`)
    }
    await update($, deploys, () => next)
    await update($, checkedAt, () => new Date().toLocaleTimeString('de-DE'))
  } finally {
    polling = false
  }
}

async function showLog($: EngineInterface, d: Deploy) {
  try {
    if (!d.deploymentId) throw new Error('keine Deployment-ID')
    const r = await inPanel($, d.panel, 'poll.cjs', ['log', d.deploymentId, '200'], 30000)
    if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n')[0] || `Exit ${r.exitCode}`)
    const text = `Build-Log von ${d.app} (${d.panel}), letzter Deploy fehlgeschlagen:\n\`\`\`\n${tailLog(r.stdout)}\n\`\`\`\n`
    await $.prompt.fill({ text })
  } catch (err) {
    void $.ui.toast(`Build-Log von ${d.app} nicht abrufbar: ${err}`)
  }
}

const runTime = (d: Deploy, tick: number) =>
  d.status === 'running' && !Number.isNaN(parseWhen(d.when)) ? elapsed(tick - parseWhen(d.when)) : clockOf(d.when)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'deploys', description: 'Deploy-Status des Projekts sofort neu abfragen' })
    void discover($).then(() => poll($))
    // Ein Sekundentakt für alles: Poll (30 s, nach Push 5 s), Discovery (10 min), laufende Zeit.
    // shortcut: in Projekten ohne Zuordnung kostet ein Poll nur `git remote`, bei Bedarf Takt je Aufgabe trennen.
    $.clock.every(1000, async () => {
      const t = Date.now()
      if (t - lastDiscover >= DISCOVER_EVERY) void discover($)
      if (t - lastPoll >= (t < fastUntil ? FAST : SLOW)) void poll($)
      if ((await read($, deploys)).some(d => d.status === 'running')) await update($, now, () => t)
    })
    return next(e)
  })

  // Nach erfolgreichem `git push` zwei Minuten schneller pollen; der Aufruf bleibt unverändert.
  // `tool.call` statt PostToolUse, weil `next(e)` das Ergebnis liefert (isError) und der Aufruf unberührt bleibt.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (e.tool === 'Bash' && /\bgit\s+push\b/.test(e.command) && !r.deny && !r.isError) {
      fastUntil = Date.now() + FAST_FOR
      lastPoll = 0
    }
    return r
  })

  on('command.run', { command: 'deploys' }, async $ => {
    await poll($)
    const n = (await read($, deploys)).length
    return { text: n ? 'Deploy-Status aktualisiert.' : 'Für dieses Projekt gibt es keine Dokploy-Dienste.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const inner = await next(e)
    const list = await read($, deploys)
    if (e.props.hasSurvey || list.length === 0) return inner
    const ui = $.ui.resolve(e)
    const { Box, Button, Link, Text } = ui
    const at = await read($, checkedAt)
    const tick = await read($, now)
    const apps = (
      <Box gap={1}>
        {list.map(d => (
          <Box key={`app:${d.panel}/${d.app}`}>
            <Text color={d.pending ? 'gray' : (COLOR[d.status] ?? 'magenta')}>● </Text>
            <Link href={linkOf(d)}>{d.app}</Link>
            {d.status === 'error' && <Button key={`log:${d.panel}/${d.app}`} plain label=" Log" onPress={() => showLog($, d)} />}
            {/* „done“ sagt schon der grüne Punkt; Status und Zeit nur, wenn etwas anderes los ist */}
            <Text dimColor>{d.error ? ' Fehler beim Abruf' : d.pending ? ' ausstehend' : d.status !== 'done' ? ` ${d.status} ${runTime(d, tick)}` : ''}</Text>
          </Box>
        ))}
      </Box>
    )
    // Abrufzeit ganz rechts (Schlüssel „9“) und nur als Randnotiz; eine Schriftgröße kennt die Oberfläche nicht, daher nur blasser
    const withApps = addToBar(ui, inner, 'left', '1-dokploy', apps)
    return addToBar(ui, withApps, 'right', '9-zeit', <Text color="subtle">{at.slice(0, 5)}</Text>)
  })
}
