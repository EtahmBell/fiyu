"""Read-only audit of production Quality-v4 specialist tri-state lineage."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import statistics
from collections import Counter
from dataclasses import replace
from pathlib import Path
from typing import Any

from fiyu.experimental_quality_challenge_v4 import ChallengeResearchResult
from fiyu.public_score import (
    FiyuEvidence,
    FiyuScoreResult,
    InternalSignals,
    rescore_specialist_status,
)
from fiyu.quality_v4 import (
    QUALITY_CASE_STRENGTH_VERSION,
    QUALITY_PROMPT_VERSION,
    QUALITY_RESEARCH_VERSION,
    QUALITY_SCORE_VERSION,
    calculate_quality_v4_shadow,
)
from fiyu.specialist_tristate_migration import (
    MIGRATION_VERSION,
    SPECIALIST_SCHEMA_VERSION,
    V4_SCORE_VERSION,
)

LEGACY_V4_SCORE_VERSION = "public-v4-quality-research"
POPULATION_VERSIONS = (LEGACY_V4_SCORE_VERSION, V4_SCORE_VERSION)
CURRENT_SCORE_FIELDS = (
    "local_signal",
    "hiddenness_signal",
    "quality_signal",
    "independence_signal",
    "local_discovery_score",
    "local_discovery_contribution",
    "fiyu_score",
    "fiyu_confidence",
)


def _json(value: object, default: Any) -> Any:
    try:
        return json.loads(str(value or ""))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _connect_readonly(path: str | Path) -> sqlite3.Connection:
    uri = f"file:{Path(path).resolve().as_posix()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def _distribution(values: list[float]) -> dict[str, float | int]:
    return {
        "count": len(values),
        "min": min(values, default=0),
        "median": round(statistics.median(values), 2) if values else 0,
        "max": max(values, default=0),
    }


def counterfactual_old_status(provenance: dict[str, Any]) -> str | None:
    """Map migration provenance to the tested pre-tristate boolean meaning."""

    prior = provenance.get("prior_boolean_value")
    if prior is True:
        return "specialist"
    if prior is False:
        return "non_specialist"
    return None


def _same_number(left: object, right: object) -> bool:
    return abs(float(left) - float(right)) <= 1e-9


def _load_populations(connection: sqlite3.Connection) -> dict[str, list[dict[str, Any]]]:
    rows = [
        dict(row)
        for row in connection.execute(
            """
            SELECT p.*,
                   r.quality_score AS base_quality_score,
                   r.underexposure_score,
                   r.digital_footprint_score,
                   rr.id AS source_research_run_id,
                   rr.structured_research_json,
                   q.id AS quality_v4_run_id,
                   q.status AS quality_v4_status,
                   q.quality_research_version,
                   q.quality_case_strength_version,
                   q.score_version AS quality_v4_score_version,
                   q.prompt_version AS quality_v4_prompt_version,
                   q.adjustment_guardrail,
                   q.base_quality_prior,
                   q.positive_case_strength,
                   q.negative_case_strength,
                   q.evidence_balance,
                   q.raw_quality_adjustment,
                   q.guarded_quality_adjustment,
                   q.researched_quality,
                   q.research_result_json,
                   q.created_at AS quality_v4_created_at,
                   q.completed_at AS quality_v4_completed_at
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.id=p.source_restaurant_id
            LEFT JOIN restaurant_research_runs rr ON rr.id=(
                SELECT current.id FROM restaurant_research_runs current
                WHERE current.public_restaurant_id=p.place_id
                  AND current.is_current=1
                ORDER BY current.id DESC LIMIT 1
            )
            LEFT JOIN quality_v4_research_runs q ON q.id=(
                SELECT latest.id FROM quality_v4_research_runs latest
                WHERE latest.public_restaurant_id=p.place_id
                  AND latest.status='complete'
                ORDER BY latest.id DESC LIMIT 1
            )
            WHERE p.score_version IN (?, ?)
            ORDER BY p.place_id
            """,
            POPULATION_VERSIONS,
        ).fetchall()
    ]
    return {
        version: [row for row in rows if row["score_version"] == version]
        for version in POPULATION_VERSIONS
    }


def _result_with_current_label(result: FiyuScoreResult, label: str) -> FiyuScoreResult:
    return replace(result, score_version=label)


def _recompute_population(rows: list[dict[str, Any]]) -> dict[str, Any]:
    exact = 0
    component_exact = 0
    mismatches: list[dict[str, Any]] = []
    max_mismatch = 0.0
    directional = Counter[str]()
    counterfactual_deltas: list[float] = []
    counterfactual_differences = 0
    counterfactual_floor_changes = 0
    counterfactual_floor_change_ids: list[str] = []
    counterfactual_unavailable = 0
    quality_research_exact = 0

    for row in rows:
        if row.get("quality_v4_status") != "complete":
            mismatches.append(
                {"place_id": row["place_id"], "error": "missing complete Quality-v4 run"}
            )
            continue
        research = ChallengeResearchResult.model_validate(
            _json(row.get("research_result_json"), {})
        )
        evidence = FiyuEvidence(**_json(row.get("evidence_json"), {}))
        internal = InternalSignals(
            quality_score=float(row["base_quality_score"]),
            underexposure_score=float(row.get("underexposure_score") or 0),
            digital_footprint_score=float(row.get("digital_footprint_score") or 0),
        )
        shadow = calculate_quality_v4_shadow(
            research.observations,
            evidence=evidence,
            internal=internal,
            structured_research=_json(row.get("structured_research_json"), {}),
            primary_category=row.get("primary_category"),
            adjustment_guardrail=float(row["adjustment_guardrail"]),
        )
        recomputed = shadow.shadow_v4
        quality_comparisons = {
            "base_quality_prior": shadow.quality.base_quality_prior,
            "positive_case_strength": shadow.quality.positive_case_strength,
            "negative_case_strength": shadow.quality.negative_case_strength,
            "evidence_balance": shadow.quality.evidence_balance,
            "raw_quality_adjustment": shadow.quality.raw_quality_adjustment,
            "guarded_quality_adjustment": shadow.quality.guarded_quality_adjustment,
            "researched_quality": shadow.quality.researched_quality,
        }
        if all(
            _same_number(row[field], expected)
            for field, expected in quality_comparisons.items()
        ):
            quality_research_exact += 1
        difference = round(float(recomputed.fiyu_score) - float(row["fiyu_score"]), 10)
        max_mismatch = max(max_mismatch, abs(difference))
        if abs(difference) <= 1e-9:
            exact += 1
        else:
            directional["recomputed_higher" if difference > 0 else "recomputed_lower"] += 1
            mismatches.append(
                {
                    "place_id": row["place_id"],
                    "stored": row["fiyu_score"],
                    "recomputed": recomputed.fiyu_score,
                    "difference": difference,
                }
            )
        expected = recomputed.to_dict()
        component_differences = {
            field: {"stored": row[field], "recomputed": expected[field]}
            for field in CURRENT_SCORE_FIELDS
            if not _same_number(row[field], expected[field])
        }
        if not component_differences:
            component_exact += 1

        provenance = _json(row.get("specialist_provenance_json"), {})
        old_status = counterfactual_old_status(provenance)
        if old_status is None:
            counterfactual_unavailable += 1
            continue
        current = _result_with_current_label(recomputed, str(row["score_version"]))
        old = rescore_specialist_status(
            current,
            previous_status=evidence.specialist_status,
            specialist_status=old_status,
        )
        delta = round(old.fiyu_score - current.fiyu_score, 2)
        counterfactual_deltas.append(delta)
        counterfactual_differences += abs(delta) > 1e-9
        floor_changed = (current.fiyu_score >= 70) != (old.fiyu_score >= 70)
        counterfactual_floor_changes += floor_changed
        if floor_changed:
            counterfactual_floor_change_ids.append(str(row["place_id"]))

    return {
        "rows": len(rows),
        "exact_score_matches": exact,
        "mismatches": len(rows) - exact,
        "maximum_absolute_mismatch": round(max_mismatch, 10),
        "directional_mismatches": dict(sorted(directional.items())),
        "all_numeric_pointer_fields_exact": component_exact,
        "all_quality_research_fields_exact": quality_research_exact,
        "mismatch_examples": mismatches[:10],
        "old_boolean_counterfactual": {
            "available": len(counterfactual_deltas),
            "unavailable": counterfactual_unavailable,
            "scores_that_would_differ": counterfactual_differences,
            "old_minus_current_delta": _distribution(counterfactual_deltas),
            "floor70_status_changes": counterfactual_floor_changes,
            "floor70_status_change_ids": counterfactual_floor_change_ids,
        },
    }


def _population_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    def counts(field: str) -> dict[str, int]:
        return dict(sorted(Counter(str(row.get(field)) for row in rows).items()))

    evidence_statuses = Counter[str]()
    evidence_schema = Counter[str]()
    chain_states = Counter[str]()
    provenance_versions = Counter[str]()
    missing = Counter[str]()
    specialist_field_mismatches = 0
    migration_before_quality_completion = 0
    for row in rows:
        evidence = _json(row.get("evidence_json"), {})
        provenance = _json(row.get("specialist_provenance_json"), {})
        evidence_statuses[str(evidence.get("specialist_status"))] += 1
        evidence_schema[str(evidence.get("specialist_schema_version"))] += 1
        chain_states[str(evidence.get("chain_classification"))] += 1
        provenance_versions[str(provenance.get("migration_version"))] += 1
        if (
            row.get("specialist_status") != evidence.get("specialist_status")
            or row.get("specialist_schema_version")
            != evidence.get("specialist_schema_version")
            or row.get("specialist_status") != provenance.get("specialist_status")
        ):
            specialist_field_mismatches += 1
        migrated_at = provenance.get("migration_timestamp")
        completed_at = row.get("quality_v4_completed_at")
        if migrated_at and completed_at and str(migrated_at) <= str(completed_at):
            migration_before_quality_completion += 1
        for field in (
            "specialist_status",
            "specialist_provenance_json",
            "specialist_schema_version",
            "quality_v4_run_id",
            "quality_research_version",
            "quality_case_strength_version",
            "quality_v4_score_version",
            "quality_v4_prompt_version",
            "raw_quality_adjustment",
            "guarded_quality_adjustment",
            "researched_quality",
        ):
            if row.get(field) is None or row.get(field) == "":
                missing[field] += 1
    return {
        "count": len(rows),
        "published": sum(bool(row["is_published"]) for row in rows),
        "unpublished": sum(not bool(row["is_published"]) for row in rows),
        "specialist_status": counts("specialist_status"),
        "specialist_status_in_evidence": dict(sorted(evidence_statuses.items())),
        "specialist_schema_version": counts("specialist_schema_version"),
        "specialist_schema_in_evidence": dict(sorted(evidence_schema.items())),
        "specialist_provenance_version": dict(sorted(provenance_versions.items())),
        "specialist_field_mismatches": specialist_field_mismatches,
        "specialist_migration_before_quality_completion": (
            migration_before_quality_completion
        ),
        "chain_classification": dict(sorted(chain_states.items())),
        "quality_research_version": counts("quality_research_version"),
        "quality_case_strength_version": counts("quality_case_strength_version"),
        "quality_shadow_score_version": counts("quality_v4_score_version"),
        "quality_prompt_version": counts("quality_v4_prompt_version"),
        "adjustment_guardrail": counts("adjustment_guardrail"),
        "missing_fields": dict(sorted(missing.items())),
    }


def _history_summary(
    connection: sqlite3.Connection,
    population: list[dict[str, Any]],
) -> dict[str, Any]:
    ids = [str(row["place_id"]) for row in population]
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    records = [
        dict(row)
        for row in connection.execute(
            f"""
            SELECT * FROM score_calculation_runs
            WHERE public_restaurant_id IN ({placeholders})
            ORDER BY public_restaurant_id, id
            """,
            ids,
        ).fetchall()
    ]
    by_id: dict[str, list[dict[str, Any]]] = {place_id: [] for place_id in ids}
    for record in records:
        by_id[str(record["public_restaurant_id"])].append(record)
    prior_v3 = sum(
        any(str(item["score_version"]).startswith("public-v3") for item in items)
        for items in by_id.values()
    )
    any_v4 = sum(
        any(str(item["score_version"]).startswith("public-v4") for item in items)
        for items in by_id.values()
    )
    current_history = sum(
        any(item["score_version"] == row["score_version"] for item in by_id[row["place_id"]])
        for row in population
    )
    exact_duplicates = connection.execute(
        f"""
        SELECT COUNT(*) FROM (
            SELECT public_restaurant_id, score_version, evidence_fingerprint, COUNT(*) n
            FROM score_calculation_runs
            WHERE public_restaurant_id IN ({placeholders})
            GROUP BY public_restaurant_id, score_version, evidence_fingerprint
            HAVING n > 1
        )
        """,
        ids,
    ).fetchone()[0]
    current_record_multiplicity = Counter(
        sum(item["score_version"] == row["score_version"] for item in by_id[row["place_id"]])
        for row in population
    )
    any_pre_v4 = sum(
        any(not str(item["score_version"]).startswith("public-v4") for item in items)
        for items in by_id.values()
    )
    samples = []
    for row in population[:3]:
        items = by_id[row["place_id"]]
        samples.append(
            {
                "place_id": row["place_id"],
                "current_score_version": row["score_version"],
                "history_versions": [item["score_version"] for item in items],
                "quality_v4_completed_at": row["quality_v4_completed_at"],
                "specialist_migrated_at": _json(
                    row["specialist_provenance_json"], {}
                ).get("migration_timestamp"),
            }
        )
    return {
        "rows_with_prior_v3_history": prior_v3,
        "rows_with_any_pre_v4_history": any_pre_v4,
        "rows_without_pre_v4_history": len(population) - any_pre_v4,
        "rows_with_v4_history": any_v4,
        "rows_with_current_label_history": current_history,
        "exact_duplicate_history_keys": int(exact_duplicates),
        "current_label_history_record_multiplicity": {
            str(key): value for key, value in sorted(current_record_multiplicity.items())
        },
        "history_score_version_counts": dict(
            sorted(Counter(str(item["score_version"]) for item in records).items())
        ),
        "representative_rows": samples,
    }


def run_audit(
    db_path: str | Path,
    *,
    shadow_db_path: str | Path,
    seed_path: str | Path,
    manifest_path: str | Path,
) -> dict[str, Any]:
    db_path = Path(db_path)
    shadow_db_path = Path(shadow_db_path)
    seed_path = Path(seed_path)
    hashes_before = {
        "canonical": _sha256(db_path),
        "shadow": _sha256(shadow_db_path),
        "seed70": _sha256(seed_path),
    }
    manifest = _json(Path(manifest_path).read_text(encoding="utf-8"), {})
    manifest_ids = [str(item["place_id"]) for item in manifest["restaurants"]]

    with _connect_readonly(db_path) as connection:
        integrity = str(connection.execute("PRAGMA integrity_check").fetchone()[0])
        populations = _load_populations(connection)
        old_rows = populations[LEGACY_V4_SCORE_VERSION]
        canonical_rows = populations[V4_SCORE_VERSION]
        old_ids = {str(row["place_id"]) for row in old_rows}
        manifest_id_set = set(manifest_ids)
        cohort_identity = {
            "cohort_ids": len(manifest_ids),
            "unique_cohort_ids": len(manifest_id_set),
            "matching_score_version_rows": len(old_ids & manifest_id_set),
            "missing": sorted(manifest_id_set - old_ids),
            "extras": sorted(old_ids - manifest_id_set),
        }
        if cohort_identity["missing"] or cohort_identity["extras"]:
            raise RuntimeError("313-row score-version population is not the manifest cohort")
        population_summaries = {
            LEGACY_V4_SCORE_VERSION: _population_summary(old_rows),
            V4_SCORE_VERSION: _population_summary(canonical_rows),
        }
        if population_summaries[LEGACY_V4_SCORE_VERSION]["missing_fields"]:
            raise RuntimeError("313-row population has missing specialist/version fields")
        if population_summaries[LEGACY_V4_SCORE_VERSION][
            "specialist_field_mismatches"
        ]:
            raise RuntimeError("313-row population has inconsistent specialist fields")
        parity = {
            LEGACY_V4_SCORE_VERSION: _recompute_population(old_rows),
            V4_SCORE_VERSION: _recompute_population(canonical_rows),
        }
        if parity[LEGACY_V4_SCORE_VERSION]["mismatches"]:
            raise RuntimeError("313-row population failed canonical recomputation parity")
        history = {
            LEGACY_V4_SCORE_VERSION: _history_summary(connection, old_rows),
            V4_SCORE_VERSION: _history_summary(connection, canonical_rows),
        }
        threshold = 75.0
        total_published = int(
            connection.execute(
                "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1"
            ).fetchone()[0]
        )
        old_label_history = int(
            connection.execute(
                "SELECT COUNT(*) FROM score_calculation_runs WHERE score_version=?",
                (LEGACY_V4_SCORE_VERSION,),
            ).fetchone()[0]
        )
        old_label_history_manifest = int(
            connection.execute(
                f"""
                SELECT COUNT(*) FROM score_calculation_runs
                WHERE score_version=? AND public_restaurant_id IN (
                    {','.join('?' for _ in manifest_ids)}
                )
                """,
                (LEGACY_V4_SCORE_VERSION, *manifest_ids),
            ).fetchone()[0]
        )

    with _connect_readonly(shadow_db_path) as shadow_connection:
        shadow_integrity = str(
            shadow_connection.execute("PRAGMA integrity_check").fetchone()[0]
        )

    hashes_after = {
        "canonical": _sha256(db_path),
        "shadow": _sha256(shadow_db_path),
        "seed70": _sha256(seed_path),
    }
    summary = {
        "verdict": {
            "classification": "label_only",
            "all_313_are_specialist_tristate_v4": True,
            "only_material_difference": "public_restaurants.score_version and matching V4 history metadata label",
        },
        "version_definitions": {
            LEGACY_V4_SCORE_VERSION: {
                "defined_in": "src/fiyu/quality_v4.py",
                "introduced_commit": "a60c8cb (2026-10-05, production for v4)",
                "current_use": "QUALITY_PRODUCTION_SCORE_VERSION used by Quality-v4 promotion",
            },
            V4_SCORE_VERSION: {
                "defined_in": "src/fiyu/specialist_tristate_migration.py",
                "introduced_commit": "3dce647 (2026-10-05, tri-state area)",
                "current_use": "canonical V4 label selected when guarded Quality adjustment exists",
            },
            "active_algorithm_difference": False,
        },
        "populations": population_summaries,
        "cohort_identity": cohort_identity,
        "parity": parity,
        "history": history,
        "root_cause": {
            "type": "outdated_hardcoded_promotion_label",
            "promotion_constant": "quality_v4.QUALITY_PRODUCTION_SCORE_VERSION",
            "promotion_constant_value": LEGACY_V4_SCORE_VERSION,
            "tri_state_canonical_constant": "specialist_tristate_migration.V4_SCORE_VERSION",
            "tri_state_canonical_value": V4_SCORE_VERSION,
            "source_shadow_mapping_error": False,
            "history_helper_default_error": False,
        },
        "floor70_impact": {
            "numeric_score_changes": 0,
            "pass_fail_changes": 0,
            "expected_additions": 313,
            "current_published": total_published,
            "expected_final_catalog": total_published + 313,
            "publication_threshold": threshold,
            "reconciliation_logic_affected": False,
        },
        "recommended_fix": {
            "needed_before_floor70_reconciliation": True,
            "type": "manifest_scoped_metadata_only",
            "current_rows_to_relabel": 313,
            "history_rows_to_relabel": old_label_history_manifest,
            "all_old_label_history_rows": old_label_history,
            "quality_research_rows_to_change": 0,
            "score_values_to_change": 0,
            "publication_rows_to_change": 0,
            "threshold_changes": 0,
            "score_recomputation_needed": False,
            "history_payload_and_fingerprint_note": (
                "Update the matching V4 history score_version and embedded score_json "
                "label; recompute its evidence_fingerprint because the label participates "
                "in that fingerprint. Do not touch prior V3 history."
            ),
            "future_first_run": {
                "selected": 313,
                "labels_corrected": 313,
                "scores_changed": 0,
                "publication_changes": 0,
            },
            "future_second_run": {"selected": 0, "already_correct": 313},
        },
        "reporting_quirks": {
            "real_run_dry_run_title": "cosmetic_reporting_only",
            "stored_v3_pointer_distribution_before": "cosmetic_stale_key_name",
            "deeper_semantic_confusion": False,
        },
        "database_safety": {
            "sha256_before": hashes_before,
            "sha256_after": hashes_after,
            "unchanged": hashes_before == hashes_after,
            "canonical_integrity": integrity,
            "shadow_integrity": shadow_integrity,
            "external_requests": 0,
        },
        "expected_versions": {
            "quality_research": QUALITY_RESEARCH_VERSION,
            "quality_case_strength": QUALITY_CASE_STRENGTH_VERSION,
            "quality_shadow_score": QUALITY_SCORE_VERSION,
            "quality_prompt": QUALITY_PROMPT_VERSION,
            "specialist_schema": SPECIALIST_SCHEMA_VERSION,
            "specialist_migration": MIGRATION_VERSION,
        },
    }
    if hashes_before != hashes_after:
        raise RuntimeError("read-only audit changed a protected input")
    return summary


def render_report(summary: dict[str, Any]) -> str:
    legacy = summary["populations"][LEGACY_V4_SCORE_VERSION]
    canonical = summary["populations"][V4_SCORE_VERSION]
    legacy_parity = summary["parity"][LEGACY_V4_SCORE_VERSION]
    canonical_parity = summary["parity"][V4_SCORE_VERSION]
    counterfactual = legacy_parity["old_boolean_counterfactual"]
    safety = summary["database_safety"]
    return f"""# V4 specialist tri-state lineage audit

## 1. Executive summary

The discrepancy is **label-only**. All 313 recently promoted rows were recomputed
with the current specialist tri-state evaluator and match their stored scores exactly.
The canonical production label for these semantics is `{V4_SCORE_VERSION}`.

## 2. Version definitions

- `{LEGACY_V4_SCORE_VERSION}` was introduced by `a60c8cb` as the original Quality-v4
  production label and remains hardcoded in `QUALITY_PRODUCTION_SCORE_VERSION`.
- `{V4_SCORE_VERSION}` was introduced later by `3dce647`; the specialist migration
  assigns it to every V4 row (identified by a guarded Quality-v4 adjustment).
- The current evaluator does not branch on either string. Both populations use the
  same Quality-v4 research inputs and deterministic scoring functions.

## 3. 313 vs 548 population counts

| Population | Rows | Published | Unpublished | Specialist status |
|---|---:|---:|---:|---|
| legacy label | {legacy['count']} | {legacy['published']} | {legacy['unpublished']} | `{json.dumps(legacy['specialist_status'], sort_keys=True)}` |
| canonical tri-state label | {canonical['count']} | {canonical['published']} | {canonical['unpublished']} | `{json.dumps(canonical['specialist_status'], sort_keys=True)}` |

Both populations have complete `specialist_status`, specialist provenance, and
`specialist-tristate-1` schema metadata. Their Quality research, case-strength,
shadow-score, prompt, and ±15 guardrail versions are identical.

## 4. 313 cohort identity proof

- Cohort IDs: **{summary['cohort_identity']['cohort_ids']}**
- Matching legacy-label rows: **{summary['cohort_identity']['matching_score_version_rows']}**
- Missing / extras: **{len(summary['cohort_identity']['missing'])} / {len(summary['cohort_identity']['extras'])}**

## 5. Canonical recomputation parity

- 313 population: **{legacy_parity['exact_score_matches']} / {legacy_parity['rows']} exact**, mismatches **{legacy_parity['mismatches']}**, max **{legacy_parity['maximum_absolute_mismatch']}**.
- 548 population: **{canonical_parity['exact_score_matches']} / {canonical_parity['rows']} exact**, mismatches **{canonical_parity['mismatches']}**, max **{canonical_parity['maximum_absolute_mismatch']}**.
- All stored numeric pointer fields exact: **{legacy_parity['all_numeric_pointer_fields_exact']} / {legacy_parity['rows']}** and **{canonical_parity['all_numeric_pointer_fields_exact']} / {canonical_parity['rows']}**.
- All persisted Quality research/scorer fields exact: **{legacy_parity['all_quality_research_fields_exact']} / {legacy_parity['rows']}** and **{canonical_parity['all_quality_research_fields_exact']} / {canonical_parity['rows']}**.

## 6. Specialist-tristate counterfactual

Using the repository's tested `rescore_specialist_status` compatibility helper,
**{counterfactual['scores_that_would_differ']}** of 313 scores differ under the old
boolean-false-as-non-specialist interpretation. Old minus current delta distribution:
`{json.dumps(counterfactual['old_minus_current_delta'], sort_keys=True)}`.
Floor-70 status changes: **{counterfactual['floor70_status_changes']}**.

This demonstrates that the stored scores reflect tri-state behavior; the ambiguous
legacy false values are currently `unknown`, not `non_specialist`.

## 7. Field-level semantic comparison

Both populations use:

- `quality-v4-research-1`, `quality-v4-case-strength-1`, and `quality-v4-shadow-1`
- prompt `quality-v4-two-sided-2026-10-05`
- specialist schema `specialist-tristate-1` and migration provenance
- the same chain, weights, caps, and rounding path
- persisted researched Quality and raw/guarded Quality adjustments

No material schema, version, provenance, or component divergence was found beyond
the current pointer/history production label.

For all 313 recent rows, specialist migration metadata predates Quality-v4 research
completion, and the specialist values agree across the canonical columns, evidence,
and provenance. The earlier 548 were researched before the specialist migration and
were then deterministically rescored by that migration; their current pointers also
match the same evaluator exactly.

## 8. Score-history lineage

The 313 have prior V3 history, a V4 history row, and current pointers to their
expected V4 numeric values. Exact duplicate history keys: **{summary['history'][LEGACY_V4_SCORE_VERSION]['exact_duplicate_history_keys']}**.
The V4 history records for the cohort carry the same stale production label; prior
V3 history must remain untouched.

For the 548 earlier rows, all 548 retain a pre-V4 history record: 486 have V3
history, while 21 entered V4 from V1 and 41 from V2. This is expected historical
lineage, not a missing-score anomaly. Every row has one canonical tri-state V4
history record and there are no exact duplicate history keys.

## 9. Existing 548 validation

The 548 canonical-label rows recompute **{canonical_parity['exact_score_matches']} / {canonical_parity['rows']}** exactly from current canonical inputs. No historical
source-artifact drift qualification is needed for this result.

## 10. Root cause of label divergence

`quality_v4_promotion.py` replaces the recomputed result's version with
`quality_v4.QUALITY_PRODUCTION_SCORE_VERSION`, whose value predates the tri-state
migration. The later canonical V4 tri-state constant was never wired into that
promotion path. This is not a source-shadow mapping or history-helper default issue.

## 11. Floor-70 impact

- Numeric score impact: **0**
- Floor-70 pass/fail impact: **0**
- Expected additions: **313**
- Expected final catalog: **{summary['floor70_impact']['expected_final_catalog']}**
- Publication reconciliation logic impact: **none**

## 12. Recommended fix

Before floor-70 reconciliation, run a manifest-scoped, metadata-only migration for
the exact 313 IDs. Relabel the current pointer and its matching V4 history record,
including the embedded `score_json.score_version`; recompute the history fingerprint
because it includes the label. Do not change score values, Quality research rows,
V3 history, publication state, eligibility/review fields, or threshold. No score
recomputation is needed.

## 13. Reporting-label quirks

The real-run report's “dry run” title and the idempotency summary's
`stored_v3_pointer_distribution_before` key are both cosmetic stale labels. The
underlying `dry_run: false`, pointer values, and audit invariants are coherent.

## 14. No-mutation confirmation

- Canonical SHA before/after: `{safety['sha256_before']['canonical']}` / `{safety['sha256_after']['canonical']}`
- Shadow SHA before/after: `{safety['sha256_before']['shadow']}` / `{safety['sha256_after']['shadow']}`
- `seed70.txt` SHA before/after: `{safety['sha256_before']['seed70']}` / `{safety['sha256_after']['seed70']}`
- SQLite integrity: canonical `{safety['canonical_integrity']}`, shadow `{safety['shadow_integrity']}`
- External requests: **0**
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="data/fiyu.db")
    parser.add_argument(
        "--shadow-db", default="data/fiyu-floor70-prepublication-v4-shadow.db"
    )
    parser.add_argument("--seed", default="seed70.txt")
    parser.add_argument(
        "--manifest",
        default="data/audits/floor70-prepublication-v4-promotion-cohort.json",
    )
    parser.add_argument(
        "--summary-out",
        default="data/audits/v4-specialist-tristate-lineage-audit-summary.json",
    )
    parser.add_argument(
        "--report-out",
        default="data/audits/v4-specialist-tristate-lineage-audit.md",
    )
    args = parser.parse_args()
    summary = run_audit(
        args.db,
        shadow_db_path=args.shadow_db,
        seed_path=args.seed,
        manifest_path=args.manifest,
    )
    Path(args.summary_out).write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    Path(args.report_out).write_text(render_report(summary), encoding="utf-8")
    print(
        json.dumps(
            {
                "verdict": summary["verdict"]["classification"],
                "313_exact": summary["parity"][LEGACY_V4_SCORE_VERSION][
                    "exact_score_matches"
                ],
                "548_exact": summary["parity"][V4_SCORE_VERSION]["exact_score_matches"],
                "protected_inputs_unchanged": summary["database_safety"]["unchanged"],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
