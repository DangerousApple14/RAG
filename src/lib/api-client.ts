/* ── Typed API client — Midnight Garage · RAG ──────────────────────────────
   Mirrors the backend contract in /home/z/my-project/worklog.md exactly.
   Every helper throws an ApiError carrying `.status` so the UI can react to
   401 responses by switching to the auth screen. */

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/* ── Contract types ─────────────────────────────────────────────────────── */

export interface User {
  id: string
  username: string
}

export type LlmProvider = 'api' | 'ollama' | 'built-in'
export type EmbeddingProvider = 'api' | 'ollama' | 'built-in'
export type OcrEngine = 'glm' | 'paddle'

export interface Settings {
  id?: string
  llmProvider: LlmProvider
  apiBaseUrl: string
  apiKey: string
  apiModel: string
  ollamaBaseUrl: string
  ollamaModel: string
  embeddingProvider: EmbeddingProvider
  embeddingApiBaseUrl: string | null
  embeddingApiKey: string | null
  embeddingModel: string
  ocrEnabled: boolean
  ocrEngine: OcrEngine
  glmModel: string
}

export type SettingsPatch = Partial<Omit<Settings, 'id'>>

export type DocumentStatus = 'processing' | 'ready' | 'error'

export interface RagDocument {
  id: string
  name: string
  size: number
  pages: number
  chunkCount: number
  status: DocumentStatus
  error: string | null
  createdAt: string
}

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Source {
  docId: string
  docName: string
  page: number
  score: number
}

export type MessageRole = 'user' | 'assistant'

/** Message exactly as GET /api/conversations/{id} returns it (sources = JSON string or null). */
export interface ApiMessage {
  id: string
  role: MessageRole
  content: string
  sources: string | null
  createdAt: string
}

export interface BackgroundsResponse {
  images: string[]
  current: string
}

export interface Capabilities {
  ollama: boolean
  paddle: boolean
  builtin: boolean
  ollamaUrl: string
}

export interface ChatStreamMeta {
  conversationId: string
  title: string
}

export interface ChatStreamDone {
  sources: Source[]
  messageId: string
}

type ChatStreamEvent =
  | ({ type: 'meta' } & ChatStreamMeta)
  | { type: 'token'; content: string }
  | ({ type: 'done' } & ChatStreamDone)
  | { type: 'error'; message: string }

/* ── File upload helpers ────────────────────────────────────────────────── */

export const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff'

const ACCEPTED_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
]

export function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/* ── Internal plumbing ──────────────────────────────────────────────────── */

function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const val = (body as Record<string, unknown>).error
    if (typeof val === 'string' && val.length > 0) return val
  }
  return fallback
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseHeaders: Record<string, string> = {}
  if (init.body != null && !(init.body instanceof FormData)) {
    baseHeaders['Content-Type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { ...baseHeaders, ...(init.headers as Record<string, string> | undefined) },
    })
  } catch {
    throw new ApiError('Network error — the local server is unreachable', 0)
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body: unknown = await res.json()
      message = extractErrorMessage(body, message)
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(message, res.status)
  }

  return (await res.json()) as T
}

/* ── Auth ───────────────────────────────────────────────────────────────── */

export async function register(username: string, password: string): Promise<{ user: User }> {
  return request<{ user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function login(username: string, password: string): Promise<{ user: User }> {
  return request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export async function me(): Promise<{ user: User }> {
  return request<{ user: User }>('/api/auth/me')
}

/* ── Settings ───────────────────────────────────────────────────────────── */

export async function getSettings(): Promise<{ settings: Settings }> {
  return request<{ settings: Settings }>('/api/settings')
}

export async function updateSettings(patch: SettingsPatch): Promise<{ settings: Settings }> {
  return request<{ settings: Settings }>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

/* ── Documents ──────────────────────────────────────────────────────────── */

export async function listDocuments(): Promise<{ documents: RagDocument[] }> {
  return request<{ documents: RagDocument[] }>('/api/documents')
}

export async function uploadDocuments(files: File[]): Promise<{ documents: RagDocument[] }> {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return request<{ documents: RagDocument[] }>('/api/documents', {
    method: 'POST',
    body: form,
  })
}

export async function deleteDocument(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/* ── Conversations ──────────────────────────────────────────────────────── */

export async function listConversations(): Promise<{ conversations: ConversationSummary[] }> {
  return request<{ conversations: ConversationSummary[] }>('/api/conversations')
}

export async function createConversation(title?: string): Promise<{ conversation: ConversationSummary }> {
  return request<{ conversation: ConversationSummary }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(title === undefined ? {} : { title }),
  })
}

export async function getConversation(
  id: string,
): Promise<{ conversation: ConversationSummary; messages: ApiMessage[] }> {
  return request<{ conversation: ConversationSummary; messages: ApiMessage[] }>(
    `/api/conversations/${encodeURIComponent(id)}`,
  )
}

export async function deleteConversation(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/* ── Misc ───────────────────────────────────────────────────────────────── */

export async function getBackgrounds(): Promise<BackgroundsResponse> {
  return request<BackgroundsResponse>('/api/backgrounds')
}

export async function getCapabilities(): Promise<Capabilities> {
  return request<Capabilities>('/api/capabilities')
}

/* ── Sources helper ─────────────────────────────────────────────────────── */

/** The conversation endpoint returns `sources` as a JSON string; parse safely. */
export function parseSources(raw: string | null): Source[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Source[]
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/* ── Chat streaming (SSE over POST, parsed manually) ────────────────────── */

export interface StreamChatOptions {
  conversationId?: string | null
  message: string
  signal?: AbortSignal
  onMeta: (meta: ChatStreamMeta) => void
  onToken: (token: string) => void
  onDone: (done: ChatStreamDone) => void
  onError: (message: string) => void
}

/**
 * POSTs to /api/chat and consumes the `text/event-stream` response.
 * Events arrive as `data: {json}\n\n`; HTTP-level failures throw ApiError
 * (so 401 can flip the UI to the auth screen) while in-stream `error`
 * events are dispatched to `onError`. Aborting the signal stops silently.
 */
export async function streamChat(options: StreamChatOptions): Promise<void> {
  const { conversationId = null, message, signal, onMeta, onToken, onDone, onError } = options

  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ conversationId, message }),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    throw new ApiError('Network error — could not reach the chat endpoint', 0)
  }

  if (!res.ok) {
    let message = `Chat failed (${res.status})`
    try {
      const body: unknown = await res.json()
      message = extractErrorMessage(body, message)
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(message, res.status)
  }

  if (!res.body) {
    throw new ApiError('Chat endpoint returned an empty stream', res.status)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatch = (rawEvent: string) => {
    for (const rawLine of rawEvent.split('\n')) {
      const line = rawLine.trimEnd()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trimStart()
      if (!payload) continue

      let event: ChatStreamEvent
      try {
        event = JSON.parse(payload) as ChatStreamEvent
      } catch {
        continue // malformed event — skip
      }

      switch (event.type) {
        case 'meta':
          onMeta({ conversationId: event.conversationId, title: event.title })
          break
        case 'token':
          onToken(event.content)
          break
        case 'done':
          onDone({
            sources: Array.isArray(event.sources) ? event.sources : [],
            messageId: event.messageId,
          })
          break
        case 'error':
          onError(event.message)
          break
      }
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // normalise CRLF so both \n\n and \r\n\r\n framings work
      buffer = buffer.replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        dispatch(chunk)
        boundary = buffer.indexOf('\n\n')
      }
    }
    // flush any trailing event that was not terminated by a blank line
    buffer += decoder.decode()
    if (buffer.trim().length > 0) dispatch(buffer)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    onError(err instanceof Error ? err.message : 'Chat stream failed')
  }
}
