import { expect, test } from 'claude-code/testing'

const OVERVIEW = '# To-do\n\n## Projekte\n- [[todo/oms-2]] — OMS 2.0\n- [[todo/andere]] — Anderes\n'
const OMS2 = `# To-do — OMS 2.0

Repos: \`skypedumont/oms-2.0\`

## Offen
- [ ] Später prüfen · seit 2026-10-01 · geparkt
- [ ] Alt und fällig · fällig 2020-01-01
  - Stand: wartet auf Antwort
- [ ] Ohne Datum
`
const ANDERE = '# To-do — Anderes\n\nRepos: `x/y`\n\n## Offen\n- [ ] Nicht meins\n'
const PAGES: Record<string, string> = { todo: OVERVIEW, 'todo/oms-2': OMS2, 'todo/andere': ANDERE }

test('Karten nach Fälligkeit, Detail, Übernahme in den Prompt', async ($, on) => {
  on('session.cwd', () => ({ value: '/x' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'git@github.com:SkypeDumont/OMS-2.0.git\n', stderr: '' } }))
  on('mcp.call', ($, e) => {
    const slug = String(e.args.slug)
    return { value: { isError: false, content: [{ type: 'text', text: JSON.stringify({ slug, title: slug, compiled_truth: PAGES[slug] }) }] } }
  })
  on('ui.open', () => ({ value: undefined }))
  let filled = ''
  on('prompt.fill', ($, e) => {
    filled = e.text
    return { isFilled: true }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.command.run({ command: 'tickets', args: '' })
    const ui = await $.ui.mount({ plugin: 'todos', surface, component: 'Pane', props: {}, requestId: 'todos' })
    const cards = (await ui.findAll({ type: 'Button' })).map(c => c.key).filter(k => k?.startsWith('task:'))
    expect(cards).toEqual(['task:todo/oms-2:0', 'task:todo/oms-2:1', 'task:todo/oms-2:2'])
    expect(await ui.find({ type: 'Text', text: /überfällig/ })).toBeDefined()

    await ui.press({ key: 'task:todo/oms-2:0' })
    expect(await ui.find({ type: 'Markdown', text: /wartet auf Antwort/ })).toBeDefined()

    await ui.press({ key: 'prompt' })
    expect(filled).toBe('Aufgabe aus todo/oms-2: Alt und fällig\n- Stand: wartet auf Antwort')

    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'task:todo/oms-2:2' })).toBeDefined()
    await ui.unmount()
  }
})
