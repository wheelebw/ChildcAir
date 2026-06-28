from datetime import UTC, datetime, timedelta
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

ALERT_SEVERITIES = ("critical", "important", "warning", "reminder", "info")
EXPIRING_SOON_DAYS = 30


def _date_label(value: datetime) -> str:
    return value.astimezone(UTC).date().isoformat()


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
    now = datetime.now(UTC)
    soon = now + timedelta(days=EXPIRING_SOON_DAYS)
    documents = [
        document
        async for document in db.documents.find({"siteId": site_id, "studentId": student_id}).sort([("documentTypeLabel", 1), ("title", 1)])
    ]

    for document in documents:
        document_id = str(document["_id"])
        name = _document_name(document)
        status = document.get("status", "missing")
        expires_at = document.get("expiresAt")

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
