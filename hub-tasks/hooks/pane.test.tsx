import { expect, test } from 'claude-code/testing'

const WS = [{ id: 'ws1' }]
const LIST = {
  items: [
    { id: 't2', short_id: 'b', title: 'Später', status: 'open', due_at: null, source_channel: 'slack' },
    { id: 't1', short_id: 'a', title: 'Angebot überarbeiten', status: 'in_progress', due_at: '2020-01-01T10:00:00Z', source_channel: 'gmail', contact_name: 'EBZ' },
    { id: 't3', short_id: 'c', title: 'Erledigt', status: 'done' },
  ],
  next_cursor: null,
}
const DETAIL = {
  id: 't1', short_id: 'a', title: 'Angebot überarbeiten', status: 'in_progress', due_at: '2020-01-01T10:00:00Z',
  url: 'https://hub.ecomsync.info/w/ws1/tasks/t1', description: 'Bitte **Preise** anpassen.',
  sources: [{ channel: 'gmail', excerpt: 'Hallo', messages: [{ sender: 'kunde@x.de', body: 'Hallo Nam', direction: 'inbound', sent_at: null }] }],
}

test('Karten nach Fälligkeit, Klick öffnet Details, Übernahme füllt den Prompt', { options: { token: 't' } }, async ($, on) => {
  on('http.fetch', ($, e) => {
    const body = e.url.endsWith('/workspaces') ? WS : e.url.includes('/tasks/t1') ? DETAIL : LIST
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }
  })
  on('ui.open', () => ({ value: undefined }))
  let filled = ''
  on('prompt.fill', ($, e) => {
    filled = e.text
    return { isFilled: true }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.command.run({ command: 'tickets', args: '' })
    const ui = await $.ui.mount({ plugin: 'hub-tasks', surface, component: 'Pane', props: {}, requestId: 'hub-tasks' })
    const cards = (await ui.findAll({ type: 'Button' })).map(c => c.key).filter(k => k?.startsWith('task:'))
    expect(cards).toEqual(['task:t1', 'task:t2'])
    expect(await ui.find({ type: 'Text', text: /überfällig/ })).toBeDefined()

    await ui.press({ key: 'open:t1' })
    expect(await ui.find({ type: 'Markdown', text: /Preise/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /kunde@x\.de/ })).toBeDefined()

    await ui.press({ key: 'prompt' })
    expect(filled).toContain('Aufgabe aus dem Message-Hub: Angebot überarbeiten')

    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'task:t2' })).toBeDefined()
    await ui.unmount()
  }
})
