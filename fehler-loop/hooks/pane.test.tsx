import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const OPEN = [{ number: 51, title: '[erst testen] Fix', url: 'https://github.com/allorders1studio/OMS/pull/51', isDraft: false, headRefName: 'fix/issue-38', body: '', labels: [{ name: 'fix-loop' }], statusCheckRollup: [] }]
const ISSUES = [
  { number: 50, title: 'Fehler im Export', url: 'https://github.com/allorders1studio/OMS/issues/50', labels: [{ name: 'bug' }], body: '' },
  { number: 36, title: 'Sammel', url: 'https://github.com/allorders1studio/OMS/issues/36', labels: [{ name: 'zu-pruefen' }], body: '**Frage an Nam:** x' },
  {
    number: 60,
    title: 'Routinen',
    url: 'https://github.com/allorders1studio/OMS/issues/60',
    labels: [{ name: 'routinen' }],
    body: '<!-- routinen-status:start -->\n| Routine | Letzter Lauf (UTC) | Ergebnis |\n| :-- | :-- | :-- |\n| glitchtip | 2026-11-23T05:48:35Z | ok |\n<!-- routinen-status:ende -->',
  },
]

const RUN = { command: 'fehler-loop', args: '', origin: { kind: 'plugin', name: 'test' }, presentation: { isFullscreen: false, columns: 80 } } as const
const PANE = {
  plugin: 'fehler-loop',
  component: 'Pane',
  requestId: 'fehler-loop',
  props: { title: 'Fehler-Loop', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const stub = (on: On, remote: string, fail = false, placed = true) => {
  on('session.cwd', () => ({ value: '/x' }))
  on('process.run', (_, e) => {
    const a = e.argv.join(' ')
    if (a.startsWith('git ')) return { value: { exitCode: 0, stdout: remote, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (fail) return { value: { exitCode: 1, stdout: '', stderr: 'gh: not logged in\nzweite Zeile', isStdoutTruncated: false, isStderrTruncated: false } }
    const out = a.includes('pr list --state open') ? OPEN : a.includes('pr list') ? [] : ISSUES
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', () => ({ value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' } }))
}

test('Beheben, Beantworten und Jetzt starten schreiben nur Text ins Eingabefeld', async ($, on) => {
  stub(on, 'git@github.com:allorders1studio/OMS.git\n')
  const filled: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    filled.length = 0
    await $.command.run(RUN)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /erst testen/ })).toBeDefined()
    await ui.press({ key: 'fix:50' })
    await ui.press({ key: 'answer:36' })
    await ui.press({ key: 'run:glitchtip' })
    expect(filled).toEqual(['/xx-fehler-loop behebe #50', 'Sammelfrage #36 beantworten: ', '/xx-fehler-loop jetzt glitchtip'])
    expect(await ui.find({ key: 'merge' })).toBeUndefined()
    await ui.unmount()
  }
})

test('Fremdes Repo: Pane zeigt Nicht im OMS-Repo', async ($, on) => {
  stub(on, 'git@github.com:allorders1studio/oms-2.0.git\n')
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Nicht im OMS-Repo/ })).toBeDefined()
  await ui.unmount()
})

test('gh-Fehler: erste Zeile von stderr im Pane', async ($, on) => {
  stub(on, 'git@github.com:allorders1studio/OMS.git\n', true)
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /gh: not logged in/ })).toBeDefined()
  await ui.unmount()
})

test('/fehler-loop: gezeichnetes Pane gibt nur den Kurztext', async ($, on) => {
  stub(on, 'git@github.com:allorders1studio/OMS.git\n')
  const placed = await $.command.run(RUN)
  expect(placed.text).toBe('Fehler-Loop-Pane geöffnet.')
})

test('/fehler-loop ohne Pane-Anzeige: Antwort enthält das Lagebild', async ($, on) => {
  stub(on, 'git@github.com:allorders1studio/OMS.git\n', false, false)
  const r = await $.command.run(RUN)
  expect(r.text).toContain('#50')
  expect(r.text).toContain('erst testen')
  expect(r.text).not.toBe('Fehler-Loop-Pane geöffnet.')
})
