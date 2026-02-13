import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { NotificationBell, PigeonProvider, type TokenProvider } from '@pigeon/react'

const demoServerUrl = import.meta.env.VITE_DEMO_SERVER_URL ?? 'http://localhost:3010'

type LoadState = 'idle' | 'loading' | 'error' | 'ready'

interface DemoConfig {
  apiBaseUrl: string
  defaultUserId: string
}

interface TokenResponse {
  token: string
  expiresAt: string
}

type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'pigeon-demo-theme'

async function requestJson<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const requestInit: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
    },
  }

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body)
  }

  const response = await fetch(`${demoServerUrl}${path}`, requestInit)

  const text = await response.text()
  let data: unknown = null

  if (text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify(data)
        : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return data as T
}

function App() {
  const [config, setConfig] = useState<DemoConfig | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [userId, setUserId] = useState('')
  const [type, setType] = useState('order.shipped')
  const [title, setTitle] = useState('Your order has shipped')
  const [body, setBody] = useState('Tracking number: TRK-482190. Estimated delivery: Tomorrow.')
  const [sending, setSending] = useState(false)
  const [sendMessage, setSendMessage] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>('light')

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const nextConfig = await requestJson<DemoConfig>('/api/config', 'GET')
        setConfig(nextConfig)
        setUserId(nextConfig.defaultUserId)
        setLoadState('ready')
      } catch (error) {
        setLoadState('error')
        setLoadError(error instanceof Error ? error.message : String(error))
      }
    }

    void loadConfig()
  }, [])

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

    if (storedTheme === 'light' || storedTheme === 'dark') {
      setThemeMode(storedTheme)
      return
    }

    setThemeMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', themeMode === 'dark')
    root.style.colorScheme = themeMode
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  const tokenProvider = useMemo<TokenProvider>(() => {
    return async () => {
      const tokenResult = await requestJson<TokenResponse>('/api/token', 'POST', { userId })
      return {
        token: tokenResult.token,
        expiresAt: tokenResult.expiresAt,
      }
    }
  }, [userId])

  const sendNotification = useCallback(async () => {
    setSending(true)
    setSendMessage(null)

    try {
      const result = await requestJson<{ id: string; status: string }>('/api/send', 'POST', {
        userId,
        type,
        title,
        body,
      })
      setSendMessage(`Sent: ${result.id} (${result.status})`)
    } catch (error) {
      setSendMessage(`Send failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSending(false)
    }
  }, [body, title, type, userId])

  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <main className="demo-page">
        <style>{DEMO_STYLES}</style>
        <section className="demo-shell">
          <h1>Preparing demo...</h1>
        </section>
      </main>
    )
  }

  if (loadState === 'error' || !config) {
    return (
      <main className="demo-page">
        <style>{DEMO_STYLES}</style>
        <section className="demo-shell">
          <h1>Demo server unavailable</h1>
          <p>{loadError}</p>
          <p>Make sure `@pigeon/demo-server` is running on {demoServerUrl}.</p>
        </section>
      </main>
    )
  }

  return (
    <PigeonProvider apiUrl={config.apiBaseUrl} tokenProvider={tokenProvider}>
      <main className="demo-page">
        <style>{DEMO_STYLES}</style>
        <section className="demo-shell">
          <header className="demo-header">
            <div>
              <p className="demo-eyebrow">Pigeon React SDK Demo</p>
              <h1>Realtime notification bell</h1>
              <p className="demo-subtitle">
                Send notifications below and watch the bell update instantly via SSE.
              </p>
            </div>
            <div className="demo-header-actions">
              <button
                type="button"
                className="demo-theme-toggle"
                aria-pressed={themeMode === 'dark'}
                onClick={() => {
                  setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))
                }}
              >
                {themeMode === 'dark' ? 'Switch to light' : 'Switch to dark'}
              </button>
              <NotificationBell panelTitle="Inbox" pageSize={20} colorMode={themeMode} />
            </div>
          </header>

          <section className="demo-grid">
            <article className="demo-card">
              <h2>Create Notification</h2>
              <div className="demo-field">
                <label htmlFor="user-id">User ID</label>
                <input
                  id="user-id"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  placeholder="demo-user-001"
                />
              </div>
              <div className="demo-field">
                <label htmlFor="notif-type">Type</label>
                <input
                  id="notif-type"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  placeholder="order.shipped"
                />
              </div>
              <div className="demo-field">
                <label htmlFor="notif-title">Title</label>
                <input
                  id="notif-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div className="demo-field">
                <label htmlFor="notif-body">Body</label>
                <textarea
                  id="notif-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={3}
                />
              </div>
              <div className="demo-actions">
                <button
                  type="button"
                  onClick={() => void sendNotification()}
                  disabled={sending || !userId}
                >
                  {sending ? 'Sending...' : 'Send Notification'}
                </button>
              </div>
              {sendMessage ? <p className="demo-note">{sendMessage}</p> : null}
            </article>

            <article className="demo-card">
              <h2>Quick presets</h2>
              <p className="demo-muted">
                These are pre-filled examples to quickly generate events and test the bell.
              </p>
              <div className="demo-presets">
                <button
                  type="button"
                  onClick={() => {
                    setType('billing.invoice.paid')
                    setTitle('Invoice paid')
                    setBody('Invoice #INV-8042 was successfully paid.')
                  }}
                >
                  Invoice Paid
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType('security.new-login')
                    setTitle('New login detected')
                    setBody('New login from Chrome on macOS, San Francisco.')
                  }}
                >
                  Security Alert
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType('message.received')
                    setTitle('New message')
                    setBody('You have a new message from support.')
                  }}
                >
                  Message
                </button>
              </div>
              <p className="demo-muted">
                API: <code>{config.apiBaseUrl}</code>
              </p>
              <p className="demo-muted">
                Demo server: <code>{demoServerUrl}</code>
              </p>
            </article>
          </section>
        </section>
      </main>
    </PigeonProvider>
  )
}

const DEMO_STYLES = `
  :root {
    color-scheme: light dark;
  }

  * {
    box-sizing: border-box;
  }

  html, body, #root {
    margin: 0;
    min-height: 100%;
  }

  body {
    font-family: "Sora", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at 6% 5%, rgba(9, 185, 174, 0.25), rgba(9, 185, 174, 0) 28%),
      radial-gradient(circle at 94% 2%, rgba(255, 145, 77, 0.24), rgba(255, 145, 77, 0) 36%),
      linear-gradient(150deg, #e9f3ff 0%, #f8fbff 55%, #f7f2ff 100%);
    color: #13233b;
  }

  .demo-page {
    padding: 32px 20px 44px;
  }

  .demo-shell {
    width: min(980px, 100%);
    margin: 0 auto;
    border: 1px solid rgba(255, 255, 255, 0.85);
    border-radius: 26px;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.8), rgba(243, 248, 255, 0.86));
    box-shadow: 0 26px 64px rgba(20, 38, 67, 0.14);
    backdrop-filter: blur(12px);
    padding: 22px;
  }

  .demo-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
  }

  .demo-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .demo-theme-toggle {
    border: 1px solid rgba(22, 38, 67, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.86);
    color: #1a3250;
    height: 34px;
    padding: 0 14px;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: all 140ms ease;
  }

  .demo-theme-toggle:hover {
    background: rgba(255, 255, 255, 0.96);
    border-color: rgba(22, 38, 67, 0.3);
  }

  .demo-eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 12px;
    color: #0f766e;
    font-weight: 700;
  }

  h1 {
    margin: 6px 0 6px;
    font-size: clamp(1.4rem, 2.3vw, 2rem);
    line-height: 1.2;
  }

  .demo-subtitle {
    margin: 0;
    color: #455a77;
    max-width: 54ch;
    line-height: 1.5;
  }

  .demo-grid {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 16px;
  }

  .demo-card {
    border-radius: 18px;
    border: 1px solid rgba(22, 38, 67, 0.12);
    background: linear-gradient(155deg, rgba(255, 255, 255, 0.82), rgba(247, 250, 255, 0.8));
    padding: 16px;
  }

  .demo-card h2 {
    margin: 0 0 12px;
    font-size: 1.03rem;
  }

  .demo-field {
    display: grid;
    gap: 6px;
    margin-bottom: 11px;
  }

  .demo-field label {
    font-size: 12px;
    color: #456284;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .demo-field input,
  .demo-field textarea {
    width: 100%;
    border: 1px solid rgba(25, 48, 86, 0.22);
    border-radius: 12px;
    padding: 10px 11px;
    font: inherit;
    color: #13233b;
    background: rgba(255, 255, 255, 0.82);
  }

  .demo-field input:focus,
  .demo-field textarea:focus {
    outline: none;
    border-color: #0f766e;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.14);
  }

  .demo-actions button,
  .demo-presets button {
    border: 0;
    border-radius: 999px;
    padding: 10px 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    color: #ecfef9;
    background: linear-gradient(120deg, #0f766e, #155e75);
    box-shadow: 0 8px 16px rgba(13, 90, 102, 0.23);
  }

  .demo-actions button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .demo-note {
    margin: 12px 0 0;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 13px;
    color: #12405a;
    background: rgba(15, 118, 110, 0.12);
  }

  .demo-muted {
    margin: 0 0 12px;
    color: #4a6082;
    line-height: 1.5;
    font-size: 13px;
  }

  .demo-presets {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
  }

  .demo-presets button {
    text-align: left;
  }

  code {
    display: inline-block;
    font-family: "IBM Plex Mono", monospace;
    font-size: 12px;
    border-radius: 6px;
    background: rgba(16, 37, 61, 0.08);
    padding: 3px 6px;
  }

  .dark body {
    background:
      radial-gradient(circle at 8% 7%, rgba(15, 118, 110, 0.22), rgba(15, 118, 110, 0) 28%),
      radial-gradient(circle at 92% 4%, rgba(217, 119, 6, 0.2), rgba(217, 119, 6, 0) 30%),
      linear-gradient(145deg, #020617, #111827 58%, #0f172a);
    color: #dbe5f2;
  }

  .dark .demo-shell {
    border-color: rgba(148, 163, 184, 0.3);
    background: linear-gradient(145deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.76));
    box-shadow: 0 26px 64px rgba(2, 6, 23, 0.65);
  }

  .dark .demo-eyebrow {
    color: #2dd4bf;
  }

  .dark h1 {
    color: #f1f5f9;
  }

  .dark .demo-subtitle,
  .dark .demo-muted {
    color: #94a3b8;
  }

  .dark .demo-theme-toggle {
    border-color: rgba(148, 163, 184, 0.32);
    background: rgba(15, 23, 42, 0.65);
    color: #cbd5e1;
  }

  .dark .demo-theme-toggle:hover {
    background: rgba(15, 23, 42, 0.92);
    border-color: rgba(148, 163, 184, 0.5);
  }

  .dark .demo-card {
    border-color: rgba(148, 163, 184, 0.24);
    background: linear-gradient(155deg, rgba(15, 23, 42, 0.84), rgba(30, 41, 59, 0.7));
  }

  .dark .demo-card h2 {
    color: #f1f5f9;
  }

  .dark .demo-field label {
    color: #93c5fd;
  }

  .dark .demo-field input,
  .dark .demo-field textarea {
    border-color: rgba(148, 163, 184, 0.32);
    color: #e2e8f0;
    background: rgba(15, 23, 42, 0.78);
  }

  .dark .demo-field input:focus,
  .dark .demo-field textarea:focus {
    border-color: #22d3ee;
    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.22);
  }

  .dark .demo-actions button,
  .dark .demo-presets button {
    background: linear-gradient(120deg, #0f766e, #0891b2);
    box-shadow: 0 8px 16px rgba(8, 145, 178, 0.28);
  }

  .dark .demo-note {
    color: #bae6fd;
    background: rgba(15, 118, 110, 0.2);
  }

  .dark code {
    color: #e2e8f0;
    background: rgba(148, 163, 184, 0.2);
  }

  @media (max-width: 860px) {
    .demo-grid {
      grid-template-columns: 1fr;
    }

    .demo-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .demo-header-actions {
      width: 100%;
      justify-content: space-between;
    }
  }
`

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing #root element')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
