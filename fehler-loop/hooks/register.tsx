import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Ci, LoopData } from '../types'
import { addToBar } from './bar'
import { buildLoop, isOmsRepo, summary, toText } from './parse'
import type { RawIssue, RawPr } from './parse'

const PANE = 'fehler-loop'
const REPO = 'allorders1studio/OMS'
const EVERY = 300000
const data = atom({ plugin: 'fehler-loop', key: 'data' } as const, null)
const error = atom({ plugin: 'fehler-loop', key: 'error' } as const, '')
const loadedAt = atom({ plugin: 'fehler-loop', key: 'loadedAt' } as const, '')
const inRepo = atom({ plugin: 'fehler-loop', key: 'inRepo' } as const, false)

// Nur lesende gh-Aufrufe; bei Exit-Code ≠ 0 zählt die erste Zeile von stderr.
async function gh<T>($: EngineInterface, cwd: string, args: string[]): Promise<T> {
  const r = await $.process.run(['gh', ...args, '--repo', REPO], { cwd })
  if (r.exitCode !== 0) throw new Error(r.stderr.split('\n').find(l => l.trim()) ?? `gh beendet mit ${r.exitCode}`)
  try {
    return JSON.parse(r.stdout) as T
  } catch {
    throw new Error('Antwort von gh nicht lesbar')
  }
}

// Repo bei jedem Lauf neu lesen, damit ein Projektwechsel in der Session greift.
async function load($: EngineInterface) {
  try {
    const cwd = await $.session.cwd()
    const remote = await $.process.run(['git', 'remote', 'get-url', 'origin'], { cwd })
    const ok = remote.exitCode === 0 && isOmsRepo(remote.stdout)
    await update($, inRepo, () => ok)
    if (!ok) {
      await update($, data, () => null)
      await update($, error, () => '')
      return
    }
    const [open, merged, issues] = await Promise.all([
      gh<RawPr[]>($, cwd, ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,url,isDraft,headRefName,body,labels,statusCheckRollup']),
      gh<RawPr[]>($, cwd, ['pr', 'list', '--state', 'merged', '--label', 'fix-loop', '--limit', '30', '--json', 'number,title,url,mergedAt,body']),
      gh<RawIssue[]>($, cwd, ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,url,labels,body']),
    ])
    await update($, data, () => buildLoop(open, merged, issues, new Date()))
    await update($, error, () => '')
  } catch (err) {
    await update($, data, () => null)
    await update($, error, () => (err instanceof Error ? err.message : String(err)))
  } finally {
    await update($, loadedAt, () => new Date().toLocaleTimeString('de-DE'))
  }
}

async function show($: EngineInterface) {
  await load($)
  return $.ui.open({ id: PANE, title: 'Fehler-Loop' })
}

const CI_COLOR: Record<Ci, string | undefined> = { grün: 'success', rot: 'error', läuft: 'warning', keine: undefined }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'fehler-loop', description: 'Stand des Fehler-Loops im OMS-Repo zeigen' })
    void load($)
    $.clock.every(EVERY, () => void load($))
    return next(e)
  })

  on('command.run', { command: 'fehler-loop' }, async $ => {
    const opened = await show($)
    // Ohne gezeichnetes Pane (z. B. Fernverbindung) bleibt nur der Text.
    if (opened?.isPlaced) return { text: 'Fehler-Loop-Pane geöffnet.' }
    return { text: toText(await read($, data), await read($, error), await read($, inRepo)) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const inner = await next(e)
    if (e.props.hasSurvey || !(await read($, inRepo))) return inner
    const d = await read($, data)
    const failed = !!(await read($, error))
    if (!d && !failed) return inner
    const { Button, Text } = $.ui.resolve(e)
    const s = d ? summary(d) : { text: 'Loop: Fehler', color: 'error' }
    const entry = (
      <Button key="fehler-loop" plain onPress={() => show($)}>
        <Text color={s.color}>{s.text}</Text>
      </Button>
    )
    return addToBar($.ui.resolve(e), inner, 'right', '2-fehler-loop', entry)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const d: LoopData | null = await read($, data)
    const err = await read($, error)
    const at = await read($, loadedAt)
    const fill = (text: string) => $.prompt.fill({ text })

    const head = (
      <Box gap={1}>
        <Button key="reload" label="Neu laden" onPress={() => load($)} />
        {at && <Text dimColor>Stand {at}</Text>}
      </Box>
    )
    const note = (node: RenderElement) => (
      <Box flexDirection="column" gap={1}>
        {head}
        {node}
      </Box>
    )
    if (err) return note(<Text color="error">{err}</Text>)
    if (!at) return note(<Text dimColor>Lade …</Text>)
    if (!(await read($, inRepo))) return note(<Text dimColor>Nicht im OMS-Repo</Text>)
    if (!d) return note(<Text dimColor>keine Daten</Text>)

    const section = (title: string, n: number, rows: RenderElement[]) => (
      <Box key={`sec:${title}`} flexDirection="column">
        <Text bold>{title}</Text>
        {n === 0 && <Text dimColor>keine</Text>}
        {rows}
      </Box>
    )

    const prs = d.prs.map(p => (
      <Box key={`pr:${p.number}`} gap={1}>
        <Link href={p.url}>{`#${p.number}`}</Link>
        <Text color={p.first ? 'warning' : undefined} bold={p.first}>{p.title}</Text>
        <Text color={CI_COLOR[p.ci]}>{`CI ${p.ci}`}</Text>
        {p.draft && <Text dimColor>Entwurf</Text>}
        {p.first && <Text color="warning">erst testen</Text>}
      </Box>
    ))
    const questions = d.questions.map(q => (
      <Box key={`q:${q.number}`} gap={1}>
        <Link href={q.url}>{`#${q.number}`}</Link>
        <Text>{q.title}</Text>
        <Text dimColor>{q.count === 1 ? '1 Frage' : `${q.count} Fragen`}</Text>
        <Button key={`answer:${q.number}`} label="Beantworten" onPress={() => fill(`Sammelfrage #${q.number} beantworten: `)} />
      </Box>
    ))
    const tests = d.tests.map(t => (
      <Box key={`t:${t.number}`} flexDirection="column">
        <Box gap={1}>
          <Link href={t.url}>{`#${t.number}`}</Link>
          <Text>{t.title}</Text>
        </Box>
        {t.items.map((x, i) => (
          <Text key={`ti:${t.number}:${i}`} dimColor>{`  ○ ${x}`}</Text>
        ))}
      </Box>
    ))
    const queue = d.queue.map(q => (
      <Box key={`w:${q.number}`} gap={1}>
        <Link href={q.url}>{`#${q.number}`}</Link>
        <Text>{q.title}</Text>
        <Text dimColor>{q.label}</Text>
        <Button key={`fix:${q.number}`} label="Beheben" onPress={() => fill(`/xx-fehler-loop behebe #${q.number}`)} />
      </Box>
    ))
    const routines = d.routines.map(r => (
      <Box key={`r:${r.name}`} gap={1}>
        <Text bold>{r.name}</Text>
        <Text dimColor>{r.at}</Text>
        <Text>{r.result}</Text>
        <Button key={`run:${r.name}`} label="Jetzt starten" onPress={() => fill(`/xx-fehler-loop jetzt ${r.name}`)} />
      </Box>
    ))

    return (
      <Box flexDirection="column" gap={1}>
        {head}
        {section('Wartet auf dich – PRs zum Mergen', prs.length, prs)}
        {section('Sammelfragen', questions.length, questions)}
        {section('Offene Handtests', tests.length, tests)}
        {section('Warteschlange', queue.length, queue)}
        {section('Routinen', routines.length, routines)}
      </Box>
    )
  })
}
