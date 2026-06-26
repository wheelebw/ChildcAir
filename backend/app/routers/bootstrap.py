from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.deps import FirebaseUser, get_current_firebase_user
from app.services.bootstrap import bootstrap_site_for_admin, get_user_context
from app.services.database import get_database

router = APIRouter(prefix="/bootstrap", tags=["bootstrap"])


@router.post("/me")
async def bootstrap_me(
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    existing_context = await get_user_context(db, firebase_user.uid)
    is_bootstrap_admin = firebase_user.email.lower() in settings.bootstrap_admin_emails

    if existing_context:
        if is_bootstrap_admin:
            return await bootstrap_site_for_admin(db, email=firebase_user.email, firebase_uid=firebase_user.uid)

        return existing_context

    if not is_bootstrap_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has not been invited to this ChildcAir site yet.",
        )

    return await bootstrap_site_for_admin(db, email=firebase_user.email, firebase_uid=firebase_user.uid)
