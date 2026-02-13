import { headers } from 'next/headers'

import { auth } from './auth'

export async function getAuthSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}
