# ChildcAir Backend

FastAPI backend for the ChildcAir MVP.

## Local Development

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The health endpoint is available at `GET /health`.
