from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.bootstrap import CUSTOM_LISTS

EVENT_TYPES = set(CUSTOM_LISTS["event_type"])


def now_utc() -> datetime:
    return datetime.now(UTC)


def normalize_to_utc(value: datetime | None) -> datetime:
    if value is None:
        return now_utc()

    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)

    return value.astimezone(UTC)


def utc_iso(value: datetime | None) -> str:
    if value is None:
        return ""

    return normalize_to_utc(value).isoformat()


def object_id(entity_id: str, detail: str) -> ObjectId:
    if not ObjectId.is_valid(entity_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

    return ObjectId(entity_id)


def serialize_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(event["_id"]),
        "siteId": event["siteId"],
        "eventType": event["eventType"],
        "studentIds": event.get("studentIds", []),
        "classroomId": event.get("classroomId", ""),
        "timestamp": utc_iso(event.get("timestamp")),
        "createdBy": event.get("createdBy", ""),
        "notes": event.get("notes", ""),
        "metadata": event.get("metadata", {}),
        "createdAt": utc_iso(event.get("createdAt")),
        "updatedAt": utc_iso(event.get("updatedAt")),
    }


async def verify_students_exist(db: AsyncIOMotorDatabase, site_id: str, student_ids: list[str]) -> None:
    object_ids = [object_id(student_id, "Student not found.") for student_id in student_ids]

    if not object_ids:
        return

    count = await db.students.count_documents({"_id": {"$in": object_ids}, "siteId": site_id})

    if count != len(set(student_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")


async def verify_classroom_exists(db: AsyncIOMotorDatabase, site_id: str, classroom_id: str) -> None:
    if not classroom_id:
        return

    classroom = await db.classrooms.find_one({"_id": object_id(classroom_id, "Classroom not found."), "siteId": site_id})

    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")


async def write_audit_log(
    db: AsyncIOMotorDatabase,
    *,
    site_id: str,
    actor_user: dict[str, Any],
    action: str,
    entity_type: str,
    entity_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    await db.audit_logs.insert_one(
        {
            "siteId": site_id,
            "actorUserId": str(actor_user["_id"]),
            "actorFirebaseUid": actor_user["firebaseUid"],
            "action": action,
            "entityType": entity_type,
            "entityId": entity_id,
            "timestamp": now_utc(),
            "metadata": metadata or {},
        }
    )


async def create_event_record(
    db: AsyncIOMotorDatabase,
    *,
    site_id: str,
    actor_user: dict[str, Any],
    event_type: str,
    student_ids: list[str],
    classroom_id: str = "",
    timestamp: datetime | None = None,
    notes: str = "",
    metadata: dict[str, Any] | None = None,
    audit_action: str = "event.created",
) -> dict[str, Any]:
    if event_type not in EVENT_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported event type.")

    unique_student_ids = list(dict.fromkeys(student_ids))
    await verify_students_exist(db, site_id, unique_student_ids)
    await verify_classroom_exists(db, site_id, classroom_id)

    current_time = now_utc()
    event = {
        "siteId": site_id,
        "eventType": event_type,
        "studentIds": unique_student_ids,
        "classroomId": classroom_id,
        "timestamp": normalize_to_utc(timestamp),
        "createdBy": str(actor_user["_id"]),
        "notes": notes,
        "metadata": metadata or {},
        "createdAt": current_time,
        "updatedAt": current_time,
    }

    result = await db.events.insert_one(event)
    await write_audit_log(
        db,
        site_id=site_id,
        actor_user=actor_user,
        action=audit_action,
        entity_type="event",
        entity_id=str(result.inserted_id),
        metadata={"eventType": event_type, **(metadata or {})},
    )
    created = await db.events.find_one({"_id": result.inserted_id, "siteId": site_id})
    return created
