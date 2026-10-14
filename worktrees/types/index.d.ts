export type Worktree = {
  path: string
  branch: string
  dirty: number
  unmerged: number
  upstream: string
  unpushed: number
  committedAt: number
  missing: boolean
}

declare module 'claude-code' {
  interface PluginState {
    worktrees: { list: Worktree[]; error: string; loadedAt: string }
  }
}
