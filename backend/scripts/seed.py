import asyncio
import os
import sys
from pathlib import Path


sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.services.bootstrap import seed_two_rivers
from app.services.database import close_mongo_connection, connect_to_mongo, get_database


def print_summary(summary: dict[str, dict[str, int]]) -> None:
    print(f"Seeded database: {settings.mongodb_db}")

    for collection, counts in summary.items():
        print(f"{collection}: inserted={counts['inserted']} existing={counts['existing']}")


async def run_seed() -> None:
    await connect_to_mongo()

    try:
        summary = await seed_two_rivers(
            get_database(),
            admin_email=os.getenv("SEED_ADMIN_EMAIL") or None,
            admin_firebase_uid=os.getenv("SEED_ADMIN_FIREBASE_UID") or None,
        )
        print_summary(summary)
    finally:
        await close_mongo_connection()


def main() -> None:
    asyncio.run(run_seed())


if __name__ == "__main__":
    main()
