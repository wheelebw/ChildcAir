# ChildcAir

Mobile-first childcare management MVP.

## Project Structure

- `frontend/` - React, Vite, and TypeScript mobile web app
- `backend/` - FastAPI Python API
- `docs/` - product, security, data model, and seed data notes

## Local Development

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend health check:

```bash
curl http://127.0.0.1:8000/health
```
