from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class FirebaseUser:
    uid: str
    email: str
    claims: dict[str, Any]


@lru_cache(maxsize=1)
def get_firebase_app() -> firebase_admin.App:
    if firebase_admin._apps:
        return firebase_admin.get_app()

    options = {"projectId": settings.firebase_project_id} if settings.firebase_project_id else None

    if settings.firebase_client_email and settings.firebase_private_key and settings.firebase_project_id:
        firebase_credential = credentials.Certificate(
            {
                "type": "service_account",
                "project_id": settings.firebase_project_id,
                "private_key": settings.firebase_private_key.replace("\\n", "\n"),
                "client_email": settings.firebase_client_email,
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        )
        return firebase_admin.initialize_app(firebase_credential, options)

    return firebase_admin.initialize_app(options=options)


def verify_firebase_token(token: str) -> dict[str, Any]:
    get_firebase_app()
    return auth.verify_id_token(token)


async def get_current_firebase_user(
    credentials_value: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> FirebaseUser:
    if not credentials_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization bearer token.",
        )

    try:
        decoded_token = verify_firebase_token(credentials_value.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase token.",
        ) from exc

    email = decoded_token.get("email")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Firebase token does not include an email address.",
        )

    return FirebaseUser(uid=decoded_token["uid"], email=email, claims=decoded_token)


# Future MongoDB client/session dependencies belong here.
