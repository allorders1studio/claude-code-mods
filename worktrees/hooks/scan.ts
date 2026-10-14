import type { Worktree } from '../types'

// Eine Zeile je Worktree (ohne den Hauptordner), Tab-getrennt:
// pfad, branch, uncommittete Dateien, Commits nicht in main (cherry-genau, -1 = Vergleich gescheitert), upstream, ungepushte Commits, Commit-Zeit, fehlt
// Verglichen wird gegen origin/<default>, weil ein lokales main fehlen oder veraltet sein kann.
export const SCRIPT = `
main=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null); main=\${main:-origin/main}
git rev-parse -q --verify "$main" >/dev/null || main=main
git worktree list --porcelain | sed -n 's/^worktree //p' | tail -n +2 | while IFS= read -r w; do
  if [ ! -d "$w" ]; then printf '%s\\t\\t0\\t0\\t\\t0\\t0\\t1\\n' "$w"; continue; fi
  b=$(git -C "$w" branch --show-current 2>/dev/null)
  d=$(git -C "$w" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  u=0; if [ -n "$b" ]; then if c=$(git cherry "$main" "$b" 2>/dev/null); then u=$(printf '%s\\n' "$c" | grep -c '^+'); else u=-1; fi; fi
  up=$(git -C "$w" rev-parse --abbrev-ref '@{u}' 2>/dev/null)
  a=0; [ -n "$up" ] && a=$(git -C "$w" rev-list --count '@{u}..HEAD' 2>/dev/null)
  t=$(git -C "$w" log -1 --format=%ct 2>/dev/null)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t0\\n' "$w" "$b" "$d" "$u" "$up" "\${a:-0}" "\${t:-0}"
done
`

export const parse = (out: string): Worktree[] =>
  out
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [path, branch, dirty, unmerged, upstream, unpushed, committedAt, missing] = line.split('\t')
      return {
        path,
        branch,
        dirty: Number(dirty) || 0,
        unmerged: Number(unmerged) || 0,
        upstream,
        unpushed: Number(unpushed) || 0,
        committedAt: Number(committedAt) || 0,
        missing: missing === '1',
      }
    })

// Was mit dem Worktree los ist, schlimmstes zuerst: Farbe und ein Satz.
export const verdict = (w: Worktree) =>
  w.missing
    ? { rank: 1, color: 'magenta', text: 'Ordner fehlt – git worktree prune' }
    : w.dirty > 0
      ? { rank: 0, color: 'red', text: `${w.dirty} Dateien uncommittet` }
      : w.unmerged < 0
        ? { rank: 2, color: 'yellow', text: 'Abgleich mit main gescheitert – Stand unklar' }
        : w.unmerged > 0 && (!w.upstream || w.unpushed > 0)
        ? { rank: 2, color: 'yellow', text: `${w.unmerged} Commits nicht in main, ${w.upstream ? `${w.unpushed} ungepusht` : 'nicht gepusht'}` }
        : w.unmerged > 0
          ? { rank: 3, color: 'cyan', text: `${w.unmerged} Commits nicht in main, gepusht` }
          : { rank: 4, color: 'green', text: 'nichts offen – kann weg' }

export const needsCare = (w: Worktree) => verdict(w).rank < 3
