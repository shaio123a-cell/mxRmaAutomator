export interface ConfigFileEntry {
  path: string
  name: string
  timestamp: string
}

const RECENT_KEY = 'mx-rma-recent-config-files'
const FAVORITES_KEY = 'mx-rma-favorite-config-files'
const MAX_RECENT = 10
export const MAX_FAVORITES = 10

export interface ToggleFavoriteResult {
  favorited: boolean
  limitReached: boolean
}

export function fileBaseName(filePath: string): string {
  const trimmed = filePath.trim().replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

export function fileDirName(filePath: string): string {
  const trimmed = filePath.trim().replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (index < 0) return ''
  if (index === 0) return trimmed.slice(0, 1)
  if (index === 2 && /^[a-zA-Z]:$/.test(trimmed.slice(0, 2))) return `${trimmed.slice(0, 2)}\\`
  return trimmed.slice(0, index)
}

function pathKey(filePath: string): string {
  const normalized = filePath.trim().replace(/[\\/]+$/, '').replace(/\//g, '\\')
  const windows = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
  return windows ? normalized.toLowerCase() : normalized
}

function safeParse(raw: string | null): ConfigFileEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const candidate = item as Record<string, unknown>
      if (typeof candidate.path !== 'string' || !candidate.path.trim()) return []
      return [{
        path: candidate.path,
        name: typeof candidate.name === 'string' && candidate.name ? candidate.name : fileBaseName(candidate.path),
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : new Date(0).toISOString(),
      }]
    })
  } catch {
    return []
  }
}

function readEntries(key: string): ConfigFileEntry[] {
  try {
    return safeParse(window.localStorage.getItem(key))
  } catch {
    return []
  }
}

function writeEntries(key: string, entries: ConfigFileEntry[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(entries))
  } catch {
    // Recent and favorite lists are a convenience; ignore storage failures.
  }
}

export function getRecentFiles(): ConfigFileEntry[] {
  return readEntries(RECENT_KEY).sort((first, second) => second.timestamp.localeCompare(first.timestamp))
}

export function recordRecentFile(filePath: string): ConfigFileEntry[] {
  const key = pathKey(filePath)
  const entry: ConfigFileEntry = { path: filePath, name: fileBaseName(filePath), timestamp: new Date().toISOString() }
  const next = [entry, ...getRecentFiles().filter(item => pathKey(item.path) !== key)].slice(0, MAX_RECENT)
  writeEntries(RECENT_KEY, next)
  return next
}

export function removeRecentFile(filePath: string): ConfigFileEntry[] {
  const key = pathKey(filePath)
  const next = getRecentFiles().filter(item => pathKey(item.path) !== key)
  writeEntries(RECENT_KEY, next)
  return next
}

export function clearRecentFiles(): void {
  writeEntries(RECENT_KEY, [])
}

export function getFavoriteFiles(): ConfigFileEntry[] {
  return readEntries(FAVORITES_KEY).sort((first, second) => second.timestamp.localeCompare(first.timestamp))
}

export function isFavoriteFile(filePath: string): boolean {
  const key = pathKey(filePath)
  return getFavoriteFiles().some(item => pathKey(item.path) === key)
}

export function toggleFavoriteFile(filePath: string): ToggleFavoriteResult {
  const key = pathKey(filePath)
  const favorites = getFavoriteFiles()
  const exists = favorites.some(item => pathKey(item.path) === key)
  if (!exists && favorites.length >= MAX_FAVORITES) {
    return { favorited: false, limitReached: true }
  }
  const next = exists
    ? favorites.filter(item => pathKey(item.path) !== key)
    : [{ path: filePath, name: fileBaseName(filePath), timestamp: new Date().toISOString() }, ...favorites]
  writeEntries(FAVORITES_KEY, next)
  return { favorited: !exists, limitReached: false }
}
