# @flypigeon/node

Node.js SDK for the Pigeon Notifications API.

## Install

```bash
npm install @flypigeon/node
```

## Basic Usage

```ts
import { Pigeon } from '@flypigeon/node'

const pigeon = new Pigeon({
  apiKey: process.env.PIGEON_API_KEY!,
  baseUrl: 'https://api.your-domain.com',
})

await pigeon.send({
  userId: 'user-123',
  type: 'welcome',
  title: 'Welcome!',
})
```
