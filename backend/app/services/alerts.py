import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

ALERT_SEVERITIES = ("critical", "important", "warning", "reminder", "info")
EXPIRING_SOON_DAYS = 30
logger = logging.getLogger("childcair.alerts")


def normalize_to_utc_datetime(value: Any, *, document_id: str = "", field_name: str = "date") -> datetime | None:
    if value is None:
        return None

    normalized: datetime | None = None

    if isinstance(value, datetime):
        normalized = value
    elif isinstance(value, date):
        normalized = datetime.combine(value, time.min)
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None

        try:
            normalized = datetime.fromisoformat(stripped.replace("Z", "+00:00"))
        except ValueError:
            try:
                normalized = datetime.combine(date.fromisoformat(stripped), time.min)
            except ValueError:
                logger.warning(
                    "Unable to parse document %s for alert computation: document_id=%s value_type=%s",
                    field_name,
                    document_id or "unknown",
                    type(value).__name__,
                )
                return None
    else:
        logger.warning(
            "Unsupported document %s for alert computation: document_id=%s value_type=%s",
            field_name,
            document_id or "unknown",
            type(value).__name__,
        )
        return None

    if normalized.tzinfo is None:
        return normalized.replace(tzinfo=timezone.utc)

    return normalized.astimezone(timezone.utc)


def _date_label(value: datetime) -> str:
    return value.astimezone(timezone.utc).date().isoformat()


def _document_name(document: dict[str, Any]) -> str:
    return document.get("documentTypeLabel") or document.get("title") or document.get("documentType") or "Document"


def summarize_alerts(alerts: list[dict[str, Any]]) -> dict[str, Any]:
    by_severity = {severity: 0 for severity in ALERT_SEVERITIES}

    for alert in alerts:
        severity = alert.get("severity", "info")
        if severity in by_severity:
            by_severity[severity] += 1

    return {
        "count": len(alerts),
        "bySeverity": by_severity,
    }


async def compute_student_alerts(db: AsyncIOMotorDatabase, site_id: str, student: dict[str, Any]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    student_id = str(student["_id"])

    if student.get("allergies"):
        alerts.append(
            {
                "source": "profile",
                "type": "allergy",
                "severity": "critical",
                "label": "Allergy Alert",
                "message": "This student has allergies listed on their profile.",
                "relatedEntity": {"type": "student", "id": student_id},
            }
        )

    if student.get("medicalNotes"):
        alerts.append(
            {
                "source": "profile",
                "type": "medical_notes",
                "severity": "important",
                "label": "Medical Notes",
                "message": "This student has medical notes on their profile.",
                "relatedEntity": {"type": "student", "id": student_id},
            }
        )

    # TODO: Add a computed no-public-photos alert if that custom profile field is introduced.
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=EXPIRING_SOON_DAYS)
    documents = [
        document
        async for document in db.documents.find({"siteId": site_id, "studentId": student_id}).sort([("documentTypeLabel", 1), ("title", 1)])
    ]

    for document in documents:
        document_id = str(document["_id"])
        name = _document_name(document)
        status = document.get("status", "missing")
        expires_at = normalize_to_utc_datetime(document.get("expiresAt"), document_id=document_id, field_name="expiresAt")
        normalize_to_utc_datetime(document.get("receivedAt"), document_id=document_id, field_name="receivedAt")

        if status == "missing":
            alerts.append(
                {
                    "source": "document",
                    "type": "missing_document",
                    "severity": "warning",
                    "label": f"Missing {name}",
                    "message": f"{name} is marked missing.",
                    "relatedEntity": {"type": "document", "id": document_id},
                }
            )

        if status == "expired" or (expires_at and expires_at < now):
            label_date = _date_label(expires_at) if expires_at else "the recorded expiration date"
            alerts.append(
                {
                    "source": "document",
                    "type": "expired_document",
                    "severity": "critical",
                    "label": f"{name} Expired",
                    "message": f"{name} expired on {label_date}.",
                    "relatedEntity": {"type": "document", "id": document_id},
                }
            )
        elif expires_at and now <= expires_at <= soon and status not in {"missing", "not_required"}:
            days = max(0, (expires_at.date() - now.date()).days)
            alerts.append(
                {
                    "source": "document",
                    "type": "document_expiring_soon",
                    "severity": "reminder",
                    "label": f"{name} Expires Soon",
                    "message": f"{name} expires in {days} days.",
                    "relatedEntity": {"type": "document", "id": document_id},
                }
            )

    manual_alerts = [
        alert
        async for alert in db.student_alerts.find({"siteId": site_id, "studentId": student_id, "active": True}).sort("createdAt", -1)
    ]
    for alert in manual_alerts:
        alerts.append(
            {
                "id": str(alert["_id"]),
                "source": "manual",
                "type": "manual",
                "severity": alert.get("severity", "important"),
                "label": alert.get("label", "Student Alert"),
                "message": alert.get("message", ""),
                "relatedEntity": {"type": "student_alert", "id": str(alert["_id"])},
            }
        )

    severity_rank = {severity: index for index, severity in enumerate(ALERT_SEVERITIES)}
    return sorted(alerts, key=lambda alert: severity_rank.get(alert.get("severity", "info"), len(ALERT_SEVERITIES)))


async def alerts_summary_for_student(db: AsyncIOMotorDatabase, site_id: str, student: dict[str, Any]) -> dict[str, Any]:
    return summarize_alerts(await compute_student_alerts(db, site_id, student))


async def alerts_summary_for_students(db: AsyncIOMotorDatabase, site_id: str, students: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    summaries: dict[str, dict[str, Any]] = {}

    for student in students:
        summaries[str(student["_id"])] = await alerts_summary_for_student(db, site_id, student)

    return summaries
