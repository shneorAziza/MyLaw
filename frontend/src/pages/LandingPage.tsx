import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth'

const useCases = [
  {
    label: '01',
    title: 'בדיקת חוזים',
    text: 'העלאת חוזה עבודה או שכירות, איתור סעיפים רגישים וקבלת הסבר בשפה פשוטה.',
  },
  {
    label: '02',
    title: 'זכויות בישראל',
    text: 'שאלות על פיצויים, חופשה, פרטיות, מסחר מקוון ושכירות עם ידע משפטי ממוקד.',
  },
  {
    label: '03',
    title: 'עבודה לפי מסמך',
    text: 'המערכת שומרת הקשר מתוך PDF ותמונות ומחזירה תשובות שמתייחסות לחומר שבתיק.',
  },
]

const aboutText =
  'כאן אפשר להוסיף טקסט אישי: מי אתה, למה בנית את My Law, למי המוצר מיועד, ומה הערך שאתה רוצה לתת למשתמשים שעובדים עם מסמכים משפטיים.'

const aboutLinks = [
  { label: 'LinkedIn', href: 'https://linkedin.com/in/shneor-aziza' },
  { label: 'GitHub', href: 'https://github.com/shneorAziza/MyLaw' },
  { label: 'Gmail', href: 'mailto:shneoraziza@gmail.com' },
  { label: 'WhatsApp', href: 'https://wa.me/972584853770' },
  { label: 'קו״ח', href: '#' },
]

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
          <nav className="landingNav" aria-label="ניווט ראשי">
            <div className="landingBrand">
              <strong>My Law</strong>
              <span>עוזר משפטי למסמכים ושיחות</span>
            </div>
            <div>
              {token ? <Link to="/chat">לצ׳אט</Link> : <Link to="/login">כניסה</Link>}
            </div>
          </nav>

          <div className="landingHeroText">
            <div className="eyebrow">ניהול תיק משפטי, מסמכים ושאלות במקום אחד</div>
            <h1>עוזר משפטי בעברית שעובד עם המסמכים שלך</h1>
            <p>
              העלה חוזים, מכתבים, תמונות או PDF, פתח שיחות לפי תיק, וקבל תשובות שמבוססות על ההקשר
              שכבר שמרת. My Law בנוי לעבודה שקטה ומסודרת סביב נושאים משפטיים בישראל.
            </p>
            <div className="landingActions">
              <button onClick={startChat} type="button">
                פתיחת סביבת העבודה
              </button>
              {!token ? <Link to="/register">יצירת חשבון</Link> : null}
            </div>
            <div className="landingProof" aria-label="יכולות מרכזיות">
              <span className="proofPill">PDF ותמונות</span>
              <span className="proofPill">תיקים וצ׳אטים</span>
              <span className="proofPill">Skills משפטיים</span>
              <span className="proofPill">Streaming בזמן אמת</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landingBand">
        <div className="landingInner landingGrid">
          <div>
            <div className="eyebrow">מה עושים כאן בפועל</div>
            <h2>לא עוד צ׳אט ריק. סביבת עבודה לתיק.</h2>
            <p>
              הממשק בנוי סביב תיקים, מסמכים ושיחות חוזרות. אפשר להעלות חומר, לשאול שאלות המשך,
              ולחזור להקשר שכבר נאסף במקום להתחיל מאפס בכל פעם.
            </p>
          </div>
          <div className="useCaseGrid">
            {useCases.map((item) => (
              <article className="useCase" key={item.label}>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landingBand landingAbout">
        <div className="landingInner landingGrid">
          <div>
            <div className="eyebrow">גבולות ואחריות</div>
            <h2>עזרה משפטית כללית, לא תחליף לעורך דין.</h2>
          </div>
          <p>
            My Law מיועד לארגון מידע, הבנת מסמכים וקבלת הכוונה ראשונית. לפני חתימה, שליחה או החלטה
            משפטית מחייבת, כדאי להתייעץ עם עורך דין שמכיר את פרטי המקרה.
          </p>
        </div>
      </section>

      <section className="landingBand aboutSection">
        <div className="landingInner aboutGrid">
          <div>
            <div className="eyebrow">מי אני</div>
            <h2>מי עומד מאחורי My Law</h2>
          </div>
          <div className="aboutCopy">
            <p>{aboutText}</p>
            <div className="landingLinks">
              {aboutLinks.map((link) => (
                <a href={link.href} target={link.href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer" key={link.label}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
