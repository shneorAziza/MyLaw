import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, ApiError } from '../api/client'
import type { MessageOut, ModelProvider } from '../api/types'
import { useAuth } from '../state/auth.tsx'

type OptimisticMsg = MessageOut & { optimistic?: true }

type AttachmentMetadata = {
  document_id?: string
  file_name?: string
  file_type?: string
  chunks_count?: number
}

type TimelineItem = { kind: 'date'; label: string } | { kind: 'msg'; msg: MessageOut }

const MODEL_PROVIDER_KEY = 'my_law_model_provider'

function AttachFileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7V3Z" />
      <path d="M14 3v5h5" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  )
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function getAttachment(msg: MessageOut): AttachmentMetadata | null {
  const attachment = msg.metadata_json?.attachment
  if (!attachment || typeof attachment !== 'object') return null
  return attachment as AttachmentMetadata
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
    <div className="toolWrap">
      <button onClick={() => setOpen((o) => !o)} className="toolButton" type="button">
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease',
            fontSize: 14,
          }}
        >
          ›
        </span>
        <span className="toolMarker" />
        <span>
          כלי משפטי הופעל: <strong>{displayName}</strong>
        </span>
      </button>

      {open ? (
        <div className="toolContent">
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatToolContent(content)}</ReactMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AttachmentBubble({ msg }: { msg: MessageOut }) {
  const attachment = getAttachment(msg)
  if (!attachment) return null

  return (
    <div className="msgBubble msgUser attachmentBubble">
      <div className="msgMeta">{attachment.file_type?.startsWith('image/') ? 'תמונה צורפה' : 'מסמך צורף'}</div>
      <div style={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{attachment.file_name ?? msg.content}</div>
      <div className="muted" style={{ fontSize: 13 }}>
        המסמך אונדקס לשיחה הזו ({attachment.chunks_count ?? 0} מקטעים)
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
  const [modelProvider, setModelProvider] = useState<ModelProvider>(() =>
    localStorage.getItem(MODEL_PROVIDER_KEY) === 'openai' ? 'openai' : 'gemini',
  )
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([])
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectBusy, setProjectBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const emptyFileInputRef = useRef<HTMLInputElement | null>(null)

  const messagesQuery = useQuery({
    queryKey: ['messages', chatId],
    queryFn: () => api.listMessages(token!, chatId!),
    enabled: !!token && !!chatId,
  })

  const sendMutation = useMutation({
    mutationFn: async (content: string) => api.sendMessage(token!, chatId!, content, modelProvider),
    onSuccess: async () => {
      setOptimistic([])
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['messages', chatId] }),
        qc.invalidateQueries({ queryKey: ['chats'] }),
      ])
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ file, targetChatId }: { file: File; targetChatId: string }) =>
      api.uploadDocument(token!, file, targetChatId),
    onMutate: ({ file }) => {
      setUploadNotice(`מעלה ומאנדקס את ${file.name}...`)
    },
    onSuccess: async () => {
      setUploadNotice(null)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['messages', chatId] }),
        qc.invalidateQueries({ queryKey: ['chats'] }),
      ])
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'העלאת הקובץ נכשלה'
      setUploadNotice(msg)
    },
  })

  const createChat = async (projectId?: string | null) => {
    const created = await api.createChat(token!, projectId ?? null)
    await qc.invalidateQueries({ queryKey: ['chats'] })
    nav(`/c/${created.chat.id}`)
    return created.chat.id
  }

  const createChatAndSend = async (content: string) => {
    const created = await api.createChat(token!, null)
    await api.sendMessage(token!, created.chat.id, content, modelProvider)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['chats'] }),
      qc.invalidateQueries({ queryKey: ['messages', created.chat.id] }),
    ])
    nav(`/c/${created.chat.id}`)
  }

  const onPickFile = () => {
    fileInputRef.current?.click()
  }

  const validateFile = (file: File) => {
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      setUploadNotice('אפשר להעלות רק קובצי PDF או תמונות')
      return false
    }
    return true
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !chatId || !validateFile(file)) return
    uploadMutation.mutate({ file, targetChatId: chatId })
  }

  const onEmptyFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !validateFile(file)) return
    const targetChatId = await createChat()
    uploadMutation.mutate({ file, targetChatId })
  }

  const onCreateProject = async (e: FormEvent) => {
    e.preventDefault()
    const name = projectName.trim()
    if (!name) return
    setProjectBusy(true)
    try {
      const project = await api.createProject(token!, name)
      const targetChatId = await createChat(project.id)
      await qc.invalidateQueries({ queryKey: ['projects'] })
      setProjectDialogOpen(false)
      setProjectName('')
      nav(`/c/${targetChatId}`)
    } finally {
      setProjectBusy(false)
    }
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
        await api.streamSendMessage(token!, chatId!, content, modelProvider, {
          onDelta: (d) => setStreamText((prev) => prev + d),
          onReplace: (content) => setStreamText(content),
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

  const onModelChange = (provider: ModelProvider) => {
    setModelProvider(provider)
    localStorage.setItem(MODEL_PROVIDER_KEY, provider)
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
        grouped.push({ kind: 'date', label: new Date(lastDate).toLocaleDateString('he-IL') })
      }
      grouped.push({ kind: 'msg', msg })
    }
    return grouped
  }, [mergedMessages])

  if (!chatId) {
    return (
      <div className="emptyChat emptyChatStart">
        <section className="emptyHero startHero">
          <div className="eyebrow">צ׳אט חדש</div>
          <h2>על מה אנחנו עובדים היום?</h2>
          <p>
            אפשר להתחיל מתיק חדש, להעלות מסמך, לנסח מכתב או לפתוח שאלה משפטית. כל בחירה פותחת צ׳אט
            מתאים ושומרת את ההקשר להמשך.
          </p>
          <input
            ref={emptyFileInputRef}
            type="file"
            accept="application/pdf,.pdf,image/*"
            onChange={onEmptyFileChange}
            style={{ display: 'none' }}
          />
          <div className="quickActionRow">
            <button type="button" onClick={() => setProjectDialogOpen(true)}>
              פרויקט חדש
            </button>
            <button type="button" className="buttonSecondary" onClick={() => emptyFileInputRef.current?.click()}>
              העלאת קבצים
            </button>
            <button type="button" className="buttonSecondary" onClick={() => createChatAndSend('עזור לי לנסח מכתב משפטי. שאל אותי קודם למי מיועד המכתב, מה קרה, ומה התוצאה שאני רוצה להשיג.')}>
              ניסוח מכתב
            </button>
            <button type="button" className="buttonSecondary" onClick={() => createChatAndSend('יש לי שאלה משפטית כללית. שאל אותי שאלות הבהרה קצרות ואז תן הכוונה ראשונית.')}>
              שאלות משפטיות
            </button>
            <button type="button" className="buttonSecondary" onClick={() => createChatAndSend('אני רוצה לבדוק חוזה. הנחה אותי אילו פרטים או מסמך להעלות, ומה לבדוק קודם.')}>
              בדיקת חוזה
            </button>
            <button type="button" className="buttonSecondary" onClick={() => createChatAndSend('עזור לי להבין זכויות עובדים בישראל לפי נסיבות המקרה שלי.')}>
              זכויות עובדים
            </button>
            <button type="button" className="buttonSecondary" onClick={() => createChatAndSend('עזור לי להכין סיכום מסודר של עובדות המקרה, שאלות פתוחות והצעדים הבאים.')}>
              סיכום תיק
            </button>
          </div>
        </section>

        {projectDialogOpen ? (
          <div className="modalBackdrop" role="presentation" onMouseDown={() => setProjectDialogOpen(false)}>
            <form className="modalPanel" onSubmit={onCreateProject} onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <div>
                  <div className="eyebrow">My Law</div>
                  <h2>יצירת פרויקט חדש</h2>
                </div>
                <button className="modalClose" onClick={() => setProjectDialogOpen(false)} type="button" aria-label="סגירת חלון">
                  ×
                </button>
              </div>
              <p>תן שם קצר וברור לתיק או לנושא המשפטי. אחרי השמירה ייפתח צ׳אט חדש בתוך הפרויקט.</p>
              <label className="modalField">
                שם הפרויקט
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} autoFocus maxLength={200} />
              </label>
              <div className="modalActions">
                <button type="button" className="buttonSecondary" onClick={() => setProjectDialogOpen(false)} disabled={projectBusy}>
                  ביטול
                </button>
                <button type="submit" disabled={projectBusy || !projectName.trim()}>
                  {projectBusy ? 'יוצר...' : 'יצירה'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    )
  }

  if (messagesQuery.isError) {
    return <div className="chatError">לא הצלחנו לטעון את ההודעות</div>
  }

  return (
    <div className="chatFrame">
      <div className="chatScroll">
        {messagesQuery.isLoading ? (
          <div className="sidebarNotice">טוען הודעות...</div>
        ) : (
          <div className="chatStack">
            {items.map((it, idx) =>
              it.kind === 'date' ? (
                <div key={`d-${idx}`} className="dateDivider">
                  {it.label}
                </div>
              ) : getAttachment(it.msg) ? (
                <AttachmentBubble key={it.msg.id} msg={it.msg} />
              ) : it.msg.role === 'tool' ? (
                <ToolBubble key={it.msg.id} content={it.msg.content} />
              ) : (
                <div key={it.msg.id} className={`msgBubble ${it.msg.role === 'user' ? 'msgUser' : 'msgAssistant'}`}>
                  <div className="msgMeta">{it.msg.role === 'user' ? 'אתה' : 'My Law'}</div>

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

            {sendMutation.isPending ? <div className="sidebarNotice">My Law מכין תשובה...</div> : null}

            {streaming ? (
              <div className="msgBubble msgAssistant">
                <div className="msgMeta">My Law</div>
                <div className="md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText || 'מנסח תשובה...'}</ReactMarkdown>
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="composer">
        {uploadNotice ? (
          <div className={`uploadNotice ${uploadMutation.isError ? 'formError' : ''}`}>
            {uploadMutation.isPending ? <span className="miniSpinner" /> : null}
            <span>{uploadNotice}</span>
          </div>
        ) : null}
        <div className="composerRow">
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
            title="העלאת PDF או תמונה"
            className="attachButton"
          >
            {uploadMutation.isPending ? <span className="miniSpinner" /> : null}
            <AttachFileIcon />
            <span className="srOnly">צירוף קובץ</span>
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="שאל שאלה משפטית או בקש ניתוח של המסמך..."
          />
          <button disabled={sendMutation.isPending || streaming} type="submit" className="sendButton">
            שליחה
          </button>
          <select
            value={modelProvider}
            onChange={(e) => onModelChange(e.target.value as ModelProvider)}
            disabled={sendMutation.isPending || streaming}
            title="בחירת מודל"
            className="composerSelect"
          >
            <option value="gemini">Gemini</option>
            <option value="openai">GPT-4o mini</option>
          </select>
        </div>
      </form>
    </div>
  )
}
