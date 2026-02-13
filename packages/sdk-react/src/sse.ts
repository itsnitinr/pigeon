export interface SseMessage {
  id?: string
  event: string
  data: string
}

export class SseHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SseHttpError'
    this.status = status
  }
}

function parseSseBlock(block: string): SseMessage | null {
  const normalized = block.replace(/\r/g, '')
  const lines = normalized.split('\n')

  let id: string | undefined
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('id:')) {
      id = line.slice(3).trim()
      continue
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (dataLines.length === 0 && !id && event === 'message') {
    return null
  }

  const message: SseMessage = {
    event,
    data: dataLines.join('\n'),
  }

  if (id !== undefined) {
    message.id = id
  }

  return message
}

export async function consumeSseStream(params: {
  url: string
  token: string
  lastEventId?: string
  signal: AbortSignal
  onOpen: () => void
  onMessage: (message: SseMessage) => void
}): Promise<void> {
  const headers = new Headers()
  headers.set('accept', 'text/event-stream')
  headers.set('authorization', `Bearer ${params.token}`)

  if (params.lastEventId) {
    headers.set('last-event-id', params.lastEventId)
  }

  const response = await fetch(params.url, {
    method: 'GET',
    headers,
    signal: params.signal,
  })

  if (!response.ok) {
    throw new SseHttpError(response.status, `SSE request failed with status ${response.status}`)
  }

  if (!response.body) {
    throw new Error('SSE response body is missing')
  }

  params.onOpen()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (!params.signal.aborted) {
    const { done, value } = await reader.read()

    if (done) {
      return
    }

    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const separatorIndex = buffer.indexOf('\n\n')

      if (separatorIndex === -1) {
        break
      }

      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      const message = parseSseBlock(block)

      if (message) {
        params.onMessage(message)
      }
    }
  }
}
