import { accounts, sessions, users, verifications } from '@flypigeon/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

import { db } from './db'
import { env } from './env'

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
})
