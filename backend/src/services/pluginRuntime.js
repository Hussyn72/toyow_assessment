const { sha256 } = require('../utils/hash')

function caesar (input, shift) {
  const s = Number(shift || 0)
  return input.replace(/[a-z]/gi, (ch) => {
    const code = ch.charCodeAt(0)
    const base = code >= 97 ? 97 : 65
    return String.fromCharCode(((code - base + s) % 26 + 26) % 26 + base)
  })
}

async function textTransform (payload, config) {
  const text = String(payload?.text || '')
  const shift = Number(config?.shift ?? 3)
  const transformed = caesar(text, shift)
  const reversed = transformed.split('').reverse().join('')
  return {
    original: text,
    shifted: transformed,
    reversed,
    checksum: sha256(reversed)
  }
}

async function apiProxy (payload, config, context) {
  const url = payload?.url || config?.url
  if (!url) throw new Error('API_PROXY requires url')
  const method = payload?.method || config?.method || 'GET'
  const headers = { ...(config?.headers || {}), ...(payload?.headers || {}) }
  const useCache = payload?.useCache ?? config?.useCache ?? true
  const cacheKey = sha256(JSON.stringify({ url, method, headers, body: payload?.body || null }))

  if (useCache && context.cache?.has(cacheKey)) {
    return { cached: true, ...context.cache.get(cacheKey) }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: payload?.body ? JSON.stringify(payload.body) : undefined
  })
  const text = await response.text()
  const result = { status: response.status, body: text, headers: Object.fromEntries(response.headers.entries()) }
  if (useCache) context.cache?.set(cacheKey, result, 60)
  return { cached: false, ...result }
}

async function dataAggregator (payload, config, context) {
  const include = config?.includeStepIds || Object.keys(context.stepOutputs || {})
  const map = {}
  for (const stepId of include) {
    map[stepId] = sha256(JSON.stringify(context.stepOutputs?.[stepId] ?? null))
  }
  return { count: include.length, summaryHashMap: map }
}

async function delayPlugin (payload, config) {
  const ms = Number(payload?.ms ?? config?.ms ?? 1000)
  const blocking = payload?.blocking ?? config?.blocking ?? true
  if (blocking) {
    await new Promise(resolve => setTimeout(resolve, ms))
    return { mode: 'blocking', delayedMs: ms }
  }
  setTimeout(() => {}, ms)
  return { mode: 'non_blocking', scheduledMs: ms }
}

async function ifEval (payload, config, context) {
  const sourceStepId = config?.sourceStepId
  const path = config?.path || ''
  const equals = config?.equals
  const source = sourceStepId ? context.stepOutputs?.[sourceStepId] : context.runInput
  const actual = path.split('.').filter(Boolean).reduce((acc, key) => acc?.[key], source)
  return { result: actual === equals, actual, expected: equals }
}

async function executePlugin (type, payload, config, context) {
  switch (type) {
    case 'TEXT_TRANSFORM': return textTransform(payload, config, context)
    case 'API_PROXY': return apiProxy(payload, config, context)
    case 'DATA_AGGREGATOR': return dataAggregator(payload, config, context)
    case 'DELAY': return delayPlugin(payload, config, context)
    case 'IF': return ifEval(payload, config, context)
    default: throw new Error(`Unsupported plugin type: ${type}`)
  }
}

module.exports = { executePlugin }
