import type { AgenticChatRecord } from '../utils/fileApi'

const DATABASE_NAME = 'mx-rma-agentic-chats'
const STORE_NAME = 'chats'
let databasePromise: Promise<IDBDatabase> | undefined
const saveQueues = new Map<string, Promise<void>>()

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open chat history storage.'))
    request.onblocked = () => reject(new Error('Chat history storage is blocked by another app tab.'))
  })
  return databasePromise
}

function readAll(database: IDBDatabase): Promise<AgenticChatRecord[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result as AgenticChatRecord[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    request.onerror = () => reject(request.error ?? new Error('Unable to read chat history.'))
  })
}

export async function listAgenticChats(): Promise<AgenticChatRecord[]> {
  if (window.electronAPI.isElectron) return window.electronAPI.listAgenticChats()
  return readAll(await openDatabase())
}

export async function loadAgenticChat(id: string): Promise<AgenticChatRecord | null> {
  if (window.electronAPI.isElectron) return window.electronAPI.loadAgenticChat(id)
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve((request.result as AgenticChatRecord | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Unable to load this chat.'))
  })
}

export async function saveAgenticChat(chat: AgenticChatRecord): Promise<void> {
  const previous = saveQueues.get(chat.id) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    if (window.electronAPI.isElectron) return window.electronAPI.saveAgenticChat(chat)
    const database = await openDatabase()
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(chat)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save this chat.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Chat save was interrupted.'))
    })
  })
  saveQueues.set(chat.id, next)
  try {
    await next
  } finally {
    if (saveQueues.get(chat.id) === next) saveQueues.delete(chat.id)
  }
}

export async function deleteAgenticChat(id: string): Promise<void> {
  const previous = saveQueues.get(id)
  if (previous) await previous.catch(() => {})
  if (window.electronAPI.isElectron) return window.electronAPI.deleteAgenticChat(id)
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Unable to delete this chat.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Chat deletion was interrupted.'))
  })
}
