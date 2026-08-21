from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from .database import connect
from .discovery_areas import TOKYO_WARD_NAMES, canonical_tokyo_ward
from .location_names import normalize_location_name
from .public_catalog import AUTO_PIPELINE_RESEARCH_STATUSES, ensure_public_schema

PIPELINE_VERSION = "catalog-pipeline-v1"

AREA_ANCHOR_WARDS = {
    "shibuya": "Shibuya",
    "shinjuku": "Shinjuku",
    "ginza": "Chuo",
    "asakusa": "Taito",
    "ueno": "Taito",
    "ikebukuro": "Toshima",
    "shimokitazawa": "Setagaya",
    "kichijoji": "Musashino",
    "nakameguro": "Meguro",
    "ebisu": "Shibuya",
    "jimbocho": "Chiyoda",
    "koenji": "Suginami",
}

LOCATION_PRECISION_RANK = {
    "unresolved": 0,
    "area": 1,
    "area_anchor": 1,
    "neighborhood": 2,
    "chome": 3,
    "block": 4,
    "parcel_or_street_number": 5,
    "address": 5,
    "building": 6,
    "exact_entrance": 7,
    "exact": 8,
    "poi": 8,
}
LOCATION_PROVENANCE_RANK = {
    "reviewed_osm_area_anchor": 1,
    "local_osm_polygon_fallback": 2,
    "local_osm_addresses": 2,
    "openstreetmap": 3,
    "manual_review": 4,
}


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _location_rank(location: dict[str, object]) -> tuple[int, int]:
    precision = str(
        location.get("map_location_precision")
        or location.get("map_anchor_type")
        or location.get("location_precision")
        or "unresolved"
    ).casefold()
    source = str(location.get("location_source") or "").casefold()
    return (
        LOCATION_PRECISION_RANK.get(precision, 0),
        LOCATION_PROVENANCE_RANK.get(source, 0),
    )


def location_update_allowed(
    existing: dict[str, object], candidate: dict[str, object]
) -> bool:
    """Allow only precision/provenance upgrades unless current state is invalid."""

    existing_valid = bool(
        existing.get("map_display_eligible")
        and existing.get("latitude") is not None
        and existing.get("longitude") is not None
        and str(existing.get("location_status") or "").casefold()
        not in {"invalidated", "location_invalidated", "location_removed"}
    )
    if not existing_valid:
        return True
    return _location_rank(candidate) > _location_rank(existing)


def restore_best_location_from_history(
    db_path: str | Path, place_id: str, *, dry_run: bool = False
) -> dict[str, object]:
    """Restore the strongest valid locally stored location without provider calls."""

    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        current_row = connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id=?", (place_id,)
        ).fetchone()
        if current_row is None:
            raise ValueError(f"Unknown place_id: {place_id}")
        history = connection.execute(
            """
            SELECT * FROM location_history
            WHERE public_restaurant_id=? AND map_display_eligible=1
              AND latitude IS NOT NULL AND longitude IS NOT NULL
              AND location_status NOT IN
                  ('invalidated', 'location_invalidated', 'location_removed')
            ORDER BY id
            """,
            (place_id,),
        ).fetchall()
        if not history:
            return {"place_id": place_id, "restored": False, "reason": "no_valid_history"}
        best = max(history, key=lambda row: (_location_rank(dict(row)), int(row["id"])))
        current = dict(current_row)
        candidate = dict(best)
        should_restore = _location_rank(candidate) > _location_rank(current)
        result = {
            "place_id": place_id,
            "restored": should_restore and not dry_run,
            "would_restore": should_restore,
            "dry_run": dry_run,
            "history_id": int(best["id"]),
            "precision": best["location_precision"],
            "source": best["location_source"],
            "responses_api_calls": 0,
            "web_search_calls": 0,
        }
        if not should_restore or dry_run:
            return result
        now = _utc_now()
        connection.execute(
            """
            UPDATE public_restaurants SET latitude=?, longitude=?, normalized_address=?,
                location_source=?, location_source_reference=?, location_precision=?,
                map_location_precision=?, map_location_approximate=?, map_anchor_type=?,
                location_matched_components_json=?, location_unmatched_components_json=?,
                location_provenance=?, location_verification_status=?,
                location_verification_tier=?, location_status=?, location_osm_type=?,
                location_osm_id=?, location_osm_version=?, location_osm_timestamp=?,
                map_display_eligible=1, address_resolution_status=?, updated_at=?
            WHERE place_id=?
            """,
            (
                best["latitude"], best["longitude"], best["normalized_address"],
                best["location_source"], best["location_source_reference"],
                "approximate" if best["map_location_approximate"] else "exact",
                best["location_precision"], best["map_location_approximate"],
                best["map_anchor_type"], best["matched_components_json"],
                best["unmatched_components_json"], best["provenance"],
                best["location_verification_status"], best["location_verification_tier"],
                best["location_status"], best["osm_type"], best["osm_id"],
                best["osm_version"], best["osm_timestamp"],
                best["location_verification_status"], now, place_id,
            ),
        )
        connection.commit()
        return result


def _ward_in_location_text(value: object) -> str | None:
    text = normalize_location_name(str(value or ""))
    direct = canonical_tokyo_ward(text)
    if direct:
        return direct
    for ward, aliases in TOKYO_WARD_NAMES.items():
        if any(normalize_location_name(alias) in text for alias in aliases):
            return ward
    return None


def _location_context(db_path: str | Path, place_id: str) -> dict[str, object]:
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT p.discovery_area, r.city AS candidate_city,
                   r.neighborhood AS candidate_neighborhood,
                   r.address AS candidate_address,
                   v.municipality_or_ward AS verified_ward,
                   v.neighborhood AS verified_neighborhood
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id=p.place_id
            LEFT JOIN verified_restaurant_addresses v ON v.rowid=(
                SELECT latest.rowid FROM verified_restaurant_addresses latest
                WHERE latest.public_restaurant_id=p.place_id
                  AND latest.status IN (
                    'address_verified', 'address_provisionally_accepted',
                    'location_verified', 'location_provisional', 'geocoding_pending'
                  )
                ORDER BY latest.updated_at DESC, latest.rowid DESC LIMIT 1
            )
            WHERE p.place_id=?
            """,
            (place_id,),
        ).fetchone()
    if row is None:
        return {}
    ward = _ward_in_location_text(row["verified_ward"])
    if not ward:
        ward = _ward_in_location_text(row["candidate_city"])
    if not ward:
        ward = _ward_in_location_text(row["candidate_address"])
    municipality = str(row["verified_ward"] or row["candidate_city"] or "").strip()
    if normalize_location_name(municipality) in {"", "tokyo", "tokyo prefecture"}:
        municipality = ""
    neighborhood = row["verified_neighborhood"] or row["candidate_neighborhood"]
    return {
        "ward": ward,
        "municipality_or_ward": ward or municipality or None,
        "neighborhood": str(neighborhood or "").strip() or None,
        "discovery_area": row["discovery_area"],
    }


def _anchor_matches_location_context(
    anchor: dict[str, object], context: dict[str, object]
) -> bool:
    area = normalize_location_name(str(anchor.get("area_name") or ""))
    discovery_area = normalize_location_name(str(context.get("discovery_area") or ""))
    if not area:
        return False
    ward = str(context.get("ward") or "")
    neighborhood = normalize_location_name(str(context.get("neighborhood") or ""))
    if neighborhood:
        if area in neighborhood:
            return True
        if area != discovery_area:
            return False
    elif area != discovery_area:
        return False
    if ward:
        return AREA_ANCHOR_WARDS.get(area) == ward
    return True


def invalidate_contradictory_area_anchor(
    db_path: str | Path, place_id: str, *, dry_run: bool = False
) -> bool:
    """Invalidate a station anchor contradicted by stronger candidate/address locality."""

    context = _location_context(db_path, place_id)
    if not context.get("ward") and not context.get("neighborhood"):
        return False
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT * FROM public_restaurants
            WHERE place_id=? AND map_display_eligible=1
              AND location_source='reviewed_osm_area_anchor'
            """,
            (place_id,),
        ).fetchone()
        if row is None:
            return False
        anchor = {
            "area_name": json.loads(row["location_matched_components_json"] or "{}")
            .get("area")
        }
        if _anchor_matches_location_context(anchor, context):
            return False
        if dry_run:
            return True
        now = _utc_now()
        connection.execute(
            """
            UPDATE public_restaurants
            SET map_display_eligible=0, location_status='location_invalidated',
                location_verification_status='location_invalidated', updated_at=?
            WHERE place_id=?
            """,
            (now, place_id),
        )
        connection.execute(
            """
            UPDATE location_history
            SET location_status='location_invalidated',
                change_reason=change_reason || '; contradicted by stronger locality evidence'
            WHERE public_restaurant_id=?
              AND location_source='reviewed_osm_area_anchor'
              AND location_status NOT IN ('location_invalidated', 'invalidated')
            """,
            (place_id,),
        )
        connection.commit()
    return True


@dataclass(frozen=True, slots=True)
class PublishReadiness:
    place_id: str
    publishable: bool
    map_eligible: bool
    location_attempted: bool
    missing: tuple[str, ...]
    warnings: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _row(db_path: str | Path, place_id: str) -> dict[str, object]:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT p.*, r.title AS candidate_title, r.address AS source_address,
                   r.neighborhood, r.image_url, r.category AS candidate_category,
                   r.broad_category AS candidate_broad_category
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            WHERE p.place_id = ?
            """,
            (place_id,),
        ).fetchone()
    if row is None:
        raise ValueError(f"Unknown place_id: {place_id}")
    return dict(row)


def publish_readiness(
    db_path: str | Path, place_id: str, *, require_approval: bool = True
) -> PublishReadiness:
    row = _row(db_path, place_id)
    missing: list[str] = []
    if not str(row.get("place_id") or "").strip():
        missing.append("stable_place_id")
    if not str(row.get("name_ja") or row.get("name_en") or row.get("candidate_title") or "").strip():
        missing.append("display_name")
    if not str(
        row.get("primary_category")
        or row.get("candidate_category")
        or row.get("candidate_broad_category")
        or ""
    ).strip():
        missing.append("category")
    if row.get("research_status") != "complete":
        missing.append("completed_research")
    if row.get("fiyu_score") is None or not str(row.get("score_version") or "").strip():
        missing.append("deterministic_score")
    if require_approval and row.get("review_status") != "approved":
        missing.append("review_approval")

    attempted = bool(row.get("location_attempted_at")) or row.get(
        "location_verification_status"
    ) not in (None, "", "unknown_provenance")
    map_eligible = bool(row.get("map_display_eligible"))
    warnings: list[str] = []
    if not attempted:
        warnings.append("location_not_attempted")
    elif not map_eligible:
        warnings.append("location_unresolved_or_map_unavailable")
    return PublishReadiness(
        place_id=place_id,
        publishable=not missing,
        map_eligible=map_eligible,
        location_attempted=attempted,
        missing=tuple(missing),
        warnings=tuple(warnings),
    )


def _score_policy_publishable(
    db_path: str | Path, row: dict[str, object]
) -> bool:
    """Evaluate current policy while preserving the historical scoring output."""

    return bool(_current_score_policy_decision(db_path, row)["publishable"])


_PROTECTED_CONFLICT = re.compile(
    r"\b(permanently closed|closure|ceased trading|evidence integrity|"
    r"fabricat(?:ed|ion)|source mismatch)\b|"
    r"\b(?:business type|category|chain status)\b[^.]{0,80}"
    r"\b(?:conflict(?:s|ed|ing)?|disagree(?:ment)?|mismatch|ambiguous|unresolved)\b|"
    r"\b(?:conflict(?:s|ed|ing)?|disagree(?:ment)?|mismatch|ambiguous|unresolved)\b"
    r"[^.]{0,80}\b(?:business type|category|chain status)\b|"
    r"閉店|廃業|証拠",
    re.IGNORECASE,
)
_NEGATED_CLOSURE_CONFLICT = re.compile(
    r"\bno\b[^.]{0,160}\b(?:closure|closed|ceased trading)\b"
    r"[^.]{0,160}\b(?:found|identified|reported|known|evidenced)\b|"
    r"\bno (?:evidence|indication|record|report) of (?:a )?"
    r"(?:closure|being (?:permanently )?closed|ceased trading)\b",
    re.IGNORECASE,
)
_ADDRESS_IDENTITY_CONFLICT = re.compile(
    r"\b(identity|wrong restaurant|separate business|branch|address|location|"
    r"same[- ]name|historical(?:-record)?|business type|category)\b|"
    r"別店舗|別の店|支店|住所|所在地|業態",
    re.IGNORECASE,
)
_CONFLICT_WORDING = re.compile(
    r"\b(conflict(?:s|ed|ing)?|disagree(?:ment)?|differ(?:ence|ent|s)?)\b|"
    r"不一致|相違|矛盾|異なる",
    re.IGNORECASE,
)


def _text_values(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)] if value else []


def _has_protected_conflict(text: str) -> bool:
    return bool(_PROTECTED_CONFLICT.search(_NEGATED_CLOSURE_CONFLICT.sub("", text)))


def _latest_address_supersedes_conflict(
    connection,
    *,
    place_id: str,
    restaurant_run_completed_at: str | None,
    structured_research: dict[str, object],
    conflict_reasons: tuple[str, ...],
    conflict_explanation: str,
) -> tuple[bool, tuple[str, ...]]:
    """Clear only an older address/identity-domain conflict resolved by a newer audit."""

    address = structured_research.get("address_evidence")
    if not isinstance(address, dict):
        return False, ("prior_conflict_not_address_domain",)
    if "material_unmatched_identity" in conflict_reasons:
        return False, ("current_restaurant_identity_unmatched",)

    top_level_text = " ".join(
        text
        for field in (
            "warnings", "conflict_explanation", "conflicting_fields",
            "prior_material_conflict_context",
        )
        for text in _text_values(structured_research.get(field))
    )
    if _has_protected_conflict(top_level_text):
        return False, ("protected_non_address_conflict_domain",)
    if _CONFLICT_WORDING.search(top_level_text) and (
        _ADDRESS_IDENTITY_CONFLICT.search(top_level_text)
    ):
        return False, ("independent_top_level_material_conflict",)
    if _has_protected_conflict(conflict_explanation):
        return False, ("protected_non_address_conflict_domain",)
    structural_address_conflict = any(
        reason in {
            "material_address_identity_status",
            "material_branch_ambiguity",
            "material_conflicting_address_candidates",
        }
        for reason in conflict_reasons
    )
    if not structural_address_conflict and not _ADDRESS_IDENTITY_CONFLICT.search(
        conflict_explanation
    ):
        return False, ("prior_conflict_not_address_identity_domain",)

    latest = connection.execute(
        """
        SELECT e.*, a.acceptance_status AS audit_acceptance_status,
               a.resolution_status AS audit_resolution_status,
               a.component_agreement_json AS audit_component_agreement_json,
               a.created_at AS audit_created_at
        FROM address_evidence e
        LEFT JOIN address_decision_audits a ON a.id=(
            SELECT current.id FROM address_decision_audits current
            WHERE current.address_evidence_id=e.id
            ORDER BY current.id DESC LIMIT 1
        )
        WHERE e.public_restaurant_id=?
        ORDER BY e.updated_at DESC, e.id DESC LIMIT 1
        """,
        (place_id,),
    ).fetchone()
    if latest is None:
        return False, ("no_newer_address_evidence",)
    evidence_time = str(latest["updated_at"] or "")
    audit_time = str(latest["audit_created_at"] or "")
    if restaurant_run_completed_at and max(evidence_time, audit_time) <= str(
        restaurant_run_completed_at
    ):
        return False, ("address_evidence_does_not_postdate_score_run",)

    accepted_statuses = {"accepted", "provisional", "verified", "approved"}
    accepted_resolutions = {
        "address_verified",
        "address_provisionally_accepted",
        "location_verified",
        "location_provisional",
    }
    audit_effective = (
        str(latest["audit_acceptance_status"] or "").casefold()
        in accepted_statuses
        and str(latest["audit_resolution_status"] or "").casefold()
        in accepted_resolutions
    )
    evidence_effective = str(latest["acceptance_status"] or "").casefold() in {
        "accepted", "provisional", "verified", "approved"
    }
    if not audit_effective and not evidence_effective:
        return False, ("latest_address_audit_not_effectively_accepted",)
    if str(latest["identity_status"] or "").casefold() not in {
        "confirmed", "matched", "verified"
    } or float(latest["identity_confidence"] or 0) < 0.80:
        return False, ("latest_address_identity_not_confirmed",)
    if str(latest["branch_name"] or "").strip():
        return False, ("latest_address_branch_remains_ambiguous",)

    try:
        agreement = json.loads(
            latest["audit_component_agreement_json"]
            or latest["component_agreement_json"]
            or "{}"
        )
    except json.JSONDecodeError:
        return False, ("latest_component_agreement_invalid",)
    if agreement.get("material_conflicting_components"):
        return False, ("latest_material_address_components_conflict",)

    try:
        conflicting_addresses = json.loads(latest["conflicting_addresses_json"] or "[]")
    except json.JSONDecodeError:
        return False, ("latest_conflicting_addresses_invalid",)
    if conflicting_addresses:
        from .address_identity import address_candidate_identity_relevant

        active_identity_conflicts = [
            item
            for item in conflicting_addresses
            if str(item.get("address_temporality") or "").casefold()
            not in {"historical", "future"}
            and address_candidate_identity_relevant(item)
        ]
        if active_identity_conflicts and agreement.get(
            "material_conflicting_components"
        ):
            return False, ("latest_identity_relevant_address_conflict_remains",)

    try:
        latest_warnings = json.loads(latest["warnings_json"] or "[]")
    except json.JSONDecodeError:
        return False, ("latest_address_warnings_invalid",)
    latest_text = " ".join(
        [
            *_text_values(latest_warnings),
            str(latest["recommended_action"] or ""),
            str(latest["research_summary"] or ""),
        ]
    )
    if _has_protected_conflict(latest_text):
        return False, ("latest_evidence_contains_protected_conflict",)
    if re.search(r"\b(business type|category)\b|業態", conflict_explanation, re.IGNORECASE):
        from .address_identity import address_candidate_identity_relevant

        if address_candidate_identity_relevant({"summary": latest_text}):
            return False, ("business_category_conflict_not_resolved_as_other_entity",)
    return True, ("newer_effective_address_identity_audit_supersedes_prior_conflict",)


def _effective_structured_research(
    connection, place_id: str, structured: dict[str, object]
) -> dict[str, object]:
    """Overlay the latest persisted deterministic address state for policy use."""

    latest = connection.execute(
        """
        SELECT * FROM address_evidence
        WHERE public_restaurant_id=?
        ORDER BY updated_at DESC, id DESC LIMIT 1
        """,
        (place_id,),
    ).fetchone()
    if latest is None:
        return structured
    effective = dict(structured)
    prior_address = dict(effective.get("address_evidence") or {})
    prior_context = " ".join(
        str(item)
        for field in ("warnings", "recommended_action", "research_summary")
        for item in (
            prior_address.get(field, [])
            if isinstance(prior_address.get(field), list)
            else [prior_address.get(field)]
            if prior_address.get(field)
            else []
        )
    )
    if prior_context:
        effective["prior_material_conflict_context"] = prior_context
    address = dict(prior_address)
    for field in (
        "identity_status", "identity_confidence", "matched_name", "branch_name",
        "address_raw", "postal_code", "prefecture", "municipality_or_ward",
        "neighborhood", "street_or_block", "building", "acceptance_status",
        "core_address_verified", "full_address_verified",
        "unresolved_address_detail", "proposed_location_precision",
    ):
        if latest[field] is not None:
            address[field] = latest[field]
    for column, field, default in (
        ("conflicting_addresses_json", "conflicting_address_candidates", []),
        ("warnings_json", "warnings", []),
        ("component_agreement_json", "component_agreement", {}),
    ):
        try:
            address[field] = json.loads(latest[column] or json.dumps(default))
        except json.JSONDecodeError:
            address[field] = default
    address["recommended_action"] = latest["recommended_action"]
    address["research_summary"] = latest["research_summary"]
    verified = connection.execute(
        """
        SELECT status, verified_core_address, core_address_verified,
               full_address_verified, updated_at
        FROM verified_restaurant_addresses
        WHERE public_restaurant_id=?
        ORDER BY updated_at DESC, rowid DESC LIMIT 1
        """,
        (place_id,),
    ).fetchone()
    if verified is not None:
        address["verified_address"] = dict(verified)
    effective["address_evidence"] = address
    return effective


def _current_score_policy_decision(
    db_path: str | Path, row: dict[str, object]
) -> dict[str, object]:
    """Return a current policy decision without rewriting historical score JSON."""

    with connect(db_path) as connection:
        run = connection.execute(
            """
            SELECT rr.score_json, rr.structured_research_json, rr.completed_at,
                   r.quality_score, r.underexposure_score, r.digital_footprint_score
            FROM restaurant_research_runs rr
            LEFT JOIN restaurants r ON r.place_id=rr.public_restaurant_id
            WHERE rr.public_restaurant_id=? AND rr.status='complete'
            ORDER BY rr.is_current DESC, rr.id DESC LIMIT 1
            """,
            (row["place_id"],),
        ).fetchone()
        if run is None:
            return {"publishable": False, "reason": "completed_score_run_missing"}
        try:
            score = json.loads(run["score_json"] or "{}")
            structured = json.loads(run["structured_research_json"] or "{}")
            evidence_payload = json.loads(row.get("evidence_json") or "{}")
        except json.JSONDecodeError:
            return {"publishable": False, "reason": "stored_scoring_json_invalid"}

        from .public_score import (
            PUBLICATION_SCORE_THRESHOLD,
            FiyuEvidence,
            InternalSignals,
            assess_publication_conflict,
            evaluate_fiyu_candidate,
        )

        try:
            evidence = FiyuEvidence(**evidence_payload)
            evidence.validate()
        except (TypeError, ValueError):
            return {"publishable": False, "reason": "stored_scoring_evidence_invalid"}
        effective_structured = _effective_structured_research(
            connection, str(row["place_id"]), structured
        )
        from .card_enrichment import scoring_research_view

        effective_structured = scoring_research_view(effective_structured)
        conflict = assess_publication_conflict(evidence, effective_structured)
        current_score = evaluate_fiyu_candidate(
            evidence,
            InternalSignals(
                quality_score=float(run["quality_score"] or 0),
                underexposure_score=float(run["underexposure_score"] or 0),
                digital_footprint_score=float(run["digital_footprint_score"] or 0),
            ),
            effective_structured,
            primary_category=str(
                row.get("primary_category")
                or row.get("candidate_category")
                or row.get("candidate_broad_category")
                or ""
            ),
        )
        superseded = bool(
            score.get("blocking_conflict") and not conflict.blocking_conflict
        )
        supersession_reasons: tuple[str, ...] = (
            ("current_structured_evidence_resolves_historical_conflict",)
            if superseded
            else ()
        )
        if conflict.blocking_conflict:
            superseded, supersession_reasons = _latest_address_supersedes_conflict(
                connection,
                place_id=str(row["place_id"]),
                restaurant_run_completed_at=run["completed_at"],
                structured_research=effective_structured,
                conflict_reasons=conflict.reasons,
                conflict_explanation=conflict.explanation,
            )

    conditions = {
        "product_eligible": current_score.product_eligible,
        "fiyu_score_threshold": (
            current_score.fiyu_score >= PUBLICATION_SCORE_THRESHOLD
        ),
        "chain_not_excluded": not current_score.chain_excluded,
    }
    return {
        "publishable": all(conditions.values()),
        "conditions": conditions,
        "diagnostics": {
            "matched_restaurant": evidence.matched_restaurant,
            "identity_confidence": evidence.identity_confidence,
            "evidence_source_count": evidence.total_evidence_sources,
            "research_confidence": current_score.fiyu_confidence,
            "research_conflict": conflict.blocking_conflict,
        },
        "current_score": current_score.to_dict(),
        "historical_score_publishable": score.get("publishable") is True,
        "conflict_classification": conflict.classification,
        "conflict_reasons": conflict.reasons,
        "conflict_superseded": superseded,
        "supersession_reasons": supersession_reasons,
        "chain_classification": current_score.chain_classification,
        "chain_excluded": current_score.chain_excluded,
    }


def auto_publish_readiness(db_path: str | Path, place_id: str) -> PublishReadiness:
    """Deterministic normal-path publication gate; no human approval required."""

    row = _row(db_path, place_id)
    base = publish_readiness(db_path, place_id, require_approval=False)
    missing = list(base.missing)
    if not _score_policy_publishable(db_path, row):
        missing.append("deterministic_score_policy")
    return PublishReadiness(
        place_id=place_id,
        publishable=not missing,
        map_eligible=base.map_eligible,
        location_attempted=base.location_attempted,
        missing=tuple(dict.fromkeys(missing)),
        warnings=base.warnings,
    )


def apply_automatic_publication(
    db_path: str | Path, place_id: str
) -> dict[str, object]:
    readiness = auto_publish_readiness(db_path, place_id)
    now = _utc_now()
    if readiness.publishable:
        status = "auto_published"
        published = True
        reason = None
    else:
        published = False
        reason = (
            "score_or_product_policy_rejected"
            if "deterministic_score_policy" in readiness.missing
            else "content_or_pipeline_incomplete"
        )
        status = "auto_rejected"
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET is_published=?, review_status=?, review_notes=?, pipeline_version=?,
                updated_at=? WHERE place_id=?
            """,
            (int(published), status, reason, PIPELINE_VERSION, now, place_id),
        )
        connection.commit()
    return {
        "place_id": place_id,
        "published": published,
        "outcome": status,
        "reason": reason,
        "readiness": readiness.to_dict(),
    }


def review_candidate(
    db_path: str | Path,
    place_id: str,
    *,
    decision: str,
    reviewed_by: str,
    notes: str | None = None,
) -> dict[str, object]:
    if decision not in {"approved", "rejected"}:
        raise ValueError("decision must be approved or rejected")
    if decision == "approved":
        readiness = publish_readiness(db_path, place_id, require_approval=False)
        if readiness.missing:
            raise ValueError("Cannot approve; missing: " + ", ".join(readiness.missing))
    now = _utc_now()
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET review_status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = ?,
                pipeline_version = ?, updated_at = ?
            WHERE place_id = ?
            """,
            (decision, notes, reviewed_by, now, PIPELINE_VERSION, now, place_id),
        )
        connection.commit()
    return inspect_candidate(db_path, place_id)


def publish_candidate(db_path: str | Path, place_id: str) -> PublishReadiness:
    readiness = publish_readiness(db_path, place_id)
    if not readiness.publishable:
        raise ValueError("Cannot publish; missing: " + ", ".join(readiness.missing))
    with connect(db_path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET is_published = 1, updated_at = ? WHERE place_id = ?",
            (_utc_now(), place_id),
        )
        connection.commit()
    return readiness


def mark_location_attempted(db_path: str | Path, place_id: str) -> None:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE public_restaurants SET location_attempted_at = ?, pipeline_version = ?,
                updated_at = ? WHERE place_id = ?
            """,
            (_utc_now(), PIPELINE_VERSION, _utc_now(), place_id),
        )
        if cursor.rowcount == 0:
            raise ValueError(f"Unknown place_id: {place_id}")
        connection.commit()


def _published_location_backfill_rows(db_path: str | Path):
    """Select published rows that are missing a usable or finalized location pass."""

    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        return connection.execute(
            """
            SELECT place_id, COALESCE(name_en, name_ja, place_id) AS name,
                   latitude, longitude, map_display_eligible,
                   location_precision, map_location_precision, location_status,
                   location_source, location_attempted_at
            FROM public_restaurants
            WHERE is_published=1 AND (
                map_display_eligible=0 OR latitude IS NULL OR longitude IS NULL
                OR location_attempted_at IS NULL
                OR map_location_precision IS NULL OR location_status IS NULL
            )
            ORDER BY COALESCE(name_en, name_ja, place_id)
            """
        ).fetchall()


def _finalize_existing_location_metadata(
    db_path: str | Path, place_id: str, *, dry_run: bool
) -> dict[str, object] | None:
    """Complete metadata for a valid legacy location without changing its coordinates."""

    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id=? AND is_published=1",
            (place_id,),
        ).fetchone()
        if not row:
            return None
        current = dict(row)
        valid = bool(
            current.get("map_display_eligible")
            and current.get("latitude") is not None
            and current.get("longitude") is not None
            and str(current.get("location_status") or "").casefold()
            not in {"invalidated", "location_invalidated", "location_removed"}
        )
        if not valid:
            return None
        precision = str(
            current.get("map_location_precision")
            or current.get("map_anchor_type")
            or current.get("location_precision")
            or "unresolved"
        ).casefold()
        if precision == "approximate":
            precision = "area"
        status = str(current.get("location_status") or "").strip()
        if not status:
            verification = str(current.get("location_verification_status") or "").casefold()
            status = (
                "location_provisional"
                if "provisional" in verification or precision in {"area", "neighborhood", "chome"}
                else "location_active"
            )
        report = {
            "place_id": place_id,
            "status": status,
            "precision": precision,
            "latitude": current["latitude"],
            "longitude": current["longitude"],
            "source": current.get("location_source"),
            "preserved_existing_coordinates": True,
            "dry_run": dry_run,
        }
        if dry_run:
            return report
        now = _utc_now()
        connection.execute(
            """
            UPDATE public_restaurants
            SET map_location_precision=COALESCE(map_location_precision, ?),
                location_status=COALESCE(location_status, ?),
                location_attempted_at=COALESCE(location_attempted_at, ?),
                pipeline_version=?, updated_at=?
            WHERE place_id=?
            """,
            (precision, status, now, PIPELINE_VERSION, now, place_id),
        )
        connection.commit()
        return report


def backfill_legacy_published_locations(
    db_path: str | Path,
    *,
    osm_index: str | Path,
    osm_address_index: str | Path,
    dry_run: bool = False,
) -> dict[str, object]:
    """Run the local-only finalized location hierarchy for published legacy rows."""

    from .address_geocoder import LocalOSMAddressGeocoder
    from .address_geocoding import geocode_verified_addresses
    from .osm_resolver import resolve_osm_locations

    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        inspected = int(
            connection.execute(
                "SELECT COUNT(*) FROM public_restaurants WHERE is_published=1"
            ).fetchone()[0]
        )
    selected = [dict(row) for row in _published_location_backfill_rows(db_path)]
    reports: list[dict[str, object]] = []
    for selected_row in selected:
        place_id = str(selected_row["place_id"])
        before = dict(selected_row)
        existing = _finalize_existing_location_metadata(
            db_path, place_id, dry_run=dry_run
        )
        method = "existing_location" if existing else None
        detail: dict[str, object] | None = existing

        if existing is None:
            poi = resolve_osm_locations(
                db_path,
                osm_index,
                limit=1,
                place_id=place_id,
                published_only=True,
                force=True,
                dry_run=dry_run,
            )
            poi_report = (poi.get("reports") or [{}])[0]
            if poi_report.get("status") == "osm_auto_verified":
                method, detail = "poi", poi_report

            if method is None:
                address = geocode_verified_addresses(
                    db_path,
                    geocoder=LocalOSMAddressGeocoder(
                        osm_address_index,
                        allow_area_fallback=True,
                        minimum_area_precision="ward",
                    ),
                    limit=1,
                    place_id=place_id,
                    dry_run=dry_run,
                    published_only=True,
                )
                if int(address.get("location_verified", 0)) or int(
                    address.get("location_provisional", 0)
                ):
                    method, detail = "verified_address", address

            if method is None:
                polygon = apply_best_available_polygon_fallback(
                    db_path,
                    place_id,
                    osm_address_index=osm_address_index,
                    dry_run=dry_run,
                    allow_candidate_context=True,
                )
                if polygon is not None:
                    method, detail = "polygon", polygon
                else:
                    anchor = _apply_trusted_area_anchor(
                        db_path, place_id, dry_run=dry_run
                    )
                    if anchor is not None:
                        method, detail = "area_anchor", anchor

            if not dry_run:
                mark_location_attempted(db_path, place_id)
                finalized = _finalize_existing_location_metadata(
                    db_path, place_id, dry_run=False
                )
                if finalized and method == "poi":
                    detail = {**(detail or {}), **finalized}

        if dry_run:
            after = detail or before
            eligible = bool(method)
            precision = (detail or {}).get("precision") or before.get(
                "map_location_precision"
            )
        else:
            with connect(db_path) as connection:
                stored = connection.execute(
                    """
                    SELECT latitude, longitude, map_display_eligible,
                           location_precision, map_location_precision,
                           location_status, location_source, location_attempted_at,
                           is_published
                    FROM public_restaurants WHERE place_id=?
                    """,
                    (place_id,),
                ).fetchone()
            after = dict(stored) if stored else {}
            eligible = bool(
                after.get("map_display_eligible")
                and after.get("latitude") is not None
                and after.get("longitude") is not None
            )
            precision = after.get("map_location_precision") or after.get(
                "location_precision"
            )
        reports.append(
            {
                "place_id": place_id,
                "name": selected_row["name"],
                "method": method or "unresolved",
                "success": eligible,
                "precision": precision,
                "before": before,
                "after": after,
                "detail": detail,
            }
        )

    remaining = (
        sum(not bool(report["success"]) for report in reports)
        if dry_run
        else len(_published_location_backfill_rows(db_path))
    )
    return {
        "published_inspected": inspected,
        "missing_before": len(selected),
        "selected_names": [row["name"] for row in selected],
        "successfully_backfilled": sum(bool(row["success"]) for row in reports),
        "missing_after": remaining,
        "dry_run": dry_run,
        "responses_api_calls": 0,
        "web_search_calls": 0,
        "external_geocoding_calls": 0,
        "reports": reports,
    }


def _apply_trusted_area_anchor(
    db_path: str | Path, place_id: str, *, dry_run: bool
) -> dict[str, object] | None:
    """Use an existing reviewed OSM area anchor as the broadest safe fallback."""

    config_path = Path(__file__).with_name("location_anchors.json")
    anchors = json.loads(config_path.read_text(encoding="utf-8"))
    context = _location_context(db_path, place_id)
    if not context:
        return None
    matches = [
        anchor
        for anchor in anchors
        if anchor.get("reviewed") is True
        and anchor.get("verified_at")
        and anchor.get("latitude") is not None
        and anchor.get("longitude") is not None
        and _anchor_matches_location_context(anchor, context)
    ]
    if len(matches) != 1:
        return None
    anchor = matches[0]
    result = {
        "status": "location_provisional",
        "precision": "area",
        "map_location_approximate": True,
        "anchor_id": anchor.get("id"),
        "area_name": anchor.get("area_name"),
        "latitude": anchor["latitude"],
        "longitude": anchor["longitude"],
        "source_reference": anchor.get("source_reference"),
        "dry_run": dry_run,
    }
    if dry_run:
        return result
    now = _utc_now()
    matched = json.dumps(
        {"area": anchor.get("area_name")}, ensure_ascii=False, sort_keys=True
    )
    with connect(db_path) as connection:
        current = connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id=?", (place_id,)
        ).fetchone()
        candidate = {
            "map_location_precision": "area",
            "map_anchor_type": "area",
            "location_precision": "approximate",
            "location_source": "reviewed_osm_area_anchor",
        }
        update_allowed = current is not None and location_update_allowed(
            dict(current), candidate
        )
        if update_allowed:
            connection.execute(
                """
                UPDATE public_restaurants
                SET latitude=?, longitude=?, location_source='reviewed_osm_area_anchor',
                    location_source_reference=?, location_verified_at=?,
                    location_precision='approximate', map_location_precision='area',
                    map_location_approximate=1, map_anchor_type='area',
                    location_matched_components_json=?, location_provenance=?,
                    location_verification_status='location_provisional',
                    location_verification_tier='provisional_medium',
                    location_status='location_provisional', location_source_checked_at=?,
                    location_verification_method='reviewed_osm_area_anchor',
                    address_resolution_status='location_provisional',
                    map_display_eligible=1, updated_at=? WHERE place_id=?
                """,
                (
                    anchor["latitude"],
                    anchor["longitude"],
                    anchor.get("source_reference"),
                    now,
                    matched,
                    anchor.get("source") or "OpenStreetMap",
                    now,
                    now,
                    place_id,
                ),
            )
        connection.execute(
            """
            INSERT INTO location_history (
                public_restaurant_id, latitude, longitude, location_source,
                location_source_reference, location_verification_status,
                location_verification_tier, location_precision,
                map_location_approximate, map_anchor_type,
                matched_components_json, provenance, map_display_eligible,
                location_status, change_reason, created_at
            ) VALUES (?, ?, ?, 'reviewed_osm_area_anchor', ?, 'location_provisional',
                      'provisional_medium', 'area', 1, 'area', ?, ?, 1,
                      'location_provisional', 'reviewed area anchor fallback accepted', ?)
            """,
            (
                place_id, anchor["latitude"], anchor["longitude"],
                anchor.get("source_reference"), matched,
                anchor.get("source") or "OpenStreetMap", now,
            ),
        )
        connection.commit()
    result["active_location_updated"] = update_allowed
    result["preserved_stronger_location"] = not update_allowed
    return result


def _shared_address_prefix(
    values: dict[str, list[str]],
    *,
    fallback_ward: object = None,
    fallback_neighborhood: object = None,
    fallback_street: object = None,
) -> dict[str, str | None]:
    from .osm_address_normalization import normalize_tokyo_neighborhood

    def location_container(value: object) -> str | None:
        raw = str(value or "").strip()
        if not raw:
            return None
        ward = canonical_tokyo_ward(raw)
        if ward:
            return ward
        normalized = normalize_location_name(raw)
        normalized = re.sub(r"(?:\s+city|[- ]shi|\u5e02)$", "", normalized).strip()
        return normalized or None

    ward_values = values.get("municipality_or_ward") or (
        [fallback_ward] if fallback_ward else []
    )
    wards = {location_container(value) for value in ward_values}
    wards.discard(None)

    neighborhood_values = values.get("neighborhood") or (
        [fallback_neighborhood] if fallback_neighborhood else []
    )
    normalized_neighborhoods = {
        normalize_tokyo_neighborhood(str(value))[0]
        for value in neighborhood_values
        if str(value or "").strip()
    }
    normalized_neighborhoods.discard("")
    neighborhood = (
        next(iter(normalized_neighborhoods))
        if len(normalized_neighborhoods) == 1
        else None
    )

    street_values = values.get("street_or_block") or (
        [fallback_street] if fallback_street else []
    )
    chomes = {
        match.group(1)
        for value in street_values
        if (match := re.search(r"(?<!\d)(\d+)\s*(?:丁目|[-ー−‐])?", str(value)))
    }
    chome = next(iter(chomes)) if neighborhood and len(chomes) == 1 else None
    return {"ward": next(iter(wards)) if len(wards) == 1 else None,
            "neighborhood": neighborhood, "chome": chome}


def _deepest_evidence_location_prefix(
    db_path: str | Path,
    place_id: str,
    *,
    allow_candidate_context: bool = False,
) -> dict[str, str | None]:
    """Find the deepest geographic prefix shared by current address evidence."""

    context = _location_context(db_path, place_id)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT e.municipality_or_ward, e.neighborhood, e.street_or_block,
                   COALESCE(a.component_agreement_json,
                            e.component_agreement_json, '{}') AS agreement
            FROM address_evidence e
            LEFT JOIN address_decision_audits a ON a.id=(
                SELECT latest.id FROM address_decision_audits latest
                WHERE latest.address_evidence_id=e.id
                ORDER BY latest.id DESC LIMIT 1
            )
            WHERE e.public_restaurant_id=?
            ORDER BY e.id DESC LIMIT 1
            """,
            (place_id,),
        ).fetchone()
    agreement = {}
    if row is not None:
        try:
            agreement = json.loads(row["agreement"] or "{}")
        except json.JSONDecodeError:
            agreement = {}
    if row is None and allow_candidate_context:
        prefix = _shared_address_prefix(
            {},
            fallback_ward=context.get("ward"),
            fallback_neighborhood=context.get("neighborhood"),
        )
    else:
        prefix = _shared_address_prefix(
            agreement.get("component_values") or {},
            fallback_ward=row["municipality_or_ward"] if row else None,
            fallback_neighborhood=row["neighborhood"] if row else None,
            fallback_street=row["street_or_block"] if row else None,
        )
    evidence_prefix_available = bool(prefix["ward"])
    ward = prefix["ward"] or context.get("municipality_or_ward")
    neighborhood = prefix["neighborhood"]
    chome = prefix["chome"]

    if not ward:
        area = normalize_location_name(str(context.get("discovery_area") or ""))
        ward = canonical_tokyo_ward(area) or AREA_ANCHOR_WARDS.get(area)
    return {
        "ward": str(ward) if ward else None,
        "neighborhood": neighborhood,
        "chome": chome,
        "source": (
            "address_evidence"
            if evidence_prefix_available
            else "candidate_context"
            if row is None and allow_candidate_context and prefix.get("ward")
            else "discovery_area"
        ),
    }


def apply_best_available_polygon_fallback(
    db_path: str | Path,
    place_id: str,
    *,
    osm_address_index: str | Path,
    dry_run: bool = False,
    allow_candidate_context: bool = False,
) -> dict[str, object] | None:
    """Persist a stable point inside the deepest defensible local OSM polygon."""

    from .address_geocoder import LocalOSMAddressGeocoder

    prefix = _deepest_evidence_location_prefix(
        db_path, place_id, allow_candidate_context=allow_candidate_context
    )
    if not prefix.get("ward"):
        return None
    geocoder = LocalOSMAddressGeocoder(
        osm_address_index, allow_area_fallback=True, minimum_area_precision="ward"
    )
    result = geocoder.geocode_polygon(
        ward=str(prefix["ward"]),
        neighborhood=prefix.get("neighborhood"),
        chome=prefix.get("chome"),
        place_id=place_id,
        raw_address=str(prefix.get("neighborhood") or prefix["ward"]),
        minimum_precision="ward",
    )
    if result is None:
        return None
    precision = result.map_anchor_type or result.address_level_match
    report = {
        "place_id": place_id,
        "status": "location_provisional",
        "precision": precision,
        "latitude": result.latitude,
        "longitude": result.longitude,
        "source": prefix["source"],
        "source_reference": result.source_reference,
        "representative_point_method": result.representative_point_method,
        "dry_run": dry_run,
    }
    if dry_run:
        return report
    now = _utc_now()
    matched = json.dumps(result.matched_components, ensure_ascii=False, sort_keys=True)
    unmatched = json.dumps(result.unmatched_components, ensure_ascii=False, sort_keys=True)
    with connect(db_path) as connection:
        current_row = connection.execute(
            "SELECT * FROM public_restaurants WHERE place_id=?", (place_id,)
        ).fetchone()
        if current_row is None:
            raise ValueError(f"Unknown place_id: {place_id}")
        candidate = {
            "map_location_precision": precision,
            "map_anchor_type": precision,
            "location_precision": "approximate",
            "location_source": "local_osm_polygon_fallback",
        }
        update_allowed = location_update_allowed(dict(current_row), candidate)
        if update_allowed:
            connection.execute(
                """
                UPDATE public_restaurants
                SET latitude=?, longitude=?, location_source='local_osm_polygon_fallback',
                    location_source_reference=?, location_verified_at=?,
                    location_precision='approximate', map_location_precision=?,
                    map_location_approximate=1, map_anchor_type=?,
                    location_matched_components_json=?,
                    location_unmatched_components_json=?, location_provenance=?,
                    location_osm_type=?, location_osm_id=?, location_osm_version=?,
                    location_osm_timestamp=?, location_representative_point_method=?,
                    location_verification_status='location_provisional',
                    location_verification_tier='provisional_medium',
                    location_status='location_provisional', location_source_checked_at=?,
                    location_verification_method='local_osm_polygon_fallback',
                    address_resolution_status='location_provisional',
                    map_display_eligible=1, updated_at=? WHERE place_id=?
                """,
                (
                    result.latitude, result.longitude, result.source_reference, now,
                    precision, precision, matched, unmatched, result.provenance,
                    result.osm_type, result.osm_id, result.osm_version,
                    result.osm_timestamp, result.representative_point_method,
                    now, now, place_id,
                ),
            )
        connection.execute(
            """
            INSERT INTO location_history (
                public_restaurant_id, latitude, longitude, location_source,
                location_source_reference, location_verification_status,
                location_verification_tier, location_precision,
                map_location_approximate, map_anchor_type,
                matched_components_json, unmatched_components_json, provenance,
                osm_type, osm_id, osm_version, osm_timestamp,
                map_display_eligible, location_status, change_reason, created_at
            ) VALUES (?, ?, ?, 'local_osm_polygon_fallback', ?,
                      'location_provisional', 'provisional_medium', ?, 1, ?,
                      ?, ?, ?, ?, ?, ?, ?, 1, 'location_provisional', ?, ?)
            """,
            (
                place_id, result.latitude, result.longitude, result.source_reference,
                precision, precision, matched, unmatched, result.provenance,
                result.osm_type, result.osm_id, result.osm_version,
                result.osm_timestamp,
                f"stable {prefix['source']} polygon fallback accepted", now,
            ),
        )
        connection.commit()
    report["active_location_updated"] = update_allowed
    report["preserved_stronger_location"] = not update_allowed
    return report


def verify_location(
    db_path: str | Path,
    place_id: str,
    *,
    osm_index: str | Path,
    osm_address_index: str | Path | None = None,
    address_model: str | None = None,
    dry_run: bool = False,
) -> dict[str, object]:
    from .osm_resolver import resolve_osm_locations

    invalidated_area_anchor = invalidate_contradictory_area_anchor(
        db_path, place_id, dry_run=dry_run
    )

    result = resolve_osm_locations(
        db_path,
        osm_index,
        limit=1,
        place_id=place_id,
        published_only=False,
        force=True,
        dry_run=dry_run,
    )
    reports = result.get("reports") or []
    poi_status = reports[0].get("status") if reports else None
    address_result: dict[str, object] | None = None
    address_research: dict[str, object] | None = None
    area_anchor: dict[str, object] | None = None
    existing_evidence_avoided_fallback = False
    with connect(db_path) as connection:
        active = connection.execute(
            """
            SELECT map_display_eligible, latitude, longitude, location_status,
                   location_precision, map_location_precision, map_anchor_type,
                   location_source
            FROM public_restaurants WHERE place_id=?
            """,
            (place_id,),
        ).fetchone()
    active_location_valid = bool(
        active
        and active["map_display_eligible"]
        and active["latitude"] is not None
        and active["longitude"] is not None
        and str(active["location_status"] or "").casefold()
        not in {"invalidated", "location_invalidated", "location_removed"}
    )
    if poi_status != "osm_auto_verified" and osm_address_index is not None:
        from .address_geocoder import LocalOSMAddressGeocoder
        from .address_geocoding import geocode_verified_addresses
        from .address_research import run_address_discovery

        # Always try already-accepted evidence first. This includes address evidence
        # captured by the combined restaurant-research request.
        address_result = geocode_verified_addresses(
            db_path,
            geocoder=LocalOSMAddressGeocoder(
                osm_address_index,
                allow_area_fallback=True,
                minimum_area_precision="ward",
            ),
            limit=1,
            place_id=place_id,
            dry_run=dry_run,
            published_only=False,
        )
        selected_existing = int(address_result.get("selected", 0)) > 0
        if selected_existing:
            existing_evidence_avoided_fallback = True
        elif not selected_existing and not active_location_valid:
            area_anchor = apply_best_available_polygon_fallback(
                db_path,
                place_id,
                osm_address_index=osm_address_index,
                dry_run=dry_run,
                allow_candidate_context=True,
            )
            if area_anchor is None:
                address_research = run_address_discovery(
                    db_path,
                    limit=1,
                    place_id=place_id,
                    plan_only=dry_run,
                    model=address_model,
                    published_only=False,
                )
                if not dry_run and int(address_research.get("persisted", 0)) > 0:
                    address_result = geocode_verified_addresses(
                        db_path,
                        geocoder=LocalOSMAddressGeocoder(
                            osm_address_index,
                            allow_area_fallback=True,
                            minimum_area_precision="ward",
                        ),
                        limit=1,
                        place_id=place_id,
                        dry_run=False,
                        published_only=False,
                    )
        address_succeeded = bool(
            int((address_result or {}).get("location_verified", 0))
            or int((address_result or {}).get("location_provisional", 0))
        )
        if not address_succeeded and not active_location_valid and area_anchor is None:
            area_anchor = apply_best_available_polygon_fallback(
                db_path,
                place_id,
                osm_address_index=osm_address_index,
                dry_run=dry_run,
                allow_candidate_context=True,
            )
            if area_anchor is None:
                area_anchor = _apply_trusted_area_anchor(
                    db_path, place_id, dry_run=dry_run
                )
    if not dry_run:
        mark_location_attempted(db_path, place_id)
    return {
        "place_id": place_id,
        "method": (
            "poi"
            if poi_status == "osm_auto_verified"
            else "address_fallback"
            if address_result and (
                int(address_result.get("location_verified", 0))
                or int(address_result.get("location_provisional", 0))
            )
            else "area_anchor"
            if area_anchor is not None
            else "existing_location"
            if active_location_valid
            else "unresolved"
        ),
        "poi": result,
        "address_fallback_attempted": address_result is not None,
        "address_fallback": address_result,
        "existing_address_evidence_avoided_responses_fallback": (
            existing_evidence_avoided_fallback
        ),
        "address_research": address_research,
        "trusted_area_anchor": area_anchor,
        "contradictory_area_anchor_invalidated": invalidated_area_anchor,
        "cost": {
            "address_fallback_responses_requests": int(
                ((address_research or {}).get("usage_totals") or {}).get(
                    "response_request_count", 0
                )
            ),
            "address_fallback_web_search_actions": int(
                ((address_research or {}).get("usage_totals") or {}).get(
                    "web_search_action_count", 0
                )
            ),
            "existing_evidence_avoided_fallback_request": (
                existing_evidence_avoided_fallback
            ),
        },
    }


def inspect_candidate(db_path: str | Path, place_id: str) -> dict[str, object]:
    row = _row(db_path, place_id)
    with connect(db_path) as connection:
        runs = [
            dict(item)
            for item in connection.execute(
                """
                SELECT id, provider, model, prompt_version, pipeline_version, status,
                       is_current, created_at, completed_at, error
                FROM restaurant_research_runs
                WHERE public_restaurant_id = ? ORDER BY created_at DESC
                """,
                (place_id,),
            )
        ]
    fields = (
        "place_id", "candidate_title", "name_ja", "name_en", "primary_category",
        "neighborhood", "source_address", "description_en", "food_tags_json",
        "signature_dishes_json", "fiyu_score", "score_band", "score_version",
        "local_discovery_score", "local_discovery_classification",
        "local_discovery_components_json", "local_discovery_contribution",
        "tourist_visibility_classification", "tourist_orientation",
        "tourist_orientation_basis",
        "tourist_signals_json", "local_audience_signals_json", "product_eligible",
        "product_eligibility_classification", "product_eligibility_reasons_json",
        "low_footprint_route_evaluated", "low_footprint_route_eligible",
        "low_footprint_trigger_reason", "low_footprint_research_attempted",
        "low_footprint_research_run_id",
        "research_status", "review_status", "is_published", "image_url",
        "normalized_address", "latitude", "longitude", "location_precision",
        "location_verification_status", "map_location_approximate",
        "map_display_eligible", "location_source_reference", "location_attempted_at",
        "card_enrichment_json", "enrichment_updated_at",
    )
    result = {field: row.get(field) for field in fields}
    result["readiness"] = publish_readiness(db_path, place_id).to_dict()
    result["auto_publish_readiness"] = auto_publish_readiness(
        db_path, place_id
    ).to_dict()
    result["research_runs"] = runs
    return result


def pipeline_status(db_path: str | Path) -> dict[str, object]:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS candidates,
              SUM(research_status = 'complete') AS researched,
              SUM(research_status = 'failed') AS research_failed,
              SUM(review_status = 'needs_review') AS needs_review,
              SUM(review_status = 'approved') AS approved,
              SUM(is_published = 1) AS published,
              SUM(location_verification_status = 'osm_auto_verified') AS location_exact,
              SUM(map_location_approximate = 1) AS location_approximate,
              SUM(location_attempted_at IS NOT NULL AND map_display_eligible = 0)
                AS location_unresolved
            FROM public_restaurants
            """
        ).fetchone()
    return {key: int(value or 0) for key, value in dict(row).items()}


def run_candidate_pipeline(
    db_path: str | Path,
    place_id: str,
    *,
    osm_index: str | Path,
    osm_address_index: str | Path | None = None,
    model: str | None = None,
    dry_run: bool = False,
) -> dict[str, object]:
    from .research_worker import run_research_batch

    research = run_research_batch(
        db_path, limit=1, place_id=place_id, model=model, dry_run=dry_run
    )
    if dry_run:
        return {
            "dry_run": True,
            "place_id": place_id,
            "research": research,
            "location": {
                "will_attempt": True,
                "osm_index": str(osm_index),
                "osm_address_index": (
                    str(osm_address_index) if osm_address_index is not None else None
                ),
            },
            "publication": "deterministic_after_location_resolution",
        }
    candidate_after_research = _row(db_path, place_id)
    if candidate_after_research.get("research_status") != "complete":
        return {"place_id": place_id, "research": research, "location": None}
    low_footprint: dict[str, object] = {
        "selected": 0,
        "responses_requests": 0,
        "web_search_actions": 0,
        "results": [],
    }
    if candidate_after_research.get("low_footprint_route_eligible"):
        from .low_footprint_research import run_low_footprint_research

        low_footprint = run_low_footprint_research(
            db_path,
            place_ids=[place_id],
            limit=1,
            model=model,
        )
    location = verify_location(
        db_path,
        place_id,
        osm_index=osm_index,
        osm_address_index=osm_address_index,
        address_model=model,
    )
    publication = apply_automatic_publication(db_path, place_id)
    address_cost = location.get("cost") or {}
    restaurant_requests = int(research.get("responses_requests", 0))
    return {
        "place_id": place_id,
        "research": research,
        "low_footprint_research": low_footprint,
        "location": location,
        "candidate": inspect_candidate(db_path, place_id),
        "publication": publication,
        "cost": {
            "restaurant_research_responses_requests": restaurant_requests,
            "low_footprint_responses_requests": int(
                low_footprint.get("responses_requests", 0)
            ),
            "low_footprint_web_search_actions": int(
                low_footprint.get("web_search_actions", 0)
            ),
            "address_fallback_responses_requests": int(
                address_cost.get("address_fallback_responses_requests", 0)
            ),
            "address_fallback_web_search_actions": int(
                address_cost.get("address_fallback_web_search_actions", 0)
            ),
            "existing_evidence_avoided_fallback_request": bool(
                address_cost.get("existing_evidence_avoided_fallback_request")
            ),
        },
        "published": publication["published"],
    }


def _batch_stage_counts(
    results: list[dict[str, object]], failures: list[dict[str, str]]
) -> dict[str, int]:
    completed = sum(
        isinstance(item.get("candidate"), dict) or "published" in item
        for item in results
    )
    research_failures = sum(
        int((item.get("research") or {}).get("failed", 0) or 0)
        for item in results
        if isinstance(item.get("research"), dict)
    )
    low_footprint_failures = sum(
        result.get("status") in {"failed", "needs_retry"}
        for item in results
        for result in (
            (item.get("low_footprint_research") or {}).get("results", [])
            if isinstance(item.get("low_footprint_research"), dict)
            else []
        )
        if isinstance(result, dict)
    )
    location_unresolved = sum(
        isinstance(item.get("location"), dict)
        and item["location"].get("method") == "unresolved"
        for item in results
    )
    fatal = len(failures)
    return {
        "completed": completed,
        "research_failures": research_failures,
        "low_footprint_failures": low_footprint_failures,
        "location_unresolved_nonfatal": location_unresolved,
        "fatal_pipeline_failures": fatal,
        "failed": research_failures + fatal,
    }


def run_pipeline_batch(
    db_path: str | Path,
    *,
    osm_index: str | Path,
    osm_address_index: str | Path | None = None,
    place_id: str | None = None,
    limit: int = 1,
    model: str | None = None,
    dry_run: bool = False,
) -> dict[str, object]:
    """Run isolated candidates; preserve completed work and continue after failures."""

    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")
    ensure_public_schema(db_path)
    status_placeholders = ",".join("?" for _ in AUTO_PIPELINE_RESEARCH_STATUSES)
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT p.place_id
            FROM public_restaurants p
            JOIN restaurants r ON r.place_id=p.place_id
            WHERE (
                    (? IS NOT NULL AND p.place_id=?)
                    OR (? IS NULL AND p.is_published=0
                        AND p.review_status!='auto_rejected')
                  )
              AND p.research_status IN ({status_placeholders})
            ORDER BY CASE WHEN p.research_status='complete' THEN 0 ELSE 1 END,
                     p.updated_at, p.place_id
            LIMIT ?
            """,
            (
                place_id,
                place_id,
                place_id,
                *AUTO_PIPELINE_RESEARCH_STATUSES,
                limit,
            ),
        ).fetchall()
    results: list[dict[str, object]] = []
    failures: list[dict[str, str]] = []
    for row in rows:
        current_id = str(row["place_id"])
        try:
            results.append(
                run_candidate_pipeline(
                    db_path,
                    current_id,
                    osm_index=osm_index,
                    osm_address_index=osm_address_index,
                    model=model,
                    dry_run=dry_run,
                )
            )
        except Exception as exc:  # noqa: BLE001 - batch rows are intentionally isolated.
            failures.append(
                {"place_id": current_id, "error": f"{type(exc).__name__}: {exc}"}
            )
    candidates = [
        item["candidate"]
        for item in results
        if isinstance(item.get("candidate"), dict)
    ]

    def distribution(field: str) -> dict[str, int]:
        return dict(
            sorted(
                Counter(str(item.get(field) or "unknown") for item in candidates).items()
            )
        )

    def score_distribution(field: str) -> dict[str, object]:
        values = [float(item[field]) for item in candidates if item.get(field) is not None]
        return {
            "count": len(values),
            "minimum": min(values) if values else None,
            "average": round(sum(values) / len(values), 2) if values else None,
            "maximum": max(values) if values else None,
        }

    from .card_enrichment import CardEnrichment, classify_enrichment

    enrichment_classes: Counter[str] = Counter()
    for candidate in candidates:
        try:
            enrichment = CardEnrichment.model_validate_json(
                str(candidate.get("card_enrichment_json") or "{}")
            )
            classification, _ = classify_enrichment(enrichment)
        except ValueError:
            classification = "sparse"
        enrichment_classes[classification] += 1

    total_cost = {
        "responses_requests": 0,
        "web_search_actions": 0,
        "token_usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
    }
    for item in results:
        research = item.get("research") if isinstance(item.get("research"), dict) else {}
        low = (
            item.get("low_footprint_research")
            if isinstance(item.get("low_footprint_research"), dict)
            else {}
        )
        cost = item.get("cost") if isinstance(item.get("cost"), dict) else {}
        total_cost["responses_requests"] += int(research.get("responses_requests", 0))
        total_cost["responses_requests"] += int(low.get("responses_requests", 0))
        total_cost["responses_requests"] += int(
            cost.get("address_fallback_responses_requests", 0)
        )
        total_cost["web_search_actions"] += int(research.get("web_search_actions", 0))
        total_cost["web_search_actions"] += int(low.get("web_search_actions", 0))
        total_cost["web_search_actions"] += int(
            cost.get("address_fallback_web_search_actions", 0)
        )
        research_usage = research.get("token_usage", {})
        low_usage = low.get("token_usage", {})
        for key in total_cost["token_usage"]:
            total_cost["token_usage"][key] += int(research_usage.get(key, 0) or 0)
            total_cost["token_usage"][key] += int(low_usage.get(key, 0) or 0)

    batch_summary = {
        "fiyu_score": score_distribution("fiyu_score"),
        "fiyu_score_bands": distribution("score_band"),
        "local_discovery_score": score_distribution("local_discovery_score"),
        "local_discovery_classifications": distribution(
            "local_discovery_classification"
        ),
        "low_footprint_triggers": {
            "eligible": sum(bool(item.get("low_footprint_route_eligible")) for item in candidates),
            "attempted": sum(bool(item.get("low_footprint_research_attempted")) for item in candidates),
            "reasons": distribution("low_footprint_trigger_reason"),
        },
        "location_precision": distribution("location_precision"),
        "card_enrichment_completeness": dict(sorted(enrichment_classes.items())),
        "external_usage": total_cost,
    }
    stage_counts = _batch_stage_counts(results, failures)
    return {
        "selected": len(rows),
        **stage_counts,
        "processed": stage_counts["completed"],
        "completed_pipeline_records": stage_counts["completed"],
        "published": sum(bool(item.get("published")) for item in results),
        "auto_rejected": sum(
            isinstance(item.get("publication"), dict)
            and item["publication"].get("outcome") == "auto_rejected"
            for item in results
        ),
        "results": results,
        "failures": failures,
        "batch_summary": batch_summary,
    }
