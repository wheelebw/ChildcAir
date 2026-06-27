from typing import Any

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.deps import FirebaseUser


async def resolve_current_user_context(db: AsyncIOMotorDatabase, firebase_user: FirebaseUser) -> dict[str, Any]:
    user = await db.users.find_one({"firebaseUid": firebase_user.uid})

    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has not been assigned to a ChildcAir site yet.",
        )

    site_id = user.get("siteId")

    if not site_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has not been assigned to a ChildcAir site yet.",
        )

    return user
