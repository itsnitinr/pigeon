import { redirect } from 'next/navigation'

import { AuthForm } from '@/components/auth/auth-form'
import { getAuthSession } from '@/lib/session'

export default async function RegisterPage() {
  const session = await getAuthSession()

  if (session) {
    redirect('/dashboard')
  }

  return <AuthForm mode="sign-up" />
}
