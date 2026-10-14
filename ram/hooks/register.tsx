import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { addToBar } from './bar'
import { parsePressure, ramColor } from './parse'

const used = atom({ plugin: 'ram', key: 'used' } as const, null)

// Fehler (kein macOS, Befehl fehlt) lassen den Eintrag verschwinden, ohne Toast: die Leiste soll nie nerven.
async function poll($: EngineInterface) {
  try {
    const r = await $.process.run(['/usr/bin/memory_pressure', '-Q'], { timeoutMs: 5000 })
    await update($, used, () => (r.exitCode === 0 ? parsePressure(r.stdout) : null))
  } catch {
    await update($, used, () => null)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void poll($)
    $.clock.every(10000, () => void poll($))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const inner = await next(e)
    const pct = await read($, used)
    if (e.props.hasSurvey || pct === null) return inner
    const { Text } = $.ui.resolve(e)
    return addToBar($.ui.resolve(e), inner, 'right', '2-ram', <Text color={ramColor(pct)}>RAM {pct}%</Text>)
  })
}
