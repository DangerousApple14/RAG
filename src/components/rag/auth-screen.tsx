'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Car, Loader2, Lock, User as UserIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/rag/password-input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError, login, register, type User } from '@/lib/api-client'

interface AuthScreenProps {
  onAuthed: (user: User) => void
}

type Mode = 'login' | 'register'

/** Centered glass auth card — Login / Register against the local backend. */
export function AuthScreen({ onAuthed }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const validate = (): string | null => {
    if (username.trim().length < 2) return 'Username must be at least 2 characters'
    if (password.length < 4) return 'Password must be at least 4 characters'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    const problem = validate()
    if (problem) {
      setInlineError(problem)
      toast.error(problem)
      return
    }

    setInlineError(null)
    setSubmitting(true)
    try {
      const res =
        mode === 'login'
          ? await login(username.trim(), password)
          : await register(username.trim(), password)
      toast.success(mode === 'login' ? `Welcome back, ${res.user.username}` : 'Account created — garage door is open')
      onAuthed(res.user)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong — try again'
      setInlineError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="glass w-full max-w-sm rounded-xl p-6 shadow-2xl"
      >
        <div className="mb-6 space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Car className="size-6" aria-hidden="true" />
          </div>
          <div>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold tracking-[0.18em]">
              MIDNIGHT <span className="text-primary">GARAGE</span>
            </h1>
            <p className="mt-1.5 text-xs text-dim">local RAG · your keys never leave this machine</p>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="login" className="flex-1">
              Login
            </TabsTrigger>
            <TabsTrigger value="register" className="flex-1">
              Register
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="auth-username">Username</Label>
            <div className="relative">
              <UserIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="auth-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your handle"
                autoComplete="username"
                autoFocus
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <PasswordInput
                id="auth-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'min. 4 characters' : 'your password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="pl-9"
              />
            </div>
          </div>

          {inlineError ? (
            <p role="alert" className="text-sm text-destructive">
              {inlineError}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {mode === 'login' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : mode === 'login' ? (
              'Sign in'
            ) : (
              'Create account'
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
