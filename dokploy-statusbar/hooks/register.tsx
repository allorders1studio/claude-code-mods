import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Deploy, Target } from '../types'
import { addToBar } from './bar'
import { clock, deployedCommit, elapsed, pathspecs, linkOf, parseLatest, parsePoll, parseWhen, tailLog, targetsFor } from './parse'
import type { PollEntry } from './parse'

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

// Fehlerbilder, die schon gemeldet wurden: eine dauerhafte Störung soll nicht alle 10 min einen Toast auslösen.
type Service = Target & { repo: string }
const toasted = new Set<string>()
const toastOnce = ($: EngineInterface, text: string) => {
  if (toasted.has(text)) return
  toasted.add(text)
  void $.ui.toast(text)
}

// Dienste samt Repo aus allen Dokploy-Panels. `dokploy-panel <panel> exec` setzt URL und Key nur für das Skript;
// discover.cjs gibt nur öffentliche Felder aus, nie Keys. Fällt ein Panel aus, zählen die anderen trotzdem.
async function discover($: EngineInterface) {
  lastDiscover = Date.now()
  try {
    const list = await $.process.run([PANEL, '--panels'], { timeoutMs: 10000 })
    if (list.exitCode !== 0) throw new Error((list.stderr || list.stdout).trim().split('\n')[0] || `Exit ${list.exitCode}`)
    const panels = list.stdout.split('\n').map(p => p.trim()).filter(Boolean)
    const found = await Promise.all(
      panels.map(async p => {
        try {
          const r = await $.process.run([PANEL, p, 'exec', NODE, `${$.plugin.root}/hooks/discover.cjs`], { timeoutMs: 60000 })
          if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n')[0] || `Exit ${r.exitCode}`)
          return { ok: true, list: JSON.parse(r.stdout) as Service[] }
        } catch (err) {
          toastOnce($, `Dokploy-Zuordnung (${p}) fehlgeschlagen: ${err}`)
          return { ok: false, list: [] as Service[] }
        }
      }),
    )
    // Ein ausgefallenes Panel behält seine bisherigen Dienste, statt sie aus der Leiste zu streichen.
    const old = await read($, services)
    const merged = found.flatMap((f, i) => (f.ok ? f.list : old.filter(o => o.panel === panels[i])))
    await update($, services, () => merged)
  } catch (err) {
    toastOnce($, `Dokploy-Zuordnung fehlgeschlagen: ${err}`)
  }
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
    // Pro Panel ein Prozess für alle Dienste: ein Infisical-Abruf statt einem je Dienst.
    const panels = [...new Set(targets.map(t => t.panel))]
    const entries = new Map<string, PollEntry[] | string>()
    await Promise.all(
      panels.map(async p => {
        const specs = targets.filter(t => t.panel === p).map(t => `${t.kind}:${t.id}`)
        try {
          const r = await $.process.run([PANEL, p, 'exec', NODE, `${$.plugin.root}/hooks/poll.cjs`, ...specs], { timeoutMs: 30000 })
          const list = r.exitCode === 0 ? parsePoll(r.stdout) : null
          entries.set(p, list ?? ((r.stderr || r.stdout).trim().split('\n')[0] || 'keine Ausgabe'))
        } catch (err) {
          entries.set(p, String(err))
        }
      }),
    )
    const next = await Promise.all(
      targets.map(async t => {
        const e = entries.get(t.panel)
        const d = Array.isArray(e) ? parseLatest(t, e.find(x => x.id === t.id)) : parseLatest(t, undefined, e)
        // Ohne `git fetch`: ein Push aktualisiert origin/<branch> lokal. Git-Fehler oder kein Treffer → keine Markierung.
        // Ausstehend heißt: seit dem deployten Commit kam einer, der die watchPaths des Dienstes berührt.
        let pending = false
        try {
          if (d.status === 'done') {
            const ref = `origin/${t.branch}`
            const g = await $.process.run(['git', 'log', '-200', '--format=%H%x09%s', ref], { cwd })
            const hash = g.exitCode === 0 ? deployedCommit(g.stdout, d.title) : ''
            if (hash) {
              const c = await $.process.run(['git', 'rev-list', '--count', `${hash}..${ref}`, ...pathspecs(t.watchPaths)], { cwd })
              pending = c.exitCode === 0 && Number(c.stdout) > 0
            }
          }
        } catch {
          pending = false
        }
        return { ...d, pending }
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
    const r = await $.process.run([PANEL, d.panel, 'deployment', 'read-logs', '--deploymentId', d.deploymentId, '--tail', '300'], { timeoutMs: 30000 })
    if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n')[0] || `Exit ${r.exitCode}`)
    const text = `Build-Log von ${d.app} (${d.panel}), letzter Deploy fehlgeschlagen:\n\`\`\`\n${tailLog(r.stdout)}\n\`\`\`\n`
    await $.prompt.fill({ text })
  } catch (err) {
    void $.ui.toast(`Build-Log von ${d.app} nicht abrufbar: ${err}`)
  }
}

const runTime = (d: Deploy, tick: number) =>
  d.status === 'running' && !Number.isNaN(parseWhen(d.when)) ? elapsed(tick - parseWhen(d.when)) : clock(d.when)

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
