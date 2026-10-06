from scripts.audit_floor70_admission_readiness import (
    classify_lineage,
    deterministic_near_cutoff,
)


def test_classify_lineage_uses_supported_production_prefixes() -> None:
    assert classify_lineage("public-v4-quality-research-specialist-tristate") == "v4"
    assert classify_lineage("public-v3-local-discovery-specialist-tristate") == "v3"
    assert classify_lineage("experimental") == "other"
    assert classify_lineage(None) == "other"


def test_near_cutoff_sample_is_deterministic_and_prefers_closest_scores() -> None:
    rows = [
        {"score": 71.0, "place_id": "c"},
        {"score": 70.1, "place_id": "b"},
        {"score": 70.1, "place_id": "a"},
        {"score": 72.0, "place_id": "d"},
    ]
    assert [row["place_id"] for row in deterministic_near_cutoff(rows, 3)] == [
        "a",
        "b",
        "c",
    ]
