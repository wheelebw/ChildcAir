from datetime import UTC, datetime
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.auth_context import resolve_current_user_context
from app.services.database import get_database
from app.services.events import create_event_record, normalize_to_utc, object_id, utc_iso

router = APIRouter(tags=["incidents"])

Severity = Literal["minor", "moderate", "major"]
NotificationMethod = Literal["none", "email", "sms", "phone", "in_person", "app", "other"]
IncidentStatus = Literal["open", "resolved", "closed"]


class IncidentCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    studentId: str = Field(..., min_length=1)
    classroomId: str = ""
    incidentType: str = Field(..., min_length=1)
    severity: Severity = "minor"
    location: str = Field(..., min_length=1)
    otherLocation: str = ""
    occurredAt: datetime | None = None
    description: str = Field(..., min_length=1)
    actionTaken: str = ""
    staffWitnesses: list[str] = Field(default_factory=list)
    parentNotified: bool = False
    parentNotificationMethod: NotificationMethod = "none"
    status: IncidentStatus = "open"

    @field_validator("studentId", "incidentType", "location", "description")
    @classmethod
    def required_text(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("Required field cannot be blank.")

        return stripped


class IncidentUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    studentId: str | None = None
    classroomId: str | None = None
    incidentType: str | None = None
    severity: Severity | None = None
    location: str | None = None
    otherLocation: str | None = None
    occurredAt: datetime | None = None
    description: str | None = None
    actionTaken: str | None = None
    staffWitnesses: list[str] | None = None
    parentNotified: bool | None = None
    parentNotificationMethod: NotificationMethod | None = None
    status: IncidentStatus | None = None

    @field_validator("studentId", "incidentType", "location", "description")
    @classmethod
    def optional_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return value

        stripped = value.strip()

        if not stripped:
            raise ValueError("Required field cannot be blank.")

        return stripped


def _now() -> datetime:
    return datetime.now(UTC)


def _serialize_incident(
    incident: dict[str, Any],
    *,
    students: dict[str, dict[str, Any]] | None = None,
    classrooms: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    student = (students or {}).get(incident["studentId"])
    classroom = (classrooms or {}).get(incident.get("classroomId", ""))

    return {
        "id": str(incident["_id"]),
        "siteId": incident["siteId"],
        "studentId": incident["studentId"],
        "studentName": _student_name(student) if student else "",
        "classroomId": incident.get("classroomId", ""),
        "classroomName": classroom.get("name", "") if classroom else "",
        "incidentType": incident["incidentType"],
        "incidentTypeLabel": incident.get("incidentTypeLabel", incident["incidentType"]),
        "severity": incident.get("severity", "minor"),
        "location": incident["location"],
        "locationLabel": incident.get("locationLabel", incident["location"]),
        "otherLocation": incident.get("otherLocation", ""),
        "occurredAt": utc_iso(incident.get("occurredAt")),
        "description": incident.get("description", ""),
        "actionTaken": incident.get("actionTaken", ""),
        "staffWitnesses": incident.get("staffWitnesses", []),
        "parentNotified": incident.get("parentNotified", False),
        "parentNotificationMethod": incident.get("parentNotificationMethod", "none"),
        "status": incident.get("status", "open"),
        "createdBy": incident.get("createdBy", ""),
        "createdAt": utc_iso(incident.get("createdAt")),
        "updatedAt": utc_iso(incident.get("updatedAt")),
    }


def _student_name(student: dict[str, Any] | None) -> str:
    if not student:
        return ""

    return " ".join(part for part in [student.get("preferredName") or student.get("firstName"), student.get("lastName")] if part)


async def _current_user_site(
    db: AsyncIOMotorDatabase,
    firebase_user: FirebaseUser,
) -> tuple[dict[str, Any], str]:
    user = await resolve_current_user_context(db, firebase_user)
    return user, user["siteId"]


async def _student_or_404(db: AsyncIOMotorDatabase, site_id: str, student_id: str) -> dict[str, Any]:
    student = await db.students.find_one({"_id": object_id(student_id, "Student not found."), "siteId": site_id})

    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    return student


async def _classroom_or_404(db: AsyncIOMotorDatabase, site_id: str, classroom_id: str) -> dict[str, Any] | None:
    if not classroom_id:
        return None

    classroom = await db.classrooms.find_one({"_id": object_id(classroom_id, "Classroom not found."), "siteId": site_id})

    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")

    return classroom


async def _custom_list_item_or_422(db: AsyncIOMotorDatabase, site_id: str, list_key: str, value: str) -> dict[str, Any]:
    item = await db.custom_lists.find_one({"siteId": site_id, "listKey": list_key, "value": value, "active": True})

    if not item:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {list_key}.")

    return item


async def _incident_or_404(db: AsyncIOMotorDatabase, site_id: str, incident_id: str) -> dict[str, Any]:
    incident = await db.incidents.find_one({"_id": object_id(incident_id, "Incident not found."), "siteId": site_id})

    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    return incident


async def _related_maps(
    db: AsyncIOMotorDatabase, site_id: str, incidents: list[dict[str, Any]]
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    student_ids = [ObjectId(incident["studentId"]) for incident in incidents if ObjectId.is_valid(incident.get("studentId", ""))]
    classroom_ids = [
        ObjectId(incident["classroomId"])
        for incident in incidents
        if incident.get("classroomId") and ObjectId.is_valid(incident["classroomId"])
    ]

    students = {
        str(student["_id"]): student
        async for student in db.students.find({"_id": {"$in": student_ids}, "siteId": site_id})
    }
    classrooms = {
        str(classroom["_id"]): classroom
        async for classroom in db.classrooms.find({"_id": {"$in": classroom_ids}, "siteId": site_id})
    }
    return students, classrooms


async def _incident_payload(
    db: AsyncIOMotorDatabase,
    site_id: str,
    payload: IncidentCreate | IncidentUpdate,
    *,
    partial: bool,
) -> dict[str, Any]:
    data = payload.model_dump(exclude_unset=partial)

    if "studentId" in data and data["studentId"] is not None:
        data["studentId"] = data["studentId"].strip()
        await _student_or_404(db, site_id, data["studentId"])

    if "classroomId" in data and data["classroomId"] is not None:
        data["classroomId"] = data["classroomId"].strip()
        await _classroom_or_404(db, site_id, data["classroomId"])

    if "incidentType" in data and data["incidentType"] is not None:
        data["incidentType"] = data["incidentType"].strip()
        item = await _custom_list_item_or_422(db, site_id, "incident_type", data["incidentType"])
        data["incidentTypeLabel"] = item.get("label", item["value"])

    if "location" in data and data["location"] is not None:
        data["location"] = data["location"].strip()
        item = await _custom_list_item_or_422(db, site_id, "incident_location", data["location"])
        data["locationLabel"] = item.get("label", item["value"])

    if "otherLocation" in data and data["otherLocation"] is not None:
        data["otherLocation"] = data["otherLocation"].strip()

    if data.get("location") and data["location"] != "Other":
        data["otherLocation"] = ""

    if "occurredAt" in data:
        data["occurredAt"] = normalize_to_utc(data["occurredAt"])

    if "staffWitnesses" in data and data["staffWitnesses"] is not None:
        data["staffWitnesses"] = [witness.strip() for witness in data["staffWitnesses"] if witness.strip()]

    if data.get("parentNotified") is False:
        data["parentNotificationMethod"] = "none"

    return data


async def _write_audit_log(
    db: AsyncIOMotorDatabase,
    *,
    site_id: str,
    actor_user: dict[str, Any],
    action: str,
    incident_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    await db.audit_logs.insert_one(
        {
            "siteId": site_id,
            "actorUserId": str(actor_user["_id"]),
            "actorFirebaseUid": actor_user["firebaseUid"],
            "action": action,
            "entityType": "incident",
            "entityId": incident_id,
            "timestamp": _now(),
            "metadata": metadata or {},
        }
    )


@router.get("/incidents")
async def list_incidents(
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    incidents = [incident async for incident in db.incidents.find({"siteId": site_id}).sort("occurredAt", -1)]
    students, classrooms = await _related_maps(db, site_id, incidents)
    return [_serialize_incident(incident, students=students, classrooms=classrooms) for incident in incidents]


@router.post("/incidents", status_code=status.HTTP_201_CREATED)
async def create_incident(
    payload: IncidentCreate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    timestamp = _now()
    data = await _incident_payload(db, site_id, payload, partial=False)
    data.update(
        {
            "siteId": site_id,
            "occurredAt": data.get("occurredAt") or timestamp,
            "createdBy": str(actor_user["_id"]),
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
    )

    result = await db.incidents.insert_one(data)
    incident_id = str(result.inserted_id)
    event = await create_event_record(
        db,
        site_id=site_id,
        actor_user=actor_user,
        event_type="incident.created",
        student_ids=[data["studentId"]],
        classroom_id=data.get("classroomId", ""),
        timestamp=data["occurredAt"],
        notes=f"{data['incidentTypeLabel']} incident ({data['severity']})",
        metadata={"incidentType": data["incidentType"], "severity": data["severity"]},
        related_entity={"type": "incident", "id": incident_id},
    )
    await db.incidents.update_one({"_id": result.inserted_id, "siteId": site_id}, {"$set": {"eventId": str(event["_id"])}})
    await _write_audit_log(
        db,
        site_id=site_id,
        actor_user=actor_user,
        action="incident.created",
        incident_id=incident_id,
        metadata={"incidentType": data["incidentType"], "severity": data["severity"], "eventId": str(event["_id"])},
    )

    incident = await _incident_or_404(db, site_id, incident_id)
    students, classrooms = await _related_maps(db, site_id, [incident])
    return _serialize_incident(incident, students=students, classrooms=classrooms)


@router.get("/incidents/{incident_id}")
async def get_incident(
    incident_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    _, site_id = await _current_user_site(db, firebase_user)
    incident = await _incident_or_404(db, site_id, incident_id)
    students, classrooms = await _related_maps(db, site_id, [incident])
    return _serialize_incident(incident, students=students, classrooms=classrooms)


@router.patch("/incidents/{incident_id}")
async def update_incident(
    incident_id: str,
    payload: IncidentUpdate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    await _incident_or_404(db, site_id, incident_id)
    data = await _incident_payload(db, site_id, payload, partial=True)
    data.pop("siteId", None)

    if data:
        data["updatedAt"] = _now()
        await db.incidents.update_one({"_id": object_id(incident_id, "Incident not found."), "siteId": site_id}, {"$set": data})
        await _write_audit_log(
            db,
            site_id=site_id,
            actor_user=actor_user,
            action="incident.updated",
            incident_id=incident_id,
            metadata={"fields": sorted(field for field in data if field not in {"description", "actionTaken", "updatedAt"})},
        )

    incident = await _incident_or_404(db, site_id, incident_id)
    students, classrooms = await _related_maps(db, site_id, [incident])
    return _serialize_incident(incident, students=students, classrooms=classrooms)


@router.get("/students/{student_id}/incidents")
async def list_student_incidents(
    student_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    await _student_or_404(db, site_id, student_id)
    incidents = [
        incident
        async for incident in db.incidents.find({"siteId": site_id, "studentId": student_id}).sort("occurredAt", -1)
    ]
    students, classrooms = await _related_maps(db, site_id, incidents)
    return [_serialize_incident(incident, students=students, classrooms=classrooms) for incident in incidents]
