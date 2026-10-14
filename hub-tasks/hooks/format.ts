import type { Detail } from '../types'

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '')

export const SOURCE: Record<string, string> = { gmail: '✉ Mail', imap: '✉ Mail', slack: '# Slack', whatsapp: '☎ WhatsApp', capture: '✎ Notiz' }

// Fälligkeit relativ zu heute, wie man sie auf einer Karte lesen will; Farbe: rot überfällig, gelb heute.
export const due = (iso: string | null | undefined, hasTime: boolean | undefined, now: Date) => {
  if (!iso) return null
  const d = new Date(iso)
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000
  const diff = day(d) - day(now)
  const time = hasTime ? ` ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''
  const text =
    diff === 0 ? `heute${time}` : diff === 1 ? `morgen${time}` : diff === -1 ? `gestern${time}` : `${d.getDate()}.${d.getMonth() + 1}.${time}`
  return { text: diff < 0 ? `überfällig · ${text}` : `fällig ${text}`, color: diff < 0 ? 'red' : diff === 0 ? 'yellow' : undefined }
}

// Was „In Prompt übernehmen“ schreibt: alles, was Claude zum Loslegen braucht, ohne den Mailverlauf.
export const toPrompt = (t: Detail) => {
  const meta = [t.list_name ?? t.status, t.due_at && `fällig ${date(t.due_at)}`, t.contact?.display_name]
    .filter(Boolean)
    .join(' · ')
  const sources = (t.sources ?? [])
    .filter(s => s.excerpt)
    .map(s => `Quelle (${s.channel ?? '?'}): ${s.excerpt!.trim()}`)
  return [`Aufgabe aus dem Message-Hub: ${t.title}`, t.url, meta, '', t.description?.trim(), ...sources]
    .filter(line => line !== undefined && line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const isOpen = (t: { status: string }) => t.status !== 'done'

// Fällige zuerst, ohne Datum ans Ende.
export const byDue = (a: { due_at?: string | null }, b: { due_at?: string | null }) =>
  (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity)
