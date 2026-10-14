import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, TodoList } from '../types'
import { addToBar } from './bar'
import { due } from './format'
import { parseList, parseOverview, repoOf, sortItems, summary, toPrompt } from './parse'

const SERVER = 'claude.ai G-Brain'
const PANE = 'todos'
const EVERY = 300000
const lists = atom({ plugin: 'todos', key: 'lists' } as const, [])
const error = atom({ plugin: 'todos', key: 'error' } as const, '')
const loadedAt = atom({ plugin: 'todos', key: 'loadedAt' } as const, '')
const detail = atom({ plugin: 'todos', key: 'detail' } as const, null)

// Der Servername hängt an der Oberfläche: im Terminal `claude.ai G-Brain`, in der Desktop-App die Connector-ID.
// Daher den Server über seine Werkzeuge finden: einer, der `get_page`, `put_page` und `remember` anbietet.
let server = ''
async function brain($: EngineInterface) {
  if (server) return server
  const names = (await $.tool.list()).filter(t => t.mcp).map(t => t.name)
  const has = (s: string, tool: string) => names.includes(`mcp__${s}__${tool}`)
  const found = names
    .map(n => n.match(/^mcp__(.+)__get_page$/)?.[1])
    .find(s => s && has(s, 'put_page') && has(s, 'remember'))
  // Nur einen Treffer merken; ohne Treffer beim nächsten Laden erneut suchen.
  if (found) server = found
  return found ?? SERVER
}

// Lesender Aufruf; Antwort ist JSON im ersten Text-Block, `compiled_truth` die Seite ohne Frontmatter.
async function page($: EngineInterface, slug: string) {
  const r = await $.mcp.call(await brain($), 'get_page', { slug, content_only: true })
  const text = r.content.find(c => c.type === 'text')?.text ?? ''
  if (r.isError) throw new Error(`${slug}: ${text.slice(0, 200) || 'Fehler'}`)
  try {
    const p = JSON.parse(text)
    return { title: String(p.title ?? ''), md: String(p.compiled_truth ?? '') }
  } catch {
    throw new Error(`${slug}: Antwort nicht lesbar`)
  }
}

// Repo bei jedem Lauf neu lesen, damit ein Projektwechsel in der Session greift.
async function load($: EngineInterface) {
  try {
    const cwd = await $.session.cwd()
    const remote = await $.process.run(['git', 'remote', 'get-url', 'origin'], { cwd })
    const repo = remote.exitCode === 0 ? repoOf(remote.stdout) : ''
    let found: TodoList[] = []
    if (repo) {
      const slugs = parseOverview((await page($, 'todo')).md)
      const all = await Promise.all(
        slugs.map(async slug => {
          const p = await page($, slug)
          const l = parseList(p.md)
          return { ...l, title: l.title || p.title, slug }
        }),
      )
      found = all.filter(l => l.repos.includes(repo))
    }
    await update($, lists, () => found)
    await update($, error, () => '')
    await update($, loadedAt, () => new Date().toLocaleTimeString('de-DE'))
  } catch (err) {
    await update($, lists, () => [])
    await update($, error, () => `G-Brain nicht lesbar: ${String(err)}`)
  }
}

async function show($: EngineInterface) {
  await update($, detail, () => null)
  await $.ui.open({ id: PANE, title: 'Aufgaben' })
  await load($)
}

// Backticks aus dem Markdown der Liste stören in Button und Text, dort wird nichts formatiert.
const plain = (t: string) => t.replace(/`/g, '')

const today = () => new Date().toLocaleDateString('sv-SE')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tickets', description: 'Offene Aufgaben dieses Repos aus dem G-Brain zeigen' })
    void load($)
    $.clock.every(EVERY, () => void load($))
    return next(e)
  })

  on('command.run', { command: 'tickets' }, async $ => {
    await show($)
    return { text: 'Aufgaben-Pane geöffnet.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const inner = await next(e)
    const ls = await read($, lists)
    if (e.props.hasSurvey || (await read($, error)) || ls.length === 0) return inner
    const { Button, Text } = $.ui.resolve(e)
    const s = summary(ls, today())
    const entry = (
      <Button key="todos" plain onPress={() => show($)}>
        <Text color={s.color}>Aufgaben {s.n}</Text>
      </Button>
    )
    return addToBar($.ui.resolve(e), inner, 'right', '1-todos', entry)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const d = await read($, detail)
    const now = new Date()
    // Fälligkeit mit Farbe, sonst „seit“; dazu Wartezustand, Prio, Parkstatus.
    const line = (it: Item) => {
      const dl = it.meta.due && !it.meta.parked ? due(`${it.meta.due}T12:00:00`, false, now) : null
      const rest = [it.meta.waitingFor && `wartet auf ${it.meta.waitingFor}`, it.meta.prio && 'Prio hoch', it.meta.parked && 'geparkt']
      const first = dl ? <Text color={dl.color}>{dl.text}</Text> : <Text dimColor>{it.meta.since ? `seit ${it.meta.since}` : ''}</Text>
      return (
        <Text dimColor={!!it.meta.parked}>
          {first}
          {/* Trenner nur zwischen vorhandenen Teilen, sonst stünde bei Einträgen ohne „seit“ ein Punkt vorn */}
          <Text dimColor>{rest.filter(Boolean).map((x, i) => (i || dl || it.meta.since ? `  ·  ${x}` : x)).join('')}</Text>
        </Text>
      )
    }

    if (d) {
      const { item, list } = d
      return (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Button key="back" label="← Zurück" onPress={() => update($, detail, () => null)} />
            <Button key="prompt" label="In Prompt übernehmen" onPress={() => $.prompt.fill({ text: toPrompt(list, item) })} />
          </Box>
          <Box flexDirection="column">
            <Text bold>{plain(item.text)}</Text>
            <Text dimColor>{list.title}</Text>
            {line(item)}
          </Box>
          {item.details.length ? <Markdown text={item.details.map(x => `- ${x}`).join('\n')} /> : <Text dimColor>Keine Details.</Text>}
        </Box>
      )
    }

    const ls = await read($, lists)
    const err = await read($, error)
    const at = await read($, loadedAt)
    const n = ls.reduce((sum, l) => sum + l.items.filter(i => !i.meta.parked).length, 0)
    return (
      <Box flexDirection="column">
        {err && <Text color="red">{err}</Text>}
        {!err && !at && <Text dimColor>Lade …</Text>}
        {!err && at && ls.length === 0 && <Text dimColor>Für dieses Repo gibt es keine Aufgabenliste im G-Brain (Zeile `Repos:` auf einer todo-Seite).</Text>}
        {ls.map(l => (
          <Box key={`list:${l.slug}`} flexDirection="column" marginBottom={1}>
            <Text bold>{l.title}</Text>
            {l.items.length === 0 && <Text dimColor>Keine offenen Aufgaben.</Text>}
            {sortItems(l.items).map((it, i) => {
              const color = it.meta.due && !it.meta.parked ? due(`${it.meta.due}T12:00:00`, false, now)?.color : undefined
              return (
                <Box key={`card:${l.slug}:${i}`} flexDirection="column" borderStyle="round" borderColor={color} borderDimColor={!color} hover={{ borderColor: 'cyan', borderDimColor: false }} paddingX={1}>
                  {/* Klick auf den Titel schreibt die Aufgabe ins Eingabefeld; die Details bleiben über „Details ›“ erreichbar */}
                  <Button key={`task:${l.slug}:${i}`} plain dimColor={it.meta.parked} label={plain(it.text)} onPress={() => $.prompt.fill({ text: toPrompt(l, it) })} />
                  <Box justifyContent="space-between">
                    {line(it)}
                    <Button key={`open:${l.slug}:${i}`} plain label="Details ›" onPress={() => update($, detail, () => ({ list: l, item: it }))} />
                  </Box>
                </Box>
              )
            })}
          </Box>
        ))}
        <Box gap={1}>
          <Button key="reload" label="Neu laden" onPress={() => load($)} />
          {at && <Text dimColor>{n} offen · Stand {at}</Text>}
        </Box>
      </Box>
    )
  })
}
