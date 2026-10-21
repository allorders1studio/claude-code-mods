# claude-code-mods

Four [Claude Code](https://claude.com/claude-code) mods (plugins that change the interface itself): a deploy status bar, a tasks pane, a RAM indicator and a Git worktree overview. The three that draw above the input field share one bar.

The UI texts of all mods are in German.

| Mod | What it shows | Works for you if |
| :-- | :-- | :-- |
| [`worktrees`](#worktrees) | All Git worktrees with open work | you use Git (nothing else needed) |
| [`dokploy-statusbar`](#dokploy-statusbar) | Last Dokploy deploy per app | you deploy with Dokploy and have the private `dokploy` CLI |
| [`todos`](#todos) | Open tasks of the current repo from a G-Brain | you have an MCP server `claude.ai G-Brain` with `get_page` |
| [`ram`](#ram) | Used memory in the bar | you use macOS |

## Installation

```sh
claude plugin marketplace add allorders1studio/claude-code-mods
claude plugin install worktrees@claude-code-mods
```

Replace `worktrees` with `dokploy-statusbar`, `todos` or `ram` as needed, then run `/reload-plugins` inside Claude Code.

## worktrees

The only mod that needs nothing but Git. `/worktrees` lists every worktree of the current repo and tells you which ones can be deleted.

```
╭──────────────────────────────────────────────────────────╮
│ feature-search  feat/search                              │
│ 3 Dateien uncommittet  ·  letzter Commit heute           │
│ Pfad kopieren                                            │
╰──────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────╮
│ fix-login  fix/login                                     │
│ 2 Commits nicht in main, nicht gepusht  ·  letzter Commit gestern │
╰──────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────╮
│ old-experiment  exp/cache                                │
│ nichts offen – kann weg  ·  letzter Commit vor 12 Tagen  │
╰──────────────────────────────────────────────────────────╯
Neu laden  3 Worktrees · 2 mit offener Arbeit · Stand 23:20:56
```

Status line while worktrees hold open work:

```
2 von 3 Worktrees mit offener Arbeit · /worktrees
```

- Uncommitted files per worktree
- Commits not in main (compared against `origin/<default branch>`)
- Pushed or not pushed
- "kann weg" (can go) for worktrees with nothing left to lose; "Stand unklar" when the comparison with main fails
- Card colors: red uncommitted, yellow not pushed, cyan pushed, green can go

Command: `/worktrees`. Requirements: Git.

## dokploy-statusbar

A bar above the input field with the last [Dokploy](https://dokploy.com) deploy of every app belonging to the current repo.

```
 ● api-app  ● web-app  ● worker running 1:20  ● docs ausstehend          23:20
 > _
```

- Dot: green (done), red (error), yellow (running), grey (pending), magenta (unknown)
- App name links to its Dokploy page; on error it links to the deployments tab
- Button "Log" on error: writes the last 80 build-log lines into the input field
- "ausstehend" (pending): a commit since the deployed one touched the service's watch paths
- `running m:ss` while a build is in progress
- After `git push`, polls every 5 s for 2 minutes instead of every 30 s
- Toast when a deploy finishes; the last fetch time is shown faintly at the far right of the shared bar (see below)

Command: `/deploys` (refresh now).

Requirements, honestly:

- The official [`@dokploy/cli`](https://www.npmjs.com/package/@dokploy/cli) (`npm i -g @dokploy/cli`).
- The wrapper `dokploy-panel` (`/opt/homebrew/bin/dokploy-panel`, from `nams-claude-setup`). It fetches the API key of each panel from Infisical at run time, so the machine needs an Infisical login. `dokploy-panel --panels` lists the panels the mod queries.
- macOS with Homebrew paths: `/opt/homebrew/bin/dokploy-panel` and `/opt/homebrew/bin/node` are hard-coded in `hooks/register.tsx`.

### How it works

Per panel, the mod runs `dokploy-panel <panel> exec node hooks/discover.cjs`. The wrapper puts `DOKPLOY_URL` and `DOKPLOY_API_KEY` into the script's environment only; the script reads all projects over Dokploy's tRPC API and keeps the services whose Git source matches `git remote get-url origin`, with id, branch and `watchPaths`. No configuration per repo is needed, and keys never reach the mod. If one panel fails, the others still count and the failure is shown once as a toast.

Every 30 s `hooks/poll.cjs` runs per panel (one process for all services of that panel) and returns the newest deployment of each service (status, commit subject, creation time, deployment id). The "Log" button reads that deployment's build log with `dokploy-panel <panel> deployment read-logs`.

## todos

`/tickets` opens a pane "Aufgaben" with the open tasks of the current repo, read from a G-Brain (GBrain) knowledge store through its MCP server. The bar above the input field shows `Aufgaben N` (parked tasks not counted): red if one is overdue, yellow if one is due today or has high priority. A click on it opens the pane.

```
╭──────────────────────────────────────────────────────────╮
│ Abo-Bestellungen per Tag kennzeichnen                    │
│ überfällig · gestern                                     │
╰──────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────╮
│ HubSpot-Workflow für die Ankündigungsmail                │
│ seit 2026-10-14  ·  Prio hoch                            │
╰──────────────────────────────────────────────────────────╯
Neu laden  2 offen · Stand 23:20:56
```

Order: tasks with a due date first (by date), then high priority, then the rest in page order, parked tasks last and dimmed. A click on a task writes it, with its detail lines, into the input field; "Details ›" opens the detail view.

How it works: the mod reads the page `todo`, takes the list slugs from the lines `- [[todo/<name>]] — …` under `## Projekte`, reads each list and keeps those whose `Repos:` line names the repo of `git remote get-url origin`. A repo may be on several lists; each is shown as its own section. Loaded at session start, every 5 minutes, on `/tickets` and on "Neu laden".

```
# To-do — My project

Repos: `owner/repo`, `owner/other-repo`

## Offen
- [ ] Task title · seit 2026-10-14 · fällig 2026-10-16 · Prio hoch
  - any number of detail lines
- [ ] Waiting task · wartet auf the supplier
- [ ] Parked task · geparkt

## Erledigt
- [x] …
```

Parts after ` · ` in the title line are read as `seit`, `fällig` (both `YYYY-MM-DD`), `wartet auf …`, `Prio hoch` and `geparkt`; anything else stays in the text. `[[a/b]]` is shown as `a/b`.

Requirements, honestly: an MCP server whose tools include `get_page`, `put_page` and `remember` (the mod finds it by these tools, since its name differs between terminal and desktop app); `get_page` takes `{ slug, content_only }` and answers with JSON containing `compiled_truth`. In auto mode a mod's MCP call is refused unless `get_page` is allowed in `permissions.allow`, e.g. `"mcp__<server>__get_page"`. Without such a store this mod is of no use to you. No credentials are configured here; the connection is the session's own.

Command: `/tickets`.

## ram

Used memory in the bar, polled every 10 seconds from `memory_pressure -Q` (macOS only): `RAM 66%` is 100 minus the "free percentage". Grey below 80 %, yellow from 80 %, red from 90 %. Where the command is missing or fails, the entry is left out without a message.

## The shared bar

`dokploy-statusbar`, `todos` and `ram` draw into the same band above the input field, which only one hook can fill. Each mod reads the tree of the hooks inside it (`next(e)`), adds its entry under a sorted key and rebuilds the bar, so the layout does not depend on plugin order. Apps on the left, the rest on the right, separated by ` · `, the Dokploy fetch time last:

```
 ● api-app  ● web-app  ● worker running 1:20            Aufgaben 3 · RAM 66% · 23:20
 > _
```

Without Dokploy only `Aufgaben` and `RAM` appear. `hooks/bar.tsx` is the same file in all three mods.

## Structure

```
.claude-plugin/marketplace.json   marketplace "claude-code-mods"
<plugin>/
  .claude-plugin/plugin.json      manifest (name, version)
  hooks/register.tsx              the mod: panes, bands, commands, atoms
  hooks/*.ts                      pure logic (parsing, scanning) plus tests
  types/index.d.ts                state types per plugin
```

Mods use the `claude-code` mod API. Tests of the pure logic sit next to the code (`*.test.ts`); UI behavior can be tested with `claude-code/testing`.

## License

MIT, see [LICENSE](LICENSE).
