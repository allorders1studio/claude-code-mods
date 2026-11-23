export type Ci = 'grün' | 'rot' | 'läuft' | 'keine'
export type MergePr = { number: number; title: string; url: string; draft: boolean; ci: Ci; first: boolean }
export type HandTest = { number: number; title: string; url: string; items: string[] }
export type Question = { number: number; title: string; url: string; count: number }
export type QueueItem = { number: number; title: string; url: string; label: string }
export type Routine = { name: string; at: string; result: string }
export type LoopData = {
  prs: MergePr[]
  questions: Question[]
  tests: HandTest[]
  queue: QueueItem[]
  routines: Routine[]
}

declare module 'claude-code' {
  interface PluginState {
    'fehler-loop': { data: LoopData | null; error: string; loadedAt: string; inRepo: boolean }
  }
}
