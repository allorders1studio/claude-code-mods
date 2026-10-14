# claude-code-mods

Three [Claude Code](https://claude.com/claude-code) mods (plugins that change the interface itself): a deploy status bar, a tasks pane and a Git worktree overview.

The UI texts of all mods are in German.

| Mod | What it shows | Works for you if |
| :-- | :-- | :-- |
| [`worktrees`](#worktrees) | All Git worktrees with open work | you use Git (nothing else needed) |
| [`dokploy-statusbar`](#dokploy-statusbar) | Last Dokploy deploy per app | you deploy with Dokploy and have the private `dokploy` CLI |
| [`hub-tasks`](#hub-tasks) | Open tasks from the Message-Hub | you have a Message-Hub account |

## Installation

```sh
claude plugin marketplace add skypedumont/claude-code-mods
claude plugin install worktrees@claude-code-mods
```

Replace `worktrees` with `dokploy-statusbar` or `hub-tasks` as needed, then run `/reload-plugins` inside Claude Code.

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
- Toast when a deploy finishes; the last fetch time is shown faintly on the right

Command: `/deploys` (refresh now).

Requirements, honestly:

- The `dokploy` CLI from [skypedumont/dokploy-cli](https://github.com/skypedumont/dokploy-cli). That repository is currently **private**; it is not the npm package of the same name.
- macOS with Homebrew paths: `/opt/homebrew/bin/dokploy`, `/opt/homebrew/lib/node_modules/dokploy-cli` and `/opt/homebrew/bin/node` are hard-coded in `hooks/register.tsx` and `hooks/discover.cjs`.

### How it works

`hooks/discover.cjs` asks Dokploy (through the CLI's API module) for all services and keeps those whose Git source matches `git remote get-url origin`. It also reads each service's `watchPaths`. No configuration per repo is needed. API keys stay inside the CLI; the mod never sees them.

## hub-tasks

`/tickets` opens a pane "Meine Aufgaben" with the open tasks assigned to you in the Message-Hub, sorted by due date (overdue red, due today yellow). A click opens the detail view with description, checklists and the source messages. "In Prompt übernehmen" copies the selected task into the input field.

```
╭──────────────────────────────────────────────────────────╮
│ Export button missing on orders page                     │
│ überfällig · gestern  ·  ✉ Mail · Jane Doe    Details ›  │
│ #frontend                                                │
╰──────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────╮
│ Update shipping labels                                   │
│ fällig heute 14:00  ·  # Slack · ☑ 1/3       Details ›   │
╰──────────────────────────────────────────────────────────╯
Neu laden  2 offen · Stand 23:20:56
```

The Message-Hub is a separate product (API at `hub.ecomsync.info`). **Without a Message-Hub account this mod is of no use to you.** It needs an API token with scope `tasks:read`:

```sh
claude plugin configure hub-tasks@claude-code-mods
```

Then `/reload-plugins`. The token is stored as a sensitive plugin option.

## Structure

```
.claude-plugin/marketplace.json   marketplace "claude-code-mods"
<plugin>/
  .claude-plugin/plugin.json      manifest (name, version, userConfig)
  hooks/register.tsx              the mod: panes, bands, commands, atoms
  hooks/*.ts                      pure logic (parsing, scanning) plus tests
  types/index.d.ts                state types per plugin
```

Mods use the `claude-code` mod API. Tests of the pure logic sit next to the code (`*.test.ts`); UI behavior can be tested with `claude-code/testing`.

## License

MIT, see [LICENSE](LICENSE).
