# My-Law Chat (React + FastAPI)

Monorepo:
- `frontend/`: React (Vite)
- `backend/`: FastAPI (Python)

## Quick start (local)

### Backend
1. Copy env:
   - `copy .env.example backend\.env` (Windows) or `cp .env.example backend/.env`
2. Create venv + install:
   - `cd backend`
   - `python -m venv .venv`
   - `.\.venv\Scripts\activate`
   - `pip install -r requirements.txt`
3. Run DB (Docker) and set `DATABASE_URL` in `backend/.env`
4. Migrate + run:
   - `alembic upgrade head`
   - `uvicorn app.main:app --reload --port 8000`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`

Frontend expects backend at `http://localhost:8000`.
