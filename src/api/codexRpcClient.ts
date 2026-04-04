import type { RpcEnvelope, RpcMethodCatalog } from '../types/codex'
import { CodexApiError, extractErrorMessage } from './codexErrors'

type RpcRequestBody = {
  method: string
  params?: unknown
}

export type RpcNotification = {
  method: string
  params: unknown
  atIso: string
}

type ServerRequestReplyBody = {
  id: number
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}

const WS_OPEN_TIMEOUT_MS = 2500
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 8000

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function rpcCall<T>(method: string, params?: unknown): Promise<T> {
  const body: RpcRequestBody = { method, params: params ?? null }

  let response: Response
  try {
    response = await fetch('/codex-api/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : `RPC ${method} failed before request was sent`,
      { code: 'network_error', method },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `RPC ${method} failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method,
        status: response.status,
      },
    )
  }

  const envelope = payload as RpcEnvelope<T> | null
  if (!envelope || typeof envelope !== 'object' || !('result' in envelope)) {
    throw new CodexApiError(`RPC ${method} returned malformed envelope`, {
      code: 'invalid_response',
      method,
      status: response.status,
    })
  }
  return envelope.result
}

export async function fetchRpcMethodCatalog(): Promise<string[]> {
  const response = await fetch('/codex-api/meta/methods')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Method catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/methods',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

export async function fetchRpcNotificationCatalog(): Promise<string[]> {
  const response = await fetch('/codex-api/meta/notifications')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Notification catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/notifications',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

function toNotification(value: unknown): RpcNotification | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.method !== 'string' || record.method.length === 0) return null

  const atIso = typeof record.atIso === 'string' && record.atIso.length > 0
    ? record.atIso
    : new Date().toISOString()

  return {
    method: record.method,
    params: record.params ?? null,
    atIso,
  }
}

export function subscribeRpcNotifications(onNotification: (value: RpcNotification) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  type Transport = 'ws' | 'sse'

  let cleanup: (() => void) | null = null
  let closed = false
  let reconnectTimer: number | null = null
  let reconnectAttempt = 0
  let activeAttempt = 0

  const preferredTransport = (): Transport => (typeof WebSocket !== 'undefined' ? 'ws' : 'sse')

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const clearActiveTransport = () => {
    const currentCleanup = cleanup
    cleanup = null
    currentCleanup?.()
  }

  const isStaleAttempt = (attemptId: number): boolean => closed || attemptId !== activeAttempt

  const handleNotificationPayload = (payload: string): void => {
    try {
      const parsed = JSON.parse(payload) as unknown
      const notification = toNotification(parsed)
      if (notification) {
        onNotification(notification)
      }
    } catch {
      // Ignore malformed event payloads and keep stream alive.
    }
  }

  const scheduleReconnect = (transport: Transport) => {
    if (closed || reconnectTimer !== null) return
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * (2 ** Math.min(reconnectAttempt, 3)),
      RECONNECT_MAX_DELAY_MS,
    )
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect(transport)
    }, delay)
  }

  const attachSse = (attemptId: number) => {
    if (typeof EventSource === 'undefined' || isStaleAttempt(attemptId)) return
    const source = new EventSource('/codex-api/events')
    cleanup = () => source.close()

    source.onopen = () => {
      if (isStaleAttempt(attemptId)) return
      reconnectAttempt = 0
    }

    source.onmessage = (event) => {
      if (isStaleAttempt(attemptId)) return
      handleNotificationPayload(event.data)
    }

    source.onerror = () => {
      if (isStaleAttempt(attemptId)) return
      if (source.readyState !== EventSource.CLOSED) return
      source.close()
      scheduleReconnect(preferredTransport())
    }
  }

  const attachWebSocketTransport = (attemptId: number) => {
    if (typeof WebSocket === 'undefined') {
      attachSse(attemptId)
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/codex-api/ws`)
    let didOpen = false
    let fallbackTimer: number | null = window.setTimeout(() => {
      if (isStaleAttempt(attemptId) || didOpen) return
      if (socket.readyState < 2) {
        socket.close()
      }
      connect('sse')
    }, WS_OPEN_TIMEOUT_MS)

    const clearFallbackTimer = () => {
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
    }

    cleanup = () => {
      clearFallbackTimer()
      if (socket.readyState < 2) {
        socket.close()
      }
    }

    socket.onopen = () => {
      if (isStaleAttempt(attemptId)) {
        cleanup?.()
        return
      }
      didOpen = true
      reconnectAttempt = 0
      clearFallbackTimer()
    }

    socket.onmessage = (event) => {
      if (isStaleAttempt(attemptId)) return
      handleNotificationPayload(String(event.data))
    }

    socket.onerror = () => {
      if (isStaleAttempt(attemptId)) return
      if (didOpen) return
      clearFallbackTimer()
      if (socket.readyState < 2) {
        socket.close()
      }
      connect('sse')
    }

    socket.onclose = () => {
      if (isStaleAttempt(attemptId)) return
      clearFallbackTimer()
      if (!didOpen) {
        connect('sse')
        return
      }
      scheduleReconnect('ws')
    }
  }

  const connect = (transport: Transport) => {
    if (closed) return
    clearReconnectTimer()
    activeAttempt += 1
    const attemptId = activeAttempt
    clearActiveTransport()

    if (transport === 'ws') {
      attachWebSocketTransport(attemptId)
      return
    }

    attachSse(attemptId)
  }

  connect(preferredTransport())

  return () => {
    closed = true
    clearReconnectTimer()
    clearActiveTransport()
  }
}

export async function respondServerRequest(body: ServerRequestReplyBody): Promise<void> {
  let response: Response
  try {
    response = await fetch('/codex-api/server-requests/respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Failed to reply to server request',
      { code: 'network_error', method: 'server-requests/respond' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Server request reply failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'server-requests/respond',
        status: response.status,
      },
    )
  }
}

export async function fetchPendingServerRequests(): Promise<unknown[]> {
  const response = await fetch('/codex-api/server-requests/pending')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Pending server requests failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'server-requests/pending',
        status: response.status,
      },
    )
  }

  const record = asRecord(payload)
  const data = record?.data
  return Array.isArray(data) ? data : []
}
