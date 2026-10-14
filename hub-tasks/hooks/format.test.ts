import { expect, test } from 'claude-code/testing'
import { byDue, due, isOpen, toPrompt } from './format'

test('baut den Prompt aus Titel, Link, Meta, Beschreibung und Quelle', () => {
  const text = toPrompt({
    id: '1', short_id: 'a', status: 'open',
    title: 'Retoure EBZ prüfen',
    url: 'https://hub.ecomsync.info/w/1/tasks/2',
    list_name: 'Heute',
    due_at: '2026-10-09T10:00:00Z',
    contact: { display_name: 'EBZ' },
    description: 'Kunde meldet fehlende Gutschrift.',
    sources: [{ channel: 'gmail', excerpt: 'Hallo, die Retoure …' }, { channel: 'slack', excerpt: null }],
  })
  expect(text).toBe(
    'Aufgabe aus dem Message-Hub: Retoure EBZ prüfen\nhttps://hub.ecomsync.info/w/1/tasks/2\nHeute · fällig 9.10.2026 · EBZ\n\nKunde meldet fehlende Gutschrift.\nQuelle (gmail): Hallo, die Retoure …',
  )
})

test('Fälligkeit relativ zu heute mit Farbe', () => {
  const now = new Date(2026, 9, 9, 9, 0)
  expect(due(new Date(2026, 9, 8, 12).toISOString(), false, now)).toEqual({ text: 'überfällig · gestern', color: 'red' })
  expect(due(new Date(2026, 9, 9, 14, 30).toISOString(), true, now)).toEqual({ text: 'fällig heute 14:30', color: 'yellow' })
  expect(due(new Date(2026, 9, 10, 12).toISOString(), false, now)).toEqual({ text: 'fällig morgen', color: undefined })
  expect(due(new Date(2026, 9, 20, 12).toISOString(), false, now)?.text).toBe('fällig 20.10.')
  expect(due(null, false, now)).toBe(null)
})

test('offen heißt alles außer done, Sortierung nach Fälligkeit', () => {
  expect(['open', 'in_progress', 'done'].map(status => isOpen({ status }))).toEqual([true, true, false])
  const sorted = [{ due_at: null }, { due_at: '2026-10-12T00:00:00Z' }, { due_at: '2026-10-01T00:00:00Z' }].sort(byDue)
  expect(sorted.map(t => t.due_at)).toEqual(['2026-10-01T00:00:00Z', '2026-10-12T00:00:00Z', null])
})
