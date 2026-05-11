import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../state/auth.tsx'
import type { ChatOut } from '../api/types'

function ChatLink({ chat, active }: { chat: ChatOut; active: boolean }) {
  return (
    <Link
      to={`/c/${chat.id}`}
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'inherit',
        background: active ? '#eef2ff' : 'transparent',
        overflowWrap: 'anywhere',
      }}
    >
      {chat.title}
    </Link>
  )
}

export function Layout() {
  const { token, logout } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { chatId } = useParams()
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)

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

  const onNewProject = async () => {
    const name = window.prompt('Project name')
    if (!name?.trim()) return
    const project = await api.createProject(token!, name.trim())
    await refreshSidebar()
    setExpandedProjectId(project.id)
  }

  const onNewProjectChat = async (projectId: string) => {
    const created = await api.createChat(token!, projectId)
    await refreshSidebar()
    setExpandedProjectId(projectId)
    nav(`/c/${created.chat.id}`)
  }

  const onNewRegularChat = async () => {
    const created = await api.createChat(token!, null)
    await refreshSidebar()
    nav(`/c/${created.chat.id}`)
  }

  const onLogout = () => {
    logout()
    qc.clear()
    nav('/login')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100vh' }}>
      <aside
        style={{
          borderRight: '1px solid #e5e7eb',
          padding: 16,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong style={{ flex: 1 }}>My Law</strong>
          <button onClick={onNewRegularChat} type="button" disabled={!defaultProject}>
            New chat
          </button>
        </div>

        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: '#64748b', fontWeight: 700 }}>Projects</div>
            <button onClick={onNewProject} type="button" title="New project">
              +
            </button>
          </div>

          {projectsQuery.isLoading ? (
            <div>Loading projects...</div>
          ) : projectsQuery.isError ? (
            <div style={{ color: '#b91c1c' }}>Failed to load projects</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {realProjects.map((project) => {
                const expanded = expandedProjectId === project.id
                const projectChats = chatsByProject[project.id] ?? []
                return (
                  <div key={project.id} style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setExpandedProjectId(expanded ? null : project.id)}
                        type="button"
                        style={{
                          flex: 1,
                          textAlign: 'right',
                          background: '#ffffff',
                          color: '#0f172a',
                          borderColor: '#e2e8f0',
                        }}
                      >
                        {expanded ? 'v ' : '> '}
                        {project.name}
                      </button>
                      <button onClick={() => onNewProjectChat(project.id)} type="button" title="New chat in project">
                        +
                      </button>
                    </div>

                    {expanded ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 12 }}>
                        {projectChats.length ? (
                          projectChats.map((chat) => <ChatLink key={chat.id} chat={chat} active={chatId === chat.id} />)
                        ) : (
                          <div style={{ color: '#64748b', fontSize: 13, padding: '4px 10px' }}>No chats yet</div>
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
          <div>Loading chats...</div>
        ) : chatsQuery.isError ? (
          <div style={{ color: '#b91c1c' }}>Failed to load chats</div>
        ) : (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: '#64748b', fontWeight: 700 }}>Regular chats</div>
              <button onClick={onNewRegularChat} type="button" title="New regular chat" disabled={!defaultProject}>
                +
              </button>
            </div>
            {regularChats.map((chat) => (
              <ChatLink key={chat.id} chat={chat} active={chatId === chat.id} />
            ))}
          </section>
        )}

        <div style={{ marginTop: 'auto' }}>
          <button onClick={onLogout} style={{ width: '100%', backgroundColor: '#dc3545', color: 'white' }}>
            Logout
          </button>
        </div>
      </aside>

      <main style={{ padding: 16, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
