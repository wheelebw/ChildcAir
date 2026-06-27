from typing import Any

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.auth_context import resolve_current_user_context
from app.services.database import get_database

router = APIRouter(prefix="/custom-lists", tags=["custom lists"])


def _serialize_custom_list_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(item["_id"]),
        "siteId": item["siteId"],
        "listKey": item["listKey"],
        "value": item["value"],
        "label": item.get("label", item["value"]),
        "active": item.get("active", True),
        "sortOrder": item.get("sortOrder", 0),
        "systemDefault": item.get("systemDefault", False),
    }


@router.get("/{list_key}")
async def list_custom_list_items(
    list_key: str,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    user = await resolve_current_user_context(db, firebase_user)
    cursor = db.custom_lists.find({"siteId": user["siteId"], "listKey": list_key, "active": True}).sort(
        [("sortOrder", 1), ("label", 1)]
    )
    return [_serialize_custom_list_item(item) async for item in cursor]
