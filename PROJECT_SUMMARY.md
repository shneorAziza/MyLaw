# My Law - Project Summary

## סקירה כללית

My Law הוא פרויקט Full Stack לבניית עוזר משפטי מבוסס צ'אט. המערכת מאפשרת למשתמשים להירשם, להתחבר, לפתוח שיחות, לשלוח שאלות משפטיות, לקבל תשובות ממודל שפה, ולהפעיל "סקילים" מובנים בתחומים משפטיים ישראליים. בנוסף קיימת תשתית ראשונית להעלאת מסמכי PDF, חילוץ הטקסט מהם, יצירת embeddings ושמירתם במסד נתונים וקטורי.

הפרויקט בנוי כמונוריפו:

- `frontend/` - אפליקציית React + Vite + TypeScript.
- `backend/` - API מבוסס FastAPI + SQLAlchemy + Alembic.
- `docker-compose.yml` - שירות PostgreSQL עם הרחבת pgvector.

## מטרת המערכת

המוצר מיועד לשמש ממשק שיחה משפטי בשם My Law. המשתמש יכול לנהל כמה שיחות, לשאול שאלות, ולקבל תשובות שנעזרות במודל LLM ובסקילים ייעודיים כמו חוזי עבודה, פרטיות, מסחר אלקטרוני, שכירות וזכויות עובדים בישראל.

המערכת אינה מסתפקת בצ'אט פשוט: היא כוללת שכבת orchestration שמאפשרת למודל לקרוא לכלים פנימיים, לשמור את תוצאות הקריאות במסד הנתונים, ולהחזיר למשתמש תשובה לאחר הפעלת הכלים.

## טכנולוגיות מרכזיות

### Backend

- FastAPI
- SQLAlchemy 2
- Alembic
- PostgreSQL
- pgvector
- JWT authentication
- Passlib + bcrypt
- httpx
- LangChain
- Gemini API דרך Google Generative Language API
- pypdf / PDF text extraction

### Frontend

- React 18
- Vite
- TypeScript
- React Router
- TanStack React Query
- React Markdown
- remark-gfm

### תשתית

- Docker Compose מריץ PostgreSQL עם image של `pgvector/pgvector:pg16`.
- Alembic מנהל migrations.
- קבצי סביבה לדוגמה קיימים בשורש ובתיקיית backend.

## מבנה הפרויקט

```text
.
├── backend/
│   ├── app/
│   │   ├── api/          # נתיבי API: auth, chats, messages, skills, uploads
│   │   ├── core/         # הגדרות ואבטחה
│   │   ├── db/           # SQLAlchemy models, session, base
│   │   ├── services/     # LLM orchestration, documents
│   │   └── skills/       # מערכת סקילים וסקילים מובנים
│   ├── alembic/          # migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/          # client + shared types
│   │   ├── components/   # Layout, RequireAuth
│   │   ├── pages/        # Login, Register, Chat
│   │   └── state/        # auth state
│   └── package.json
├── docker-compose.yml
├── README.md
└── .env.example
```

## Backend

נקודת הכניסה היא `backend/app/main.py`. הפונקציה `create_app()` יוצרת את אפליקציית FastAPI, מגדירה CORS, טוענת סקילים מובנים, ומחברת את הראוטרים:

- `/auth`
- `/chats`
- `/chats/{chat_id}/messages`
- `/skills`
- `/uploads`
- `/health`

### אימות משתמשים

הקובץ `backend/app/api/auth.py` מספק:

- `POST /auth/register` - הרשמה עם email וסיסמה.
- `POST /auth/login` - התחברות וקבלת JWT.
- `GET /auth/me` - החזרת המשתמש הנוכחי לפי token.

הסיסמאות נשמרות כ-hash, והזדהות משתמשים נעשית באמצעות JWT.

### צ'אטים והודעות

הקובץ `backend/app/api/chats.py` מספק:

- רשימת שיחות של המשתמש.
- יצירת שיחה חדשה.
- קבלת שיחה לפי מזהה.
- מחיקת שיחה.

הקובץ `backend/app/api/messages.py` מספק:

- קבלת הודעות בשיחה.
- שליחת הודעה רגילה.
- שליחת הודעה ב-streaming דרך `messages:stream`.

כאשר משתמש שולח הודעה, המערכת שומרת אותה, טוענת את היסטוריית השיחה, מפעילה את `ChatOrchestrator`, שומרת את תשובת העוזר, ומעדכנת את כותרת השיחה לפי ההודעה הראשונה.

### מודל שפה ו-Orchestrator

הקובץ `backend/app/services/orchestrator.py` מנהל turn מלא בשיחה:

1. ממיר הודעות מהמסד לפורמט פנימי.
2. שולח את ההיסטוריה למודל.
3. אם המודל ביקש tool call, מפעיל את הסקיל המתאים.
4. שומר הודעת `tool` ואת רשומת `SkillInvocation`.
5. שולח למודל את תוצאות הכלים ומייצר תשובת assistant.
6. שומר את תשובת assistant במסד.

הקובץ `backend/app/services/llm.py` מכיל כמה clients:

- `StubLLMClient` - מצב פיתוח ללא מודל אמיתי.
- `GeminiLLMClient` - קריאה ישירה ל-Gemini API כולל function calling ו-streaming.
- `LangChainGeminiClient` - מימוש נוסף דרך LangChain.

בחירת הספק נעשית לפי משתני הסביבה:

- `LLM_PROVIDER`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `LLM_THINKING_LEVEL`

## סקילים

מערכת הסקילים נמצאת תחת `backend/app/skills`.

הרישום מתבצע דרך `SkillRegistry`, והטעינה דרך `load_builtin_skills()`.

סקילים מובנים:

- `time_now`
- `simple_calculator`
- `israeli_employment_contracts`
- `israeli_privacy_shield`
- `israeli_ecommerce_compliance`
- `israeli_rental_agreements`
- `israeli_workplace_rights_navigator`

כל סקיל חושף:

- `name`
- `description`
- `input_schema()`
- `run(ctx, args)`

הסקילים נחשפים גם דרך `GET /skills`.

## מסד נתונים

המודלים המרכזיים נמצאים ב-`backend/app/db/models.py`.

טבלאות עיקריות:

- `users` - משתמשים, אימייל, hash של סיסמה ותאריך יצירה.
- `chats` - שיחות לפי משתמש.
- `messages` - הודעות בשיחה: user, assistant, system או tool.
- `skill_invocations` - תיעוד קריאות לכלים.
- `documents` - מסמכים שהועלו.
- `document_embeddings` - מקטעי טקסט ווקטורים בגודל 768.

ה-migration `73c8addc2f2f_add_documents_and_embeddings.py` מוסיף את טבלאות המסמכים ויוצר את הרחבת `vector`.

## העלאת מסמכים ו-RAG ראשוני

הקובץ `backend/app/api/uploads.py` מאפשר העלאת PDF בלבד דרך:

```text
POST /uploads/
```

זרימת העיבוד:

1. בדיקה שהקובץ הוא PDF.
2. שמירת הקובץ תחת `storage/documents`.
3. קריאת התוכן לזיכרון.
4. חילוץ טקסט מה-PDF.
5. פיצול הטקסט ל-chunks.
6. יצירת embeddings עם Google Generative AI.
7. שמירת המסמך וה-embeddings במסד הנתונים.

זו תשתית RAG ראשונית, אך כרגע לא נמצאה זרימת חיפוש שמחזירה chunks רלוונטיים לתוך הצ'אט.

## Frontend

נקודת הכניסה היא `frontend/src/App.tsx`.

הנתיבים המרכזיים:

- `/login` - התחברות.
- `/register` - הרשמה.
- `/` - מסך פתיחה מוגן.
- `/c/:chatId` - מסך שיחה.

הקומפוננטה `RequireAuth` מגינה על אזורי האפליקציה שדורשים token.

### Layout

`frontend/src/components/Layout.tsx` מציג:

- Sidebar עם רשימת שיחות.
- כפתור יצירת שיחה חדשה.
- כפתור Logout.
- אזור תוכן מרכזי.

### ChatPage

`frontend/src/pages/ChatPage.tsx` מנהל את חוויית השיחה:

- טעינת הודעות קיימות.
- שליחת הודעה.
- optimistic UI עבור הודעת המשתמש.
- תמיכה ב-streaming אם `VITE_USE_STREAMING=true`.
- הצגת תשובות assistant כ-Markdown.
- הצגת הודעות tool כ-accordion נפתח.

### API Client

`frontend/src/api/client.ts` מרכז את כל הקריאות ל-backend:

- הרשמה והתחברות.
- טעינת משתמש.
- ניהול שיחות.
- ניהול הודעות.
- streaming דרך Server-Sent Events.

ברירת המחדל ל-backend:

```text
http://localhost:8000
```

ניתן לשנות זאת עם:

```text
VITE_API_BASE_URL
```

## הרצה מקומית

### מסד נתונים

```bash
docker compose up -d
```

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

האפליקציה תרוץ בדרך כלל ב:

```text
http://localhost:5173
```

## משתני סביבה חשובים

Backend:

```text
DATABASE_URL
JWT_SECRET
JWT_EXPIRES_MIN
CORS_ORIGINS
LLM_PROVIDER
LLM_API_KEY
LLM_BASE_URL
LLM_MODEL
LLM_THINKING_LEVEL
```

Frontend:

```text
VITE_API_BASE_URL
VITE_USE_STREAMING
```

## מצב נוכחי ונקודות לשיפור

- קיימת אי התאמה בין `docker-compose.yml`, שיוצר DB בשם `my_law`, לבין חלק מקבצי הסביבה שמצביעים ל-`gpt_like`.
- `uploads.py` משתמש כרגע ב-`user_id` קשיח במקום המשתמש המחובר.
- endpoint העלאת המסמכים לא מחייב כרגע `CurrentUserDep`, ולכן האבטחה בו חלקית.
- יש תשתית embeddings, אבל עדיין לא נמצא חיפוש וקטורי שמחובר לתשובות הצ'אט.
- `requirements.txt` עשוי להיות חסר חבילות שנעשה בהן שימוש בקוד, למשל `pgvector`, `langchain-google-genai` ו-`langchain-text-splitters`.
- `documents.py` מייבא `PyPDF2`, בעוד שב-`requirements.txt` מופיעה `pypdf`.
- חלק מהטקסטים בקוד נראים עם בעיית encoding, בעיקר הערות וטקסטי UI בעברית.
- קיים client נוסף `LangChainGeminiClient`, אך factory ברירת המחדל משתמש ב-`GeminiLLMClient` כאשר `LLM_PROVIDER=gemini`.

## סיכום קצר

My Law הוא בסיס טוב לעוזר משפטי מבוסס צ'אט, עם ארכיטקטורה שמפרידה בין frontend, backend, LLM, סקילים, משתמשים, שיחות ומסמכים. החלקים המרכזיים כבר קיימים: אימות, שיחות, הודעות, function calling, סקילים משפטיים, streaming ותשתית מסמכים וקטורית. כדי להביא את הפרויקט לרמת מוצר יציבה יותר, כדאי להתמקד בחיבור RAG מלא לצ'אט, תיקון אבטחת העלאות, יישור dependencies ומשתני סביבה, ושיפור encoding בממשק ובקוד.
