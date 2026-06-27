from datetime import UTC, datetime, time
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.auth_context import resolve_current_user_context
from app.services.database import get_database
from app.services.events import create_event_record, object_id, serialize_event, utc_iso

router = APIRouter(tags=["classrooms"])

AttendanceAction = Literal["check_in", "check_out"]
DEFAULT_SITE_TIMEZONE = "America/Chicago"


class AttendanceRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    studentIds: list[str] = Field(..., min_length=1)
    classroomId: str = Field(..., min_length=1)
    timestamp: datetime | None = None
    notes: str = ""


async def _current_user_site(
    db: AsyncIOMotorDatabase,
    firebase_user: FirebaseUser,
) -> tuple[dict[str, Any], str]:
    user = await resolve_current_user_context(db, firebase_user)
    return user, user["siteId"]


def _serialize_classroom(classroom: dict[str, Any], counts: dict[str, int] | None = None) -> dict[str, Any]:
    return {
        "id": str(classroom["_id"]),
        "siteId": classroom["siteId"],
        "name": classroom["name"],
        "status": classroom.get("status", "active"),
        "sortOrder": classroom.get("sortOrder", 0),
        "attendance": counts or {"checked_in": 0, "checked_out": 0, "not_checked_in": 0},
    }


def _serialize_student(student: dict[str, Any], attendance: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(student["_id"]),
        "firstName": student["firstName"],
        "lastName": student["lastName"],
        "preferredName": student.get("preferredName", ""),
        "defaultClassroomId": student.get("defaultClassroomId", ""),
        "status": student.get("status", "active"),
        "attendance": attendance,
    }


async def _site_timezone(db: AsyncIOMotorDatabase, site_id: str) -> str:
    site = await db.sites.find_one({"siteId": site_id}, {"timezone": 1})

    if not site:
        return DEFAULT_SITE_TIMEZONE

    return site.get("timezone") or DEFAULT_SITE_TIMEZONE


def _timezone(site_timezone: str) -> ZoneInfo:
    try:
        return ZoneInfo(site_timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_SITE_TIMEZONE)


def _today_bounds(site_timezone: str) -> tuple[datetime, datetime]:
    zone = _timezone(site_timezone)
    today = datetime.now(zone).date()
    start = datetime.combine(today, time.min, tzinfo=zone).astimezone(UTC)
    end = datetime.combine(today, time.max, tzinfo=zone).astimezone(UTC)
    return start, end


async def _classroom_or_404(db: AsyncIOMotorDatabase, site_id: str, classroom_id: str) -> dict[str, Any]:
    classroom = await db.classrooms.find_one({"_id": object_id(classroom_id, "Classroom not found."), "siteId": site_id})

    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")

    return classroom


async def _attendance_by_student(
    db: AsyncIOMotorDatabase, site_id: str, student_ids: list[str], site_timezone: str
) -> dict[str, dict[str, Any]]:
    start, end = _today_bounds(site_timezone)
    latest: dict[str, dict[str, Any]] = {}
    cursor = db.events.find(
        {
            "siteId": site_id,
            "eventType": {"$in": ["attendance.check_in", "attendance.check_out"]},
            "studentIds": {"$in": student_ids},
            "timestamp": {"$gte": start, "$lte": end},
        }
    ).sort("timestamp", -1)

    async for event in cursor:
        for student_id in event.get("studentIds", []):
            if student_id in student_ids and student_id not in latest:
                latest[student_id] = {
                    "status": "checked_in" if event["eventType"] == "attendance.check_in" else "checked_out",
                    "timestamp": utc_iso(event.get("timestamp")),
                    "eventId": str(event["_id"]),
                }

    return {
        student_id: latest.get(student_id, {"status": "not_checked_in", "timestamp": "", "eventId": ""})
        for student_id in student_ids
    }


async def _students_for_classroom(db: AsyncIOMotorDatabase, site_id: str, classroom_id: str) -> list[dict[str, Any]]:
    cursor = db.students.find({"siteId": site_id, "status": "active", "defaultClassroomId": classroom_id}).sort(
        [("lastName", 1), ("firstName", 1)]
    )
    return [student async for student in cursor]


def _counts(attendance_by_student: dict[str, dict[str, Any]]) -> dict[str, int]:
    counts = {"checked_in": 0, "checked_out": 0, "not_checked_in": 0}

    for attendance in attendance_by_student.values():
        counts[attendance["status"]] += 1

    return counts


@router.get("/classrooms")
async def list_classrooms(
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    site_timezone = await _site_timezone(db, site_id)
    classrooms = [classroom async for classroom in db.classrooms.find({"siteId": site_id, "status": "active"}).sort("sortOrder", 1)]
    response = []

    for classroom in classrooms:
        classroom_id = str(classroom["_id"])
        students = await _students_for_classroom(db, site_id, classroom_id)
        attendance = await _attendance_by_student(db, site_id, [str(student["_id"]) for student in students], site_timezone)
        response.append(_serialize_classroom(classroom, _counts(attendance)))

    return response


@router.get("/classrooms/{classroom_id}/attendance")
async def get_classroom_attendance(
    classroom_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    _, site_id = await _current_user_site(db, firebase_user)
    site_timezone = await _site_timezone(db, site_id)
    classroom = await _classroom_or_404(db, site_id, classroom_id)
    students = await _students_for_classroom(db, site_id, classroom_id)
    student_ids = [str(student["_id"]) for student in students]
    attendance = await _attendance_by_student(db, site_id, student_ids, site_timezone)

    return {
        "classroom": _serialize_classroom(classroom, _counts(attendance)),
        "students": [_serialize_student(student, attendance[str(student["_id"])]) for student in students],
    }


async def _write_attendance(
    db: AsyncIOMotorDatabase,
    *,
    firebase_user: FirebaseUser,
    payload: AttendanceRequest,
    action: AttendanceAction,
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    await _classroom_or_404(db, site_id, payload.classroomId)
    event_type = "attendance.check_in" if action == "check_in" else "attendance.check_out"
    event = await create_event_record(
        db,
        site_id=site_id,
        actor_user=actor_user,
        event_type=event_type,
        student_ids=payload.studentIds,
        classroom_id=payload.classroomId,
        timestamp=payload.timestamp,
        notes=payload.notes,
        metadata={"action": action, "classroomId": payload.classroomId},
        audit_action=event_type,
    )
    return serialize_event(event)


@router.post("/attendance/check-in", status_code=status.HTTP_201_CREATED)
async def check_in(
    payload: AttendanceRequest,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    return await _write_attendance(db, firebase_user=firebase_user, payload=payload, action="check_in")


@router.post("/attendance/check-out", status_code=status.HTTP_201_CREATED)
async def check_out(
    payload: AttendanceRequest,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    return await _write_attendance(db, firebase_user=firebase_user, payload=payload, action="check_out")
