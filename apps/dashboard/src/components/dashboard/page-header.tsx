import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description: string
  eyebrow?: string
  contextBadges?: string[]
  className?: string
}

export function PageHeader({
  title,
  description,
  eyebrow,
  contextBadges = [],
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-3', className)}>
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>

      {contextBadges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {contextBadges.map((label) => (
            <Badge key={label} variant="muted">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}
    </header>
  )
}
