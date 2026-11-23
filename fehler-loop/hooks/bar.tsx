import type { EngineInterface, RenderElement } from 'claude-code'

type Tree = { props?: { key?: string }; children?: Tree[] }
type UI = ReturnType<EngineInterface['ui']['resolve']>

// Gemeinsame Leiste über dem Eingabefeld, byte-gleich in dokploy-statusbar, todos und ram (Plugins sind getrennt).
// `AbovePrompt` ist eine Instanz, die Hooks nesten (erster = äußerster) und deren `next(e)` den Baum der inneren liefert.
// Jeder Mod liest daher den Baum der inneren, hängt seinen Eintrag unter einem Schlüssel ein und baut die Leiste neu;
// links/rechts und Reihenfolge ergeben sich aus dem Schlüssel (Sortierung), nicht aus der Plugin-Reihenfolge.
// shortcut: erkennt nur Bäume mit `key="bar"`; fremde Inhalte stehen darüber, bei Bedarf gezielter einordnen.
export function addToBar(ui: UI, inner: RenderElement, side: 'left' | 'right', key: string, node: RenderElement): RenderElement {
  const { Box, Text } = ui
  const tree = (inner ?? {}) as Tree // falls `next(e)` doch nichts liefert
  const isBar = tree.props?.key === 'bar'
  const part = (k: string) => (isBar ? (tree.children?.find(c => c.props?.key === k)?.children ?? []) : [])
  const entry = (<Box key={`bar:${key}`}>{node}</Box>) as Tree
  const place = (k: string, items: Tree[]) =>
    [...items.filter(c => c.props?.key !== `bar:${key}` && c.props?.key !== 'bar:sep'), ...(side === k ? [entry] : [])].sort((a, b) =>
      String(a.props?.key).localeCompare(String(b.props?.key)),
    ) as RenderElement[]
  const left = place('left', part('bar:left'))
  const right = place('right', part('bar:right'))
  const bar = (
    <Box key="bar" justifyContent="space-between">
      <Box key="bar:left" gap={1}>
        {left}
      </Box>
      <Box key="bar:right">
        {right.flatMap((c, i) => (i ? [<Box key="bar:sep"><Text color="subtle"> · </Text></Box>, c] : [c]))}
      </Box>
    </Box>
  )
  return !isBar && (tree.children?.length ?? 0) > 0 ? <Box flexDirection="column">{inner}{bar}</Box> : bar
}
