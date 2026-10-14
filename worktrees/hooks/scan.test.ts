import { expect, test } from 'claude-code/testing'
import { needsCare, parse, verdict } from './scan'

const OUT = [
  '/r/.claude/worktrees/a\tfeat/a\t12\t0\t\t0\t1759000000\t0',
  '/r/.claude/worktrees/b\tfeat/b\t0\t15\t\t0\t1759000000\t0',
  '/r/.claude/worktrees/c\tfeat/c\t0\t2\torigin/feat/c\t0\t1759000000\t0',
  '/r/.claude/worktrees/d\tfeat/d\t0\t0\t\t0\t1759000000\t0',
  '/r/.claude/worktrees/e\t\t0\t0\t\t0\t0\t1',
  '/r/.claude/worktrees/f\tfeat/f\t0\t-1\t\t0\t1759000000\t0',
].join('\n')

test('liest die Zeilen und bewertet jeden Worktree', () => {
  const list = parse(OUT)
  expect(list.map(w => verdict(w).text)).toEqual([
    '12 Dateien uncommittet',
    '15 Commits nicht in main, nicht gepusht',
    '2 Commits nicht in main, gepusht',
    'nichts offen – kann weg',
    'Ordner fehlt – git worktree prune',
    'Abgleich mit main gescheitert – Stand unklar',
  ])
  expect(list.map(needsCare)).toEqual([true, true, false, false, true, true])
})
