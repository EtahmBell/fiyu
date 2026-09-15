import io
import json
from urllib.error import HTTPError, URLError

import pytest

from fiyu import supabase_auth


@pytest.mark.parametrize(
    ("provider_code", "status", "expected"),
    [
        ("invalid_credentials", 400, "invalid_credentials"),
        ("email_not_confirmed", 400, "email_not_confirmed"),
        ("user_already_exists", 422, "user_already_exists"),
        ("over_request_rate_limit", 429, "rate_limited"),
        ("unknown", 503, "service_unavailable"),
    ],
)
def test_provider_errors_are_classified_by_code_and_status(
    monkeypatch, provider_code, status, expected
):
    monkeypatch.setenv("SUPABASE_URL", "https://public-project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-test-key")

    def fail(request, timeout):
        assert timeout == 10
        raise HTTPError(
            request.full_url,
            status,
            "provider failure",
            {},
            io.BytesIO(json.dumps({"error_code": provider_code, "msg": "private"}).encode()),
        )

    monkeypatch.setattr(supabase_auth, "urlopen", fail)
    with pytest.raises(supabase_auth.SupabaseAuthError) as raised:
        supabase_auth.sign_in_with_supabase(email="person@example.com", password="private")

    assert raised.value.code == expected
    assert raised.value.status == status


@pytest.mark.parametrize(
    ("reason", "expected"),
    [(TimeoutError(), "request_timeout"), (OSError("connection refused"), "service_unavailable")],
)
def test_provider_transport_errors_are_not_credentials(monkeypatch, reason, expected):
    monkeypatch.setenv("SUPABASE_URL", "https://public-project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-test-key")
    monkeypatch.setattr(
        supabase_auth,
        "urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(URLError(reason)),
    )
    with pytest.raises(supabase_auth.SupabaseAuthError) as raised:
        supabase_auth.sign_in_with_supabase(email="person@example.com", password="private")
    assert raised.value.code == expected
