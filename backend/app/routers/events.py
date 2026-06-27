from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.auth_context import resolve_current_user_context
from app.services.bootstrap import CUSTOM_LISTS
from app.services.database import get_database

router = APIRouter(tags=["events"])

EVENT_TYPES = set(CUSTOM_LISTS["event_type"])


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


def _object_id(entity_id: str, detail: str) -> ObjectId:
    if not ObjectId.is_valid(entity_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

    return ObjectId(entity_id)


def _serialize_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(event["_id"]),
        "siteId": event["siteId"],
        "eventType": event["eventType"],
        "studentIds": event.get("studentIds", []),
        "classroomId": event.get("classroomId", ""),
        "timestamp": event["timestamp"].isoformat() if event.get("timestamp") else "",
        "createdBy": event.get("createdBy", ""),
        "notes": event.get("notes", ""),
        "metadata": event.get("metadata", {}),
        "createdAt": event["createdAt"].isoformat() if event.get("createdAt") else "",
        "updatedAt": event["updatedAt"].isoformat() if event.get("updatedAt") else "",
    }


async def _current_user_site(
    db: AsyncIOMotorDatabase,
    firebase_user: FirebaseUser,
) -> tuple[dict[str, Any], str]:
    user = await resolve_current_user_context(db, firebase_user)
    return user, user["siteId"]


async def _verify_students_exist(db: AsyncIOMotorDatabase, site_id: str, student_ids: list[str]) -> None:
    object_ids = [_object_id(student_id, "Student not found.") for student_id in student_ids]

    if not object_ids:
        return

    count = await db.students.count_documents({"_id": {"$in": object_ids}, "siteId": site_id})

    if count != len(set(student_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")


async def _verify_classroom_exists(db: AsyncIOMotorDatabase, site_id: str, classroom_id: str) -> None:
    if not classroom_id:
        return

    classroom = await db.classrooms.find_one({"_id": _object_id(classroom_id, "Classroom not found."), "siteId": site_id})

    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")


async def _write_audit_log(
    db: AsyncIOMotorDatabase,
    *,
    site_id: str,
    actor_user: dict[str, Any],
    event_id: str,
    event_type: str,
) -> None:
    await db.audit_logs.insert_one(
        {
            "siteId": site_id,
            "actorUserId": str(actor_user["_id"]),
            "actorFirebaseUid": actor_user["firebaseUid"],
            "action": "event.created",
            "entityType": "event",
            "entityId": event_id,
            "timestamp": _now(),
            "metadata": {"eventType": event_type},
        }
    )


@router.get("/students/{student_id}/events")
async def list_student_events(
    student_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    student = await db.students.find_one({"_id": _object_id(student_id, "Student not found."), "siteId": site_id})

    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    cursor = db.events.find({"siteId": site_id, "studentIds": student_id}).sort("timestamp", -1)
    return [_serialize_event(event) async for event in cursor]


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

    student_ids = list(dict.fromkeys(payload.studentIds))
    await _verify_students_exist(db, site_id, student_ids)
    await _verify_classroom_exists(db, site_id, payload.classroomId)

    timestamp = payload.timestamp or _now()
    now = _now()
    event = {
        "siteId": site_id,
        "eventType": event_type,
        "studentIds": student_ids,
        "classroomId": payload.classroomId,
        "timestamp": timestamp,
        "createdBy": str(actor_user["_id"]),
        "notes": payload.notes,
        "metadata": payload.metadata,
        "createdAt": now,
        "updatedAt": now,
    }

    result = await db.events.insert_one(event)
    await _write_audit_log(
        db,
        site_id=site_id,
        actor_user=actor_user,
        event_id=str(result.inserted_id),
        event_type=event_type,
    )
    created = await db.events.find_one({"_id": result.inserted_id, "siteId": site_id})
    return _serialize_event(created)
