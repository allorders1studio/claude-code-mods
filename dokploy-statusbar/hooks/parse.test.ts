import { expect, test } from 'claude-code/testing'
import { deployedCommit, elapsed, linkOf, parseLatest, parseWhen, pathspecs, tailLog, targetsFor } from './parse'

const api = { panel: 'oms1', app: 'oms-api', kind: 'application' as const, branch: 'main', watchPaths: [], url: 'https://p/svc' }

test('liest den neuesten Deploy', () => {
  const out = '🗂  Deployments for "oms-api" (11):\n\n   1. [running] 7.10.2026, 17:53:48 — feat(x): Titel\n   2. [done] 5.10.2026, 15:18:54 — alt\n'
  expect(parseLatest(api, out)).toEqual({ ...api, status: 'running', when: '7.10.2026, 17:53:48', title: 'feat(x): Titel' })
})

test('meldet unbekannte Ausgabe als Fehler', () => {
  expect(parseLatest(api, 'error: unknown option -p').status).toBe('?')
})

test('ordnet Dienste nach Remote zu, nicht nach Ordnername', () => {
  const svc = (app: string, repo: string) => ({ ...api, app, repo })
  const all = [svc('oms-api', 'skypedumont/oms'), svc('oms2-wms', 'skypedumont/oms-2.0'), svc('oms2-api', 'skypedumont/oms-2.0')]
  expect(targetsFor(all, 'https://github.com/skypedumont/OMS.git').map(t => t.app)).toEqual(['oms-api'])
  expect(targetsFor(all, 'git@github.com:skypedumont/oms-2.0.git').map(t => t.app)).toEqual(['oms2-api', 'oms2-wms'])
  expect(targetsFor(all, 'https://github.com/allorders1studio/OMS.git').map(t => t.app)).toEqual(['oms-api'])
  expect(targetsFor(all, 'https://github.com/example/other-repo')).toEqual([])
  expect(targetsFor(all, '')).toEqual([])
})

test('Klick führt bei Fehler zu den Deployments, sonst auf die Dienst-Seite', () => {
  expect(linkOf({ ...api, status: 'done', when: '', title: '' })).toBe('https://p/svc')
  expect(linkOf({ ...api, status: 'error', when: '', title: '' })).toBe('https://p/svc?tab=deployments')
  expect(linkOf(parseLatest(api, 'error: unknown option -p'))).toBe('https://p/svc?tab=deployments')
})

test('deployten Commit über den Titel finden, tolerant', () => {
  const log = 'c3\tfeat(agents): neu\nb2\tfix(x): ein langer Titel\na1\tchore: alt'
  expect(deployedCommit(log, 'fix(x): ein langer Titel')).toBe('b2')
  expect(deployedCommit(log, ' fix(x): ein lang ')).toBe('b2')
  expect(deployedCommit(log, 'unbekannt')).toBe('')
  expect(deployedCommit('', 'x')).toBe('')
  expect(deployedCommit(log, '')).toBe('')
})

test('watchPaths werden zu Pathspecs, leer bleibt leer', () => {
  expect(pathspecs([])).toEqual([])
  expect(pathspecs(['apps/api/**', 'Dockerfile.api'])).toEqual(['--', ':(glob)apps/api/**', ':(glob)Dockerfile.api'])
})

test('Zeitangabe und verstrichene Zeit', () => {
  expect(parseWhen('7.10.2026, 17:53:48')).toBe(new Date(2026, 9, 7, 17, 53, 48).getTime())
  expect(parseWhen('kaputt')).toBeNaN()
  expect(elapsed(80_000)).toBe('1:20')
  expect(elapsed(5_000)).toBe('0:05')
  expect(elapsed(-1)).toBe('0:00')
  expect(elapsed(NaN)).toBe('0:00')
})

test('Log: letzte Zeilen, ohne ANSI', () => {
  expect(tailLog('\x1b[32mgrün\x1b[0m\nzwei\ndrei\n', 2)).toBe('zwei\ndrei')
})
