export type Meta = { since?: string; due?: string; waitingFor?: string; prio?: boolean; parked?: boolean }
export type Item = { text: string; meta: Meta; details: string[] }
export type Parsed = { title: string; repos: string[]; items: Item[] }
export type TodoList = Parsed & { slug: string }

declare module 'claude-code' {
  interface PluginState {
    todos: { lists: TodoList[]; error: string; loadedAt: string; detail: { list: TodoList; item: Item } | null }
  }
}
