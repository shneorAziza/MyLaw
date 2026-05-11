import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../state/auth.tsx'

export function RegisterPage() {
  const nav = useNavigate()
  const { setToken } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const tok = await api.register(email, password)
      setToken(tok.access_token)
      nav('/chat')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'ההרשמה נכשלה'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '12vh auto', padding: 20, border: '1px solid #e5e7eb', borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>הרשמה</h2>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label>
          אימייל
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={{ width: '100%' }} />
        </label>
        <label>
          סיסמה (לפחות 8 תווים)
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            style={{ width: '100%' }}
          />
        </label>
        {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
        <button disabled={loading} type="submit">
          {loading ? 'יוצר חשבון...' : 'יצירת חשבון'}
        </button>
      </form>
      <div style={{ marginTop: 12 }}>
        יש לך חשבון? <Link to="/login">כניסה</Link>
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" onClick={() => nav('/')} style={{ width: '100%', backgroundColor: '#ffffff', color: '#0f172a' }}>
          כניסה כאורח
        </button>
      </div>
    </div>
  )
}
