import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = "ChildcAir API"
    mongodb_uri: str | None = os.getenv("MONGODB_URI")
    mongodb_db: str | None = os.getenv("MONGODB_DB")


settings = Settings()
