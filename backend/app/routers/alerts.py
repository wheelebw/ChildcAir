from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.alerts import ALERT_SEVERITIES, compute_student_alerts
from app.services.auth_context import resolve_current_user_context
from app.services.database import get_database
from app.services.events import object_id, utc_iso

router = APIRouter(tags=["alerts"])

AlertSeverity = Literal["critical", "important", "warning", "reminder", "info"]


class ManualAlertCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    severity: AlertSeverity = "important"
    label: str = Field(..., min_length=1)
    message: str = ""
    active: bool = True

    @field_validator("label")
    @classmethod
    def required_label(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("Alert label is required.")

        return stripped


class ManualAlertUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    severity: AlertSeverity | None = None
    label: str | None = None
    message: str | None = None
    active: bool | None = None

    @field_validator("label")
    @classmethod
    def optional_label(cls, value: str | None) -> str | None:
        if value is None:
            return value

        stripped = value.strip()

        if not stripped:
            raise ValueError("Alert label is required.")

        return stripped


def _now() -> datetime:
    return datetime.now(UTC)


def _serialize_manual_alert(alert: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(alert["_id"]),
        "siteId": alert["siteId"],
        "studentId": alert["studentId"],
        "severity": alert.get("severity", "important"),
        "label": alert.get("label", ""),
        "message": alert.get("message", ""),
        "active": alert.get("active", True),
        "createdBy": alert.get("createdBy", ""),
        "createdAt": utc_iso(alert.get("createdAt")),
        "updatedAt": utc_iso(alert.get("updatedAt")),
    }


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


async def _manual_alert_or_404(db: AsyncIOMotorDatabase, site_id: str, alert_id: str) -> dict[str, Any]:
    alert = await db.student_alerts.find_one({"_id": object_id(alert_id, "Alert not found."), "siteId": site_id})

    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")

    return alert


async def _write_audit_log(
    db: AsyncIOMotorDatabase,
    *,
    site_id: str,
    actor_user: dict[str, Any],
    action: str,
    alert_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    await db.audit_logs.insert_one(
        {
            "siteId": site_id,
            "actorUserId": str(actor_user["_id"]),
            "actorFirebaseUid": actor_user["firebaseUid"],
            "action": action,
            "entityType": "student_alert",
            "entityId": alert_id,
            "timestamp": _now(),
            "metadata": metadata or {},
        }
    )


def _manual_alert_payload(payload: ManualAlertCreate | ManualAlertUpdate, *, partial: bool) -> dict[str, Any]:
    data = payload.model_dump(exclude_unset=partial)

    if "label" in data and data["label"] is not None:
        data["label"] = data["label"].strip()

    if "message" in data and data["message"] is not None:
        data["message"] = data["message"].strip()

    if data.get("severity") not in ALERT_SEVERITIES and data.get("severity") is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid alert severity.")

    return data


@router.get("/students/{student_id}/alerts")
async def list_student_alerts(
    student_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    student = await _student_or_404(db, site_id, student_id)
    return await compute_student_alerts(db, site_id, student)


@router.get("/students/{student_id}/manual-alerts")
async def list_manual_student_alerts(
    student_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    await _student_or_404(db, site_id, student_id)
    alerts = [alert async for alert in db.student_alerts.find({"siteId": site_id, "studentId": student_id}).sort("createdAt", -1)]
    return [_serialize_manual_alert(alert) for alert in alerts]


@router.post("/students/{student_id}/manual-alerts", status_code=status.HTTP_201_CREATED)
async def create_manual_student_alert(
    student_id: str,
    payload: ManualAlertCreate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    await _student_or_404(db, site_id, student_id)
    timestamp = _now()
    data = _manual_alert_payload(payload, partial=False)
    data.update(
        {
            "siteId": site_id,
            "studentId": student_id,
            "createdBy": str(actor_user["_id"]),
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
    )
    result = await db.student_alerts.insert_one(data)
    await _write_audit_log(
        db,
        site_id=site_id,
        actor_user=actor_user,
        action="student_alert.created",
        alert_id=str(result.inserted_id),
        metadata={"severity": data["severity"], "active": data["active"]},
    )
    alert = await _manual_alert_or_404(db, site_id, str(result.inserted_id))
    return _serialize_manual_alert(alert)


@router.patch("/student-alerts/{alert_id}")
async def update_manual_student_alert(
    alert_id: str,
    payload: ManualAlertUpdate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    await _manual_alert_or_404(db, site_id, alert_id)
    data = _manual_alert_payload(payload, partial=True)
    data.pop("siteId", None)
    data.pop("studentId", None)

    if data:
        data["updatedAt"] = _now()
        await db.student_alerts.update_one({"_id": object_id(alert_id, "Alert not found."), "siteId": site_id}, {"$set": data})
        await _write_audit_log(
            db,
            site_id=site_id,
            actor_user=actor_user,
            action="student_alert.updated",
            alert_id=alert_id,
            metadata={"fields": sorted(field for field in data if field not in {"message", "updatedAt"})},
        )

    alert = await _manual_alert_or_404(db, site_id, alert_id)
    return _serialize_manual_alert(alert)
