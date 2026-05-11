import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth'

export function LandingPage() {
  const { token } = useAuth()
  const nav = useNavigate()

  const startChat = () => {
    nav(token ? '/chat' : '/login')
  }

  return (
    <main className="landingPage">
      <section className="landingHero">
        <div className="landingInner">
          <div className="landingNav">
            <strong>My Law</strong>
            <div>
              {token ? <Link to="/chat">לצ׳אט</Link> : <Link to="/login">כניסה</Link>}
            </div>
          </div>

          <div className="landingHeroText">
            <h1>עוזר משפטי חכם לעבודה עם מסמכים, תמונות ושיחות</h1>
            <p>
              מערכת צ׳אט שמאפשרת להעלות PDF ותמונות, לחלץ מהם טקסט, לאנדקס אותם כ-embeddings,
              ולשלוף הקשר רלוונטי בזמן שיחה. היא בנויה סביב פרויקטים, כך שכל תיק או נושא יכול להכיל
              כמה צ׳אטים וקבצים משותפים.
            </p>
            <div className="landingActions">
              <button onClick={startChat} type="button">
                מעבר לצ׳אט
              </button>
              {!token ? <Link to="/register">הרשמה</Link> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="landingBand">
        <div className="landingInner landingGrid">
          <div>
            <h2>מה המערכת יודעת לעשות</h2>
            <p>
              ניהול פרויקטים, צ׳אטים מרובים לכל פרויקט, OCR לתמונות וקבצי PDF סרוקים, אינדוקס
              מסמכים לוקטורים, RAG לשליפת מקטעים רלוונטיים, וסטרימינג של תשובות בזמן אמת.
            </p>
          </div>
          <div>
            <h2>טכנולוגיות</h2>
            <p>
              FastAPI, PostgreSQL, pgvector, SQLAlchemy, Alembic, React, Vite, TanStack Query,
              Gemini, OpenAI GPT-4o mini, OCR מבוסס מודלי vision, ו-pipeline למסמכים.
            </p>
          </div>
        </div>
      </section>

      <section className="landingBand landingAbout">
        <div className="landingInner">
          <h2>קצת עליי</h2>
          <p>
            כאן ייכנס בהמשך טקסט אישי קצר: מי אני, מה אני בונה, איזה בעיות מעניינות אותי, ומה
            הסיפור מאחורי הפרויקט.
          </p>
          <div className="landingLinks">
            <a href="https://github.com/" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a href="https://wa.me/" target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
