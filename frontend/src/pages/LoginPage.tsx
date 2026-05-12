import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../state/auth.tsx'

export function LoginPage() {
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
      const tok = await api.login(email, password)
      setToken(tok.access_token)
      nav('/chat')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'הכניסה נכשלה'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="authPage">
      <section className="authCard" aria-labelledby="login-title">
        <div className="eyebrow">My Law</div>
        <h2 id="login-title">כניסה</h2>
        <p>חזרה לסביבת העבודה המשפטית שלך.</p>

        <form onSubmit={onSubmit} className="authForm">
          <label>
            אימייל
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            סיסמה
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} />
          </label>
          {error ? <div className="formError">{error}</div> : null}
          <button disabled={loading} type="submit">
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>

        <div className="authLinks">
          <div>
            אין חשבון? <Link to="/register">יצירת חשבון</Link>
          </div>
          <button type="button" onClick={() => nav('/')} className="buttonSecondary">
            חזרה לעמוד הראשי
          </button>
        </div>
      </section>
    </main>
  )
}
