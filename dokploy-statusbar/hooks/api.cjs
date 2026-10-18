// Minimal tRPC client for Dokploy. Runs under `dokploy-panel <panel> exec node …`, which puts
// DOKPLOY_URL, DOKPLOY_API_KEY and DOKPLOY_PANEL into the environment; the key never leaves that process.
const baseUrl = (process.env.DOKPLOY_URL || '').replace(/\/+$/, '')
const apiKey = process.env.DOKPLOY_API_KEY || ''

async function get(proc, params) {
  if (!baseUrl || !apiKey) throw new Error('DOKPLOY_URL/DOKPLOY_API_KEY missing (run via dokploy-panel <panel> exec)')
  const query = params ? `?input=${encodeURIComponent(JSON.stringify({ json: params }))}` : ''
  const res = await fetch(`${baseUrl}/api/trpc/${proc}${query}`, { headers: { 'x-api-key': apiKey } })
  if (!res.ok) throw new Error(`${proc} ${res.status}`)
  return (await res.json()).result.data.json
}

module.exports = { baseUrl, panel: process.env.DOKPLOY_PANEL || '', get }
