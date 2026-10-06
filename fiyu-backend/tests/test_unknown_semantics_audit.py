from scripts.audit_unknown_semantics import (
    delta_bands,
    specialist_neutral_delta,
    threshold_effects,
)


def test_specialist_neutral_delta_keeps_weights_fixed() -> None:
    assert specialist_neutral_delta(chain_excluded=False, product_cap=False) == 0.95
    assert specialist_neutral_delta(chain_excluded=True, product_cap=False) == 0
    assert specialist_neutral_delta(chain_excluded=False, product_cap=True) == 0


def test_threshold_effects_uses_current_score_as_baseline() -> None:
    rows = [
        {"place_id": "cross", "score": 69.2, "delta": 0.95},
        {"place_id": "stay", "score": 68.0, "delta": 0.0},
        {"place_id": "unscored", "score": None, "delta": 5.0},
    ]
    effects = threshold_effects(rows, "delta")
    assert effects["70"]["currently_below"] == 2
    assert effects["70"]["cross_upward"] == 1
    assert effects["70"]["cross_downward"] == 0


def test_delta_bands_are_complete_at_boundaries() -> None:
    values = [-2, -1.5, -0.75, 0.49, 0.5, 1, 2, 3]
    assert list(delta_bands(values).values()) == [1, 1, 1, 1, 1, 1, 1, 1]
