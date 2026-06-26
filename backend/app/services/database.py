from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING

from app.config import settings

client: AsyncIOMotorClient | None = None
database: AsyncIOMotorDatabase | None = None


async def connect_to_mongo() -> None:
    global client, database

    if not settings.mongodb_uri:
        return

    client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    database = client[settings.mongodb_db]
    await client.admin.command("ping")
    await ensure_indexes(database)


async def close_mongo_connection() -> None:
    global client, database

    if client:
        client.close()

    client = None
    database = None


def get_database() -> AsyncIOMotorDatabase:
    if database is None:
        raise RuntimeError("Database connection is not initialized.")

    return database


async def check_database_connection() -> bool:
    if client is None:
        return False

    try:
        await client.admin.command("ping")
        return True
    except Exception:
        return False


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.sites.create_index([("siteId", ASCENDING)], unique=True)
    await db.users.create_index([("firebaseUid", ASCENDING)], unique=True)
    await db.users.create_index([("email", ASCENDING)], unique=True)
    await db.roles.create_index([("siteId", ASCENDING), ("roleId", ASCENDING)], unique=True)
    await db.classrooms.create_index([("siteId", ASCENDING), ("name", ASCENDING)], unique=True)
    await db.custom_lists.create_index([("siteId", ASCENDING), ("listType", ASCENDING)], unique=True)
