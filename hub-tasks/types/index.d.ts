export type Task = {
  id: string
  short_id: string
  title: string
  status: string
  priority?: string
  source_channel?: string | null
  due_at?: string | null
  due_has_time?: boolean
  list_name?: string | null
  contact_name?: string | null
  labels?: { name: string }[]
  checklist_total?: number
  checklist_done?: number
}

export type Detail = Omit<Task, 'labels'> & {
  url?: string | null
  description?: string | null
  contact?: { display_name?: string | null } | null
  labels?: { name: string }[]
  checklists?: { title: string; items: { text: string; is_done: boolean }[] }[]
  sources?: {
    channel?: string | null
    excerpt?: string | null
    messages?: { sender: string; sent_at?: string | null; body: string; direction: string }[] | null
  }[]
}

declare module 'claude-code' {
  interface PluginState {
    'hub-tasks': { tasks: Task[]; error: string; loadedAt: string; detail: Detail | null; loading: string }
  }
}
