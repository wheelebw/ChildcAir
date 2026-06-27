from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.auth_context import resolve_current_user_context
from app.services.database import get_database
from app.services.events import (
    EVENT_TYPES,
    create_event_record,
    object_id,
    serialize_event,
)

router = APIRouter(tags=["events"])

class EventCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    eventType: str = Field(..., min_length=1)
    studentIds: list[str] = Field(default_factory=list)
    classroomId: str = ""
    timestamp: datetime | None = None
    notes: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


def _now() -> datetime:
    return datetime.now(UTC)


async def _current_user_site(
    db: AsyncIOMotorDatabase,
    firebase_user: FirebaseUser,
) -> tuple[dict[str, Any], str]:
    user = await resolve_current_user_context(db, firebase_user)
    return user, user["siteId"]


@router.get("/students/{student_id}/events")
async def list_student_events(
    student_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    student = await db.students.find_one({"_id": object_id(student_id, "Student not found."), "siteId": site_id})

    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    cursor = db.events.find({"siteId": site_id, "studentIds": student_id}).sort("timestamp", -1)
    return [serialize_event(event) async for event in cursor]


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    event_type = payload.eventType.strip()

    if event_type not in EVENT_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported event type.")

    event = await create_event_record(
        db,
        site_id=site_id,
        actor_user=actor_user,
        event_type=event_type,
        student_ids=payload.studentIds,
        classroom_id=payload.classroomId,
        timestamp=payload.timestamp,
        notes=payload.notes,
        metadata=payload.metadata,
    )
    return serialize_event(event)
