export type DiffLineType = 'context' | 'added' | 'removed'

export interface DiffLine {
  type: DiffLineType
  text: string
  oldLine?: number
  newLine?: number
}

type EditLine = { type: DiffLineType; text: string }

function splitLines(text: string): string[] {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function lcsEdits(oldLines: string[], newLines: string[]): EditLine[] {
  const oldCount = oldLines.length
  const newCount = newLines.length

  if (oldCount === 0) return newLines.map(text => ({ type: 'added', text }))
  if (newCount === 0) return oldLines.map(text => ({ type: 'removed', text }))

  if (oldCount * newCount > 4_000_000) {
    return [
      ...oldLines.map(text => ({ type: 'removed' as const, text })),
      ...newLines.map(text => ({ type: 'added' as const, text })),
    ]
  }

  const table: Uint32Array[] = Array.from({ length: oldCount + 1 }, () => new Uint32Array(newCount + 1))
  for (let oldIndex = oldCount - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = newCount - 1; newIndex >= 0; newIndex--) {
      table[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1])
    }
  }

  const edits: EditLine[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldCount && newIndex < newCount) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      edits.push({ type: 'context', text: oldLines[oldIndex] })
      oldIndex++
      newIndex++
    } else if (table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]) {
      edits.push({ type: 'removed', text: oldLines[oldIndex] })
      oldIndex++
    } else {
      edits.push({ type: 'added', text: newLines[newIndex] })
      newIndex++
    }
  }
  while (oldIndex < oldCount) edits.push({ type: 'removed', text: oldLines[oldIndex++] })
  while (newIndex < newCount) edits.push({ type: 'added', text: newLines[newIndex++] })
  return edits
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)

  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++

  let oldSuffix = oldLines.length - 1
  let newSuffix = newLines.length - 1
  while (oldSuffix >= prefix && newSuffix >= prefix && oldLines[oldSuffix] === newLines[newSuffix]) {
    oldSuffix--
    newSuffix--
  }

  const result: DiffLine[] = []
  for (let index = 0; index < prefix; index++) {
    result.push({ type: 'context', text: oldLines[index], oldLine: index + 1, newLine: index + 1 })
  }

  const edits = lcsEdits(oldLines.slice(prefix, oldSuffix + 1), newLines.slice(prefix, newSuffix + 1))
  let oldLine = prefix + 1
  let newLine = prefix + 1
  for (const edit of edits) {
    if (edit.type === 'context') {
      result.push({ type: 'context', text: edit.text, oldLine: oldLine++, newLine: newLine++ })
    } else if (edit.type === 'removed') {
      result.push({ type: 'removed', text: edit.text, oldLine: oldLine++ })
    } else {
      result.push({ type: 'added', text: edit.text, newLine: newLine++ })
    }
  }

  for (let index = oldSuffix + 1, newIndex = newSuffix + 1; index < oldLines.length; index++, newIndex++) {
    result.push({ type: 'context', text: oldLines[index], oldLine: index + 1, newLine: newIndex + 1 })
  }

  return result
}

export function diffStats(lines: DiffLine[]): { added: number, removed: number } {
  return lines.reduce(
    (stats, line) => {
      if (line.type === 'added') stats.added++
      else if (line.type === 'removed') stats.removed++
      return stats
    },
    { added: 0, removed: 0 },
  )
}
