import { expect, test } from 'claude-code/testing'
import { buildLoop, ciOf, countQuestions, isFirstTest, isOmsRepo, openHandTests, parseQueue, parseRoutines, summary, toText } from './parse'
import type { RawIssue, RawPr } from './parse'

const BODY_KEINE = `## Testplan
**B. Automatisch geprüft**
- [x] \`pnpm build\`: 8/8 Tasks erfolgreich.
- [ ] CI grün.

**C. Handtests:** keine.

## Betroffene Apps
`
const BODY_EINER = `**C. Handtests**
- [ ] Auftragsdetail öffnen: Tickets laden ohne Fehlermeldung
- [x] Login prüfen

## Risiko
- [ ] nicht zählen
`
const ROUTINEN = `Letzter Lauf jeder Routine. …

<!-- routinen-status:start -->
| Routine | Letzter Lauf (UTC) | Ergebnis |
| :-- | :-- | :-- |
| fehler-loop | 2026-11-23T08:47:38Z | ok 2 PRs mit gruenem CI (#45 fuer #38, #46 fuer #40), keine Nachkontrolle faellig |
| glitchtip | 2026-11-23T05:48:35Z | ok 6 geprüft, 0 Issues, 6 weiter zu prüfen (#36) |
<!-- routinen-status:ende -->
`

const issue = (number: number, labels: string[], body = ''): RawIssue => ({ number, title: `Issue ${number}`, url: `https://github.com/allorders1studio/OMS/issues/${number}`, labels: labels.map(name => ({ name })), body })
const pr = (p: Partial<RawPr>): RawPr => ({ number: 1, title: 'PR', url: 'u', ...p })

test('Repo: nur Name OMS, Owner egal', () => {
  expect(isOmsRepo('git@github.com:allorders1studio/OMS.git\n')).toBe(true)
  expect(isOmsRepo('https://github.com/x/OMS')).toBe(true)
  expect(isOmsRepo('git@github.com:allorders1studio/oms-2.0.git')).toBe(false)
  expect(isOmsRepo('')).toBe(false)
})

test('CI-Zusammenfassung in allen vier Fällen', () => {
  expect(ciOf([])).toBe('keine')
  expect(ciOf(undefined)).toBe('keine')
  expect(ciOf([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }])).toBe('grün')
  expect(ciOf([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }])).toBe('läuft')
  expect(ciOf([{ state: 'PENDING' }])).toBe('läuft')
  expect(ciOf([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('rot')
  expect(ciOf([{ status: 'COMPLETED', conclusion: 'CANCELLED' }])).toBe('rot')
  expect(ciOf([{ status: 'COMPLETED', conclusion: 'TIMED_OUT' }])).toBe('rot')
  expect(ciOf([{ status: 'COMPLETED', conclusion: 'ACTION_REQUIRED' }])).toBe('rot')
  expect(ciOf([{ state: 'ERROR' }])).toBe('rot')
})

test('erst testen erkennt den Titelanfang ohne Groß/Klein', () => {
  expect(isFirstTest('[erst testen] Fix X')).toBe(true)
  expect(isFirstTest('[Erst Testen] Fix X')).toBe(true)
  expect(isFirstTest('Fix [erst testen]')).toBe(false)
})

test('Handtests: nur Abschnitt C, nur offene Punkte', () => {
  expect(openHandTests(BODY_KEINE)).toEqual([])
  expect(openHandTests(BODY_EINER)).toEqual(['Auftragsdetail öffnen: Tickets laden ohne Fehlermeldung'])
})

test('Handtests: nur gemergte PRs der letzten 14 Tage', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  const l = buildLoop([], [
    pr({ number: 1, body: BODY_EINER, mergedAt: '2026-11-20T00:00:00Z' }),
    pr({ number: 2, body: BODY_EINER, mergedAt: '2026-10-01T00:00:00Z' }),
    pr({ number: 3, body: BODY_KEINE, mergedAt: '2026-11-20T00:00:00Z' }),
  ], [], now)
  expect(l.tests.map(t => t.number)).toEqual([1])
})

test('Fragen werden gezählt', () => {
  expect(countQuestions('**Frage an Nam:** a\n\n**Frage an Nam:** b')).toBe(2)
  expect(countQuestions('nichts')).toBe(0)
  expect(countQuestions('**Frage an dich:** a\n**Frage an Nam:** b')).toBe(2)
  const l = buildLoop([], [], [issue(36, ['zu-pruefen'], '**Frage an Nam:** x'), issue(42, ['zu-pruefen'], ''), issue(5, ['bug'])], new Date())
  expect(l.questions.map(q => [q.number, q.count])).toEqual([[36, 1], [42, 0]])
})

test('PRs zum Mergen: nur fix-loop, Entwürfe hinten', () => {
  const l = buildLoop([
    pr({ number: 9, title: 'A', isDraft: true, labels: [{ name: 'fix-loop' }] }),
    pr({ number: 8, title: '[erst testen] B', labels: [{ name: 'fix-loop' }], statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] }),
    pr({ number: 7, title: 'C', labels: [] }),
  ], [], [], new Date())
  expect(l.prs.map(p => [p.number, p.draft, p.ci, p.first])).toEqual([[8, false, 'grün', true], [9, true, 'keine', false]])
})

test('Warteschlange: Labelreihenfolge, Ausschlüsse, PR-Zuordnung', () => {
  const issues = [
    issue(10, ['performance']),
    issue(11, ['bug']),
    issue(12, ['sicherheit']),
    issue(13, ['beheben']),
    issue(14, ['bug', 'manuell']),
    issue(15, ['bug', 'zu-pruefen']),
    issue(16, ['beheben', 'routinen']),
    issue(4, ['bug']),
    issue(44, ['bug']),
    issue(20, ['bug']),
    issue(21, ['bug']),
    issue(22, ['sonstiges']),
    issue(3, ['beheben', 'bug']),
  ]
  const prs = [pr({ number: 100, body: 'Closes #4' }), pr({ number: 101, headRefName: 'fix/issue-20' }), pr({ number: 102, body: 'fixes #21.' })]
  expect(parseQueue(issues, prs).map(q => q.number)).toEqual([3, 13, 12, 11, 44, 10])
  // #4 darf #44 nicht abdecken und umgekehrt
  expect(parseQueue([issue(4, ['bug']), issue(44, ['bug'])], [pr({ body: 'Closes #44' })]).map(q => q.number)).toEqual([4])
  expect(parseQueue([issue(4, ['bug']), issue(44, ['bug'])], [pr({ body: 'Closes #4' })]).map(q => q.number)).toEqual([44])
})

test('Routinen: Tabelle zwischen den Markern', () => {
  expect(parseRoutines(ROUTINEN)).toEqual([
    { name: 'fehler-loop', at: '2026-11-23T08:47:38Z', result: 'ok 2 PRs mit gruenem CI (#45 fuer #38, #46 fuer #40), keine Nachkontrolle faellig' },
    { name: 'glitchtip', at: '2026-11-23T05:48:35Z', result: 'ok 6 geprüft, 0 Issues, 6 weiter zu prüfen (#36)' },
  ])
  expect(parseRoutines('keine Tabelle')).toEqual([])
})

test('Leiste: Singular/Plural, Nullen weg, Farben', () => {
  const base = { prs: [], questions: [], tests: [], queue: [], routines: [] }
  expect(summary(base)).toEqual({ text: 'Loop: nichts offen', color: 'subtle' })
  const p = (n: number, ci: 'grün' | 'rot', first = false, draft = false) => ({ number: n, title: '', url: '', draft, ci, first })
  const q = { number: 1, title: '', url: '', count: 1 }
  const t = { number: 1, title: '', url: '', items: ['a', 'b', 'c'] }
  expect(summary({ ...base, prs: [p(1, 'grün'), p(2, 'grün')], questions: [q], tests: [t] })).toEqual({ text: 'Loop: 2 PRs · 1 Frage · 3 Tests', color: undefined })
  expect(summary({ ...base, prs: [p(1, 'grün', true)] })).toEqual({ text: 'Loop: 1 PR', color: 'warning' })
  expect(summary({ ...base, prs: [p(1, 'rot', true)] }).color).toBe('error')
  expect(summary({ ...base, prs: [p(1, 'grün', false, true)] }).text).toBe('Loop: nichts offen')
})

test('toText: Lagebild als Markdown mit Links, erst testen und keine', () => {
  const d = {
    prs: [{ number: 50, title: 'Fix Export', url: 'https://x/pull/50', draft: true, ci: 'grün' as const, first: true }],
    questions: [{ number: 36, title: 'Sammel', url: 'https://x/issues/36', count: 2 }],
    tests: [{ number: 45, title: 'Retoure', url: 'https://x/pull/45', items: ['Liste öffnen'] }],
    queue: [],
    routines: [{ name: 'glitchtip', at: '2026-11-23T05:48:35Z', result: 'ok' }],
  }
  const t = toText(d, '', true)
  expect(t).toContain('## Loop: 2 Fragen · 1 Test')
  expect(t).toContain('- [#50](https://x/pull/50) Fix Export (CI grün, Entwurf, erst testen)')
  expect(t).toContain('- [#36](https://x/issues/36) Sammel (2 Fragen)')
  expect(t).toContain('  - [ ] Liste öffnen')
  expect(t).toContain('### Warteschlange\n- keine')
  expect(t).toContain('- **glitchtip** 2026-11-23T05:48:35Z: ok')
  expect(t).toContain('Beheben: `/xx-fehler-loop behebe #<nr>` · Routine starten: `/xx-fehler-loop jetzt <name>`')
})

test('toText: Fehler und fremdes Repo', () => {
  expect(toText(null, 'gh: not logged in', true)).toBe('Fehler-Loop: gh: not logged in')
  expect(toText(null, '', false)).toBe('Nicht im OMS-Repo')
})
