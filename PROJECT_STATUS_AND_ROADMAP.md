# My Law - מצב פרויקט ותוכנית המשך

## 1. מה המערכת

`My Law` היא מערכת Full Stack לעוזר משפטי מבוסס צ'אט בעברית, שמיועדת לעבודה עם תיקים, מסמכים ושאלות משפטיות בהקשר ישראלי.

המערכת מיועדת למשתמשים שרוצים סביבת עבודה משפטית ראשונית: יזמים, עובדים, שוכרים, בעלי עסקים, מפתחים, נותני שירותים, או כל מי שרוצה להבין מסמכים משפטיים ולקבל הכוונה כללית. המערכת אינה מחליפה ייעוץ משפטי של עורך דין.

המשתמש יכול:

- להירשם ולהתחבר.
- לפתוח תיקים/פרויקטים משפטיים.
- לפתוח כמה צ'אטים תחת כל תיק.
- לשנות שם ולמחוק תיקים וצ'אטים.
- להעלות מסמכי PDF ותמונות.
- לחלץ טקסט ממסמכים ותמונות.
- לאנדקס מסמכים ל-embeddings.
- לשאול שאלות משפטיות בצ'אט.
- לקבל תשובות ממודל שפה עם תמיכה ב-streaming.
- להפעיל skills משפטיים ייעודיים בתחומים ישראליים.

## 2. ארכיטקטורה קיימת

הפרויקט בנוי כמונוריפו:

```text
.
├── frontend/   React + Vite + TypeScript
├── backend/    FastAPI + SQLAlchemy + Alembic
└── docker-compose.yml
```

### Frontend

`frontend/` אחראי על ממשק המשתמש:

- עמוד פתיחה.
- הרשמה וכניסה.
- סביבת עבודה עם sidebar של תיקים וצ'אטים.
- מסך צ'אט.
- יצירת תיק/צ'אט.
- שינוי שם ומחיקה דרך modal פנימי.
- העלאת קבצים.
- בחירת provider של מודל.
- הצגת תשובות Markdown.
- תצוגת tool/skill שהופעל.

הסטאק:

- React 18
- Vite
- TypeScript
- React Router
- TanStack Query
- React Markdown
- remark-gfm

### Backend

`backend/` אחראי על:

- API.
- אימות משתמשים עם JWT.
- ניהול משתמשים.
- ניהול פרויקטים/תיקים.
- ניהול צ'אטים והודעות.
- העלאת מסמכים.
- הפעלת skills.
- orchestration מול מודלי שפה.
- תשתית embeddings ו-vector search.

הסטאק:

- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- pgvector
- JWT
- Gemini/OpenAI provider support

### Database

המסד המרכזי הוא PostgreSQL עם הרחבת `pgvector`.

טבלאות מרכזיות:

- `users` - משתמשים.
- `projects` - תיקים/פרויקטים.
- `chats` - שיחות.
- `messages` - הודעות בצ'אט.
- `skill_invocations` - תיעוד הפעלות skills/tools.
- `documents` - מסמכים שהועלו.
- `document_embeddings` - chunks ווקטורים של מסמכים.

## 3. רכיבי AI Engineering קיימים

### LLM Layer

שכבת המודל נמצאת ב-`backend/app/services/llm.py`.

המערכת כבר תומכת בבחירת provider, כולל Gemini ו-OpenAI. ב-frontend קיימת בחירת מודל בין Gemini לבין GPT-4o mini.

### Orchestrator / Agentic Layer

ה-orchestrator נמצא ב-`backend/app/services/orchestrator.py`.

הוא מנהל turn מלא בצ'אט:

1. טעינת היסטוריית השיחה.
2. שליחת ההקשר למודל.
3. זיהוי tool calls.
4. הפעלת skill מתאים.
5. שמירת הודעת tool ותיעוד invocation.
6. שליחה חוזרת למודל עם תוצאת הכלי.
7. שמירת תשובת assistant.

זו תשתית טובה ל-agentic workflows, גם אם עדיין לא מדובר באייגנט אוטונומי מלא.

### Tools / Skills

המערכת כוללת מנגנון skills תחת `backend/app/skills`.

skills קיימים:

- `time_now`
- `simple_calculator`
- `israeli_employment_contracts`
- `israeli_privacy_shield`
- `israeli_ecommerce_compliance`
- `israeli_rental_agreements`
- `israeli_workplace_rights_navigator`

ה-skills המשפטיים מאפשרים למודל להפעיל ידע מובנה בתחומים כמו חוזי עבודה, פרטיות, מסחר אלקטרוני, שכירות וזכויות עובדים בישראל.

### Document Pipeline

קיימת תשתית להעלאת מסמכים:

1. העלאת PDF או תמונה.
2. שמירת הקובץ.
3. חילוץ טקסט.
4. חלוקה ל-chunks.
5. יצירת embeddings.
6. שמירת chunks ווקטורים במסד.
7. הצגת attachment בצ'אט.

### Embeddings

המערכת יוצרת embedding לכל chunk של מסמך.

לפי מבנה המסד, ה-vector dimension הוא `768`, ומתאים לשימוש עם מודלי embedding מהמשפחה של Gemini/Google.

### Vector DB

PostgreSQL עם `pgvector` משמש כ-Vector DB.

טבלת `document_embeddings` מאפשרת שמירה של:

- מזהה מסמך.
- מספר chunk.
- תוכן טקסטואלי.
- embedding וקטורי.

### RAG

קיימת תשתית RAG חלקית:

```text
Upload → Text Extraction/OCR → Chunking → Embedding → pgvector Storage
```

החלק שעדיין צריך להשלים:

```text
User Question → Retrieval → Context Injection → LLM Answer with Sources
```

כלומר, יש כבר תשתית מסמכים ווקטורים, אבל צריך לחבר retrieval אוטומטי לתוך ה-orchestrator כך שכל שאלה בצ'אט תשלוף chunks רלוונטיים מתוך התיק ותכניס אותם להקשר של המודל.

## 4. מה קיים כרגע

### מוצר

- מערכת התחברות והרשמה.
- תיקים/פרויקטים.
- צ'אטים מרובים.
- שינוי שם ומחיקה של תיקים וצ'אטים.
- ממשק RTL בעברית.
- עמוד פתיחה מחודש.
- מסך צ'אט מחודש.
- מסך צ'אט ריק עם פעולות מהירות.
- העלאת PDF ותמונות.
- בחירת provider.
- streaming responses.
- הצגת Markdown.
- הצגת tool calls/skills.

### AI

- שכבת LLM abstraction.
- Gemini/OpenAI provider selection.
- orchestration בסיסי.
- multi-step tool calling דרך skills.
- skills משפטיים ישראליים.
- pipeline להעלאת מסמכים.
- embeddings.
- pgvector.
- בסיס ל-RAG.

### Backend/API

- Auth.
- Users.
- Projects.
- Chats.
- Messages.
- Uploads.
- Skills.
- Document search endpoint קיים בתשתית.

## 5. מה חסר

### RAG מלא

חסר חיבור retrieval לתוך תשובת הצ'אט.

צריך:

- לבצע semantic search לפי השאלה.
- להגביל חיפוש לפי `chat_id` או `project_id`.
- להכניס chunks רלוונטיים לפרומפט.
- להציג מקורות/ציטוטים או לפחות references למשתמש.
- להימנע מהכנסת יותר מדי טקסט להקשר.

### ניהול מסמכים

כרגע העלאה קיימת, אבל חסר ממשק מסמכים מלא:

- רשימת מסמכים בתיק.
- מחיקת מסמך.
- שינוי שם מסמך.
- צפייה בטקסט שחולץ.
- סטטוס indexing.
- קישור בין מסמך לבין צ'אטים.

### יצירת מסמכים משפטיים מותאמים אישית

זה אחד הערכים הגבוהים ביותר למשתמש.

חסר:

- templates משפטיים.
- פרופיל משתמש/משרד.
- יצירת DOCX/PDF.
- preview למסמך.
- הורדה.

### מידע משפטי עדכני מהאינטרנט

כדי לצמצם hallucination ולמנוע שימוש בחוקים או נתונים ישנים, צריך search tool.

חסר:

- חיבור ל-Tavily / Serper / API חיפוש אחר.
- skill ייעודי לחקיקה ופסיקה.
- מדיניות אילו מקורות אמינים.
- ציטוט מקורות בתשובה.

### Agents in Action

כרגע יש orchestration ו-tool calling, אבל אין עדיין agent שסוגר פעולות חיצוניות.

חסר:

- שליחת מיילים.
- יצירת תזכורות.
- פתיחת משימות.
- יצירת follow-ups.
- פעולות מאושרות מראש מול המשתמש.

### יכולות מתקדמות

חסר:

- השוואת גרסאות חוזה.
- מחשבון מועדים משפטיים.
- חילוץ משימות מפרוטוקול/החלטה.
- dashboard לתיק.
- ניהול סטטוס משימות.
- התראות.

## 6. פיצ'רים מומלצים להמשך

### 6.1 RAG מלא לתיקים

מטרה: כל שאלה בצ'אט תוכל להשתמש במסמכים שהועלו לתיק.

מה לעשות:

- להוסיף פונקציה ב-service שמקבלת `query`, `chat_id`, `project_id`.
- לבצע vector similarity search ב-`document_embeddings`.
- להחזיר top-k chunks.
- להכניס chunks לפרומפט של ה-orchestrator.
- להוסיף בתשובה אזור "על סמך המסמכים".
- לשמור metadata של chunks שהוזנו למודל.

עדיפות: גבוהה מאוד.

### 6.2 Legal Generator Service + Templates

מטרה: יצירת מסמכים משפטיים מותאמים אישית.

מה לעשות:

- להקים טבלת `UserProfiles` או `FirmSettings`.
- לשמור:
  - שם משתמש/משרד.
  - לוגו.
  - כתובת.
  - טלפון.
  - אימייל.
  - נוסח חתימה קבוע.
  - פרטי עוסק/חברה אם רלוונטי.
- ליצור `LegalGeneratorService`.
- להגדיר templates משפטיים:
  - מכתב התראה.
  - מכתב דרישה לתשלום.
  - מכתב התפטרות.
  - סיכום פגישה.
  - הסכם שכירות בסיסי.
  - חוזה עבודה בסיסי.
- לייצר DOCX בעזרת ספרייה כמו `python-docx`.
- בהמשך להוסיף PDF export.

עדיפות: גבוהה מאוד.

### 6.3 Search Tool למידע משפטי עדכני

מטרה: לאפשר לאייגנט לבדוק חקיקה, פסיקה או מידע משפטי עדכני לפני תשובה.

מה לעשות:

- לבחור provider: Tavily, Serper, או מנוע חיפוש מתאים ל-AI.
- ליצור skill חדש:

```text
legal_web_search
```

או:

```text
israeli_law_search
```

- להגדיר input schema:
  - query
  - jurisdiction
  - source_type: legislation / case_law / government / general
- להחזיר:
  - title
  - snippet
  - url
  - source_type
  - retrieval_time
- להנחות את המודל לציין תאריך בדיקה ומקורות.

עדיפות: גבוהה.

### 6.4 Agents in Action - מיילים ואוטומציות

מטרה: סגירת מעגל מפעולה משפטית להביצוע.

דוגמאות:

- ניסוח מייל לצד שני.
- שליחת מייל אחרי אישור המשתמש.
- יצירת תזכורת למועד משפטי.
- יצירת משימה מתוך תשובת האייגנט.
- מעקב אחרי מסמך או פעולה.

מה לעשות:

- להוסיף טבלת `tasks`.
- להוסיף טבלת `agent_actions`.
- להגדיר workflow של אישור משתמש לפני פעולה חיצונית.
- בעתיד לחבר Gmail/Outlook או provider אחר.

עדיפות: בינונית-גבוהה, אחרי RAG ו-Templates.

### 6.5 Diff Checker לחוזים

מטרה: להעלות שני נוסחים של חוזה ולזהות מה השתנה.

מה לעשות:

- לאפשר העלאת שני מסמכים לאותו flow.
- לחלץ טקסט משניהם.
- לבצע comparison ברמת סעיפים.
- להציג:
  - סעיפים שנוספו.
  - סעיפים שנמחקו.
  - ניסוחים שהוחמרו.
  - נקודות סיכון.
- לשלב LLM כדי להסביר את המשמעות המשפטית של שינוי.

עדיפות: גבוהה כמוצר "secret sauce".

### 6.6 מחשבון מועדים משפטיים

מטרה: חישוב מועדים לפי דין, ימי עבודה, פגרות, חגים ולוח שנה ישראלי.

מה לעשות:

- ליצור skill:

```text
israeli_legal_deadline_calculator
```

- לתמוך ב:
  - תאריך החלטה/מסירה.
  - מספר ימים.
  - ימי עבודה או ימים קלנדריים.
  - פגרות.
  - חגים.
  - מועדים להגשת כתב הגנה/תגובה/ערעור.
- להציג חישוב שקוף ולא רק תוצאה.

עדיפות: בינונית-גבוהה.

### 6.7 Task Extraction מפרוטוקולים והחלטות

מטרה: האייגנט יקרא פרוטוקול או החלטה ויחלץ משימות.

דוגמה:

```text
בית המשפט הורה להגיש תצהירים עד 15.06.
```

המערכת תחזיר:

- משימה: הגשת תצהירים.
- אחראי: המשתמש/הלקוח.
- תאריך יעד.
- מקור במסמך.
- סטטוס.

מה לעשות:

- ליצור skill או service:

```text
legal_task_extractor
```

- להוסיף טבלת `tasks`.
- להציג משימות ברמת תיק.
- לאפשר סימון כבוצע.

עדיפות: בינונית.

## 7. סדר עבודה מומלץ

### שלב 1 - ייצוב בסיס המוצר

- לוודא שכל הטקסטים בעברית תקינים ללא בעיות encoding.
- לסדר build/test ל-backend.
- לוודא שה-venv תקין.
- להוסיף בדיקות API בסיסיות.
- לשפר ניהול שגיאות ב-frontend.

### שלב 2 - RAG מלא

- לחבר retrieval ל-orchestrator.
- להחזיר תשובות עם מקורות.
- להגביל retrieval לפי תיק.
- להוסיף תצוגת "מקורות מתוך המסמכים".

### שלב 3 - מסמכים משפטיים מותאמים

- UserProfiles/FirmSettings.
- templates.
- LegalGeneratorService.
- DOCX export.
- UI ליצירת מסמך.

### שלב 4 - Search Tool משפטי

- חיבור Tavily/Serper.
- skill לחיפוש חקיקה ופסיקה.
- מדיניות מקורות.
- ציטוטים ותאריך בדיקה.

### שלב 5 - Secret Sauce

- Diff Checker.
- מחשבון מועדים.
- Task Extraction.
- ניהול משימות בתיק.

### שלב 6 - Agents in Action

- אוטומציות.
- שליחת מיילים.
- תזכורות.
- workflows עם אישור משתמש.

## 8. תיאור קצר לגיטהאב

Advanced GenAI legal workspace for Israeli law, combining RAG, vector embeddings, pgvector, document understanding, streaming LLM chat, multi-step tool calling, legal Skills, and future autonomous agent workflows for precise case-based assistance.
