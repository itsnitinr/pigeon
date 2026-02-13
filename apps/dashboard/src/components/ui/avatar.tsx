import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  fallback: string
}

export function Avatar({ className, fallback, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground',
        className,
      )}
      {...props}
    >
      {fallback}
    </div>
  )
}
