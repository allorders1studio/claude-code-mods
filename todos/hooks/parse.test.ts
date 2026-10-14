import { expect, test } from 'claude-code/testing'
import { parseList, parseOverview, repoOf, sortItems, summary, toPrompt } from './parse'

const LIST = `# To-do — OMS 2.0

Bezug: Projekt \`~/Projekte/OMS-2.0\` (Fork von OMS 1, eigenständiges Produkt). Übersicht: [[todo]].

Repos: \`skypedumont/oms-2.0\`, \`Skypedumont/Zweit\`

## Offen
- [ ] Kundenservice-MVP (\`feat/kundenservice\`) prüfen: übernehmen oder verwerfen · seit 2026-10-14 · geparkt
  - Stand: 17 Commits (+26.582 Zeilen, 180 Dateien) …
  - Schritte: auf aktuelles \`main\` bringen → Build/Tests → entscheiden
- [ ] Regelmässige Lieferung: Abo-Bestellungen per Tag kennzeichnen — [[kunden/pflegewegweiser]] · seit 2026-10-14 · fällig 2026-10-16 (Go-Live 2026-10-19)
- [ ] \`jtlItemId\` vervollständigen (105 von 558 Varianten) · wartet auf Artikel-Stammtabelle vom 3PL
- [ ] HubSpot-Workflow für die Ankündigungsmail · Prio hoch
  - Stand 2026-10-14: … · fällig 2026-10-15

## Erledigt
- [x] … — 2026-10-14
`

const OVERVIEW = `# To-do

## Projekte
- [[todo/oms-2]] — OMS 2.0
- [[todo/pflegewegweiser]] — Pflegewegweiser

## Prioritäten
- [[todo/nicht-hier]] — falsch
`

test('liest Titel, Repos und offene Einträge mit Metadaten', () => {
  const l = parseList(LIST)
  expect(l.title).toBe('To-do — OMS 2.0')
  expect(l.repos).toEqual(['skypedumont/oms-2.0', 'skypedumont/zweit'])
  expect(l.items.length).toBe(4)
  expect(l.items[0].meta).toEqual({ since: '2026-10-14', parked: true })
  expect(l.items[0].details).toEqual(['Stand: 17 Commits (+26.582 Zeilen, 180 Dateien) …', 'Schritte: auf aktuelles `main` bringen → Build/Tests → entscheiden'])
  expect(l.items[1].text).toBe('Regelmässige Lieferung: Abo-Bestellungen per Tag kennzeichnen — kunden/pflegewegweiser')
  expect(l.items[1].meta).toEqual({ since: '2026-10-14', due: '2026-10-16' })
  expect(l.items[2].meta).toEqual({ waitingFor: 'Artikel-Stammtabelle vom 3PL' })
  expect(l.items[3].meta).toEqual({ prio: true })
})

test('zieht Listen-Slugs nur aus „Projekte“', () => {
  expect(parseOverview(OVERVIEW)).toEqual(['todo/oms-2', 'todo/pflegewegweiser'])
})

test('Sortierung, Zusammenfassung und Prompt', () => {
  const l = { ...parseList(LIST), slug: 'todo/oms-2' }
  expect(sortItems(l.items).map(i => i.text.slice(0, 8))).toEqual(['Regelmäs', 'HubSpot-', '`jtlItem', 'Kundense'])
  expect(summary([l], '2026-10-17')).toEqual({ n: 3, color: 'error' })
  expect(summary([l], '2026-10-16')).toEqual({ n: 3, color: 'warning' })
  expect(summary([{ ...l, items: [l.items[2]] }], '2026-10-16')).toEqual({ n: 1, color: 'subtle' })
  expect(toPrompt(l, l.items[0])).toBe('Aufgabe aus todo/oms-2: Kundenservice-MVP (`feat/kundenservice`) prüfen: übernehmen oder verwerfen\n- Stand: 17 Commits (+26.582 Zeilen, 180 Dateien) …\n- Schritte: auf aktuelles `main` bringen → Build/Tests → entscheiden')
})

test('Repo aus dem Remote', () => {
  expect(repoOf('git@github.com:SkypeDumont/OMS-2.0.git\n')).toBe('skypedumont/oms-2.0')
})
