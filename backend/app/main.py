from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.bootstrap import router as bootstrap_router
from app.services.database import check_database_connection, close_mongo_connection, connect_to_mongo


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    try:
        await connect_to_mongo()
    except Exception:
        await close_mongo_connection()

    yield
    await close_mongo_connection()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.frontend_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bootstrap_router)


@app.get("/health")
async def health() -> dict[str, str]:
    try:
        database_connected = await check_database_connection()
    except Exception:
        return {"status": "error", "database": "unavailable"}

    if not database_connected:
        return {"status": "error", "database": "unavailable"}

    return {"status": "ok", "database": "connected"}
