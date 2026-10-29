'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>

/** Password field with a show/hide reveal toggle (Eye/EyeOff). */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false)

  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
      </Button>
    </div>
  )
}
