from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings

PERMISSIONS = [
    "students.read",
    "students.write",
    "classrooms.read",
    "classrooms.write",
    "attendance.write",
    "incidents.write",
    "communication.write",
    "documents.read",
    "documents.write",
    "billing.read",
    "billing.write",
    "settings.customize",
    "users.manage",
    "audit.read",
]

ROLE_TEMPLATES = {
    "platform_admin": PERMISSIONS,
    "site_owner": PERMISSIONS,
    "site_admin": [
        "students.read",
        "students.write",
        "classrooms.read",
        "classrooms.write",
        "attendance.write",
        "incidents.write",
        "communication.write",
        "documents.read",
        "documents.write",
        "settings.customize",
        "users.manage",
        "audit.read",
    ],
    "guide": [
        "students.read",
        "classrooms.read",
        "attendance.write",
        "incidents.write",
        "communication.write",
        "documents.read",
    ],
    "assistant": [
        "students.read",
        "classrooms.read",
        "attendance.write",
        "incidents.write",
    ],
}

CLASSROOMS = ["Nido", "Toddler", "Primary", "Elementary", "Aftercare"]
INCIDENT_TYPES = ["Fall", "Bite", "Scratch", "Illness", "Behavior", "Medication", "Other"]
DOCUMENT_TYPES = [
    "Enrollment Form",
    "Immunization Record",
    "Medication Authorization",
    "Emergency Contact Form",
    "Handbook Acknowledgement",
    "Other",
]


def _now() -> datetime:
    return datetime.now(UTC)


async def get_user_context(db: AsyncIOMotorDatabase, firebase_uid: str) -> dict[str, Any] | None:
    user = await db.users.find_one({"firebaseUid": firebase_uid})

    if not user:
        return None

    return await build_context(db, user)


async def bootstrap_site_for_admin(
    db: AsyncIOMotorDatabase,
    *,
    email: str,
    firebase_uid: str,
) -> dict[str, Any]:
    now = _now()
    site_id = settings.default_site_id

    await db.sites.update_one(
        {"siteId": site_id},
        {
            "$setOnInsert": {
                "siteId": site_id,
                "name": settings.default_site_name,
                "status": "active",
                "timezone": "America/Chicago",
                "createdAt": now,
            },
            "$set": {"updatedAt": now},
        },
        upsert=True,
    )

    for role_id, permissions in ROLE_TEMPLATES.items():
        await db.roles.update_one(
            {"siteId": site_id, "roleId": role_id},
            {
                "$setOnInsert": {
                    "siteId": site_id,
                    "roleId": role_id,
                    "name": role_id.replace("_", " ").title(),
                    "permissions": permissions,
                    "createdAt": now,
                },
                "$set": {"updatedAt": now},
            },
            upsert=True,
        )

    for index, classroom in enumerate(CLASSROOMS):
        await db.classrooms.update_one(
            {"siteId": site_id, "name": classroom},
            {
                "$setOnInsert": {
                    "siteId": site_id,
                    "name": classroom,
                    "status": "active",
                    "sortOrder": index,
                    "createdAt": now,
                },
                "$set": {"updatedAt": now},
            },
            upsert=True,
        )

    await upsert_custom_list(db, "incident_types", INCIDENT_TYPES, now)
    await upsert_custom_list(db, "document_types", DOCUMENT_TYPES, now)

    await db.users.update_one(
        {"firebaseUid": firebase_uid},
        {
            "$setOnInsert": {
                "siteId": site_id,
                "firebaseUid": firebase_uid,
                "email": email,
                "status": "active",
                "roles": ["site_owner", "platform_admin"],
                "createdAt": now,
            },
            "$set": {
                "email": email,
                "siteId": site_id,
                "updatedAt": now,
            },
        },
        upsert=True,
    )

    user = await db.users.find_one({"firebaseUid": firebase_uid})
    return await build_context(db, user)


async def upsert_custom_list(
    db: AsyncIOMotorDatabase,
    list_type: str,
    values: list[str],
    timestamp: datetime,
) -> None:
    await db.custom_lists.update_one(
        {"siteId": settings.default_site_id, "listType": list_type},
        {
            "$setOnInsert": {
                "siteId": settings.default_site_id,
                "listType": list_type,
                "values": values,
                "createdAt": timestamp,
            },
            "$set": {"updatedAt": timestamp},
        },
        upsert=True,
    )


async def build_context(db: AsyncIOMotorDatabase, user: dict[str, Any]) -> dict[str, Any]:
    site = await db.sites.find_one({"siteId": user["siteId"]})
    classroom_count = await db.classrooms.count_documents({"siteId": user["siteId"], "status": "active"})

    return {
        "user": {
            "email": user["email"],
            "firebaseUid": user["firebaseUid"],
            "roles": user.get("roles", []),
        },
        "site": {
            "siteId": site["siteId"],
            "name": site["name"],
            "status": site["status"],
            "timezone": site["timezone"],
        }
        if site
        else None,
        "classrooms": {"count": classroom_count},
    }
