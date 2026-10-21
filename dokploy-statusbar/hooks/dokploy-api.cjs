// Gemeinsamer tRPC-Lesezugriff für discover.cjs und poll.cjs. Läuft unter `dokploy-panel <panel> exec …`:
// URL und Key kommen aus der Umgebung, nie aus dem Mod und nie in die Ausgabe.
const base = () => {
  const url = process.env.DOKPLOY_URL
  const key = process.env.DOKPLOY_API_KEY
  if (!url || !key) throw new Error('DOKPLOY_URL/DOKPLOY_API_KEY fehlen (Aufruf nur über `dokploy-panel <panel> exec`)')
  return { url: url.replace(/\/+$/, ''), key }
}

// Lesende tRPC-Abfrage; GET-Input als { json: … } kodiert.
async function query(proc, input) {
  const { url, key } = base()
  const qs = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
  const res = await fetch(`${url}/api/trpc/${proc}${qs}`, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`${proc} ${res.status}`)
  return (await res.json()).result.data.json
}

module.exports = { query, baseUrl: () => base().url, panel: () => process.env.DOKPLOY_PANEL || '' }
