import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useAuth } from '../state/auth.tsx'
import type { ChatOut, ProjectOut } from '../api/types'

type SidebarDialog =
  | { kind: 'project-create' }
  | { kind: 'project-rename'; project: ProjectOut }
  | { kind: 'project-delete'; project: ProjectOut }
  | { kind: 'chat-rename'; chat: ChatOut }
  | { kind: 'chat-delete'; chat: ChatOut }
  | null

function IconButton({
  label,
  tone = 'default',
  onClick,
  children,
}: {
  label: string
  tone?: 'default' | 'danger'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      className={`iconAction ${tone === 'danger' ? 'iconActionDanger' : ''}`}
      onClick={onClick}
      type="button"
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16.8V20h3.2L18.6 8.6l-3.2-3.2L4 16.8Z" />
      <path d="m17 3.8 3.2 3.2" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`chevronIcon ${open ? 'chevronIconOpen' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function ChatItem({
  chat,
  active,
  onRename,
  onDelete,
}: {
  chat: ChatOut
  active: boolean
  onRename: (chat: ChatOut) => void
  onDelete: (chat: ChatOut) => void
}) {
  return (
    <div className={`chatItem ${active ? 'chatItemActive' : ''}`}>
      <Link to={`/c/${chat.id}`} className="chatItemLink">
        {chat.title}
      </Link>
      <div className="rowActions" aria-label={`פעולות עבור ${chat.title}`}>
        <IconButton label="שינוי שם צ׳אט" onClick={() => onRename(chat)}>
          <EditIcon />
        </IconButton>
        <IconButton label="מחיקת צ׳אט" tone="danger" onClick={() => onDelete(chat)}>
          <TrashIcon />
        </IconButton>
      </div>
    </div>
  )
}

function SidebarModal({
  dialog,
  value,
  busy,
  onValueChange,
  onClose,
  onSubmit,
}: {
  dialog: SidebarDialog
  value: string
  busy: boolean
  onValueChange: (value: string) => void
  onClose: () => void
  onSubmit: (e: FormEvent) => void
}) {
  if (!dialog) return null

  const isDelete = dialog.kind === 'project-delete' || dialog.kind === 'chat-delete'
  const title =
    dialog.kind === 'project-create'
      ? 'יצירת תיק חדש'
      : dialog.kind === 'project-rename'
        ? 'שינוי שם תיק'
        : dialog.kind === 'project-delete'
          ? 'מחיקת תיק'
          : dialog.kind === 'chat-rename'
            ? 'שינוי שם צ׳אט'
            : 'מחיקת צ׳אט'

  const body =
    dialog.kind === 'project-delete'
      ? `הפעולה תמחק את התיק "${dialog.project.name}" ואת הצ׳אטים שבתוכו.`
      : dialog.kind === 'chat-delete'
        ? `הפעולה תמחק את הצ׳אט "${dialog.chat.title}".`
        : dialog.kind === 'project-create'
          ? 'בחר שם ברור לתיק או לנושא המשפטי.'
          : 'אפשר לשנות את השם בלי לפגוע בתוכן הקיים.'

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <form className="modalPanel" onSubmit={onSubmit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <div className="eyebrow">My Law</div>
            <h2>{title}</h2>
          </div>
          <button className="modalClose" onClick={onClose} type="button" aria-label="סגירת חלון">
            ×
          </button>
        </div>

        <p>{body}</p>

        {!isDelete ? (
          <label className="modalField">
            שם
            <input value={value} onChange={(e) => onValueChange(e.target.value)} autoFocus maxLength={200} />
          </label>
        ) : null}

        <div className="modalActions">
          <button type="button" className="buttonSecondary" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button type="submit" className={isDelete ? 'buttonDanger' : ''} disabled={busy || (!isDelete && !value.trim())}>
            {busy ? 'שומר...' : isDelete ? 'מחיקה' : 'שמירה'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function Layout() {
  const { token, logout } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { chatId } = useParams()
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)
  const [sidebarError, setSidebarError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<SidebarDialog>(null)
  const [dialogValue, setDialogValue] = useState('')
  const [dialogBusy, setDialogBusy] = useState(false)

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.listProjects(token!),
    enabled: !!token,
  })

  const chatsQuery = useQuery({
    queryKey: ['chats'],
    queryFn: () => api.listChats(token!),
    enabled: !!token,
  })

  const defaultProject = useMemo(
    () => projectsQuery.data?.find((project) => project.name === 'General') ?? projectsQuery.data?.[0] ?? null,
    [projectsQuery.data],
  )

  const realProjects = useMemo(
    () => (projectsQuery.data ?? []).filter((project) => project.id !== defaultProject?.id),
    [defaultProject?.id, projectsQuery.data],
  )

  const activeChat = useMemo(
    () => chatsQuery.data?.find((chat) => chat.id === chatId) ?? null,
    [chatsQuery.data, chatId],
  )

  useEffect(() => {
    if (!activeChat || activeChat.project_id === defaultProject?.id) return
    setExpandedProjectId(activeChat.project_id)
  }, [activeChat, defaultProject?.id])

  const chatsByProject = useMemo(() => {
    return (chatsQuery.data ?? []).reduce<Record<string, ChatOut[]>>((acc, chat) => {
      acc[chat.project_id] = [...(acc[chat.project_id] ?? []), chat]
      return acc
    }, {})
  }, [chatsQuery.data])

  const regularChats = defaultProject ? chatsByProject[defaultProject.id] ?? [] : []

  const refreshSidebar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: ['chats'] }),
    ])
  }

  const showError = (e: unknown, fallback: string) => {
    setSidebarError(e instanceof ApiError ? e.message : fallback)
  }

  const openDialog = (nextDialog: SidebarDialog) => {
    setSidebarError(null)
    setDialog(nextDialog)
    if (nextDialog?.kind === 'project-rename') setDialogValue(nextDialog.project.name)
    else if (nextDialog?.kind === 'chat-rename') setDialogValue(nextDialog.chat.title)
    else setDialogValue('')
  }

  const closeDialog = () => {
    if (dialogBusy) return
    setDialog(null)
    setDialogValue('')
  }

  const submitDialog = async (e: FormEvent) => {
    e.preventDefault()
    if (!dialog) return

    setDialogBusy(true)
    setSidebarError(null)
    try {
      if (dialog.kind === 'project-create') {
        const project = await api.createProject(token!, dialogValue.trim())
        await refreshSidebar()
        setExpandedProjectId(project.id)
      } else if (dialog.kind === 'project-rename') {
        await api.updateProject(token!, dialog.project.id, dialogValue.trim())
        await refreshSidebar()
      } else if (dialog.kind === 'project-delete') {
        await api.deleteProject(token!, dialog.project.id)
        await refreshSidebar()
        if (activeChat?.project_id === dialog.project.id) nav('/chat')
      } else if (dialog.kind === 'chat-rename') {
        await api.updateChat(token!, dialog.chat.id, dialogValue.trim())
        await refreshSidebar()
      } else if (dialog.kind === 'chat-delete') {
        await api.deleteChat(token!, dialog.chat.id)
        await refreshSidebar()
        if (dialog.chat.id === chatId) nav('/chat')
      }

      setDialog(null)
      setDialogValue('')
    } catch (err) {
      showError(err, 'הפעולה נכשלה')
    } finally {
      setDialogBusy(false)
    }
  }

  const onNewProjectChat = async (projectId: string) => {
    setSidebarError(null)
    try {
      const created = await api.createChat(token!, projectId)
      await refreshSidebar()
      setExpandedProjectId(projectId)
      nav(`/c/${created.chat.id}`)
    } catch (e) {
      showError(e, 'לא הצלחנו ליצור צ׳אט בתיק')
    }
  }

  const onNewRegularChat = async () => {
    setSidebarError(null)
    try {
      const created = await api.createChat(token!, null)
      await refreshSidebar()
      nav(`/c/${created.chat.id}`)
    } catch (e) {
      showError(e, 'לא הצלחנו ליצור צ׳אט')
    }
  }

  const onLogout = () => {
    logout()
    qc.clear()
    nav('/login')
  }

  return (
    <div className="appShell">
      <aside className="appSidebar">
        <div className="sidebarHeader">
          <Link to="/" className="appBrand appBrandLink" title="חזרה לעמוד הראשי">
            <strong>My Law</strong>
            <span>סביבת עבודה משפטית</span>
          </Link>
        </div>

        {sidebarError ? <div className="sidebarError">{sidebarError}</div> : null}

        <section className="sidebarSection">
          <div className="sidebarSectionHeader">
            <div>
              <div className="sidebarTitle">תיקים ונושאים</div>
              <div className="sidebarHint">כל תיק יכול להכיל כמה צ׳אטים</div>
            </div>
            <button className="buttonSecondary addButton" onClick={() => openDialog({ kind: 'project-create' })} type="button">
              תיק חדש
            </button>
          </div>

          {projectsQuery.isLoading ? (
            <div className="sidebarNotice">טוען תיקים...</div>
          ) : projectsQuery.isError ? (
            <div className="sidebarError">לא הצלחנו לטעון תיקים</div>
          ) : (
            <div className="projectList">
              {realProjects.map((project) => {
                const expanded = expandedProjectId === project.id
                const projectChats = chatsByProject[project.id] ?? []
                return (
                  <div key={project.id} className="projectBlock">
                    <div className="projectRow">
                      <button
                        onClick={() => setExpandedProjectId(expanded ? null : project.id)}
                        type="button"
                        className="projectToggle"
                        aria-expanded={expanded}
                        title={expanded ? 'סגירת רשימת הצ׳אטים' : 'פתיחת רשימת הצ׳אטים'}
                      >
                        <ChevronIcon open={expanded} />
                        <span className="projectName">{project.name}</span>
                      </button>
                      <button
                        className="miniAction primaryMini"
                        onClick={() => onNewProjectChat(project.id)}
                        type="button"
                        title="צ׳אט חדש בתיק"
                      >
                        צ׳אט +
                      </button>
                    </div>

                    <div className="projectActions">
                      <IconButton label="שינוי שם תיק" onClick={() => openDialog({ kind: 'project-rename', project })}>
                        <EditIcon />
                      </IconButton>
                      <IconButton label="מחיקת תיק" tone="danger" onClick={() => openDialog({ kind: 'project-delete', project })}>
                        <TrashIcon />
                      </IconButton>
                    </div>

                    {expanded ? (
                      <div className="projectChats">
                        {projectChats.length ? (
                          projectChats.map((chat) => (
                            <ChatItem
                              key={chat.id}
                              chat={chat}
                              active={chatId === chat.id}
                              onRename={(item) => openDialog({ kind: 'chat-rename', chat: item })}
                              onDelete={(item) => openDialog({ kind: 'chat-delete', chat: item })}
                            />
                          ))
                        ) : (
                          <div className="sidebarNotice">אין עדיין צ׳אטים בתיק</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {chatsQuery.isLoading ? (
          <div className="sidebarNotice">טוען צ׳אטים...</div>
        ) : chatsQuery.isError ? (
          <div className="sidebarError">לא הצלחנו לטעון צ׳אטים</div>
        ) : (
          <section className="sidebarSection" style={{ flex: 1 }}>
            <div className="sidebarSectionHeader">
              <div>
                <div className="sidebarTitle">שיחות כלליות</div>
                <div className="sidebarHint">ללא תיק ספציפי</div>
              </div>
              <button className="buttonSecondary addButton" onClick={onNewRegularChat} type="button" disabled={!defaultProject}>
                צ׳אט חדש
              </button>
            </div>
            <div className="chatList">
              {regularChats.length ? (
                regularChats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    active={chatId === chat.id}
                    onRename={(item) => openDialog({ kind: 'chat-rename', chat: item })}
                    onDelete={(item) => openDialog({ kind: 'chat-delete', chat: item })}
                  />
                ))
              ) : (
                <div className="sidebarNotice">אין עדיין שיחות כלליות</div>
              )}
            </div>
          </section>
        )}

        <div style={{ marginTop: 'auto' }}>
          <button onClick={onLogout} className="buttonDanger" style={{ width: '100%' }}>
            התנתקות
          </button>
        </div>
      </aside>

      <main className="appMain">
        <Outlet />
      </main>

      <SidebarModal
        dialog={dialog}
        value={dialogValue}
        busy={dialogBusy}
        onValueChange={setDialogValue}
        onClose={closeDialog}
        onSubmit={submitDialog}
      />
    </div>
  )
}
