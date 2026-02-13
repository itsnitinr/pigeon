'use client'

import { type StreamEvent, streamEventSchema } from '@flypigeon/shared'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { PigeonReactApiError } from './errors'
import { SseHttpError, consumeSseStream } from './sse'
import type {
  PigeonConnectionStatus,
  PigeonContextValue,
  PigeonProviderProps,
  TokenProviderResult,
} from './types'

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 1000
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000
const TOKEN_EXPIRY_DRIFT_MS = 15_000

interface TokenCacheEntry {
  token: string
  expiresAtMs: number | null
}

const PigeonContext = createContext<PigeonContextValue | null>(null)

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error(String(error))
}

function parseJsonText(rawText: string): unknown {
  if (!rawText.trim()) {
    return null
  }

  try {
    return JSON.parse(rawText)
  } catch {
    return null
  }
}

function parseTokenProviderResult(result: string | TokenProviderResult): TokenCacheEntry {
  if (typeof result === 'string') {
    if (!result.trim()) {
      throw new Error('tokenProvider returned an empty token')
    }

    return {
      token: result,
      expiresAtMs: null,
    }
  }

  if (!result || typeof result.token !== 'string' || !result.token.trim()) {
    throw new Error('tokenProvider returned an invalid token result')
  }

  let expiresAtMs: number | null = null

  if (result.expiresAt) {
    const parsed = Date.parse(result.expiresAt)

    if (Number.isNaN(parsed)) {
      throw new Error('tokenProvider returned invalid expiresAt')
    }

    expiresAtMs = parsed
  }

  return {
    token: result.token,
    expiresAtMs,
  }
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

export function PigeonProvider({
  apiUrl,
  tokenProvider,
  children,
  reconnectInitialDelayMs = DEFAULT_RECONNECT_INITIAL_DELAY_MS,
  reconnectMaxDelayMs = DEFAULT_RECONNECT_MAX_DELAY_MS,
}: PigeonProviderProps) {
  const [connectionStatus, setConnectionStatus] = useState<PigeonConnectionStatus>('connecting')

  const eventListenersRef = useRef(new Set<(event: StreamEvent) => void>())
  const lastEventIdRef = useRef<string | undefined>(undefined)
  const tokenCacheRef = useRef<TokenCacheEntry | null>(null)
  const inflightTokenRef = useRef<Promise<string> | null>(null)

  const clearCachedToken = useCallback(() => {
    tokenCacheRef.current = null
  }, [])

  const getToken = useCallback(
    async (forceRefresh = false): Promise<string> => {
      const now = Date.now()
      const cached = tokenCacheRef.current

      if (
        !forceRefresh &&
        cached &&
        (cached.expiresAtMs === null || cached.expiresAtMs - TOKEN_EXPIRY_DRIFT_MS > now)
      ) {
        return cached.token
      }

      if (!inflightTokenRef.current) {
        inflightTokenRef.current = Promise.resolve(tokenProvider())
          .then((result) => parseTokenProviderResult(result))
          .then((entry) => {
            tokenCacheRef.current = entry
            return entry.token
          })
          .finally(() => {
            inflightTokenRef.current = null
          })
      }

      return inflightTokenRef.current
    },
    [tokenProvider],
  )

  const emitEvent = useCallback((event: StreamEvent) => {
    const listeners = [...eventListenersRef.current]

    for (const listener of listeners) {
      listener(event)
    }
  }, [])

  const subscribeToEvents = useCallback((listener: (event: StreamEvent) => void) => {
    eventListenersRef.current.add(listener)

    return () => {
      eventListenersRef.current.delete(listener)
    }
  }, [])

  const requestJson = useCallback(
    async <TResponse,>({
      path,
      method = 'GET',
      body,
    }: {
      path: string
      method?: 'GET' | 'POST'
      body?: unknown
    }): Promise<TResponse> => {
      const request = async (forceRefreshToken: boolean): Promise<Response> => {
        const token = await getToken(forceRefreshToken)
        const url = new URL(path, apiUrl)
        const headers = new Headers()
        headers.set('authorization', `Bearer ${token}`)

        const init: RequestInit = {
          method,
          headers,
        }

        if (body !== undefined) {
          headers.set('content-type', 'application/json')
          init.body = JSON.stringify(body)
        }

        return fetch(url, init)
      }

      let response = await request(false)

      if (response.status === 401) {
        clearCachedToken()
        response = await request(true)
      }

      const rawText = await response.text()
      const payload = parseJsonText(rawText)

      if (!response.ok) {
        if (isObjectRecord(payload) && isObjectRecord(payload.error)) {
          const code = payload.error.code
          const message = payload.error.message
          const requestId = payload.error.requestId
          const details = payload.error.details

          if (typeof code === 'string' && typeof message === 'string') {
            const errorPayload: {
              status: number
              code: string
              message: string
              requestId?: string
              details?: unknown
            } = {
              status: response.status,
              code,
              message,
              details,
            }

            if (typeof requestId === 'string') {
              errorPayload.requestId = requestId
            }

            throw new PigeonReactApiError(errorPayload)
          }
        }

        throw new PigeonReactApiError({
          status: response.status,
          code: `HTTP_${response.status}`,
          message: `Request failed with status ${response.status}`,
        })
      }

      return payload as TResponse
    },
    [apiUrl, clearCachedToken, getToken],
  )

  useEffect(() => {
    let disposed = false
    let activeController: AbortController | null = null

    const connectLoop = async () => {
      let attempt = 0

      while (!disposed) {
        setConnectionStatus('connecting')
        activeController = new AbortController()

        try {
          const token = await getToken(attempt > 0)
          const streamRequest: {
            url: string
            token: string
            signal: AbortSignal
            onOpen: () => void
            onMessage: (message: { id?: string; event: string; data: string }) => void
            lastEventId?: string
          } = {
            url: new URL('/v1/stream', apiUrl).toString(),
            token,
            signal: activeController.signal,
            onOpen: () => {
              attempt = 0
              setConnectionStatus('connected')
            },
            onMessage: (message) => {
              if (message.id) {
                lastEventIdRef.current = message.id
              }

              if (
                message.event !== 'notification.created' &&
                message.event !== 'notification.read'
              ) {
                return
              }

              const parsed = streamEventSchema.safeParse({
                event: message.event,
                data: parseJsonText(message.data),
              })

              if (!parsed.success) {
                return
              }

              emitEvent(parsed.data)
            },
          }

          if (lastEventIdRef.current) {
            streamRequest.lastEventId = lastEventIdRef.current
          }

          await consumeSseStream(streamRequest)
        } catch (error) {
          if (disposed) {
            return
          }

          if (error instanceof SseHttpError && error.status === 401) {
            clearCachedToken()
          }

          const normalizedError = normalizeError(error)

          if (normalizedError.name === 'AbortError') {
            return
          }
        }

        if (disposed) {
          return
        }

        setConnectionStatus('disconnected')

        const delayMs = Math.min(reconnectMaxDelayMs, reconnectInitialDelayMs * 2 ** attempt)
        attempt += 1
        await sleep(delayMs)
      }
    }

    void connectLoop()

    return () => {
      disposed = true

      if (activeController) {
        activeController.abort()
      }
    }
  }, [apiUrl, clearCachedToken, emitEvent, getToken, reconnectInitialDelayMs, reconnectMaxDelayMs])

  const value = useMemo<PigeonContextValue>(
    () => ({
      apiUrl,
      connectionStatus,
      requestJson,
      subscribeToEvents,
    }),
    [apiUrl, connectionStatus, requestJson, subscribeToEvents],
  )

  return <PigeonContext.Provider value={value}>{children}</PigeonContext.Provider>
}

export function usePigeonContext(): PigeonContextValue {
  const context = useContext(PigeonContext)

  if (!context) {
    throw new Error('usePigeonContext must be used inside <PigeonProvider>')
  }

  return context
}
