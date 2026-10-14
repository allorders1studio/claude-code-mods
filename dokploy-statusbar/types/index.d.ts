export type Target = { panel: string; app: string; kind: 'application' | 'compose'; branch: string; watchPaths: string[]; url: string }
export type Deploy = Target & { status: string; when: string; title: string; error?: string; pending?: boolean }

declare module 'claude-code' {
  interface PluginState {
    'dokploy-statusbar': { deploys: Deploy[]; checkedAt: string; services: (Target & { repo: string })[]; now: number }
  }
}
