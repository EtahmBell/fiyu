from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from fiyu import api
from fiyu.taste_phrasing import (
    COPY_VERSION,
    TastePhraseResponse,
    compact_findings_payload,
    phrase_taste_snapshot,
    snapshot_needs_copy,
    with_deterministic_copy,
)
from fiyu.user_fiyu_summary import TasteFacet, _fallback_copy


def _snapshot() -> dict[str, object]:
    return {
        "milestone": 10,
        "rated_visit_count": 10,
        "overall_average": 3.9,
        "insights": [
            {
                "id": "emerging:creative",
                "type": "emerging",
                "facet_key": "creative",
                "facet_label": "Creative cooking",
                "confidence": "emerging",
                "direction": "positive",
                "headline": "An early pull toward creative cooking",
                "description": "Old copy",
                "supporting_text": "4.5★ across 2 rated restaurants.",
                "support_count": 2,
                "average_rating": 4.5,
                "delta_from_user_average": 0.6,
                "save_affinity": 0.2,
                "visit_affinity": 0.1,
                "evidence_summary": "4.5★ across 2 rated restaurants.",
                "change_status": "new",
            }
        ],
        "tags": [{"key": "creative", "label": "Creative"}],
        "uniqueness": None,
        "taste_type": None,
        "private_note": "must never leave the application",
        "place_ids": ["secret-place-id"],
    }


class _Responses:
    def __init__(self, parsed: object = None, error: Exception | None = None):
        self.parsed = parsed
        self.error = error
        self.calls: list[dict[str, object]] = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(output_parsed=self.parsed)


def _client(parsed: object = None, error: Exception | None = None):
    return SimpleNamespace(responses=_Responses(parsed, error))


def test_compact_payload_contains_only_derived_supported_findings():
    payload = compact_findings_payload(with_deterministic_copy(_snapshot()))
    serialized = repr(payload)

    assert set(payload) == {"user_overall_rating", "milestone", "findings"}
    assert set(payload["findings"][0]) == {
        "facet",
        "label",
        "direction",
        "confidence",
        "support_count",
        "rating_delta",
        "save_affinity",
        "visit_affinity",
        "change_status",
    }
    assert "private_note" not in serialized
    assert "secret-place-id" not in serialized


def test_valid_phrasing_changes_copy_only_and_preserves_deterministic_finding():
    client = _client(
        TastePhraseResponse.model_validate(
            {
                "insights": [
                    {
                        "facet_key": "creative",
                        "headline": "Creative cooking keeps finding you",
                        "description": "Unexpected approaches are becoming a pattern among places that land well.",
                    }
                ]
            }
        )
    )
    result = phrase_taste_snapshot(_snapshot(), client=client, enabled=True)
    insight = result["insights"][0]

    assert result["copy_source"] == "llm"
    assert insight["headline"] == "Creative cooking keeps finding you"
    assert insight["description"].startswith("Unexpected approaches")
    assert insight["supporting_text"] == insight["description"]
    assert insight["direction"] == "positive"
    assert insight["confidence"] == "emerging"
    assert insight["evidence_summary"] == "4.5★ across 2 rated restaurants."
    assert len(client.responses.calls) == 1
    assert "tools" not in client.responses.calls[0]


def test_unsupported_output_falls_back_without_adding_an_insight():
    result = phrase_taste_snapshot(
        _snapshot(),
        client=_client(
            {
                "insights": [
                    {
                        "facet_key": "luxury",
                        "headline": "You love luxury",
                        "description": "An unsupported claim.",
                    }
                ]
            }
        ),
        enabled=True,
    )

    assert result["copy_source"] == "deterministic_fallback"
    assert [item["facet_key"] for item in result["insights"]] == ["creative"]
    assert result["insights"][0]["headline"] == "Creative cooking is showing up more often"


def test_early_finding_cannot_be_rephrased_as_a_strong_claim():
    snapshot = _snapshot()
    snapshot["insights"][0]["type"] = "early_signal"
    snapshot["insights"][0]["confidence"] = "early"
    result = phrase_taste_snapshot(
        snapshot,
        client=_client(
            {
                "insights": [
                    {
                        "facet_key": "creative",
                        "headline": "You always love creative cooking",
                        "description": "This is your clearest pattern.",
                    }
                ]
            }
        ),
        enabled=True,
    )

    assert result["copy_source"] == "deterministic_fallback"
    assert result["insights"][0]["confidence"] == "early"
    assert result["insights"][0]["direction"] == "positive"


def test_timeout_returns_confidence_aware_deterministic_fallback():
    result = phrase_taste_snapshot(
        _snapshot(), client=_client(error=TimeoutError("timed out")), enabled=True
    )

    assert result["copy_source"] == "deterministic_fallback"
    assert result["insights"][0]["headline"] == "Creative cooking is showing up more often"
    assert "4.5★" not in result["insights"][0]["description"]


def test_fallback_copy_varies_by_supported_finding_type():
    creative = _fallback_copy(
        facet=TasteFacet("creative", "Creative cooking", "food_style"),
        insight_type="emerging",
        direction="positive",
        support=2,
        save_rate=0,
        visit_rate=0,
    )
    counter = _fallback_copy(
        facet=TasteFacet("counter_seating", "Counter spots", "dining_format"),
        insight_type="emerging",
        direction="positive",
        support=0,
        save_rate=0,
        visit_rate=0.4,
    )
    broad = _fallback_copy(
        facet=TasteFacet("taste_breadth", "Broad exploration", "breadth"),
        insight_type="early_signal",
        direction="neutral",
        support=5,
        save_rate=0,
        visit_rate=0,
    )
    formal = _fallback_copy(
        facet=TasteFacet("refined", "Refined dining", "atmosphere"),
        insight_type="contrast",
        direction="negative",
        support=3,
        save_rate=0,
        visit_rate=0,
    )

    assert creative[0] == "Creative cooking is showing up more often"
    assert counter[0] == "Counter spots keep making the cut"
    assert broad[0] == "You're still exploring widely"
    assert formal[0] == "Formal dining seems less convincing so far"
    assert len({creative[0], counter[0], broad[0], formal[0]}) == 4


def test_strict_output_schema_rejects_extra_fields():
    with pytest.raises(ValidationError):
        TastePhraseResponse.model_validate(
            {
                "insights": [
                    {
                        "facet_key": "creative",
                        "headline": "Creative cooking is becoming a pattern",
                        "description": "A supported description.",
                        "confidence": "strong",
                    }
                ]
            }
        )


def test_snapshot_copy_is_created_once_then_reused(monkeypatch):
    rows: dict[tuple[str, int], dict[str, object]] = {}
    calls = 0

    def get_snapshot(*, user_id: str, milestone: int):
        return rows.get((user_id, milestone))

    def upsert(*, user_id: str, milestone: int, snapshot: dict[str, object]):
        row = {"snapshot": snapshot, "acknowledged_at": None}
        rows[(user_id, milestone)] = row
        return row

    def phrase(snapshot):
        nonlocal calls
        calls += 1
        return with_deterministic_copy(snapshot)

    monkeypatch.setattr(api.shared_user_data, "get_taste_snapshot", get_snapshot)
    monkeypatch.setattr(api.shared_user_data, "upsert_taste_snapshot", upsert)
    monkeypatch.setattr(api.taste_phrasing, "phrase_taste_snapshot", phrase)

    first = api._ensure_taste_snapshot_copy(
        user_id="user-a", milestone=10, generated_snapshot=_snapshot()
    )
    second = api._ensure_taste_snapshot_copy(
        user_id="user-a", milestone=10, generated_snapshot=_snapshot()
    )

    assert calls == 1
    assert first == second
    assert first["snapshot"]["copy_version"] == COPY_VERSION
    assert snapshot_needs_copy(first["snapshot"]) is False


def test_legacy_snapshot_without_generated_copy_is_repaired_once(monkeypatch):
    legacy = _snapshot()
    legacy.pop("taste_type")
    row: dict[str, object] = {"snapshot": legacy, "acknowledged_at": "already-seen"}
    calls = 0

    def phrase(snapshot):
        nonlocal calls
        calls += 1
        return with_deterministic_copy(snapshot)

    def replace(*, user_id: str, milestone: int, snapshot: dict[str, object]):
        assert (user_id, milestone) == ("user-a", 10)
        row["snapshot"] = snapshot
        return row

    monkeypatch.setattr(api.shared_user_data, "get_taste_snapshot", lambda **_: row)
    monkeypatch.setattr(api.shared_user_data, "replace_taste_snapshot", replace)
    monkeypatch.setattr(api.taste_phrasing, "phrase_taste_snapshot", phrase)

    first = api._ensure_taste_snapshot_copy(
        user_id="user-a", milestone=10, generated_snapshot=_snapshot()
    )
    second = api._ensure_taste_snapshot_copy(
        user_id="user-a", milestone=10, generated_snapshot=_snapshot()
    )

    assert calls == 1
    assert first == second
    assert row["acknowledged_at"] == "already-seen"
