from datetime import UTC, date, datetime
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.auth_context import resolve_current_user_context
from app.services.database import get_database

router = APIRouter(prefix="/students", tags=["students"])

StudentStatus = Literal["active", "inactive", "future_enrollment", "withdrawn", "graduated"]
PreferredContactMethod = Literal["email", "sms", "phone"]


class GuardianInput(BaseModel):
    name: str = ""
    relationship: str = ""
    phone: str = ""
    email: str = ""
    preferredMethod: PreferredContactMethod = "email"
    emailOptIn: bool = True
    smsOptIn: bool = False
    primary: bool = True


class StudentCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    firstName: str = Field(..., min_length=1)
    lastName: str = Field(..., min_length=1)
    preferredName: str = ""
    birthdate: date | None = None
    status: StudentStatus = "active"
    defaultClassroomId: str = ""
    allergies: list[str] = Field(default_factory=list)
    medicalNotes: str = ""
    guardians: list[GuardianInput] = Field(default_factory=list)
    authorizedPickup: list[dict[str, Any]] = Field(default_factory=list)
    custom: dict[str, Any] = Field(default_factory=dict)

    @field_validator("firstName", "lastName")
    @classmethod
    def required_name(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("Name is required.")

        return stripped


class StudentUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    firstName: str | None = Field(default=None, min_length=1)
    lastName: str | None = Field(default=None, min_length=1)
    preferredName: str | None = None
    birthdate: date | None = None
    status: StudentStatus | None = None
    defaultClassroomId: str | None = None
    allergies: list[str] | None = None
    medicalNotes: str | None = None
    guardians: list[GuardianInput] | None = None
    authorizedPickup: list[dict[str, Any]] | None = None
    custom: dict[str, Any] | None = None

    @field_validator("firstName", "lastName")
    @classmethod
    def optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return value

        stripped = value.strip()

        if not stripped:
            raise ValueError("Name is required.")

        return stripped


def _now() -> datetime:
    return datetime.now(UTC)


def _serialize_student(student: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(student["_id"]),
        "siteId": student["siteId"],
        "firstName": student["firstName"],
        "lastName": student["lastName"],
        "preferredName": student.get("preferredName", ""),
        "birthdate": student["birthdate"].isoformat() if student.get("birthdate") else "",
        "status": student.get("status", "active"),
        "defaultClassroomId": student.get("defaultClassroomId", ""),
        "allergies": student.get("allergies", []),
        "medicalNotes": student.get("medicalNotes", ""),
        "guardians": student.get("guardians", []),
        "authorizedPickup": student.get("authorizedPickup", []),
        "custom": student.get("custom", {}),
        "createdAt": student["createdAt"].isoformat() if student.get("createdAt") else "",
        "updatedAt": student["updatedAt"].isoformat() if student.get("updatedAt") else "",
    }


def _object_id(student_id: str) -> ObjectId:
    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    return ObjectId(student_id)


def _student_payload(payload: StudentCreate | StudentUpdate, *, partial: bool) -> dict[str, Any]:
    data = payload.model_dump(exclude_unset=partial)

    if "firstName" in data and data["firstName"] is not None:
        data["firstName"] = data["firstName"].strip()

    if "lastName" in data and data["lastName"] is not None:
        data["lastName"] = data["lastName"].strip()

    if data.get("birthdate"):
        data["birthdate"] = datetime.combine(data["birthdate"], datetime.min.time(), tzinfo=UTC)

    if "allergies" in data and data["allergies"] is not None:
        data["allergies"] = [allergy.strip() for allergy in data["allergies"] if allergy.strip()]

    if "guardians" in data and data["guardians"] is not None:
        data["guardians"] = [guardian.model_dump() if isinstance(guardian, GuardianInput) else guardian for guardian in data["guardians"]]

    return data


async def _current_user_site(
    db: AsyncIOMotorDatabase,
    firebase_user: FirebaseUser,
) -> tuple[dict[str, Any], str]:
    user = await resolve_current_user_context(db, firebase_user)
    return user, user["siteId"]


async def _write_audit_log(
    db: AsyncIOMotorDatabase,
    *,
    site_id: str,
    actor_user: dict[str, Any],
    action: str,
    student_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    await db.audit_logs.insert_one(
        {
            "siteId": site_id,
            "actorUserId": str(actor_user["_id"]),
            "actorFirebaseUid": actor_user["firebaseUid"],
            "action": action,
            "entityType": "student",
            "entityId": student_id,
            "timestamp": _now(),
            "metadata": metadata or {},
        }
    )


@router.get("")
async def list_students(
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    cursor = db.students.find({"siteId": site_id}).sort([("lastName", 1), ("firstName", 1)])
    return [_serialize_student(student) async for student in cursor]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_student(
    payload: StudentCreate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    timestamp = _now()
    data = _student_payload(payload, partial=False)
    data.update(
        {
            "siteId": site_id,
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
    )

    result = await db.students.insert_one(data)
    await _write_audit_log(
        db,
        site_id=site_id,
        actor_user=actor_user,
        action="student.created",
        student_id=str(result.inserted_id),
        metadata={"fields": ["firstName", "lastName", "status", "defaultClassroomId"]},
    )
    student = await db.students.find_one({"_id": result.inserted_id, "siteId": site_id})
    return _serialize_student(student)


@router.get("/{student_id}")
async def get_student(
    student_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    _, site_id = await _current_user_site(db, firebase_user)
    student = await db.students.find_one({"_id": _object_id(student_id), "siteId": site_id})

    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    return _serialize_student(student)


@router.patch("/{student_id}")
async def update_student(
    student_id: str,
    payload: StudentUpdate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    data = _student_payload(payload, partial=True)
    data.pop("siteId", None)

    if not data:
        student = await db.students.find_one({"_id": _object_id(student_id), "siteId": site_id})
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
        return _serialize_student(student)

    data["updatedAt"] = _now()
    result = await db.students.update_one(
        {"_id": _object_id(student_id), "siteId": site_id},
        {"$set": data},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    await _write_audit_log(
        db,
        site_id=site_id,
        actor_user=actor_user,
        action="student.updated",
        student_id=student_id,
        metadata={"fields": sorted(field for field in data if field not in {"medicalNotes", "updatedAt"})},
    )
    student = await db.students.find_one({"_id": _object_id(student_id), "siteId": site_id})
    return _serialize_student(student)
