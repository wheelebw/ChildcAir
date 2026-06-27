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
    "platform_admin": {
        "label": "Platform Admin",
        "permissions": PERMISSIONS,
        "systemRole": True,
    },
    "site_owner": {
        "label": "Site Owner",
        "permissions": PERMISSIONS,
        "systemRole": True,
    },
    "site_admin": {
        "label": "Site Admin",
        "permissions": [
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
        "systemRole": True,
    },
    "guide": {
        "label": "Guide",
        "permissions": [
            "students.read",
            "classrooms.read",
            "attendance.write",
            "incidents.write",
            "communication.write",
            "documents.read",
        ],
        "systemRole": True,
    },
    "assistant": {
        "label": "Assistant",
        "permissions": [
            "students.read",
            "classrooms.read",
            "attendance.write",
            "incidents.write",
        ],
        "systemRole": True,
    },
}

CLASSROOMS = ["Nido", "Toddler", "Primary", "Elementary", "Aftercare"]
CUSTOM_LISTS = {
    "event_type": [
        "attendance.check_in",
        "attendance.check_out",
        "attendance.absent",
        "attendance.late",
        "movement.classroom_change",
        "nap.started",
        "nap.ended",
        "meal.snack",
        "meal.lunch",
        "activity.circle_time",
        "activity.outside",
        "activity.group",
        "incident.created",
        "communication.sent",
        "document.uploaded",
    ],
    "incident_type": ["Fall", "Bite", "Scratch", "Illness", "Behavior", "Medication", "Other"],
    "incident_location": [
        "Nido Classroom",
        "Toddler Classroom",
        "Toddler Bathroom",
        "Littles Playground",
        "Primary Classroom",
        "Primary Bathroom",
        "Primary Classroom Kitchen",
        "Primary Playground",
        "Other",
    ],
    "document_type": [
        "Enrollment Form",
        "Immunization Record",
        "Medication Authorization",
        "Emergency Contact Form",
        "Handbook Acknowledgement",
        "Other",
    ],
    "attendance_status": ["Present", "Absent", "Late", "Checked Out"],
    "student_status": ["Active", "Inactive", "Future Enrollment", "Withdrawn", "Graduated"],
}


def _now() -> datetime:
    return datetime.now(UTC)


def _empty_summary() -> dict[str, dict[str, int]]:
    return {
        "sites": {"inserted": 0, "existing": 0},
        "classrooms": {"inserted": 0, "existing": 0},
        "roles": {"inserted": 0, "existing": 0},
        "custom_lists": {"inserted": 0, "existing": 0},
        "users": {"inserted": 0, "existing": 0},
    }


def _record_result(summary: dict[str, dict[str, int]], collection: str, upserted_id: Any) -> None:
    key = "inserted" if upserted_id is not None else "existing"
    summary[collection][key] += 1


async def get_user_context(db: AsyncIOMotorDatabase, firebase_uid: str) -> dict[str, Any] | None:
    user = await db.users.find_one({"firebaseUid": firebase_uid})

    if not user:
        return None

    return await build_context(db, user)


async def seed_two_rivers(
    db: AsyncIOMotorDatabase,
    *,
    admin_email: str | None = None,
    admin_firebase_uid: str | None = None,
) -> dict[str, dict[str, int]]:
    now = _now()
    site_id = settings.default_site_id
    summary = _empty_summary()

    result = await db.sites.update_one(
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
    _record_result(summary, "sites", result.upserted_id)

    for index, classroom in enumerate(CLASSROOMS):
        result = await db.classrooms.update_one(
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
        _record_result(summary, "classrooms", result.upserted_id)

    for role_key, template in ROLE_TEMPLATES.items():
        result = await db.roles.update_one(
            {"siteId": site_id, "roleKey": role_key},
            {
                "$setOnInsert": {
                    "siteId": site_id,
                    "roleKey": role_key,
                    "label": template["label"],
                    "permissions": template["permissions"],
                    "systemRole": template["systemRole"],
                    "createdAt": now,
                },
                "$set": {"updatedAt": now},
            },
            upsert=True,
        )
        _record_result(summary, "roles", result.upserted_id)

    for list_key, values in CUSTOM_LISTS.items():
        for index, value in enumerate(values):
            result = await db.custom_lists.update_one(
                {"siteId": site_id, "listKey": list_key, "value": value},
                {
                    "$setOnInsert": {
                        "siteId": site_id,
                        "listKey": list_key,
                        "value": value,
                        "label": value,
                        "active": True,
                        "sortOrder": index,
                        "systemDefault": True,
                        "createdAt": now,
                    },
                    "$set": {"updatedAt": now},
                },
                upsert=True,
            )
            _record_result(summary, "custom_lists", result.upserted_id)

    if admin_email and admin_firebase_uid:
        result = await upsert_bootstrap_admin_user(
            db,
            email=admin_email,
            firebase_uid=admin_firebase_uid,
            timestamp=now,
        )
        _record_result(summary, "users", result.upserted_id)

    return summary


async def bootstrap_site_for_admin(
    db: AsyncIOMotorDatabase,
    *,
    email: str,
    firebase_uid: str,
) -> dict[str, Any]:
    await seed_two_rivers(db, admin_email=email, admin_firebase_uid=firebase_uid)
    user = await db.users.find_one({"firebaseUid": firebase_uid})
    return await build_context(db, user)


async def upsert_bootstrap_admin_user(db: AsyncIOMotorDatabase, *, email: str, firebase_uid: str, timestamp: datetime):
    site_id = settings.default_site_id

    return await db.users.update_one(
        {"firebaseUid": firebase_uid},
        {
            "$setOnInsert": {
                "firebaseUid": firebase_uid,
                "status": "active",
                "createdAt": timestamp,
            },
            "$set": {
                "email": email,
                "siteId": site_id,
                "roles": ["site_owner", "platform_admin"],
                "memberships": [
                    {
                        "siteId": site_id,
                        "roleKey": "site_owner",
                        "status": "active",
                    },
                    {
                        "siteId": "*",
                        "roleKey": "platform_admin",
                        "status": "active",
                    },
                ],
                "updatedAt": timestamp,
            },
        },
        upsert=True,
    )


async def build_context(db: AsyncIOMotorDatabase, user: dict[str, Any]) -> dict[str, Any]:
    site_id = user["siteId"]
    site = await db.sites.find_one({"siteId": site_id})
    classroom_cursor = db.classrooms.find({"siteId": site_id, "status": "active"}).sort("sortOrder", 1)
    classrooms = [
        {
            "id": str(classroom["_id"]),
            "name": classroom["name"],
        }
        async for classroom in classroom_cursor
    ]

    return {
        "user": {
            "email": user["email"],
            "firebaseUid": user["firebaseUid"],
            "roles": user.get("roles", []),
            "memberships": user.get("memberships", []),
        },
        "site": {
            "siteId": site["siteId"],
            "name": site["name"],
            "status": site["status"],
            "timezone": site["timezone"],
        }
        if site
        else None,
        "classrooms": {"count": len(classrooms), "items": classrooms},
    }
