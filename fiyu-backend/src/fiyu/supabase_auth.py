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
    """A sanitized provider failure with a stable category for API mapping."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "unknown_auth_error",
        status: int | None = None,
    ) -> None:
        if code == "unknown_auth_error":
            normalized = message.lower()
            if "invalid login" in normalized:
                code = "invalid_credentials"
            elif "confirm" in normalized or "verif" in normalized:
                code = "email_not_confirmed"
            elif "already" in normalized or "registered" in normalized:
                code = "user_already_exists"
        super().__init__(message)
        self.code = code
        self.status = status


def _provider_error_code(detail: dict[str, Any], status: int) -> str:
    provider_code = str(detail.get("error_code") or detail.get("code") or "").lower()
    message = str(detail.get("msg") or detail.get("message") or "").lower()
    combined = f"{provider_code} {message}"
    if status == 429 or "rate" in combined or "too many" in combined:
        return "rate_limited"
    if "email_not_confirmed" in combined or ("email" in combined and "confirm" in combined):
        return "email_not_confirmed"
    if "invalid_credentials" in combined or "invalid login" in combined:
        return "invalid_credentials"
    if "user_already_exists" in combined or "already registered" in combined:
        return "user_already_exists"
    if "signup_disabled" in combined or "signup is disabled" in combined:
        return "signup_disabled"
    if status >= 500:
        return "service_unavailable"
    if status == 400:
        return "bad_request"
    return "unknown_auth_error"


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
        raise SupabaseAuthError(
            str(message), code=_provider_error_code(detail, exc.code), status=exc.code
        ) from None
    except TimeoutError:
        raise SupabaseAuthError(
            "Authentication provider timed out", code="request_timeout"
        ) from None
    except URLError as exc:
        code = "request_timeout" if isinstance(exc.reason, TimeoutError) else "service_unavailable"
        raise SupabaseAuthError("Authentication provider is unavailable", code=code) from None
    except json.JSONDecodeError:
        raise SupabaseAuthError(
            "Authentication provider returned an invalid response",
            code="service_unavailable",
        ) from None
    if not isinstance(body, dict):
        raise SupabaseAuthError(
            "Authentication provider returned an invalid response",
            code="service_unavailable",
        )
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
        raise SupabaseAuthError("Missing authentication token", code="invalid_credentials")
    token = authorization[7:].strip()
    if not token:
        raise SupabaseAuthError("Missing authentication token", code="invalid_credentials")
    user = _request("/auth/v1/user", method="GET", access_token=token)
    try:
        user["id"] = str(UUID(str(user["id"])))
    except (KeyError, ValueError):
        raise SupabaseAuthError(
            "Authentication provider returned an invalid user",
            code="service_unavailable",
        ) from None
    return user
