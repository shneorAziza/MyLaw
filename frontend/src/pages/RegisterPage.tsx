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
    <main className="authPage">
      <section className="authCard" aria-labelledby="register-title">
        <div className="eyebrow">My Law</div>
        <h2 id="register-title">יצירת חשבון</h2>
        <p>פותחים סביבת עבודה לתיקים, מסמכים ושיחות משפטיות.</p>

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
            {loading ? 'יוצר חשבון...' : 'יצירת חשבון'}
          </button>
        </form>

        <div className="authLinks">
          <div>
            יש לך חשבון? <Link to="/login">כניסה</Link>
          </div>
          <button type="button" onClick={() => nav('/')} className="buttonSecondary">
            חזרה לעמוד הראשי
          </button>
        </div>
      </section>
    </main>
  )
}
