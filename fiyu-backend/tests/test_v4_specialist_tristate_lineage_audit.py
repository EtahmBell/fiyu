from scripts.audit_v4_specialist_tristate_lineage import (
    _distribution,
    counterfactual_old_status,
)


def test_counterfactual_old_status_uses_migration_provenance() -> None:
    assert counterfactual_old_status({"prior_boolean_value": True}) == "specialist"
    assert (
        counterfactual_old_status({"prior_boolean_value": False}) == "non_specialist"
    )
    assert counterfactual_old_status({}) is None


def test_distribution_reports_exact_counterfactual_range() -> None:
    assert _distribution([0.0, -0.95, -0.95]) == {
        "count": 3,
        "min": -0.95,
        "median": -0.95,
        "max": 0.0,
    }
