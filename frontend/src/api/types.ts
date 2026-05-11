export type TokenOut = {
  access_token: string
  token_type: 'bearer'
}

export type UserOut = {
  id: string
  email: string
  created_at: string
}

export type ProjectOut = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type ChatOut = {
  id: string
  project_id: string
  title: string
  created_at: string
  updated_at: string
}

export type MessageOut = {
  id: string
  chat_id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  metadata_json: Record<string, unknown>
  created_at: string
}

export type SendMessageOut = {
  assistant_message: MessageOut
  message_ids: string[]
}

export type ModelProvider = 'gemini' | 'openai'

export type UploadDocumentOut = {
  id: string
  filename: string
  chunks_count: number
  message_id?: string | null
  status: 'success_and_indexed'
}

export type DocumentSearchHit = {
  document_id: string
  file_name: string
  chunk_id: number
  content: string
  score: number
}
