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
