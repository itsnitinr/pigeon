import { createHmac } from 'node:crypto'

import { env } from './env'

export interface WebhookRequestResult {
  ok: boolean
  status: number | null
  responseBody: string | null
  error: string | null
}

interface ErrorLike {
  code?: string
  errno?: number
  syscall?: string
  address?: string
  port?: number
  message?: string
}

function trimResponseBody(body: string): string {
  const MAX_BODY_LENGTH = 4000

  if (body.length <= MAX_BODY_LENGTH) {
    return body
  }

  return `${body.slice(0, MAX_BODY_LENGTH)}...`
}

export function signWebhookPayload(secret: string, payload: string): string {
  const digest = createHmac('sha256', secret).update(payload).digest('hex')
  return `sha256=${digest}`
}

function formatWebhookError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown webhook error'
  }

  if (error.name === 'AbortError') {
    return `Webhook request timed out after ${env.WEBHOOK_TIMEOUT_MS}ms`
  }

  const cause = (error as Error & { cause?: unknown }).cause

  if (cause && typeof cause === 'object') {
    const typedCause = cause as ErrorLike
    const parts = [
      typedCause.code,
      typedCause.syscall,
      typedCause.address ? `${typedCause.address}:${typedCause.port ?? ''}` : undefined,
      typedCause.message
    ].filter(Boolean)

    if (parts.length > 0) {
      return `${error.message} (${parts.join(' ')})`
    }
  }

  return error.message
}

export async function deliverWebhook(
  url: string,
  event: string,
  secret: string,
  payload: string
): Promise<WebhookRequestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, env.WEBHOOK_TIMEOUT_MS)

  try {
    const signature = signWebhookPayload(secret, payload)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pigeon-event': event,
        'x-pigeon-signature': signature,
        'user-agent': 'pigeon-worker/0.1'
      },
      body: payload,
      signal: controller.signal
    })

    const responseText = trimResponseBody(await response.text())

    return {
      ok: response.ok,
      status: response.status,
      responseBody: responseText,
      error: response.ok ? null : `Webhook returned status ${response.status}`
    }
  } catch (error) {
    const message = formatWebhookError(error)

    return {
      ok: false,
      status: null,
      responseBody: null,
      error: message
    }
  } finally {
    clearTimeout(timeout)
  }
}
