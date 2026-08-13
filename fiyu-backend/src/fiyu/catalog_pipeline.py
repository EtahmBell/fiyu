from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from .database import connect
from .location_names import normalize_location_name
from .public_catalog import ensure_public_schema

PIPELINE_VERSION = "catalog-pipeline-v1"

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
                   r.neighborhood, r.image_url
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
    if not str(row.get("primary_category") or "").strip():
        missing.append("category")
    if row.get("research_status") != "complete":
        missing.append("completed_research")
    if row.get("fiyu_score") is None or not str(row.get("score_version") or "").strip():
        missing.append("deterministic_score")
    if not str(row.get("description_en") or "").strip():
        missing.append("description")
    if require_approval and row.get("review_status") != "approved":
        missing.append("review_approval")

    attempted = bool(row.get("location_attempted_at")) or row.get(
        "location_verification_status"
    ) not in (None, "", "unknown_provenance")
    if not attempted:
        missing.append("location_attempt")
    map_eligible = bool(row.get("map_display_eligible"))
    warnings: list[str] = []
    if attempted and not map_eligible:
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
    """Return the deterministic publish decision stored with current research."""

    with connect(db_path) as connection:
        run = connection.execute(
            """
            SELECT score_json FROM restaurant_research_runs
            WHERE public_restaurant_id=? AND status='complete'
            ORDER BY is_current DESC, id DESC LIMIT 1
            """,
            (row["place_id"],),
        ).fetchone()
    if run is None:
        return False
    try:
        score = json.loads(run["score_json"] or "{}")
    except json.JSONDecodeError:
        return False
    return score.get("publishable") is True


def auto_publish_readiness(db_path: str | Path, place_id: str) -> PublishReadiness:
    """Deterministic normal-path publication gate; no human approval required."""

    row = _row(db_path, place_id)
    base = publish_readiness(db_path, place_id, require_approval=False)
    missing = list(base.missing)
    if not _score_policy_publishable(db_path, row):
        missing.append("deterministic_score_policy")
    if not base.map_eligible:
        missing.append("defensible_location")
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
            "location_unresolvable"
            if "defensible_location" in readiness.missing
            else "identity_or_score_policy_rejected"
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


def _apply_trusted_area_anchor(
    db_path: str | Path, place_id: str, *, dry_run: bool
) -> dict[str, object] | None:
    """Use an existing reviewed OSM area anchor as the broadest safe fallback."""

    config_path = Path(__file__).with_name("location_anchors.json")
    anchors = json.loads(config_path.read_text(encoding="utf-8"))
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT v.neighborhood, p.discovery_area
            FROM public_restaurants p
            LEFT JOIN verified_restaurant_addresses v
              ON v.public_restaurant_id=p.place_id
            WHERE p.place_id=?
            """,
            (place_id,),
        ).fetchone()
    if row is None:
        return None
    supported_areas = {
        normalize_location_name(value)
        for value in (row["neighborhood"], row["discovery_area"])
        if value
    }
    matches = [
        anchor
        for anchor in anchors
        if anchor.get("reviewed") is True
        and anchor.get("verified_at")
        and anchor.get("latitude") is not None
        and anchor.get("longitude") is not None
        and normalize_location_name(anchor.get("area_name")) in supported_areas
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
                minimum_area_precision="neighborhood",
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
                        minimum_area_precision="neighborhood",
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
        if not address_succeeded and not active_location_valid:
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
        "research_status", "review_status", "is_published", "image_url",
        "normalized_address", "latitude", "longitude", "location_precision",
        "location_verification_status", "map_location_approximate",
        "map_display_eligible", "location_source_reference", "location_attempted_at",
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
        "location": location,
        "candidate": inspect_candidate(db_path, place_id),
        "publication": publication,
        "cost": {
            "restaurant_research_responses_requests": restaurant_requests,
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
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT place_id FROM public_restaurants
            WHERE (? IS NOT NULL AND place_id=?)
               OR (? IS NULL AND is_published=0 AND review_status!='auto_rejected')
            ORDER BY CASE WHEN research_status='complete' THEN 0 ELSE 1 END,
                     updated_at, place_id LIMIT ?
            """,
            (place_id, place_id, place_id, limit),
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
    return {
        "selected": len(rows),
        "completed": len(results),
        "failed": len(failures),
        "published": sum(bool(item.get("published")) for item in results),
        "auto_rejected": sum(
            isinstance(item.get("publication"), dict)
            and item["publication"].get("outcome") == "auto_rejected"
            for item in results
        ),
        "results": results,
        "failures": failures,
    }
