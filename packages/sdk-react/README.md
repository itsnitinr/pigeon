# @flypigeon/react

React SDK for Pigeon Notifications.

Includes:
- `PigeonProvider`
- `useNotifications`
- `NotificationBell`

## Install

```bash
npm install @flypigeon/react @flypigeon/shared react react-dom
```

## Basic Usage

```tsx
import '@flypigeon/react/styles.css'
import { PigeonProvider, useNotifications } from '@flypigeon/react'

function App() {
  return (
    <PigeonProvider
      apiUrl="https://api.your-domain.com"
      tokenProvider={async () => 'jwt-token'}
    >
      <Content />
    </PigeonProvider>
  )
}

function Content() {
  const { notifications, unreadCount } = useNotifications()
  return <div>{unreadCount} unread</div>
}
```

The `NotificationBell` styles are shipped in `@flypigeon/react/styles.css`, so import that once in your app entrypoint.
