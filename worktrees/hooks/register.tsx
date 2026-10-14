import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { SCRIPT, needsCare, parse, verdict } from './scan'

const PANE = 'worktrees'
const list = atom({ plugin: 'worktrees', key: 'list' } as const, [])
const error = atom({ plugin: 'worktrees', key: 'error' } as const, '')
const loadedAt = atom({ plugin: 'worktrees', key: 'loadedAt' } as const, '')

const age = (sec: number) => {
  const days = Math.floor((Date.now() / 1000 - sec) / 86400)
  return !sec ? '' : days < 1 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`
}

async function scan($: EngineInterface) {
  const r = await $.process.run(['sh', '-c', SCRIPT], { cwd: await $.session.cwd(), timeoutMs: 60000 })
  if (r.exitCode !== 0) {
    await update($, error, () => (r.stderr.trim().split('\n')[0] || 'kein Git-Repo'))
    void $.ui.status(undefined)
    return
  }
  const found = parse(r.stdout).sort((a, b) => verdict(a).rank - verdict(b).rank || b.committedAt - a.committedAt)
  await update($, list, () => found)
  await update($, error, () => '')
  await update($, loadedAt, () => new Date().toLocaleTimeString('de-DE'))
  const care = found.filter(needsCare).length
  void $.ui.status(care ? `${care} von ${found.length} Worktrees mit offener Arbeit · /worktrees` : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'worktrees', description: 'Worktrees dieses Repos mit offenem Stand zeigen' })
    void scan($)
    // ponytail: alle 10 min neu; Worktrees ändern sich selten, git-Aufrufe je Worktree kosten
    $.clock.every(600000, () => scan($))
    return next(e)
  })

  on('command.run', { command: 'worktrees' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Worktrees' })
    await scan($)
    return { text: 'Worktree-Übersicht geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const all = await read($, list)
    const err = await read($, error)
    const at = await read($, loadedAt)
    return (
      <Box flexDirection="column">
        {err && <Text color="red">{err}</Text>}
        {!err && all.length === 0 && <Text dimColor>{at ? 'Keine Worktrees außer dem Hauptordner.' : 'Lade …'}</Text>}
        {all.map(w => {
          const v = verdict(w)
          return (
            <Box key={`wt:${w.path}`} flexDirection="column" borderStyle="round" borderColor={v.color} paddingX={1} marginBottom={1}>
              <Text>
                <Text bold>{w.path.split('/').pop()}</Text>
                <Text dimColor>  {w.branch || '(kein Branch)'}</Text>
              </Text>
              <Text>
                <Text color={v.color}>{v.text}</Text>
                <Text dimColor>{w.committedAt ? `  ·  letzter Commit ${age(w.committedAt)}` : ''}</Text>
              </Text>
              <Box>
                <Button key={`copy:${w.path}`} plain label="Pfad kopieren" onPress={press => $.ui.copy({ text: w.path, surface: press.surface })} />
              </Box>
            </Box>
          )
        })}
        <Box gap={1}>
          <Button key="reload" label="Neu laden" onPress={() => scan($)} />
          {at && <Text dimColor>{all.length} Worktrees · {all.filter(needsCare).length} mit offener Arbeit · Stand {at}</Text>}
        </Box>
      </Box>
    )
  })
}
