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

// ─── Tool Bubble ────────────────────────────────────────────────────────────

function ToolBubble({ content }: { content: string }) {
  const [open, setOpen] = useState(false)

  // חלץ את שם הסקיל מה-JSON שמגיע מה-backend
  const skillName = useMemo(() => {
    try {
      const parsed = JSON.parse(content)
      // הפורמט שמחזיר הסקיל שלנו: { skill: "skill_name", ... }
      if (parsed?.skill) return parsed.skill
      // גיבוי: metadata_json
      if (parsed?.metadata?.skill) return parsed.metadata.skill
    } catch {
      // תוכן גולמי — ננסה regex
      const match = content.match(/'skill':\s*'([^']+)'|"skill":\s*"([^"]+)"/)
      if (match) return match[1] || match[2]
    }
    return 'skill'
  }, [content])

  // הצג שם ידידותי
  const displayName = skillName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase())

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
      {/* שורת הכותרת — תמיד גלויה */}
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
      >
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease',
            fontSize: 10,
          }}
        >
          ▶
        </span>
        <span style={{ color: '#7c3aed', fontWeight: 600 }}>⚡</span>
        <span>שימוש בסקיל: <strong>{displayName}</strong></span>
      </button>

      {/* תוכן מפורט — נפתח בלחיצה */}
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {formatToolContent(content)}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

// המר את תוכן ה-tool ל-markdown קריא
function formatToolContent(raw: string): string {
  try {
    // 1. ניסיון ראשון: פענוח כ-JSON תקני
    const parsed = JSON.parse(raw);
    if (parsed?.knowledge) return parsed.knowledge;
    return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
  } catch {
    // 2. ניסיון שני: חילוץ ידני של תוכן ה-knowledge (עבור אובייקטים עם גרשיים בודדים)
    // אנחנו מחפשים את מה שבין 'knowledge': ' לבין הסגירה שלו
    const knowledgeMatch = raw.match(/['"]knowledge['"]:\s*['"]([\s\S]*?)['"]\s*,\s*['"]user_question['"]/);
    
    if (knowledgeMatch && knowledgeMatch[1]) {
      // טיפול בתווי מילוט כמו n\
      return knowledgeMatch[1].replace(/\\n/g, '\n').replace(/\\'/g, "'");
    }

    // 3. אם זה אובייקט כללי, ננסה להפוך אותו לקריא יותר ע"י ירידות שורה בסיסיות
    return raw.replace(/', '/g, "',\n'").replace(/{'/g, "{\n'");
  }
}

// ─── ChatPage ────────────────────────────────────────────────────────────────

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
        <h2 style={{ marginTop: 0 }}>התחל שיחה חדשה</h2>
        <button
          onClick={async () => {
            const created = await api.createChat(token!)
            qc.invalidateQueries({ queryKey: ['chats'] })
            nav(`/c/${created.chat.id}`)
          }}
        >
          צור שיחה
        </button>
      </div>
    )
  }

  if (messagesQuery.isError) {
    return <div style={{ color: '#b91c1c' }}>שגיאה בטעינת הודעות</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr auto', height: 'calc(100vh - 32px)' }}>
      <div style={{ overflow: 'auto', paddingRight: 8 }}>
        {messagesQuery.isLoading ? (
          <div>טוען…</div>
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
              ) : it.msg.role === 'tool' ? (
                // ── הודעת tool — bubble מיוחד עם accordion ──
                <ToolBubble key={it.msg.id} content={it.msg.content} />
              ) : (
                // ── הודעות רגילות: user / assistant ──
                <div
                  key={it.msg.id}
                  className={`msgBubble ${it.msg.role === 'user' ? 'msgUser' : 'msgAssistant'}`}
                  style={{
                    alignSelf: it.msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                  }}
                >
                  {/* תווית שולח */}
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                    {it.msg.role === 'user' ? 'אתה' : 'My Law'}
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

            {/* מצב המתנה */}
            {sendMutation.isPending ? (
              <div style={{ color: '#6b7280', fontSize: 13 }}>My Law חושב…</div>
            ) : null}

            {/* streaming bubble */}
            {streaming ? (
              <div
                className="msgBubble msgAssistant"
                style={{ alignSelf: 'flex-start', maxWidth: '80%' }}
              >
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>My Law</div>
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
            placeholder="שאל שאלה משפטית…"
            style={{ flex: 1 }}
          />
          <button disabled={sendMutation.isPending || streaming} type="submit" style={{
            backgroundColor: (sendMutation.isPending || streaming) ? '#a8d5ba' : '#4CAF50',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '5px',
            cursor: (sendMutation.isPending || streaming) ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.3s ease', // אנימציה חלקה למעבר צבע
            opacity: (sendMutation.isPending || streaming) ? 0.7 : 1
  }}>
            שלח
          </button>
        </div>
      </form>
    </div>
  )
}