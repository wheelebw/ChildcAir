from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.bootstrap import router as bootstrap_router
from app.routers.classrooms import router as classrooms_router
from app.routers.custom_lists import router as custom_lists_router
from app.routers.events import router as events_router
from app.routers.incidents import router as incidents_router
from app.routers.students import router as students_router
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
app.include_router(classrooms_router)
app.include_router(custom_lists_router)
app.include_router(events_router)
app.include_router(incidents_router)
app.include_router(students_router)


@app.get("/health")
async def health() -> dict[str, str]:
    try:
        database_connected = await check_database_connection()
    except Exception:
        return {"status": "error", "database": "unavailable"}

    if not database_connected:
        return {"status": "error", "database": "unavailable"}

    return {"status": "ok", "database": "connected"}
