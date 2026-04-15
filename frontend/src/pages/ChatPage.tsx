import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api/client'
import type { MessageOut } from '../api/types'
import { useAuth } from '../state/auth.tsx'

type OptimisticMsg = MessageOut & { optimistic?: true }

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export function ChatPage() {
  const { token } = useAuth()
  const { chatId } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

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
  }, [messagesQuery.data, sendMutation.isPending, streaming, streamText])

  const mergedMessages = useMemo(() => {
    const server = messagesQuery.data ?? []
    if (!optimistic.length) return server
    return [...server, ...optimistic]
  }, [messagesQuery.data, optimistic])

  const items = useMemo(() => {
    const msgs = mergedMessages
    const grouped: Array<{ kind: 'date'; label: string } | { kind: 'msg'; msg: MessageOut }> = []
    let lastDate: string | null = null
    for (const m of msgs) {
      if (!lastDate || !isSameDay(lastDate, m.created_at)) {
        lastDate = m.created_at
        grouped.push({ kind: 'date', label: new Date(lastDate).toLocaleDateString() })
      }
      grouped.push({ kind: 'msg', msg: m })
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
          <div>Loading…</div>
        ) : (
          <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it, idx) =>
              it.kind === 'date' ? (
                <div
                  key={`d-${idx}`}
                  style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, margin: '14px 0 4px' }}
                >
                  {it.label}
                </div>
              ) : (
                <div
                  key={it.msg.id}
                  className={`msgBubble ${it.msg.role === 'user' ? 'msgUser' : 'msgAssistant'}`}
                  style={{
                    alignSelf: it.msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{it.msg.role}</div>
                  {it.msg.role === 'assistant' || it.msg.role === 'tool' ? (
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
              <div style={{ color: '#6b7280', fontSize: 13 }}>Assistant is thinking…</div>
            ) : null}
            {streaming ? (
              <div
                className="msgBubble msgAssistant"
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '80%',
                }}
              >
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>assistant</div>
                <div className="md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText || '…'}</ReactMarkdown>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Ask something… (try "/tool time_now {}")'
            style={{ flex: 1 }}
          />
          <button disabled={sendMutation.isPending || streaming} type="submit">
            Send
          </button>
        </div>
      </form>
    </div>
  )
}

