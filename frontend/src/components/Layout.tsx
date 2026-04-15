import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../state/auth.tsx'

export function Layout() {
  const { token, logout } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { chatId } = useParams()

  const chatsQuery = useQuery({
    queryKey: ['chats'],
    queryFn: () => api.listChats(token!),
    enabled: !!token,
  })

  const onNewChat = async () => {
    const created = await api.createChat(token!)
    qc.invalidateQueries({ queryKey: ['chats'] })
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
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong style={{ flex: 1 }}>My Law</strong>
          <button onClick={onNewChat}>New chat</button>
        </div>

        {chatsQuery.isLoading ? (
          <div>Loading chats…</div>
        ) : chatsQuery.isError ? (
          <div style={{ color: '#b91c1c' }}>Failed to load chats</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            {chatsQuery.data!.map((c) => (
              <Link
                key={c.id}
                to={`/c/${c.id}`}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: 'inherit',
                  background: chatId === c.id ? '#eef2ff' : 'transparent',
                }}
              >
                {c.title}
              </Link>
            ))}
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          <button onClick={onLogout} style={{ width: '100%' }}>
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

