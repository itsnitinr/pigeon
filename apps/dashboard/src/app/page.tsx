import { redirect } from 'next/navigation'

import { getAuthSession } from '@/lib/session'

export default async function IndexPage() {
  const session = await getAuthSession()

  redirect(session ? '/dashboard' : '/login')
}
