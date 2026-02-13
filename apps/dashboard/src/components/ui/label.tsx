import type { LabelHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: this is a reusable wrapper; usage sites provide htmlFor.
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />
}
