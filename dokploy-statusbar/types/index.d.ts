export type Target = { panel: string; app: string; id: string; kind: 'application' | 'compose'; branch: string; watchPaths: string[]; url: string }
// `when` is the ISO timestamp (UTC) of the deployment's creation.
export type Deploy = Target & { status: string; when: string; title: string; deploymentId?: string; error?: string; pending?: boolean }
// One entry of poll.cjs's output.
export type PollEntry = { id: string; deploymentId?: string; status?: string; title?: string; createdAt?: string; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'dokploy-statusbar': { deploys: Deploy[]; checkedAt: string; services: (Target & { repo: string })[]; now: number }
  }
}
