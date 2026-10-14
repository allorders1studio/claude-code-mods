import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Detail, Task } from '../types'
import { SOURCE, byDue, due, isOpen, toPrompt } from './format'

const API = 'https://hub.ecomsync.info/api/v1'
const PANE = 'hub-tasks'
const tasks = atom({ plugin: 'hub-tasks', key: 'tasks' } as const, [])
const error = atom({ plugin: 'hub-tasks', key: 'error' } as const, '')
const loadedAt = atom({ plugin: 'hub-tasks', key: 'loadedAt' } as const, '')
const detail = atom({ plugin: 'hub-tasks', key: 'detail' } as const, null)
const loading = atom({ plugin: 'hub-tasks', key: 'loading' } as const, '')

async function get($: EngineInterface, token: string, path: string) {
  const r = await $.http.fetch(API + path, { headers: { authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`HTTP ${r.status} bei ${path.split('?')[0]}`)
  return JSON.parse(r.text)
}

// ponytail: nimmt den ersten Workspace des Tokens; Auswahl erst, wenn es mehrere gibt
async function workspace($: EngineInterface, token: string): Promise<string> {
  const list = await get($, token, '/workspaces')
  if (!list.length) throw new Error('Token sieht keinen Workspace')
  return list[0].id
}

async function load($: EngineInterface, token: string) {
  if (!token) {
    await update($, error, () => 'Kein Token hinterlegt: claude plugin configure hub-tasks@nam-mods, danach /reload-plugins')
    return
  }
  try {
    const ws = await workspace($, token)
    const all: Task[] = []
    let cursor = ''
    // Wie „Meine Aufgaben“ in der Web-App: assignee=me, alle Seiten, done clientseitig raus.
    for (let page = 0; page < 5; page++) {
      const r = await get($, token, `/w/${ws}/tasks?assignee=me&limit=100${cursor && `&cursor=${encodeURIComponent(cursor)}`}`)
      all.push(...r.items)
      if (!r.next_cursor) break
      cursor = r.next_cursor
    }
    await update($, tasks, () => all.filter(isOpen).sort(byDue))
    await update($, error, () => '')
    await update($, loadedAt, () => new Date().toLocaleTimeString('de-DE'))
  } catch (err) {
    await update($, error, () => String(err))
  }
}

async function open($: EngineInterface, token: string, task: Task) {
  await update($, loading, () => task.id)
  try {
    const ws = await workspace($, token)
    const d: Detail = await get($, token, `/w/${ws}/tasks/${task.id}`)
    await update($, detail, () => d)
  } catch (err) {
    void $.ui.toast(`Aufgabe nicht geladen: ${String(err)}`)
  }
  await update($, loading, () => '')
}

export const register: Register = (on, options) => {
  const token = String(options.token ?? '')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tickets', description: 'Offene Aufgaben aus dem Message-Hub zeigen' })
    return next(e)
  })

  on('command.run', { command: 'tickets' }, async $ => {
    await update($, detail, () => null)
    await $.ui.open({ id: PANE, title: 'Meine Aufgaben' })
    await load($, token)
    return { text: 'Aufgaben-Pane geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Markdown, Text } = $.ui.resolve(e)
    const d = await read($, detail)

    if (d) {
      const dl = due(d.due_at, d.due_has_time, new Date())
      const meta = [SOURCE[d.source_channel ?? ''], d.list_name, d.contact?.display_name ?? d.contact_name].filter(Boolean)
      return (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Button key="back" label="← Zurück" onPress={() => update($, detail, () => null)} />
            <Button key="prompt" label="In Prompt übernehmen" onPress={() => $.prompt.fill({ text: toPrompt(d) })} />
          </Box>
          <Box flexDirection="column">
            <Text bold>{d.title}</Text>
            <Text>
              {dl && <Text color={dl.color}>{dl.text}  </Text>}
              <Text dimColor>{meta.join(' · ')}</Text>
            </Text>
            {(d.labels ?? []).length > 0 && <Text color="cyan">{d.labels!.map(l => `#${l.name}`).join(' ')}</Text>}
            {d.url && <Link href={d.url} label="Im Message-Hub öffnen" />}
          </Box>
          {d.description?.trim() ? <Markdown text={d.description.trim()} /> : <Text dimColor>Keine Beschreibung.</Text>}
          {(d.checklists ?? []).map(c => (
            <Box flexDirection="column">
              <Text bold>{c.title}</Text>
              {c.items.map(i => (
                <Text dimColor={i.is_done}>{i.is_done ? '☑' : '☐'} {i.text}</Text>
              ))}
            </Box>
          ))}
          {(d.sources ?? []).map(s => (
            <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
              <Text dimColor>{SOURCE[s.channel ?? ''] ?? s.channel ?? 'Quelle'}</Text>
              {s.messages?.length
                ? s.messages.map(m => (
                    <Box flexDirection="column" marginTop={1}>
                      <Text bold>
                        {m.direction === 'outbound' ? '→ ' : ''}
                        {m.sender} <Text dimColor>{m.sent_at ? new Date(m.sent_at).toLocaleString('de-DE') : ''}</Text>
                      </Text>
                      <Markdown text={m.body.trim()} />
                    </Box>
                  ))
                : s.excerpt && <Text>{s.excerpt.trim()}</Text>}
            </Box>
          ))}
        </Box>
      )
    }

    const list = await read($, tasks)
    const err = await read($, error)
    const at = await read($, loadedAt)
    const busy = await read($, loading)
    const now = new Date()
    return (
      <Box flexDirection="column">
        {err && <Text color="red">{err}</Text>}
        {!err && list.length === 0 && <Text dimColor>{at ? 'Keine offenen Aufgaben.' : 'Lade …'}</Text>}
        {list.map(t => {
          const dl = due(t.due_at, t.due_has_time, now)
          const meta = [
            SOURCE[t.source_channel ?? ''],
            t.contact_name,
            t.checklist_total ? `☑ ${t.checklist_done}/${t.checklist_total}` : '',
            t.status === 'in_progress' ? 'in Arbeit' : '',
            t.priority && t.priority !== 'normal' ? `Prio ${t.priority}` : '',
          ].filter(Boolean)
          return (
            <Box key={`card:${t.id}`} flexDirection="column" borderStyle="round" borderColor={dl?.color} borderDimColor={!dl?.color} hover={{ borderColor: 'cyan', borderDimColor: false }} paddingX={1} marginBottom={1}>
              <Button key={`task:${t.id}`} plain label={busy === t.id ? `${t.title} …` : t.title} onPress={() => open($, token, t)} />
              <Box justifyContent="space-between">
                <Text>
                  {dl ? <Text color={dl.color}>{dl.text}</Text> : <Text dimColor>ohne Fälligkeit</Text>}
                  <Text dimColor>{meta.length ? `  ·  ${meta.join(' · ')}` : ''}</Text>
                </Text>
                <Button key={`open:${t.id}`} plain label="Details ›" onPress={() => open($, token, t)} />
              </Box>
              {(t.labels ?? []).length > 0 && <Text color="cyan">{t.labels!.map(l => `#${l.name}`).join(' ')}</Text>}
            </Box>
          )
        })}
        <Box gap={1}>
          <Button key="reload" label="Neu laden" onPress={() => load($, token)} />
          {at && <Text dimColor>{list.length} offen · Stand {at}</Text>}
        </Box>
      </Box>
    )
  })
}
