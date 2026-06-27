from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.deps import FirebaseUser, get_current_firebase_user
from app.services.auth_context import resolve_current_user_context
from app.services.database import get_database
from app.services.events import create_event_record, serialize_event

router = APIRouter(tags=["daily care"])

ACTIVITY_EVENT_TYPES = {
    "Circle Time": "activity.circle_time",
    "Outside Time": "activity.outside",
    "Art": "activity.art",
    "Music": "activity.music",
    "Story Time": "activity.story_time",
    "Group Lesson": "activity.group_lesson",
    "Sensory Activity": "activity.sensory",
    "Water Play": "activity.water_play",
    "Field Trip": "activity.field_trip",
}

MEAL_EVENT_TYPES = {
    "Breakfast": "meal.breakfast",
    "Snack": "meal.snack",
    "Lunch": "meal.lunch",
    "PM Snack": "meal.pm_snack",
}


class DailyCareBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    studentIds: list[str] = Field(..., min_length=1)
    classroomId: str = Field(..., min_length=1)
    timestamp: datetime | None = None
    notes: str = ""

    @field_validator("classroomId")
    @classmethod
    def required_classroom(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("Classroom is required.")

        return stripped


class ActivityRequest(DailyCareBase):
    activityType: str = Field(..., min_length=1)

    @field_validator("activityType")
    @classmethod
    def required_activity_type(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("Activity type is required.")

        return stripped


class MealRequest(DailyCareBase):
    mealType: str = Field(..., min_length=1)

    @field_validator("mealType")
    @classmethod
    def required_meal_type(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("Meal type is required.")

        return stripped


async def _current_user_site(
    db: AsyncIOMotorDatabase,
    firebase_user: FirebaseUser,
) -> tuple[dict[str, Any], str]:
    user = await resolve_current_user_context(db, firebase_user)
    return user, user["siteId"]


async def _custom_list_item_or_422(db: AsyncIOMotorDatabase, site_id: str, list_key: str, value: str) -> dict[str, Any]:
    item = await db.custom_lists.find_one({"siteId": site_id, "listKey": list_key, "value": value, "active": True})

    if not item:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {list_key}.")

    return item


async def _create_daily_event(
    db: AsyncIOMotorDatabase,
    *,
    firebase_user: FirebaseUser,
    payload: DailyCareBase,
    event_type: str,
    audit_action: str,
    metadata: dict[str, Any],
    notes: str,
) -> dict[str, Any]:
    actor_user, site_id = await _current_user_site(db, firebase_user)
    event = await create_event_record(
        db,
        site_id=site_id,
        actor_user=actor_user,
        event_type=event_type,
        student_ids=payload.studentIds,
        classroom_id=payload.classroomId,
        timestamp=payload.timestamp,
        notes=notes,
        metadata=metadata,
        audit_action=audit_action,
    )
    return serialize_event(event)


@router.post("/activities", status_code=status.HTTP_201_CREATED)
async def log_activity(
    payload: ActivityRequest,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    _, site_id = await _current_user_site(db, firebase_user)
    activity_type = payload.activityType.strip()
    item = await _custom_list_item_or_422(db, site_id, "activity_type", activity_type)
    event_type = ACTIVITY_EVENT_TYPES.get(activity_type)

    if not event_type:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported activity type.")

    return await _create_daily_event(
        db,
        firebase_user=firebase_user,
        payload=payload,
        event_type=event_type,
        audit_action="activity.logged",
        metadata={"activityType": activity_type},
        notes=payload.notes or item.get("label", activity_type),
    )


@router.post("/meals", status_code=status.HTTP_201_CREATED)
async def log_meal(
    payload: MealRequest,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    _, site_id = await _current_user_site(db, firebase_user)
    meal_type = payload.mealType.strip()
    item = await _custom_list_item_or_422(db, site_id, "meal_type", meal_type)
    event_type = MEAL_EVENT_TYPES.get(meal_type)

    if not event_type:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported meal type.")

    return await _create_daily_event(
        db,
        firebase_user=firebase_user,
        payload=payload,
        event_type=event_type,
        audit_action="meal.logged",
        metadata={"mealType": meal_type},
        notes=payload.notes or item.get("label", meal_type),
    )


@router.post("/naps/start", status_code=status.HTTP_201_CREATED)
async def start_nap(
    payload: DailyCareBase,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    return await _create_daily_event(
        db,
        firebase_user=firebase_user,
        payload=payload,
        event_type="nap.started",
        audit_action="nap.started",
        metadata={"napAction": "started"},
        notes=payload.notes or "Nap Started",
    )


@router.post("/naps/end", status_code=status.HTTP_201_CREATED)
async def end_nap(
    payload: DailyCareBase,
    firebase_user: FirebaseUser = Depends(get_current_firebase_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    return await _create_daily_event(
        db,
        firebase_user=firebase_user,
        payload=payload,
        event_type="nap.ended",
        audit_action="nap.ended",
        metadata={"napAction": "ended"},
        notes=payload.notes or "Nap Ended",
    )
