import { defineEventHandler, getQuery, readBody, getRequestHeaders, createError } from 'h3'

/**
 * Bridge API proxy — forwards requests to the local Bridge HTTP server.
 * This avoids CORS issues since the browser only talks to the Nuxt server.
 *
 * Usage: /api/bridge/{path}?host=127.0.0.1&port=18773
 * e.g.   /api/bridge/v1/health?host=127.0.0.1&port=18773
 */
export default defineEventHandler(async (event) => {
  const method = event.method || 'GET'
  const params = event.context.params || {}
  const bridgePath = params.path || ''

  const query = getQuery(event)
  const host = (query.host as string) || '127.0.0.1'
  const port = (query.port as string) || '18773'

  const targetUrl = `http://${host}:${port}/${bridgePath}`

  const fetchOpts: RequestInit = {
    method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  }

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    try {
      const body = await readBody(event)
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body)
    } catch {
      // no body
    }
  }

  try {
    const resp = await fetch(targetUrl, fetchOpts)
    const text = await resp.text()

    // Forward status code
    event.node.res.statusCode = resp.status

    // Try to parse as JSON
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      throw createError({
        statusCode: 502,
        statusMessage: `Bridge unreachable at ${host}:${port}`,
        data: { error: `Cannot connect to Bridge at ${host}:${port}. Is it running?` },
      })
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      throw createError({
        statusCode: 504,
        statusMessage: 'Bridge request timeout',
        data: { error: `Request to Bridge timed out after 30s` },
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Bridge proxy error',
      data: { error: msg },
    })
  }
})
