import { expect, test } from 'claude-code/testing'
import { due } from './format'

test('Fälligkeit relativ zu heute mit Farbe', () => {
  const now = new Date(2026, 9, 9, 9, 0)
  expect(due(new Date(2026, 9, 8, 12).toISOString(), false, now)).toEqual({ text: 'überfällig · gestern', color: 'red' })
  expect(due(new Date(2026, 9, 9, 14, 30).toISOString(), true, now)).toEqual({ text: 'fällig heute 14:30', color: 'yellow' })
  expect(due(new Date(2026, 9, 10, 12).toISOString(), false, now)).toEqual({ text: 'fällig morgen', color: undefined })
  expect(due(new Date(2026, 9, 20, 12).toISOString(), false, now)?.text).toBe('fällig 20.10.')
  expect(due(null, false, now)).toBe(null)
})
