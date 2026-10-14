import { expect, test } from 'claude-code/testing'
import { parsePressure, ramColor } from './parse'

test('liest den belegten Anteil aus memory_pressure -Q', () => {
  const out = 'The system has 17179869184 (1048576 pages with a page size of 16384).\nSystem-wide memory free percentage: 34%\n'
  expect(parsePressure(out)).toBe(66)
  expect(parsePressure('')).toBe(null)
  expect(parsePressure('command not found: memory_pressure')).toBe(null)
})

test('Farbe nach Schwellen 80 und 90', () => {
  expect([0, 79, 80, 89, 90, 100].map(ramColor)).toEqual(['subtle', 'subtle', 'warning', 'warning', 'error', 'error'])
})
