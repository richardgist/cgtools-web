import net from 'node:net'
import { createError, defineEventHandler, readBody } from 'h3'

type InspectorBody = {
  host?: string
  port?: number
  timeoutMs?: number
  request?: Record<string, unknown>
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 49273
const DEFAULT_TIMEOUT_MS = 5000
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024
const FRAME_MAGIC = Buffer.from('SPMI', 'ascii')

function encodeFrame(payload: Buffer): Buffer {
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32BE(payload.length, 0)
  return Buffer.concat([FRAME_MAGIC, header, payload])
}

function sendInspectorRequest(host: string, port: number, timeoutMs: number, request: Record<string, unknown>) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    const chunks: Buffer[] = []
    let receivedBytes = 0
    let expectedPayloadBytes: number | null = null
    let responseHeaderBytes = 0
    let settled = false

    const finishResolve = (value: Record<string, unknown>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.end()
      resolve(value)
    }

    const finishReject = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      reject(error)
    }

    const timer = setTimeout(() => {
      finishReject(new Error(`Inspector request timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    socket.on('connect', () => {
      const payload = Buffer.from(JSON.stringify(request), 'utf8')
      if (payload.length <= 0 || payload.length > MAX_PAYLOAD_BYTES) {
        finishReject(new Error(`Invalid request payload size: ${payload.length}`))
        return
      }
      console.info(`[Inspector] send ${String(request.cmd || 'unknown')} id=${String(request.id || '')} to ${host}:${port} bytes=${payload.length}`)
      socket.write(encodeFrame(payload))
    })

    socket.on('data', (chunk) => {
      const dataChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(dataChunk)
      receivedBytes += dataChunk.length

      const buffer = Buffer.concat(chunks, receivedBytes)
      if (expectedPayloadBytes === null && buffer.length >= 4) {
        const hasMagic = buffer.subarray(0, 4).equals(FRAME_MAGIC)
        if (hasMagic && buffer.length < 8) {
          return
        }
        responseHeaderBytes = hasMagic ? 8 : 4
        expectedPayloadBytes = buffer.readUInt32BE(hasMagic ? 4 : 0)
        if (expectedPayloadBytes <= 0 || expectedPayloadBytes > MAX_PAYLOAD_BYTES) {
          finishReject(new Error(`Invalid response payload size: ${expectedPayloadBytes}`))
          return
        }
      }

      if (expectedPayloadBytes !== null && buffer.length >= expectedPayloadBytes + responseHeaderBytes) {
        const payload = buffer.subarray(responseHeaderBytes, responseHeaderBytes + expectedPayloadBytes).toString('utf8')
        try {
          finishResolve(JSON.parse(payload))
        } catch {
          finishReject(new Error(`Inspector returned invalid JSON: ${payload.slice(0, 200)}`))
        }
      }
    })

    socket.on('error', (err) => {
      finishReject(err)
    })

    socket.on('close', () => {
      if (!settled) {
        finishReject(new Error(`Inspector connection closed before response from ${host}:${port}`))
      }
    })
  })
}

export default defineEventHandler(async (event) => {
  const body = await readBody<InspectorBody>(event)
  const host = body.host || DEFAULT_HOST
  const port = Number(body.port || DEFAULT_PORT)
  const timeoutMs = Number(body.timeoutMs || DEFAULT_TIMEOUT_MS)
  const request = body.request

  if (!request || typeof request !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing inspector request',
      data: { error: 'request must be a JSON object' },
    })
  }

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid inspector port',
      data: { error: `Invalid port: ${body.port}` },
    })
  }

  try {
    return await sendInspectorRequest(host, port, timeoutMs, request)
  } catch (err: any) {
    const message = err?.message || String(err)
    throw createError({
      statusCode: message.includes('timeout') ? 504 : 502,
      statusMessage: 'Inspector request failed',
      data: { error: message, host, port },
    })
  }
})
