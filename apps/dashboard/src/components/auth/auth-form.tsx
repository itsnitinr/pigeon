'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

type AuthMode = 'sign-in' | 'sign-up'

interface AuthFormProps {
  mode: AuthMode
}

function getErrorMessage(result: unknown): string | null {
  if (!result || typeof result !== 'object' || !('error' in result)) {
    return null
  }

  const error = result.error

  if (error === null || error === undefined) {
    return null
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error !== 'object') {
    return 'Authentication failed. Please try again.'
  }

  if ('message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Authentication failed. Please try again.'
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const isSignUp = mode === 'sign-up'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{isSignUp ? 'Create your account' : 'Welcome back'}</CardTitle>
        <CardDescription>
          {isSignUp
            ? 'Use email and password to create a dashboard account.'
            : 'Sign in to manage projects, templates, and notification logs.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()

            void (async () => {
              setIsSubmitting(true)
              setErrorMessage(null)

              try {
                if (isSignUp) {
                  const result = await authClient.signUp.email({
                    name,
                    email,
                    password,
                    callbackURL: '/dashboard',
                  })

                  const error = getErrorMessage(result)

                  if (error) {
                    setErrorMessage(error)
                    return
                  }
                } else {
                  const result = await authClient.signIn.email({
                    email,
                    password,
                    callbackURL: '/dashboard',
                  })

                  const error = getErrorMessage(result)

                  if (error) {
                    setErrorMessage(error)
                    return
                  }
                }

                router.push('/dashboard')
                router.refresh()
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.')
              } finally {
                setIsSubmitting(false)
              }
            })()
          }}
        >
          {isSignUp ? (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                autoComplete="name"
                required
                placeholder="Jane Doe"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={8}
              required
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? isSignUp
                ? 'Creating account...'
                : 'Signing in...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {isSignUp ? 'Already have an account?' : "Don't have an account?"}
        <Link
          href={isSignUp ? '/login' : '/register'}
          className="ml-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          {isSignUp ? 'Sign in' : 'Create one'}
        </Link>
      </CardFooter>
    </Card>
  )
}
