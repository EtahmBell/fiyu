from scripts.audit_floor70_prepublication_v4_final import (
    _catalog_scenario,
    adjustment_bands,
    score_bands,
)


def _row(
    place_id: str,
    score: float,
    *,
    published: bool = False,
    lineage: str = "v3",
) -> dict[str, object]:
    return {
        "place_id": place_id,
        "score": score,
        "is_published": published,
        "review_status": "candidate" if published else "auto_rejected",
        "review_notes": None if published else "score_or_product_policy_rejected",
        "product_eligible": True,
        "canonical_chain_excluded": False,
        "canonical_category": "published" if published else "score_only_rejected",
        "canonical_block_reasons": [],
        "base_readiness_missing": [],
        "lineage": lineage,
    }


def test_adjustment_bands_partition_boundaries() -> None:
    values = [-9, -8, -5, -3, -1, -0.5, 0.49, 0.5, 0.99, 1, 3, 5, 8, 12]
    bands = adjustment_bands(values)
    assert sum(bands.values()) == len(values)
    assert bands["< -8"] == 1
    assert bands["-8 to -5"] == 1
    assert bands[">= +12"] == 1


def test_score_bands_use_requested_cutoffs() -> None:
    bands = score_bands([67.99, 68, 68.99, 69, 69.99, 70, 70.5, 71, 72, 75])
    assert bands == {
        "68.00-68.99": 2,
        "69.00-69.99": 2,
        "70.00-70.49": 1,
        "70.50-70.99": 1,
        "71.00-71.99": 1,
        "72.00-74.99": 1,
        "75+": 1,
    }


def test_catalog_scenario_uses_v4_for_cohort_and_keeps_v3_separate() -> None:
    rows = [
        _row("published-pass", 80, published=True, lineage="v4"),
        _row("published-remove", 67, published=True, lineage="v3"),
        _row("cohort-pass", 72),
        _row("cohort-fail", 72),
        _row("existing-v4", 71, lineage="v4"),
        _row("needs-v4", 71, lineage="v3"),
    ]
    scenario = _catalog_scenario(
        rows,
        {"cohort-pass": 70.5, "cohort-fail": 69.5},
        70,
    )
    assert scenario["currently_published_below_floor"] == 1
    assert scenario["v4_ready_additions"] == 2
    assert scenario["v3_rows_needing_v4"] == 1
    assert scenario["safe_v4_first_catalog_size"] == 3
    assert scenario["raw_threshold_only_catalog_size"] == 4
