const CPP_DIRECTIVE = /^#\s*(include|define|if|ifdef|ifndef|endif|else|elif|undef|pragma|error|line)\b/i
const REM_COMMENT = /^rem\b/i

function splitLines(text: string): string[] {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function leadingWhitespace(line: string): string {
  return line.match(/^[ \t]*/)?.[0] ?? ''
}

function classifyCommentLines(lines: string[]): boolean[] {
  const isComment = new Array<boolean>(lines.length).fill(false)
  let blockEnd: string | null = null

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    if (blockEnd) {
      isComment[index] = true
      if (trimmed.includes(blockEnd)) blockEnd = null
      continue
    }
    if (!trimmed) continue
    if (trimmed.startsWith('<#')) {
      isComment[index] = true
      if (!trimmed.includes('#>', 2)) blockEnd = '#>'
      continue
    }
    if (trimmed.startsWith('/*')) {
      isComment[index] = true
      if (!trimmed.includes('*/', 2)) blockEnd = '*/'
      continue
    }
    if (trimmed.startsWith('<!--')) {
      isComment[index] = true
      if (!trimmed.includes('-->', 4)) blockEnd = '-->'
      continue
    }
    if (trimmed.startsWith('#!')) {
      isComment[index] = true
      continue
    }
    if (trimmed.startsWith('#')) {
      if (!CPP_DIRECTIVE.test(trimmed)) isComment[index] = true
      continue
    }
    if (
      trimmed.startsWith('//')
      || trimmed.startsWith(';')
      || trimmed.startsWith('--')
      || trimmed.startsWith('::')
      || trimmed.startsWith("'")
      || REM_COMMENT.test(trimmed)
    ) {
      isComment[index] = true
    }
  }

  return isComment
}

function nextCodeLineIndex(lines: string[], isComment: boolean[], from: number): number {
  for (let index = from; index < lines.length; index++) {
    if (!isComment[index] && lines[index].trim()) return index
  }
  return -1
}

function reindent(lines: string[], originalAnchor: string, fixedAnchor: string): string[] {
  const from = leadingWhitespace(originalAnchor)
  const to = leadingWhitespace(fixedAnchor)
  if (from === to) return lines
  return lines.map(line => line.startsWith(from) ? `${to}${line.slice(from.length)}` : line)
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const previous = new Array<number>(b.length + 1)
  const current = new Array<number>(b.length + 1)
  for (let index = 0; index <= b.length; index++) previous[index] = index

  for (let aIndex = 1; aIndex <= a.length; aIndex++) {
    current[0] = aIndex
    for (let bIndex = 1; bIndex <= b.length; bIndex++) {
      const cost = a.charCodeAt(aIndex - 1) === b.charCodeAt(bIndex - 1) ? 0 : 1
      current[bIndex] = Math.min(
        previous[bIndex] + 1,
        current[bIndex - 1] + 1,
        previous[bIndex - 1] + cost,
      )
    }
    for (let index = 0; index <= b.length; index++) previous[index] = current[index]
  }

  return previous[b.length]
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (!longest) return 1
  return 1 - levenshtein(a, b) / longest
}

/**
 * Restores comment lines from the original script when the code they document
 * still exists in the corrected script. Comments whose following code block was
 * removed are left out, which keeps intentionally deleted sections clean.
 */
export function preserveOriginalComments(original: string, fixed: string): string {
  if (!original?.trim() || !fixed?.trim()) return fixed

  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const originalLines = splitLines(original)
  const fixedLines = splitLines(fixed)
  const originalComments = classifyCommentLines(originalLines)
  const fixedComments = classifyCommentLines(fixedLines)

  if (!originalComments.some(Boolean)) return fixed

  const fixedCodeIndices = new Set<number>()
  fixedLines.forEach((line, index) => {
    if (!fixedComments[index] && line.trim()) fixedCodeIndices.add(index)
  })

  const fixedTrimmed = new Set(fixedLines.map(line => line.trim()))
  const shebang = originalLines[0]?.trim().startsWith('#!') ? originalLines[0] : ''
  const shebangPresent = fixedLines.some(line => line.trim().startsWith('#!'))

  let leadingEnd = 0
  while (leadingEnd < originalLines.length && (originalComments[leadingEnd] || !originalLines[leadingEnd].trim())) {
    leadingEnd++
  }
  const headerLines: string[] = []
  for (let headerIndex = 0; headerIndex < leadingEnd; headerIndex++) {
    if (originalComments[headerIndex]) headerLines.push(originalLines[headerIndex])
  }
  const missingHeader = headerLines.filter(line => {
    if (shebang && line === shebang) return false
    return !fixedTrimmed.has(line.trim())
  })

  const insertions = new Map<number, string[]>()
  let searchFrom = 0
  let index = leadingEnd

  while (index < originalLines.length) {
    if (!originalComments[index]) {
      index++
      continue
    }

    const blockStart = index
    while (index < originalLines.length && originalComments[index]) index++
    const block = originalLines.slice(blockStart, index)

    const anchorIndex = nextCodeLineIndex(originalLines, originalComments, index)
    if (anchorIndex === -1) continue

    const anchor = originalLines[anchorIndex]
    if (!anchor.trim()) continue

    let target = -1
    for (let candidate = searchFrom; candidate < fixedLines.length; candidate++) {
      if (!fixedCodeIndices.has(candidate)) continue
      if (fixedLines[candidate].trim() === anchor.trim()) {
        target = candidate
        break
      }
    }

    if (target === -1) {
      let bestScore = 0.7
      let inspected = 0
      for (let candidate = searchFrom; candidate < fixedLines.length && inspected < 60; candidate++) {
        if (!fixedCodeIndices.has(candidate)) continue
        inspected++
        const score = similarity(anchor.trim(), fixedLines[candidate].trim())
        if (score > bestScore) {
          bestScore = score
          target = candidate
        }
      }
    }

    if (target === -1) continue

    const missing = block.filter(line => {
      if (shebang && line === shebang) return false
      return !fixedTrimmed.has(line.trim())
    })
    if (missing.length) {
      const adjusted = reindent(missing, anchor, fixedLines[target])
      insertions.set(target, [...(insertions.get(target) ?? []), ...adjusted])
    }
    searchFrom = target
  }

  if (!insertions.size && !missingHeader.length && (shebangPresent || !shebang)) return fixed

  const result: string[] = []
  let skipFixedIndex = -1
  if (shebang) {
    if (shebangPresent) {
      const fixedShebangIndex = fixedLines.findIndex(line => line.trim().startsWith('#!'))
      if (fixedShebangIndex >= 0) {
        result.push(fixedLines[fixedShebangIndex])
        skipFixedIndex = fixedShebangIndex
      }
    } else {
      result.push(shebang)
    }
  }
  result.push(...missingHeader)
  fixedLines.forEach((line, lineIndex) => {
    if (lineIndex === skipFixedIndex) return
    const before = insertions.get(lineIndex)
    if (before) result.push(...before)
    result.push(line)
  })

  return result.join(eol)
}
