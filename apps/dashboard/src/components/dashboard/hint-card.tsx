import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface HintCardProps {
  title: string
  description?: string
  hints: string[]
  className?: string
}

export function HintCard({ title, description, hints, className }: HintCardProps) {
  return (
    <Card className={cn('border-dashed bg-muted/30', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {hints.map((hint) => (
          <p key={hint} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
            <span>{hint}</span>
          </p>
        ))}
      </CardContent>
    </Card>
  )
}
