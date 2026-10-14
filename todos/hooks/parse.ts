import type { Item, Meta, Parsed, TodoList } from '../types'

export const repoOf = (remoteUrl: string) =>
  remoteUrl.trim().toLowerCase().replace(/\.git$/, '').match(/github\.com[:/]([^/]+\/[^/]+)$/)?.[1] ?? ''

// Listen-Slugs aus `- [[todo/<name>]] — …` unter `## Projekte` der Seite `todo`.
export const parseOverview = (md: string): string[] => {
  const slugs: string[] = []
  let inside = false
  for (const line of md.split('\n')) {
    if (/^## /.test(line)) inside = /^## Projekte\s*$/.test(line)
    else if (inside) {
      const m = line.match(/^- \[\[(todo\/[^\]|]+)\]\]/)
      if (m) slugs.push(m[1])
    }
  }
  return slugs
}

const DATE = '(\\d{4}-\\d{2}-\\d{2})'
const link = (s: string) => s.replace(/\[\[([^\]|]+)\]\]/g, '$1')

// Metadaten stehen als ` · `-Teile hinter dem Text; ein unbekannter Teil bleibt im Text, damit nichts verschwindet.
const parseTitle = (raw: string): { text: string; meta: Meta } => {
  const [head, ...parts] = raw.split(' · ')
  const meta: Meta = {}
  const rest: string[] = []
  for (const p of parts) {
    const t = p.trim()
    let m: RegExpMatchArray | null
    if ((m = t.match(new RegExp(`^seit ${DATE}`)))) meta.since = m[1]
    else if ((m = t.match(new RegExp(`^fällig ${DATE}`)))) meta.due = m[1]
    else if ((m = t.match(/^wartet auf (.+)$/))) meta.waitingFor = m[1]
    else if (/^Prio hoch\b/.test(t)) meta.prio = true
    else if (/^geparkt\b/.test(t)) meta.parked = true
    else rest.push(t)
  }
  return { text: link([head.trim(), ...rest].join(' · ')), meta }
}

// Nur Top-Level-Einträge `- [ ] ` unter `## Offen`; eingerückte `- `-Zeilen darunter sind Details.
export const parseList = (md: string): Parsed => {
  const lines = md.split('\n')
  const title = lines.find(l => l.startsWith('# '))?.slice(2).trim() ?? ''
  const repos = [...(md.match(/^Repos:(.*)$/m)?.[1] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1].trim().toLowerCase())
  const items: Item[] = []
  let open = false
  for (const line of lines) {
    if (/^## /.test(line)) open = /^## Offen\s*$/.test(line)
    else if (!open) continue
    else if (line.startsWith('- [ ] ')) items.push({ ...parseTitle(line.slice(6)), details: [] })
    else if (/^\s+- /.test(line) && items.length) items[items.length - 1].details.push(link(line.replace(/^\s+- /, '').trim()))
  }
  return { title, repos, items }
}

// Mit Datum zuerst (nach Datum), dann Prio hoch, dann Rest in Seitenreihenfolge, geparkt zuletzt; sort ist stabil.
const rank = (i: Item) => (i.meta.parked ? 3 : i.meta.due ? 0 : i.meta.prio ? 1 : 2)
export const sortItems = (items: Item[]): Item[] =>
  [...items].sort((a, b) => rank(a) - rank(b) || (a.meta.due ?? '').localeCompare(b.meta.due ?? ''))

// Zahl und Farbe des Leisten-Eintrags; today als JJJJ-MM-TT.
export const summary = (lists: TodoList[], today: string) => {
  const open = lists.flatMap(l => l.items).filter(i => !i.meta.parked)
  const color = open.some(i => i.meta.due && i.meta.due < today)
    ? 'error'
    : open.some(i => i.meta.due === today || i.meta.prio)
      ? 'warning'
      : 'subtle'
  return { n: open.length, color }
}

export const toPrompt = (list: TodoList, item: Item) =>
  [`Aufgabe aus ${list.slug}: ${item.text}`, ...item.details.map(d => `- ${d}`)].join('\n')
