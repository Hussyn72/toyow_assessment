const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export async function api (path, options = {}, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  })
  if (!res.ok) {
    const raw = await res.text()
    let message = raw || `HTTP ${res.status}`
    try {
      const parsed = JSON.parse(raw)
      message = parsed.error || parsed.message || message
    } catch (_) {}
    throw new Error(message)
  }
  if (res.status === 204) return null
  return res.json()
}

export function streamRunLogs (runId, token, onRow) {
  const controller = new AbortController()
  fetch(`${API_BASE}/runs/${runId}/logs/stream`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal
  }).then(async (res) => {
    if (!res.ok || !res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line) onRow(JSON.parse(line))
      }
    }
  }).catch(() => {})
  return () => controller.abort()
}

export function connectWs (runId, onLog) {
  const wsBase = API_BASE.replace(/^http/, 'ws')
  const ws = new WebSocket(`${wsBase}/ws`)
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'subscribe', runId }))
  })
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'run.log' && msg.runId === runId) onLog(msg.payload)
  })
  return () => ws.close()
}
