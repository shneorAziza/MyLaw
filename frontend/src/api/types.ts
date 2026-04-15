export type TokenOut = {
  access_token: string
  token_type: 'bearer'
}

export type UserOut = {
  id: string
  email: string
  created_at: string
}

export type ChatOut = {
  id: string
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

