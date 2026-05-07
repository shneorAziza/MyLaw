import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, ApiError } from '../api/client'
import type { MessageOut } from '../api/types'
import { useAuth } from '../state/auth.tsx'

type OptimisticMsg = MessageOut & { optimistic?: true }

type AttachmentMetadata = {
  document_id?: string
  file_name?: string
  file_type?: string
  chunks_count?: number
}

type TimelineItem = { kind: 'date'; label: string } | { kind: 'msg'; msg: MessageOut }

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function getAttachment(msg: MessageOut): AttachmentMetadata | null {
  const attachment = msg.metadata_json?.attachment
  if (!attachment || typeof attachment !== 'object') return null
  return attachment as AttachmentMetadata
}

function ToolBubble({ content }: { content: string }) {
  const [open, setOpen] = useState(false)

  const skillName = useMemo(() => {
    try {
      const parsed = JSON.parse(content)
      if (parsed?.skill) return parsed.skill
      if (parsed?.metadata?.skill) return parsed.metadata.skill
    } catch {
      const match = content.match(/'skill':\s*'([^']+)'|"skill":\s*"([^"]+)"/)
      if (match) return match[1] || match[2]
    }
    return 'skill'
  }, [content])

  const displayName = skillName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '5px 10px',
          cursor: 'pointer',
          color: '#6b7280',
          fontSize: 12,
          fontFamily: 'inherit',
        }}
        type="button"
      >
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease',
            fontSize: 10,
          }}
        >
          {'>'}
        </span>
        <span style={{ color: '#7c3aed', fontWeight: 600 }}>*</span>
        <span>
          Skill used: <strong>{displayName}</strong>
        </span>
      </button>

      {open && (
        <div
          style={{
            marginTop: 4,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: '10px 14px',
            background: '#f9fafb',
            fontSize: 13,
            color: '#374151',
          }}
        >
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatToolContent(content)}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

function formatToolContent(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.knowledge) return parsed.knowledge
    return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```'
  } catch {
    const knowledgeMatch = raw.match(/['"]knowledge['"]:\s*['"]([\s\S]*?)['"]\s*,\s*['"]user_question['"]/)
    if (knowledgeMatch?.[1]) {
      return knowledgeMatch[1].replace(/\\n/g, '\n').replace(/\\'/g, "'")
    }
    return raw.replace(/', '/g, "',\n'").replace(/{'/g, "{\n'")
  }
}

function AttachmentBubble({ msg }: { msg: MessageOut }) {
  const attachment = getAttachment(msg)
  if (!attachment) return null

  return (
    <div
      className="msgBubble msgUser"
      style={{
        alignSelf: 'flex-end',
        maxWidth: '80%',
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        {attachment.file_type?.startsWith('image/') ? 'Image attached' : 'Document attached'}
      </div>
      <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{attachment.file_name ?? msg.content}</div>
      <div style={{ color: '#475569', fontSize: 13 }}>
        Indexed for this chat ({attachment.chunks_count ?? 0} chunks)
      </div>
    </div>
  )
}

export function ChatPage() {
  const { token } = useAuth()
  const { chatId } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const messagesQuery = useQuery({
    queryKey: ['messages', chatId],
    queryFn: () => api.listMessages(token!, chatId!),
    enabled: !!token && !!chatId,
  })

  const sendMutation = useMutation({
    mutationFn: async (content: string) => api.sendMessage(token!, chatId!, content),
    onSuccess: async () => {
      setOptimistic([])
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['messages', chatId] }),
        qc.invalidateQueries({ queryKey: ['chats'] }),
      ])
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => api.uploadDocument(token!, file, chatId!),
    onMutate: (file) => {
      setUploadNotice(`Uploading and indexing ${file.name}...`)
    },
    onSuccess: async () => {
      setUploadNotice(null)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['messages', chatId] }),
        qc.invalidateQueries({ queryKey: ['chats'] }),
      ])
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Upload failed'
      setUploadNotice(msg)
    },
  })

  const onPickFile = () => {
    fileInputRef.current?.click()
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      setUploadNotice('Only PDF and image files are supported')
      return
    }
    uploadMutation.mutate(file)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    setText('')

    const nowIso = new Date().toISOString()
    const tempId = `optimistic-${nowIso}-${Math.random().toString(16).slice(2)}`
    setOptimistic((prev) => [
      ...prev,
      {
        id: tempId,
        chat_id: chatId!,
        role: 'user',
        content,
        created_at: nowIso,
        metadata_json: {},
        optimistic: true,
      },
    ])

    if (api.useStreaming()) {
      setStreaming(true)
      setStreamText('')
      try {
        await api.streamSendMessage(token!, chatId!, content, {
          onDelta: (d) => setStreamText((prev) => prev + d),
          onDone: async () => {
            setStreaming(false)
            setStreamText('')
            setOptimistic([])
            await Promise.all([
              qc.invalidateQueries({ queryKey: ['messages', chatId] }),
              qc.invalidateQueries({ queryKey: ['chats'] }),
            ])
          },
        })
      } finally {
        setStreaming(false)
      }
      return
    }

    await sendMutation.mutateAsync(content)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesQuery.data, sendMutation.isPending, streaming, streamText, uploadMutation.isPending])

  const mergedMessages = useMemo(() => {
    const server = messagesQuery.data ?? []
    if (!optimistic.length) return server
    return [...server, ...optimistic]
  }, [messagesQuery.data, optimistic])

  const items = useMemo(() => {
    const grouped: TimelineItem[] = []
    let lastDate: string | null = null
    for (const msg of mergedMessages) {
      if (!lastDate || !isSameDay(lastDate, msg.created_at)) {
        lastDate = msg.created_at
        grouped.push({ kind: 'date', label: new Date(lastDate).toLocaleDateString() })
      }
      grouped.push({ kind: 'msg', msg })
    }
    return grouped
  }, [mergedMessages])

  if (!chatId) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0 }}>Start a new chat</h2>
        <button
          onClick={async () => {
            const created = await api.createChat(token!)
            qc.invalidateQueries({ queryKey: ['chats'] })
            nav(`/c/${created.chat.id}`)
          }}
          type="button"
        >
          Create chat
        </button>
      </div>
    )
  }

  if (messagesQuery.isError) {
    return <div style={{ color: '#b91c1c' }}>Failed to load messages</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr auto', height: 'calc(100vh - 32px)' }}>
      <div style={{ overflow: 'auto', paddingRight: 8 }}>
        {messagesQuery.isLoading ? (
          <div>Loading...</div>
        ) : (
          <div
            style={{
              maxWidth: 860,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {items.map((it, idx) =>
              it.kind === 'date' ? (
                <div
                  key={`d-${idx}`}
                  style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, margin: '14px 0 4px' }}
                >
                  {it.label}
                </div>
              ) : getAttachment(it.msg) ? (
                <AttachmentBubble key={it.msg.id} msg={it.msg} />
              ) : it.msg.role === 'tool' ? (
                <ToolBubble key={it.msg.id} content={it.msg.content} />
              ) : (
                <div
                  key={it.msg.id}
                  className={`msgBubble ${it.msg.role === 'user' ? 'msgUser' : 'msgAssistant'}`}
                  style={{
                    alignSelf: it.msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                    {it.msg.role === 'user' ? 'You' : 'My Law'}
                  </div>

                  {it.msg.role === 'assistant' ? (
                    <div className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{it.msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{it.msg.content}</div>
                  )}
                </div>
              ),
            )}

            {sendMutation.isPending ? (
              <div style={{ color: '#6b7280', fontSize: 13 }}>My Law is thinking...</div>
            ) : null}

            {streaming ? (
              <div className="msgBubble msgAssistant" style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>My Law</div>
                <div className="md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText || '...'}</ReactMarkdown>
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {uploadNotice ? (
            <div
              style={{
                color: uploadMutation.isError ? '#b91c1c' : '#475569',
                fontSize: 13,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {uploadMutation.isPending ? <span className="miniSpinner" /> : null}
              <span>{uploadNotice}</span>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,image/*"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={onPickFile}
              disabled={uploadMutation.isPending || sendMutation.isPending || streaming}
              title="Upload PDF or image"
              style={{
                minWidth: 54,
                backgroundColor: uploadMutation.isPending ? '#e2e8f0' : '#ffffff',
                color: '#0f172a',
                borderColor: '#cbd5e1',
                padding: '10px 12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {uploadMutation.isPending ? <span className="miniSpinner" /> : null}
              File
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a legal question..."
              style={{ flex: 1 }}
            />
            <button
              disabled={sendMutation.isPending || streaming}
              type="submit"
              style={{
                backgroundColor: sendMutation.isPending || streaming ? '#a8d5ba' : '#4CAF50',
                color: 'white',
                padding: '10px 20px',
                border: 'none',
                borderRadius: '5px',
                cursor: sendMutation.isPending || streaming ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.3s ease',
                opacity: sendMutation.isPending || streaming ? 0.7 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
