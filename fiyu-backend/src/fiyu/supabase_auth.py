from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID


class SupabaseConfigurationError(RuntimeError):
    pass


class SupabaseAuthError(RuntimeError):
    pass


def _configuration() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not url or not anon_key:
        raise SupabaseConfigurationError("Supabase Auth is not configured")
    return url, anon_key


def _request(
    path: str,
    *,
    method: str,
    payload: dict[str, object] | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    url, anon_key = _configuration()
    headers = {"apikey": anon_key, "Content-Type": "application/json"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(f"{url}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            detail = {}
        message = detail.get("msg") or detail.get("message") or "Authentication failed"
        raise SupabaseAuthError(str(message)) from None
    except (URLError, TimeoutError, json.JSONDecodeError):
        raise SupabaseAuthError("Authentication provider is unavailable") from None
    if not isinstance(body, dict):
        raise SupabaseAuthError("Authentication provider returned an invalid response")
    return body


def sign_up_with_supabase(*, email: str, password: str, username: str) -> dict[str, Any]:
    return _request(
        "/auth/v1/signup",
        method="POST",
        payload={"email": email, "password": password, "data": {"username": username}},
    )


def sign_in_with_supabase(*, email: str, password: str) -> dict[str, Any]:
    return _request(
        "/auth/v1/token?grant_type=password",
        method="POST",
        payload={"email": email, "password": password},
    )


def authenticated_supabase_user(authorization: str | None) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise SupabaseAuthError("Missing authentication token")
    token = authorization[7:].strip()
    if not token:
        raise SupabaseAuthError("Missing authentication token")
    user = _request("/auth/v1/user", method="GET", access_token=token)
    try:
        user["id"] = str(UUID(str(user["id"])))
    except (KeyError, ValueError):
        raise SupabaseAuthError("Authentication provider returned an invalid user") from None
    return user
