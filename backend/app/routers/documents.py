from datetime import UTC, date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.auth_context import resolve_current_user_context
from app.services.database import get_database
from app.services.events import object_id, utc_iso

router = APIRouter(tags=["documents"])

DocumentStatus = Literal["missing", "received", "expired", "not_required"]


class DocumentCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    documentType: str = Field(..., min_length=1)
    status: DocumentStatus = "missing"
    title: str = ""
    receivedAt: date | None = None
    expiresAt: date | None = None
    notes: str = ""

    @field_validator("documentType")
    @classmethod
    def required_document_type(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("Document type is required.")

        return stripped


class DocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    documentType: str | None = None
    status: DocumentStatus | None = None
    title: str | None = None
    receivedAt: date | None = None
    expiresAt: date | None = None
    notes: str | None = None

    @field_validator("documentType")
    @classmethod
    def optional_document_type(cls, value: str | None) -> str | None:
        if value is None:
            return value

        stripped = value.strip()

        if not stripped:
            raise ValueError("Document type is required.")

        return stripped


def _now() -> datetime:
    return datetime.now(UTC)


def _date_to_datetime(value: date | None) -> datetime | None:
    if value is None:
        return None

    return datetime.combine(value, datetime.min.time(), tzinfo=UTC)


def _serialize_document(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "siteId": document["siteId"],
        "studentId": document["studentId"],
        "documentType": document["documentType"],
        "documentTypeLabel": document.get("documentTypeLabel", document["documentType"]),
        "status": document.get("status", "missing"),
        "title": document.get("title", ""),
        "receivedAt": utc_iso(document.get("receivedAt")),
        "expiresAt": utc_iso(document.get("expiresAt")),
        "notes": document.get("notes", ""),
        "createdBy": document.get("createdBy", ""),
        "createdAt": utc_iso(document.get("createdAt")),
        "updatedAt": utc_iso(document.get("updatedAt")),
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


async def _document_or_404(db: AsyncIOMotorDatabase, site_id: str, document_id: str) -> dict[str, Any]:
    document = await db.documents.find_one({"_id": object_id(document_id, "Document not found."), "siteId": site_id})

    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    return document


async def _document_type_or_422(db: AsyncIOMotorDatabase, site_id: str, value: str) -> dict[str, Any]:
    item = await db.custom_lists.find_one({"siteId": site_id, "listKey": "document_type", "value": value, "active": True})

    if not item:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid document type.")

    return item


async def _write_audit_log(
    db: AsyncIOMotorDatabase,
    *,
    site_id: str,
    actor_user: dict[str, Any],
    action: str,
    document_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    await db.audit_logs.insert_one(
        {
            "siteId": site_id,
            "actorUserId": str(actor_user["_id"]),
            "actorFirebaseUid": actor_user["firebaseUid"],
            "action": action,
            "entityType": "document",
            "entityId": document_id,
            "timestamp": _now(),
            "metadata": metadata or {},
        }
    )


async def _document_payload(
    db: AsyncIOMotorDatabase,
    site_id: str,
    payload: DocumentCreate | DocumentUpdate,
    *,
    partial: bool,
) -> dict[str, Any]:
    data = payload.model_dump(exclude_unset=partial)

    if "documentType" in data and data["documentType"] is not None:
        data["documentType"] = data["documentType"].strip()
        item = await _document_type_or_422(db, site_id, data["documentType"])
        data["documentTypeLabel"] = item.get("label", item["value"])

    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()

    if "notes" in data and data["notes"] is not None:
        data["notes"] = data["notes"].strip()

    if "receivedAt" in data:
        data["receivedAt"] = _date_to_datetime(data["receivedAt"])

    if "expiresAt" in data:
        data["expiresAt"] = _date_to_datetime(data["expiresAt"])

    return data


@router.get("/students/{student_id}/documents")
async def list_student_documents(
    student_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    _, site_id = await _current_user_site(db, firebase_user)
    await _student_or_404(db, site_id, student_id)
    cursor = db.documents.find({"siteId": site_id, "studentId": student_id}).sort([("documentTypeLabel", 1), ("title", 1)])
    return [_serialize_document(document) async for document in cursor]


@router.post("/students/{student_id}/documents", status_code=status.HTTP_201_CREATED)
async def create_student_document(
    student_id: str,
    payload: DocumentCreate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    await _student_or_404(db, site_id, student_id)
    timestamp = _now()
    data = await _document_payload(db, site_id, payload, partial=False)
    data.update(
        {
            "siteId": site_id,
            "studentId": student_id,
            "createdBy": str(actor_user["_id"]),
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
    )
    result = await db.documents.insert_one(data)
    await _write_audit_log(
        db,
        site_id=site_id,
        actor_user=actor_user,
        action="document.created",
        document_id=str(result.inserted_id),
        metadata={"documentType": data["documentType"], "status": data.get("status", "missing")},
    )
    document = await _document_or_404(db, site_id, str(result.inserted_id))
    return _serialize_document(document)


@router.patch("/documents/{document_id}")
async def update_document(
    document_id: str,
    payload: DocumentUpdate,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    await _document_or_404(db, site_id, document_id)
    data = await _document_payload(db, site_id, payload, partial=True)
    data.pop("siteId", None)

    if data:
        data["updatedAt"] = _now()
        await db.documents.update_one({"_id": object_id(document_id, "Document not found."), "siteId": site_id}, {"$set": data})
        await _write_audit_log(
            db,
            site_id=site_id,
            actor_user=actor_user,
            action="document.updated",
            document_id=document_id,
            metadata={"fields": sorted(field for field in data if field not in {"notes", "updatedAt"})},
        )

    document = await _document_or_404(db, site_id, document_id)
    return _serialize_document(document)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    document = await _document_or_404(db, site_id, document_id)
    await db.documents.delete_one({"_id": document["_id"], "siteId": site_id})
    await _write_audit_log(
        db,
        site_id=site_id,
        actor_user=actor_user,
        action="document.deleted",
        document_id=document_id,
        metadata={"documentType": document.get("documentType"), "status": document.get("status")},
    )
