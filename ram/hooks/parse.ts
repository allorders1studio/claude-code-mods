// Letzte Zeile von `memory_pressure -Q`: „System-wide memory free percentage: 34%“. Belegt = 100 − frei.
export const parsePressure = (out: string): number | null => {
  const m = out.match(/memory free percentage:\s*(\d{1,3})%/)
  return m && Number(m[1]) <= 100 ? 100 - Number(m[1]) : null
}

export const ramColor = (pct: number) => (pct >= 90 ? 'error' : pct >= 80 ? 'warning' : 'subtle')
