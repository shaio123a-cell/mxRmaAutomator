export interface PatrolValidationIssue {
  line?: number
  message: string
}

export interface PatrolValidationResult {
  ok: boolean
  format: 'A' | 'B' | null
  issues: PatrolValidationIssue[]
  warnings: PatrolValidationIssue[]
}

const NUMBER = /^-?\d+(\.\d+)?$/
const IDENTIFIER = /^[A-Za-z0-9_]+$/
const METADATA_PREFIX = /^<(metadata|parameters)>/i

function annotationSize(text: string): number {
  return new TextEncoder().encode(text).length
}

function validateMetadataLine(line: string, index: number, issues: PatrolValidationIssue[], warnings: PatrolValidationIssue[]) {
  const trimmed = line.trim()
  const lineNumber = index + 1

  if (/^<metadata>/i.test(trimmed)) {
    if (!/<\/metadata>$/i.test(trimmed)) {
      issues.push({ line: lineNumber, message: 'The <metadata> line must end with </metadata>.' })
      return
    }
    const content = trimmed.slice('<metadata>'.length, trimmed.length - '</metadata>'.length).trim()
    if (!content) {
      issues.push({ line: lineNumber, message: 'The <metadata> line is empty.' })
      return
    }
    for (const entry of content.split(',')) {
      const separator = entry.indexOf('=')
      if (separator <= 0) {
        issues.push({ line: lineNumber, message: `Invalid metadata entry "${entry.trim()}". Expected key=value.` })
        continue
      }
      const key = entry.slice(0, separator).trim()
      const value = entry.slice(separator + 1).trim()
      if (key !== 'MonitorTypeName' && key !== 'I2D') {
        issues.push({ line: lineNumber, message: `Unsupported metadata tag "${key}". Only MonitorTypeName and I2D are allowed.` })
      } else if (key === 'I2D' && !/^(true|false)$/i.test(value)) {
        issues.push({ line: lineNumber, message: `I2D must be true or false (got "${value}").` })
      } else if (key === 'MonitorTypeName' && !IDENTIFIER.test(value)) {
        warnings.push({ line: lineNumber, message: `MonitorTypeName "${value}" should use only letters, digits and underscores.` })
      }
    }
    return
  }

  if (!/<\/parameters>$/i.test(trimmed)) {
    issues.push({ line: lineNumber, message: 'The <parameters> line must end with </parameters>.' })
    return
  }
  const content = trimmed.slice('<parameters>'.length, trimmed.length - '</parameters>'.length).trim()
  if (!content) {
    issues.push({ line: lineNumber, message: 'The <parameters> line is empty.' })
    return
  }
  if (index > 1) {
    issues.push({ line: lineNumber, message: 'The <parameters> line must be the first or second line of the output.' })
  }
  for (const entry of content.split('|')) {
    const parts = entry.split(',')
    const name = (parts.shift() || '').trim()
    if (!name) {
      issues.push({ line: lineNumber, message: 'A <parameters> entry is missing its metric name.' })
      continue
    }
    if (!IDENTIFIER.test(name)) {
      warnings.push({ line: lineNumber, message: `Metric name "${name}" should use only letters, digits and underscores.` })
    }
    for (const setting of parts) {
      const separator = setting.indexOf(':')
      if (separator <= 0) {
        issues.push({ line: lineNumber, message: `Invalid parameter setting "${setting.trim()}". Expected key:value.` })
        continue
      }
      const key = setting.slice(0, separator).trim()
      const value = setting.slice(separator + 1).trim()
      if (key !== 'kpi' && key !== 'units') {
        issues.push({ line: lineNumber, message: `Unsupported parameter setting "${key}". Only kpi and units are allowed.` })
      } else if (key === 'units' && /[|,:]/.test(value)) {
        issues.push({ line: lineNumber, message: 'Parameter units must not contain pipe, comma or colon.' })
      }
    }
  }
}

export function validatePatrolOutput(raw: string): PatrolValidationResult {
  const issues: PatrolValidationIssue[] = []
  const warnings: PatrolValidationIssue[] = []
  const finish = (format: 'A' | 'B' | null): PatrolValidationResult => ({
    ok: issues.length === 0,
    format,
    issues,
    warnings,
  })

  const text = String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!text.trim()) {
    issues.push({ message: 'There is no standard output to validate.' })
    return finish(null)
  }

  const lines = text.split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) {
    issues.push({ message: 'There is no standard output to validate.' })
    return finish(null)
  }

  let bodyStart = 0
  while (bodyStart < lines.length && METADATA_PREFIX.test(lines[bodyStart].trim())) {
    validateMetadataLine(lines[bodyStart], bodyStart, issues, warnings)
    bodyStart += 1
  }

  const body = lines.slice(bodyStart)
  if (body.length === 0) {
    issues.push({ message: 'Only metadata was found. The script must also output a metric value.' })
    return finish(null)
  }

  const bodyLines = body.map((line, offset) => ({ line, number: bodyStart + offset + 1 }))
  const nonEmpty = bodyLines.filter(entry => entry.line.trim() !== '' && !METADATA_PREFIX.test(entry.line.trim()))
  if (nonEmpty.length === 0) {
    issues.push({ message: 'There is no metric output to validate.' })
    return finish(null)
  }

  const firstEntry = nonEmpty[0]
  const firstContentIndex = bodyLines.indexOf(firstEntry)
  for (let index = 0; index < firstContentIndex; index += 1) {
    issues.push({ line: bodyLines[index].number, message: 'Blank lines are not allowed before the first output line.' })
  }
  for (const entry of bodyLines) {
    if (METADATA_PREFIX.test(entry.line.trim())) {
      issues.push({ line: entry.number, message: 'Metadata lines must appear at the top of the output.' })
    }
  }

  const first = firstEntry.line.trim()
  if (NUMBER.test(first)) {
    const annotation = bodyLines.slice(firstContentIndex + 1).map(entry => entry.line).join('\n')
    if (annotationSize(annotation) > 32 * 1024) {
      issues.push({ message: 'The annotation attached to the value exceeds the 32 KB limit.' })
    }
    return finish('A')
  }

  if (/^-?\d/.test(first)) {
    issues.push({ line: firstEntry.number, message: 'Format A requires line 1 to contain only the number (no units, text or extra characters).' })
    return finish(null)
  }

  for (let index = firstContentIndex; index < bodyLines.length; index += 1) {
    if (!bodyLines[index].line.trim()) {
      issues.push({ line: bodyLines[index].number, message: 'Blank lines are not allowed in the script output.' })
    }
  }

  let monitorType = ''
  let metricSignature = ''
  let namedMetrics: boolean | null = null

  for (const entry of nonEmpty) {
    const trimmed = entry.line.trim()
    const separator = trimmed.indexOf('=')
    if (separator <= 0) {
      issues.push({ line: entry.number, message: 'Expected MonitorTypeName=InstanceName followed by metric values.' })
      continue
    }
    const typeName = trimmed.slice(0, separator).trim()
    const rest = trimmed.slice(separator + 1)
    const comma = rest.indexOf(',')
    if (comma <= 0) {
      issues.push({ line: entry.number, message: 'Expected an instance name followed by at least one metric value.' })
      continue
    }
    const instanceName = rest.slice(0, comma).trim()
    const metricParts = rest.slice(comma + 1).split(',')

    if (!typeName) issues.push({ line: entry.number, message: 'The monitor type name is empty.' })
    if (!instanceName) issues.push({ line: entry.number, message: 'The instance name is empty.' })
    if (instanceName.includes('|')) {
      issues.push({ line: entry.number, message: 'Instance names must not contain the pipe character "|".' })
    }
    if (typeName && !IDENTIFIER.test(typeName)) {
      warnings.push({ line: entry.number, message: `Monitor type "${typeName}" should use only letters, digits and underscores.` })
    }
    if (instanceName && !IDENTIFIER.test(instanceName)) {
      warnings.push({ line: entry.number, message: `Instance name "${instanceName}" should use only letters, digits and underscores.` })
    }

    if (!monitorType) monitorType = typeName
    else if (monitorType !== typeName) {
      issues.push({ line: entry.number, message: `All lines must use the same monitor type (expected "${monitorType}", got "${typeName}").` })
    }

    const names: string[] = []
    const named = metricParts.length > 0 && metricParts[0].includes('=')
    if (namedMetrics === null) namedMetrics = named
    else if (namedMetrics !== named) {
      issues.push({ line: entry.number, message: 'Do not mix named and positional metric values in the same output.' })
    }

    metricParts.forEach((part, metricIndex) => {
      if (named) {
        const metricSeparator = part.indexOf('=')
        if (metricSeparator <= 0) {
          issues.push({ line: entry.number, message: `Metric ${metricIndex + 1} must be written as name=number.` })
          return
        }
        const name = part.slice(0, metricSeparator).trim()
        const value = part.slice(metricSeparator + 1).trim()
        if (!name) {
          issues.push({ line: entry.number, message: `Metric ${metricIndex + 1} has an empty name.` })
        } else if (names.includes(name)) {
          issues.push({ line: entry.number, message: `Metric name "${name}" is duplicated on the same line.` })
        } else {
          names.push(name)
          if (!IDENTIFIER.test(name)) {
            warnings.push({ line: entry.number, message: `Metric name "${name}" should use only letters, digits and underscores.` })
          }
        }
        if (!NUMBER.test(value)) {
          issues.push({ line: entry.number, message: `Metric "${name || `#${metricIndex + 1}`}" must be a bare number without units or text (got "${value}").` })
        }
      } else {
        const value = part.trim()
        names.push(`Value${metricIndex + 1}`)
        if (!value) {
          issues.push({ line: entry.number, message: `Metric ${metricIndex + 1} has an empty value.` })
        } else if (!NUMBER.test(value)) {
          issues.push({ line: entry.number, message: `Metric ${metricIndex + 1} must be a bare number without units or text (got "${value}").` })
        }
      }
    })

    const signature = names.join(',')
    if (!metricSignature) metricSignature = signature
    else if (metricSignature !== signature) {
      issues.push({ line: entry.number, message: 'All lines must use the same metric names in the same order.' })
    }
  }

  return finish('B')
}
