import type {
  ChatOut,
  DocumentSearchHit,
  MessageOut,
  SendMessageOut,
  TokenOut,
  UploadDocumentOut,
  UserOut,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const USE_STREAMING = (import.meta.env.VITE_USE_STREAMING ?? 'true').toString() === 'true'

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

const TOKEN_KEY = 'gpt_like_token'

function handleUnauthorized() {
  localStorage.removeItem(TOKEN_KEY)
  // hard redirect to reset in-memory state/query cache
  if (window.location.pathname !== '/login') window.location.href = '/login'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  })

  const text = await res.text()
  const body = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    const msg = (body as any)?.detail ?? `Request failed: ${res.status}`
    throw new ApiError(res.status, msg, body)
  }
  return body as T
}

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const api = {
  register: (email: string, password: string) =>
    request<TokenOut>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<TokenOut>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<UserOut>('/auth/me', { headers: authHeaders(token) }),

  listChats: (token: string) => request<ChatOut[]>('/chats', { headers: authHeaders(token) }),
  createChat: (token: string) => request<{ chat: ChatOut }>('/chats', { method: 'POST', headers: authHeaders(token) }),
  getChat: (token: string, chatId: string) => request<ChatOut>(`/chats/${chatId}`, { headers: authHeaders(token) }),
  deleteChat: (token: string, chatId: string) =>
    request<void>(`/chats/${chatId}`, { method: 'DELETE', headers: authHeaders(token) }),

  listMessages: (token: string, chatId: string) =>
    request<MessageOut[]>(`/chats/${chatId}/messages`, { headers: authHeaders(token) }),
  sendMessage: (token: string, chatId: string, content: string) =>
    request<SendMessageOut>(`/chats/${chatId}/messages`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ content }),
    }),

  uploadDocument: async (token: string, file: File, chatId?: string | null) => {
    const form = new FormData()
    form.append('file', file)

    const query = chatId ? `?chat_id=${encodeURIComponent(chatId)}` : ''
    const res = await fetch(`${API_BASE}/uploads/${query}`, {
      method: 'POST',
      headers: authHeaders(token),
      body: form,
    })

    const text = await res.text()
    const body = text ? (JSON.parse(text) as unknown) : null
    if (!res.ok) {
      if (res.status === 401) handleUnauthorized()
      const msg = (body as any)?.detail ?? `Request failed: ${res.status}`
      throw new ApiError(res.status, msg, body)
    }
    return body as UploadDocumentOut
  },

  searchDocuments: (token: string, query: string, options: { chatId?: string | null; limit?: number } = {}) =>
    request<DocumentSearchHit[]>('/uploads/search', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        query,
        chat_id: options.chatId ?? null,
        limit: options.limit ?? 5,
      }),
    }),

  useStreaming: () => USE_STREAMING,

  streamSendMessage: async (
    token: string,
    chatId: string,
    content: string,
    handlers: {
      onDelta: (delta: string) => void
      onDone: (result: SendMessageOut) => void
    },
  ) => {
    const res = await fetch(`${API_BASE}/chats/${chatId}/messages:stream`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      const body = text ? (JSON.parse(text) as unknown) : null
      if (res.status === 401) handleUnauthorized()
      const msg = (body as any)?.detail ?? `Request failed: ${res.status}`
      throw new ApiError(res.status, msg, body)
    }

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() ?? ''
      for (const part of parts) {
        const line = part
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('data: '))
        if (!line) continue
        const payload = JSON.parse(line.slice('data: '.length)) as any
        if (payload.type === 'delta') handlers.onDelta(payload.delta as string)
        if (payload.type === 'done') handlers.onDone(payload as SendMessageOut)
      }
    }
  },
}
