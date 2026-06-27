import os
from dataclasses import dataclass

from dotenv import find_dotenv, load_dotenv


load_dotenv(find_dotenv(usecwd=True))


def _get_csv(name: str) -> tuple[str, ...]:
    return tuple(item.strip().lower() for item in os.getenv(name, "").split(",") if item.strip())


def _get_list(name: str, default: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in os.getenv(name, default).split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    app_name: str = "ChildcAir API"
    mongodb_uri: str | None = os.getenv("MONGODB_URI")
    mongodb_db: str = os.getenv("MONGODB_DB", "childcAir_dev")
    bootstrap_admin_emails: tuple[str, ...] = _get_csv("BOOTSTRAP_ADMIN_EMAILS")
    default_site_id: str = os.getenv("DEFAULT_SITE_ID", "two-rivers")
    default_site_name: str = os.getenv("DEFAULT_SITE_NAME", "Two Rivers Academy")
    frontend_origins: tuple[str, ...] = _get_list(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    firebase_project_id: str | None = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("VITE_FIREBASE_PROJECT_ID")
    firebase_client_email: str | None = os.getenv("FIREBASE_CLIENT_EMAIL")
    firebase_private_key: str | None = os.getenv("FIREBASE_PRIVATE_KEY")
    google_application_credentials: str | None = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")


settings = Settings()
