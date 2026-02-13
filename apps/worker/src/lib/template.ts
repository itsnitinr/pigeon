function getNestedValue(input: unknown, path: string): unknown {
  if (!path) {
    return undefined
  }

  const segments = path.split('.')
  let current: unknown = input

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

const TEMPLATE_TOKEN_REGEX = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(TEMPLATE_TOKEN_REGEX, (_match, rawPath: string) => {
    const value = getNestedValue(data, rawPath)
    return stringifyValue(value)
  })
}
