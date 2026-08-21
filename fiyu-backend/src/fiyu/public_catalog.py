from __future__ import annotations

import csv
import hashlib
import json
import os
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

from .database import connect
from .local_discovery import ProductEligibility, assess_low_footprint_eligibility
from .public_score import (
    FiyuEvidence,
    FiyuScoreResult,
    InternalSignals,
    evaluate_fiyu_candidate,
)

PUBLIC_SCHEMA = """
CREATE TABLE IF NOT EXISTS public_restaurants (
    place_id TEXT PRIMARY KEY,
    source_restaurant_id INTEGER,

    name_ja TEXT,
    name_en TEXT,
    primary_category TEXT,
    food_tags_json TEXT NOT NULL DEFAULT '[]',
    signature_dishes_json TEXT NOT NULL DEFAULT '[]',
    why_fiyu TEXT,
    description_en TEXT,
    description_source_urls_json TEXT NOT NULL DEFAULT '[]',
    description_confidence REAL,
    description_model_name TEXT,
    description_prompt_version TEXT,
    description_researched_at TEXT,
    card_description TEXT,
    card_description_confidence REAL,
    card_description_checked_at TEXT,
    review_themes_json TEXT NOT NULL DEFAULT '[]',
    review_themes_checked_at TEXT,
    practical_info_json TEXT NOT NULL DEFAULT '{}',
    practical_info_checked_at TEXT,
    opening_hours_json TEXT NOT NULL DEFAULT '{}',
    hours_display TEXT,
    hours_confidence REAL,
    hours_checked_at TEXT,
    card_enrichment_json TEXT NOT NULL DEFAULT '{}',
    card_enrichment_conflicts_json TEXT NOT NULL DEFAULT '[]',
    enrichment_updated_at TEXT,

    discovery_area TEXT,
    discovery_area_type TEXT,
    discovery_area_source TEXT,
    discovery_source_file TEXT,
    discovery_source_row INTEGER,
    discovery_areas_json TEXT NOT NULL DEFAULT '[]',
    multiple_discovery_areas INTEGER NOT NULL DEFAULT 0,
    discovery_area_conflict INTEGER NOT NULL DEFAULT 0,
    discovery_area_conflict_reason TEXT,

    latitude REAL,
    longitude REAL,
    normalized_address TEXT,
    location_source TEXT,
    location_source_reference TEXT,
    location_verified_at TEXT,
    location_reviewer_notes TEXT,
    location_reviewed_by TEXT,
    location_reviewed_at TEXT,
    location_verification_status TEXT NOT NULL DEFAULT 'unknown_provenance',
    location_verification_tier TEXT,
    location_status TEXT,
    location_match_confidence REAL,
    location_match_method TEXT,
    location_verification_method TEXT,
    location_osm_type TEXT,
    location_osm_id INTEGER,
    location_osm_version INTEGER,
    location_osm_timestamp TEXT,
    location_representative_point_method TEXT,
    location_source_checked_at TEXT,
    location_resolution_reason TEXT,
    map_display_eligible INTEGER NOT NULL DEFAULT 0,
    verified_core_address TEXT,
    core_address_verified INTEGER NOT NULL DEFAULT 0,
    full_address_verified INTEGER NOT NULL DEFAULT 0,
    map_location_approximate INTEGER NOT NULL DEFAULT 0,
    map_location_precision TEXT,
    map_anchor_type TEXT,
    location_matched_components_json TEXT NOT NULL DEFAULT '{}',
    location_unmatched_components_json TEXT NOT NULL DEFAULT '{}',
    location_provenance TEXT,
    unresolved_address_detail TEXT,
    location_precision TEXT CHECK (
        location_precision IS NULL OR location_precision IN ('exact', 'approximate', 'area_anchor')
    ),

    local_signal REAL,
    hiddenness_signal REAL,
    quality_signal REAL,
    independence_signal REAL,
    local_discovery_score REAL,
    local_discovery_classification TEXT,
    local_discovery_components_json TEXT NOT NULL DEFAULT '{}',
    local_discovery_contribution REAL,
    tourist_visibility_classification TEXT,
    tourist_orientation TEXT NOT NULL DEFAULT 'unknown',
    tourist_orientation_basis TEXT NOT NULL DEFAULT 'neutral_unknown',
    tourist_signals_json TEXT NOT NULL DEFAULT '[]',
    local_audience_signals_json TEXT NOT NULL DEFAULT '[]',
    product_eligible INTEGER NOT NULL DEFAULT 1,
    product_eligibility_classification TEXT,
    product_eligibility_reasons_json TEXT NOT NULL DEFAULT '[]',
    low_footprint_route_evaluated INTEGER NOT NULL DEFAULT 0,
    low_footprint_route_eligible INTEGER NOT NULL DEFAULT 0,
    low_footprint_trigger_reason TEXT,
    low_footprint_trigger_score_json TEXT NOT NULL DEFAULT '{}',
    low_footprint_research_attempted INTEGER NOT NULL DEFAULT 0,
    low_footprint_research_run_id INTEGER,
    fiyu_score REAL,
    fiyu_confidence REAL,
    confidence_band TEXT,
    score_band TEXT,
    score_version TEXT,

    identity_confidence REAL,
    evidence_json TEXT NOT NULL DEFAULT '{}',
    evidence_urls_json TEXT NOT NULL DEFAULT '[]',

    research_status TEXT NOT NULL DEFAULT 'pending',
    verification_status TEXT NOT NULL DEFAULT 'unresearched',
    research_error TEXT,
    model_name TEXT,
    prompt_version TEXT,
    researched_at TEXT,
    address_resolution_status TEXT NOT NULL DEFAULT 'address_not_researched',
    is_published INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_public_score
    ON public_restaurants(is_published, fiyu_score DESC);
CREATE INDEX IF NOT EXISTS idx_public_research_queue
    ON public_restaurants(research_status, updated_at);
CREATE TABLE IF NOT EXISTS restaurant_research_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    pipeline_version TEXT NOT NULL,
    status TEXT NOT NULL,
    structured_research_json TEXT NOT NULL DEFAULT '{}',
    evidence_json TEXT NOT NULL DEFAULT '{}',
    evidence_urls_json TEXT NOT NULL DEFAULT '[]',
    score_json TEXT NOT NULL DEFAULT '{}',
    location_snapshot_json TEXT NOT NULL DEFAULT '{}',
    usage_metadata_json TEXT NOT NULL DEFAULT '{}',
    error TEXT,
    is_current INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id)
);
CREATE INDEX IF NOT EXISTS idx_restaurant_research_runs_current
    ON restaurant_research_runs(public_restaurant_id, is_current, created_at DESC);
CREATE TABLE IF NOT EXISTS score_calculation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    source_research_run_id INTEGER,
    score_version TEXT NOT NULL,
    evidence_fingerprint TEXT NOT NULL,
    score_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id),
    FOREIGN KEY (source_research_run_id) REFERENCES restaurant_research_runs(id),
    UNIQUE (public_restaurant_id, score_version, evidence_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_score_calculation_runs_restaurant
    ON score_calculation_runs(public_restaurant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS low_footprint_research_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    evidence_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    trigger_reason TEXT NOT NULL,
    trigger_snapshot_json TEXT NOT NULL DEFAULT '{}',
    restaurant_research_run_id INTEGER,
    response_id TEXT,
    result_evidence_json TEXT NOT NULL DEFAULT '{}',
    before_score_json TEXT NOT NULL DEFAULT '{}',
    after_score_json TEXT NOT NULL DEFAULT '{}',
    usage_metadata_json TEXT NOT NULL DEFAULT '{}',
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id),
    FOREIGN KEY (restaurant_research_run_id) REFERENCES restaurant_research_runs(id),
    UNIQUE (public_restaurant_id, evidence_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_low_footprint_runs_restaurant
    ON low_footprint_research_runs(public_restaurant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS description_research_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    response_id TEXT,
    status TEXT NOT NULL,
    previous_description_en TEXT,
    description_en TEXT,
    restaurant_type_en TEXT,
    cuisine_terms_en_json TEXT NOT NULL DEFAULT '[]',
    signature_dishes_en_json TEXT NOT NULL DEFAULT '[]',
    supporting_source_urls_json TEXT NOT NULL DEFAULT '[]',
    confidence REAL,
    unsupported_claims_json TEXT NOT NULL DEFAULT '[]',
    web_search_action_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id)
);
CREATE INDEX IF NOT EXISTS idx_description_research_runs_restaurant
    ON description_research_runs(public_restaurant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS restaurant_card_enrichment_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    prompt_version TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    source_research_run_id INTEGER,
    response_id TEXT,
    input_fingerprint TEXT NOT NULL,
    enrichment_json TEXT NOT NULL DEFAULT '{}',
    usage_metadata_json TEXT NOT NULL DEFAULT '{}',
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id),
    FOREIGN KEY (source_research_run_id) REFERENCES restaurant_research_runs(id),
    UNIQUE (public_restaurant_id, phase, input_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_card_enrichment_runs_restaurant
    ON restaurant_card_enrichment_runs(public_restaurant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS community_recommendations (
    response_id TEXT PRIMARY KEY,
    place_id TEXT NOT NULL,
    user_subject_id TEXT NOT NULL,
    recommends INTEGER NOT NULL CHECK (recommends IN (0, 1)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (place_id) REFERENCES public_restaurants(place_id),
    UNIQUE (place_id, user_subject_id)
);
CREATE INDEX IF NOT EXISTS idx_community_recommendations_place
    ON community_recommendations(place_id);
CREATE TABLE IF NOT EXISTS location_match_candidates (
    place_id TEXT NOT NULL,
    candidate_rank INTEGER NOT NULL,
    osm_type TEXT NOT NULL,
    osm_id INTEGER NOT NULL,
    osm_version INTEGER,
    osm_timestamp TEXT,
    candidate_name TEXT,
    alternate_names_json TEXT NOT NULL DEFAULT '[]',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    amenity TEXT,
    cuisine TEXT,
    address_json TEXT NOT NULL DEFAULT '{}',
    total_score REAL NOT NULL,
    score_components_json TEXT NOT NULL DEFAULT '{}',
    warnings_json TEXT NOT NULL DEFAULT '[]',
    proposed_decision TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (place_id, candidate_rank),
    FOREIGN KEY (place_id) REFERENCES public_restaurants(place_id)
);
CREATE TABLE IF NOT EXISTS address_research_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    response_id TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    prompt_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    error TEXT,
    dry_run INTEGER NOT NULL DEFAULT 0,
    forced INTEGER NOT NULL DEFAULT 0,
    combined_research INTEGER NOT NULL DEFAULT 0,
    response_request_count INTEGER NOT NULL DEFAULT 0,
    web_search_action_count INTEGER NOT NULL DEFAULT 0,
    requested_max_web_actions INTEGER NOT NULL DEFAULT 0,
    web_action_limit_reached INTEGER NOT NULL DEFAULT 0,
    web_action_limit_exceeded INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    usage_metadata_json TEXT NOT NULL DEFAULT '{}',
    retry_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id)
);
CREATE INDEX IF NOT EXISTS idx_address_research_runs_restaurant
    ON address_research_runs(public_restaurant_id, started_at DESC);
CREATE TABLE IF NOT EXISTS address_search_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    research_run_id INTEGER NOT NULL,
    public_restaurant_id TEXT NOT NULL,
    query TEXT NOT NULL,
    query_fingerprint TEXT NOT NULL,
    search_action_index INTEGER,
    search_action_reference TEXT,
    attempted_at TEXT NOT NULL,
    result_status TEXT NOT NULL,
    query_origin TEXT NOT NULL DEFAULT 'fiyu_generated',
    FOREIGN KEY (research_run_id) REFERENCES address_research_runs(id),
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id)
);
CREATE INDEX IF NOT EXISTS idx_address_search_attempts_fingerprint
    ON address_search_attempts(public_restaurant_id, query_fingerprint);
CREATE TABLE IF NOT EXISTS address_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    research_run_id INTEGER,
    identity_status TEXT NOT NULL,
    identity_confidence REAL NOT NULL,
    matched_name TEXT,
    branch_name TEXT,
    address_raw TEXT,
    postal_code TEXT,
    prefecture TEXT,
    municipality_or_ward TEXT,
    neighborhood TEXT,
    street_or_block TEXT,
    building TEXT,
    floor TEXT,
    suite_or_unit TEXT,
    entrance TEXT,
    component_agreement_json TEXT NOT NULL DEFAULT '{}',
    agreed_core_address TEXT,
    core_address_verified INTEGER NOT NULL DEFAULT 0,
    full_address_verified INTEGER NOT NULL DEFAULT 0,
    unresolved_address_detail TEXT,
    proposed_location_precision TEXT,
    map_location_approximate INTEGER NOT NULL DEFAULT 0,
    source_evidence_json TEXT NOT NULL DEFAULT '[]',
    conflicting_addresses_json TEXT NOT NULL DEFAULT '[]',
    search_queries_json TEXT NOT NULL DEFAULT '[]',
    warnings_json TEXT NOT NULL DEFAULT '[]',
    recommended_action TEXT,
    research_summary TEXT,
    acceptance_status TEXT NOT NULL,
    acceptance_reasons_json TEXT NOT NULL DEFAULT '[]',
    evidence_fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id),
    FOREIGN KEY (research_run_id) REFERENCES address_research_runs(id)
);
CREATE INDEX IF NOT EXISTS idx_address_evidence_restaurant
    ON address_evidence(public_restaurant_id, acceptance_status, created_at DESC);
CREATE TABLE IF NOT EXISTS address_decision_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    address_evidence_id INTEGER NOT NULL,
    decision_version TEXT NOT NULL,
    acceptance_status TEXT NOT NULL,
    resolution_status TEXT NOT NULL,
    confidence_tier TEXT,
    acceptance_reasons_json TEXT NOT NULL DEFAULT '[]',
    component_agreement_json TEXT NOT NULL DEFAULT '{}',
    temporal_evidence_json TEXT NOT NULL DEFAULT '[]',
    original_evidence_fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id),
    FOREIGN KEY (address_evidence_id) REFERENCES address_evidence(id)
);
CREATE INDEX IF NOT EXISTS idx_address_decision_audits_restaurant
    ON address_decision_audits(public_restaurant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS address_review_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    address_evidence_id INTEGER NOT NULL,
    reviewer_decision TEXT NOT NULL,
    reviewer_notes TEXT,
    reviewed_by TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    import_provenance TEXT,
    evidence_fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id),
    FOREIGN KEY (address_evidence_id) REFERENCES address_evidence(id)
);
CREATE INDEX IF NOT EXISTS idx_address_review_decisions_restaurant
    ON address_review_decisions(public_restaurant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS verified_restaurant_addresses (
    public_restaurant_id TEXT PRIMARY KEY,
    address_evidence_id INTEGER,
    address_raw TEXT NOT NULL,
    postal_code TEXT,
    prefecture TEXT,
    municipality_or_ward TEXT,
    neighborhood TEXT,
    street_or_block TEXT,
    building TEXT,
    floor TEXT,
    suite_or_unit TEXT,
    entrance TEXT,
    verified_core_address TEXT,
    geocoding_address TEXT,
    core_address_verified INTEGER NOT NULL DEFAULT 0,
    full_address_verified INTEGER NOT NULL DEFAULT 0,
    unresolved_address_detail TEXT,
    approved_location_precision TEXT,
    map_location_approximate INTEGER NOT NULL DEFAULT 0,
    verification_method TEXT NOT NULL,
    evidence_references_json TEXT NOT NULL DEFAULT '[]',
    verified_by TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    status TEXT NOT NULL,
    address_confidence_tier TEXT,
    decision_fingerprint TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id),
    FOREIGN KEY (address_evidence_id) REFERENCES address_evidence(id)
);
CREATE TABLE IF NOT EXISTS address_geocode_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    verified_address_id INTEGER,
    raw_address TEXT NOT NULL,
    normalized_address TEXT,
    latitude REAL,
    longitude REAL,
    prefecture TEXT,
    municipality_or_ward TEXT,
    neighborhood TEXT,
    match_level TEXT,
    match_status TEXT,
    matched_components_json TEXT NOT NULL DEFAULT '{}',
    unmatched_components_json TEXT NOT NULL DEFAULT '{}',
    precision TEXT,
    derived_location_precision TEXT,
    map_location_approximate INTEGER NOT NULL DEFAULT 0,
    provider TEXT NOT NULL,
    provider_version TEXT,
    source_reference TEXT,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    validation_status TEXT NOT NULL,
    validation_reasons_json TEXT NOT NULL DEFAULT '[]',
    input_fingerprint TEXT,
    osm_type TEXT,
    osm_id INTEGER,
    osm_version INTEGER,
    osm_timestamp TEXT,
    representative_point_method TEXT,
    map_anchor_type TEXT,
    provenance TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id)
);
CREATE INDEX IF NOT EXISTS idx_address_geocode_results_restaurant
    ON address_geocode_results(public_restaurant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS location_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_restaurant_id TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    normalized_address TEXT,
    location_source TEXT,
    location_source_reference TEXT,
    location_verification_status TEXT,
    location_verification_tier TEXT,
    location_precision TEXT,
    map_location_approximate INTEGER NOT NULL DEFAULT 0,
    map_anchor_type TEXT,
    matched_components_json TEXT NOT NULL DEFAULT '{}',
    unmatched_components_json TEXT NOT NULL DEFAULT '{}',
    provenance TEXT,
    map_display_eligible INTEGER NOT NULL DEFAULT 0,
    location_status TEXT NOT NULL,
    osm_type TEXT,
    osm_id INTEGER,
    osm_version INTEGER,
    osm_timestamp TEXT,
    change_reason TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (public_restaurant_id) REFERENCES public_restaurants(place_id)
);
CREATE INDEX IF NOT EXISTS idx_location_history_restaurant
    ON location_history(public_restaurant_id, created_at DESC);
"""

PUBLIC_LOCATION_COLUMNS = {
    "latitude": "REAL",
    "longitude": "REAL",
    "normalized_address": "TEXT",
    "location_source": "TEXT",
    "location_source_reference": "TEXT",
    "location_verified_at": "TEXT",
    "location_reviewer_notes": "TEXT",
    "location_reviewed_by": "TEXT",
    "location_reviewed_at": "TEXT",
    "location_verification_status": "TEXT NOT NULL DEFAULT 'unknown_provenance'",
    "location_verification_tier": "TEXT",
    "location_status": "TEXT",
    "location_match_confidence": "REAL",
    "location_match_method": "TEXT",
    "location_verification_method": "TEXT",
    "location_osm_type": "TEXT",
    "location_osm_id": "INTEGER",
    "location_osm_version": "INTEGER",
    "location_osm_timestamp": "TEXT",
    "location_representative_point_method": "TEXT",
    "location_source_checked_at": "TEXT",
    "location_resolution_reason": "TEXT",
    "map_display_eligible": "INTEGER NOT NULL DEFAULT 0",
    "verified_core_address": "TEXT",
    "core_address_verified": "INTEGER NOT NULL DEFAULT 0",
    "full_address_verified": "INTEGER NOT NULL DEFAULT 0",
    "map_location_approximate": "INTEGER NOT NULL DEFAULT 0",
    "map_location_precision": "TEXT",
    "map_anchor_type": "TEXT",
    "location_matched_components_json": "TEXT NOT NULL DEFAULT '{}'",
    "location_unmatched_components_json": "TEXT NOT NULL DEFAULT '{}'",
    "location_provenance": "TEXT",
    "unresolved_address_detail": "TEXT",
    "location_precision": "TEXT",
    "address_resolution_status": "TEXT NOT NULL DEFAULT 'address_not_researched'",
}

PUBLIC_DISCOVERY_COLUMNS = {
    "discovery_area": "TEXT",
    "discovery_area_type": "TEXT",
    "discovery_area_source": "TEXT",
    "discovery_source_file": "TEXT",
    "discovery_source_row": "INTEGER",
    "discovery_areas_json": "TEXT NOT NULL DEFAULT '[]'",
    "multiple_discovery_areas": "INTEGER NOT NULL DEFAULT 0",
    "discovery_area_conflict": "INTEGER NOT NULL DEFAULT 0",
    "discovery_area_conflict_reason": "TEXT",
}

PUBLIC_DESCRIPTION_COLUMNS = {
    "description_en": "TEXT",
    "description_source_urls_json": "TEXT NOT NULL DEFAULT '[]'",
    "description_confidence": "REAL",
    "description_model_name": "TEXT",
    "description_prompt_version": "TEXT",
    "description_researched_at": "TEXT",
}

PUBLIC_CARD_ENRICHMENT_COLUMNS = {
    "card_description": "TEXT",
    "card_description_confidence": "REAL",
    "card_description_checked_at": "TEXT",
    "review_themes_json": "TEXT NOT NULL DEFAULT '[]'",
    "review_themes_checked_at": "TEXT",
    "practical_info_json": "TEXT NOT NULL DEFAULT '{}'",
    "practical_info_checked_at": "TEXT",
    "opening_hours_json": "TEXT NOT NULL DEFAULT '{}'",
    "hours_display": "TEXT",
    "hours_confidence": "REAL",
    "hours_checked_at": "TEXT",
    "card_enrichment_json": "TEXT NOT NULL DEFAULT '{}'",
    "card_enrichment_conflicts_json": "TEXT NOT NULL DEFAULT '[]'",
    "enrichment_updated_at": "TEXT",
}

PUBLIC_PIPELINE_COLUMNS = {
    "review_status": "TEXT NOT NULL DEFAULT 'candidate'",
    "review_notes": "TEXT",
    "reviewed_by": "TEXT",
    "reviewed_at": "TEXT",
    "location_attempted_at": "TEXT",
    "pipeline_version": "TEXT",
}

PUBLIC_LOCAL_DISCOVERY_COLUMNS = {
    "local_discovery_score": "REAL",
    "local_discovery_classification": "TEXT",
    "local_discovery_components_json": "TEXT NOT NULL DEFAULT '{}'",
    "local_discovery_contribution": "REAL",
    "tourist_visibility_classification": "TEXT",
    "tourist_orientation": "TEXT NOT NULL DEFAULT 'unknown'",
    "tourist_orientation_basis": "TEXT NOT NULL DEFAULT 'neutral_unknown'",
    "tourist_signals_json": "TEXT NOT NULL DEFAULT '[]'",
    "local_audience_signals_json": "TEXT NOT NULL DEFAULT '[]'",
    "product_eligible": "INTEGER NOT NULL DEFAULT 1",
    "product_eligibility_classification": "TEXT",
    "product_eligibility_reasons_json": "TEXT NOT NULL DEFAULT '[]'",
    "low_footprint_route_evaluated": "INTEGER NOT NULL DEFAULT 0",
    "low_footprint_route_eligible": "INTEGER NOT NULL DEFAULT 0",
    "low_footprint_trigger_reason": "TEXT",
    "low_footprint_trigger_score_json": "TEXT NOT NULL DEFAULT '{}'",
    "low_footprint_research_attempted": "INTEGER NOT NULL DEFAULT 0",
    "low_footprint_research_run_id": "INTEGER",
}

DESCRIPTION_TABLE_COLUMNS = {
    "previous_description_en": "TEXT",
}

ADDRESS_TABLE_COLUMNS = {
    "address_research_runs": {
        "requested_max_web_actions": "INTEGER NOT NULL DEFAULT 0",
        "web_action_limit_reached": "INTEGER NOT NULL DEFAULT 0",
        "web_action_limit_exceeded": "INTEGER NOT NULL DEFAULT 0",
    },
    "address_search_attempts": {
        "query_origin": "TEXT NOT NULL DEFAULT 'fiyu_generated'",
    },
    "address_evidence": {
        "floor": "TEXT",
        "suite_or_unit": "TEXT",
        "entrance": "TEXT",
        "component_agreement_json": "TEXT NOT NULL DEFAULT '{}'",
        "agreed_core_address": "TEXT",
        "core_address_verified": "INTEGER NOT NULL DEFAULT 0",
        "full_address_verified": "INTEGER NOT NULL DEFAULT 0",
        "unresolved_address_detail": "TEXT",
        "proposed_location_precision": "TEXT",
        "map_location_approximate": "INTEGER NOT NULL DEFAULT 0",
    },
    "verified_restaurant_addresses": {
        "floor": "TEXT",
        "suite_or_unit": "TEXT",
        "entrance": "TEXT",
        "verified_core_address": "TEXT",
        "geocoding_address": "TEXT",
        "core_address_verified": "INTEGER NOT NULL DEFAULT 0",
        "full_address_verified": "INTEGER NOT NULL DEFAULT 0",
        "unresolved_address_detail": "TEXT",
        "approved_location_precision": "TEXT",
        "map_location_approximate": "INTEGER NOT NULL DEFAULT 0",
        "address_confidence_tier": "TEXT",
        "decision_fingerprint": "TEXT",
    },
    "address_decision_audits": {
        "confidence_tier": "TEXT",
    },
    "address_geocode_results": {
        "derived_location_precision": "TEXT",
        "map_location_approximate": "INTEGER NOT NULL DEFAULT 0",
        "input_fingerprint": "TEXT",
        "neighborhood": "TEXT",
        "match_status": "TEXT",
        "matched_components_json": "TEXT NOT NULL DEFAULT '{}'",
        "unmatched_components_json": "TEXT NOT NULL DEFAULT '{}'",
        "osm_type": "TEXT",
        "osm_id": "INTEGER",
        "osm_version": "INTEGER",
        "osm_timestamp": "TEXT",
        "representative_point_method": "TEXT",
        "map_anchor_type": "TEXT",
        "provenance": "TEXT",
    },
    "location_history": {
        "osm_type": "TEXT",
        "osm_id": "INTEGER",
        "osm_version": "INTEGER",
        "osm_timestamp": "TEXT",
        "map_anchor_type": "TEXT",
        "matched_components_json": "TEXT NOT NULL DEFAULT '{}'",
        "unmatched_components_json": "TEXT NOT NULL DEFAULT '{}'",
        "provenance": "TEXT",
    },
}


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _score_evidence_fingerprint(
    evidence: FiyuEvidence,
    structured_research: dict[str, object] | None,
    score_version: str,
) -> str:
    payload = json.dumps(
        {
            "evidence": evidence.to_dict(),
            "structured_research": structured_research or {},
            "score_version": score_version,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _record_score_calculation(
    connection,
    *,
    place_id: str,
    evidence: FiyuEvidence,
    structured_research: dict[str, object] | None,
    score: FiyuScoreResult,
    source_research_run_id: int | None,
    now: str,
) -> None:
    connection.execute(
        """
        INSERT OR IGNORE INTO score_calculation_runs (
            public_restaurant_id, source_research_run_id, score_version,
            evidence_fingerprint, score_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            place_id,
            source_research_run_id,
            score.score_version,
            _score_evidence_fingerprint(evidence, structured_research, score.score_version),
            json.dumps(score.to_dict(), ensure_ascii=False),
            now,
        ),
    )


def _low_footprint_snapshot(evidence: FiyuEvidence, score: FiyuScoreResult) -> dict[str, object]:
    return {
        "score_version": score.score_version,
        "fiyu_score": score.fiyu_score,
        "local_discovery_score": score.local_discovery_score,
        "local_discovery_components": score.local_discovery_components,
        "research_confidence": score.fiyu_confidence,
        "evidence_source_count": evidence.total_evidence_sources,
        "product_eligible": score.product_eligible,
        "chain_excluded": score.chain_excluded,
    }


def ensure_public_schema(db_path: str | Path) -> None:
    with connect(db_path) as connection:
        connection.executescript(PUBLIC_SCHEMA)
        existing = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(public_restaurants)").fetchall()
        }
        for name, declaration in {
            **PUBLIC_LOCATION_COLUMNS,
            **PUBLIC_DISCOVERY_COLUMNS,
            **PUBLIC_DESCRIPTION_COLUMNS,
            **PUBLIC_CARD_ENRICHMENT_COLUMNS,
            **PUBLIC_PIPELINE_COLUMNS,
            **PUBLIC_LOCAL_DISCOVERY_COLUMNS,
        }.items():
            if name not in existing:
                connection.execute(
                    f"ALTER TABLE public_restaurants ADD COLUMN {name} {declaration}"
                )
        for table, columns in ADDRESS_TABLE_COLUMNS.items():
            existing_table_columns = {
                row["name"] for row in connection.execute(f"PRAGMA table_info({table})")
            }
            for name, declaration in columns.items():
                if name not in existing_table_columns:
                    connection.execute(f"ALTER TABLE {table} ADD COLUMN {name} {declaration}")
        existing_description_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(description_research_runs)")
        }
        for name, declaration in DESCRIPTION_TABLE_COLUMNS.items():
            if name not in existing_description_columns:
                connection.execute(
                    f"ALTER TABLE description_research_runs ADD COLUMN {name} {declaration}"
                )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_location_match_status
            ON public_restaurants(location_verification_status, is_published)
            """
        )
        connection.commit()


def seed_public_queue(
    db_path: str | Path,
    *,
    limit: int = 50,
    min_internal_score: float = 60.0,
    simple_rule_only: bool = False,
) -> int:
    """Seed research records without erasing completed research.

    place_id is used as the durable key because the internal restaurants table is
    replaced during each ingestion and its integer IDs can change.
    """

    ensure_public_schema(db_path)
    conditions = [
        "candidate_eligible = 1",
        "place_id IS NOT NULL",
        "TRIM(place_id) <> ''",
        "internal_fiyu_score >= ?",
    ]
    parameters: list[object] = [min_internal_score]
    if simple_rule_only:
        conditions.append("matches_simple_rule = 1")
    parameters.append(limit)

    now = _utc_now()
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT id, place_id
            FROM restaurants
            WHERE {" AND ".join(conditions)}
            ORDER BY internal_fiyu_score DESC, confidence_score DESC
            LIMIT ?
            """,
            parameters,
        ).fetchall()
        connection.executemany(
            """
            INSERT INTO public_restaurants (
                place_id, source_restaurant_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(place_id) DO UPDATE SET
                source_restaurant_id = excluded.source_restaurant_id,
                updated_at = excluded.updated_at
            """,
            ((row["place_id"], row["id"], now, now) for row in rows),
        )
        connection.commit()
    return len(rows)


AUTO_RESEARCH_QUEUE_STATUSES = ("pending",)
AUTO_PIPELINE_RESEARCH_STATUSES = ("complete", *AUTO_RESEARCH_QUEUE_STATUSES)


def get_research_queue(
    db_path: str | Path,
    *,
    limit: int = 10,
    retry_failed: bool = False,
    place_id: str | None = None,
) -> list[dict[str, object]]:
    ensure_public_schema(db_path)
    statuses = (
        (*AUTO_RESEARCH_QUEUE_STATUSES, "failed")
        if retry_failed
        else AUTO_RESEARCH_QUEUE_STATUSES
    )
    placeholders = ",".join("?" for _ in statuses)
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT
                p.place_id,
                p.research_status,
                p.name_ja,
                p.name_en,
                p.discovery_area,
                p.discovery_area_type,
                p.discovery_areas_json,
                r.id AS source_restaurant_id,
                r.title,
                r.address,
                r.city,
                r.neighborhood,
                r.latitude,
                r.longitude,
                r.category,
                r.broad_category,
                r.internal_fiyu_score,
                r.quality_score,
                r.underexposure_score,
                r.digital_footprint_score,
                r.rating,
                r.review_count,
                r.maps_url
            FROM public_restaurants p
            JOIN restaurants r ON r.place_id = p.place_id
            WHERE p.research_status IN ({placeholders})
              AND (? IS NULL OR p.place_id = ?)
            ORDER BY r.internal_fiyu_score DESC, r.confidence_score DESC
            LIMIT ?
            """,
            (*statuses, place_id, place_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def mark_research_started(db_path: str | Path, place_id: str) -> None:
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET research_status = 'needs_retry',
                research_error = 'Research request outcome is pending or ambiguous; explicit operator recovery is required before retry.',
                updated_at = ?
            WHERE place_id = ?
            """,
            (_utc_now(), place_id),
        )
        connection.commit()


def start_restaurant_research_run(
    db_path: str | Path,
    place_id: str,
    *,
    model: str,
    prompt_version: str,
    pipeline_version: str = "catalog-pipeline-v1",
) -> int:
    now = _utc_now()
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO restaurant_research_runs (
                public_restaurant_id, provider, model, prompt_version, pipeline_version,
                status, error, is_current, created_at
            ) VALUES (?, 'openai', ?, ?, ?, 'running', NULL, 0, ?)
            """,
            (place_id, model, prompt_version, pipeline_version, now),
        )
        connection.commit()
        return int(cursor.lastrowid)


def finish_restaurant_research_run(
    db_path: str | Path,
    run_id: int,
    *,
    status: str,
    error: str | None = None,
) -> None:
    if status not in {"failed", "needs_retry"}:
        raise ValueError("research run status must be failed or needs_retry")
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE restaurant_research_runs
            SET status = ?, error = ?, completed_at = ? WHERE id = ?
            """,
            (status, error[:2000] if error else None, _utc_now(), run_id),
        )
        connection.commit()


def mark_research_failed(db_path: str | Path, place_id: str, error: str) -> None:
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET research_status = 'failed', research_error = ?, updated_at = ?
            WHERE place_id = ?
            """,
            (error[:2000], _utc_now(), place_id),
        )
        connection.commit()


def save_research_result(
    db_path: str | Path,
    *,
    place_id: str,
    evidence: FiyuEvidence,
    score: FiyuScoreResult,
    name_ja: str | None,
    name_en: str | None,
    primary_category: str | None,
    food_tags: Iterable[str],
    signature_dishes: Iterable[str],
    why_fiyu: str,
    evidence_urls: Iterable[str],
    model_name: str,
    prompt_version: str,
    description_en: str | None = None,
    structured_research: dict[str, object] | None = None,
    usage_metadata: dict[str, object] | None = None,
    pipeline_version: str = "catalog-pipeline-v1",
    research_run_id: int | None = None,
) -> None:
    now = _utc_now()
    evidence_urls = tuple(sorted(set(evidence_urls)))
    verification_status = "automatically_researched"
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET
                name_ja = ?,
                name_en = ?,
                primary_category = ?,
                food_tags_json = ?,
                signature_dishes_json = ?,
                why_fiyu = ?,
                description_en = COALESCE(?, description_en),
                local_signal = ?,
                hiddenness_signal = ?,
                quality_signal = ?,
                independence_signal = ?,
                local_discovery_score = ?,
                local_discovery_classification = ?,
                local_discovery_components_json = ?,
                local_discovery_contribution = ?,
                tourist_visibility_classification = ?,
                tourist_orientation = ?,
                tourist_orientation_basis = ?,
                tourist_signals_json = ?,
                local_audience_signals_json = ?,
                product_eligible = ?,
                product_eligibility_classification = ?,
                product_eligibility_reasons_json = ?,
                fiyu_score = ?,
                fiyu_confidence = ?,
                confidence_band = ?,
                score_band = ?,
                score_version = ?,
                identity_confidence = ?,
                evidence_json = ?,
                evidence_urls_json = ?,
                research_status = 'complete',
                verification_status = ?,
                research_error = NULL,
                model_name = ?,
                prompt_version = ?,
                researched_at = ?, pipeline_version = ?, review_status = 'needs_review',
                updated_at = ?
            WHERE place_id = ?
            """,
            (
                name_ja,
                name_en,
                primary_category,
                json.dumps(list(food_tags), ensure_ascii=False),
                json.dumps(list(signature_dishes), ensure_ascii=False),
                why_fiyu,
                description_en,
                score.local_signal,
                score.hiddenness_signal,
                score.quality_signal,
                score.independence_signal,
                score.local_discovery_score,
                score.local_discovery_classification,
                json.dumps(score.local_discovery_components, ensure_ascii=False),
                score.local_discovery_contribution,
                score.tourist_visibility_classification,
                score.tourist_orientation,
                score.tourist_orientation_basis,
                json.dumps(evidence.tourist_signals, ensure_ascii=False),
                json.dumps(evidence.local_audience_signals, ensure_ascii=False),
                int(score.product_eligible),
                score.product_eligibility_classification,
                json.dumps(score.product_eligibility_reasons, ensure_ascii=False),
                score.fiyu_score,
                score.fiyu_confidence,
                score.confidence_band,
                score.score_band,
                score.score_version,
                evidence.identity_confidence,
                json.dumps(evidence.to_dict(), ensure_ascii=False),
                json.dumps(sorted(set(evidence_urls)), ensure_ascii=False),
                verification_status,
                model_name,
                prompt_version,
                now,
                pipeline_version,
                now,
                place_id,
            ),
        )
        location = connection.execute(
            """
            SELECT normalized_address, latitude, longitude, location_precision,
                   location_verification_status, map_location_approximate,
                   map_display_eligible, location_source_reference
            FROM public_restaurants WHERE place_id = ?
            """,
            (place_id,),
        ).fetchone()
        connection.execute(
            "UPDATE restaurant_research_runs SET is_current = 0 WHERE public_restaurant_id = ?",
            (place_id,),
        )
        run_payload = (
            json.dumps(structured_research or {}, ensure_ascii=False),
            json.dumps(evidence.to_dict(), ensure_ascii=False),
            json.dumps(sorted(set(evidence_urls)), ensure_ascii=False),
            json.dumps(score.to_dict(), ensure_ascii=False),
            json.dumps(dict(location) if location else {}, ensure_ascii=False),
            json.dumps(usage_metadata or {}, ensure_ascii=False),
        )
        if research_run_id is None:
            cursor = connection.execute(
                """
                INSERT INTO restaurant_research_runs (
                public_restaurant_id, provider, model, prompt_version, pipeline_version,
                status, structured_research_json, evidence_json, evidence_urls_json,
                score_json, location_snapshot_json, usage_metadata_json, is_current,
                created_at, completed_at
                ) VALUES (?, 'openai', ?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (place_id, model_name, prompt_version, pipeline_version, *run_payload, now, now),
            )
            active_research_run_id = int(cursor.lastrowid)
        else:
            connection.execute(
                """
                UPDATE restaurant_research_runs
                SET status = 'complete', structured_research_json = ?, evidence_json = ?,
                    evidence_urls_json = ?, score_json = ?, location_snapshot_json = ?,
                    usage_metadata_json = ?, is_current = 1, completed_at = ?, error = NULL
                WHERE id = ? AND public_restaurant_id = ?
                """,
                (*run_payload, now, research_run_id, place_id),
            )
            active_research_run_id = research_run_id
        from .card_enrichment import scoring_research_view

        _record_score_calculation(
            connection,
            place_id=place_id,
            evidence=evidence,
            structured_research=scoring_research_view(structured_research),
            score=score,
            source_research_run_id=active_research_run_id,
            now=now,
        )
        raw_enrichment = (structured_research or {}).get("card_enrichment")
        if isinstance(raw_enrichment, dict):
            from .card_enrichment import (
                CardEnrichment,
                compact_card_description,
                persist_card_enrichment,
            )

            incoming_enrichment = CardEnrichment.model_validate(raw_enrichment)
            if not incoming_enrichment.card_description:
                compact_description = compact_card_description(description_en)
                if compact_description:
                    incoming_enrichment = incoming_enrichment.model_copy(
                        update={
                            "card_description": compact_description,
                            "card_description_confidence": 0.6,
                            "card_description_source_urls": sorted(set(evidence_urls))[:8],
                        }
                    )

            persist_card_enrichment(
                connection,
                place_id=place_id,
                incoming=incoming_enrichment,
                provider="embedded_restaurant_research",
                model=model_name,
                prompt_version=prompt_version,
                source_research_run_id=active_research_run_id,
                response_id=str((usage_metadata or {}).get("response_id") or "") or None,
                usage_metadata=usage_metadata,
                phase="embedded_pipeline",
            )
        snapshot = _low_footprint_snapshot(evidence, score)
        route = assess_low_footprint_eligibility(
            local_discovery_score=score.local_discovery_score,
            fiyu_score=score.fiyu_score,
            research_confidence=score.fiyu_confidence,
            evidence_source_count=evidence.total_evidence_sources,
            product_eligibility=ProductEligibility(
                score.product_eligible,
                score.product_eligibility_classification,
                score.product_eligibility_reasons,
            ),
            chain_excluded=score.chain_excluded,
            fingerprint_payload=snapshot,
        )
        connection.execute(
            """
            UPDATE public_restaurants
            SET low_footprint_route_evaluated=1,
                low_footprint_route_eligible=?, low_footprint_trigger_reason=?,
                low_footprint_trigger_score_json=?
            WHERE place_id=?
            """,
            (
                int(route.eligible),
                route.reason,
                json.dumps(snapshot, ensure_ascii=False),
                place_id,
            ),
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO low_footprint_research_runs (
                public_restaurant_id, evidence_fingerprint, status,
                trigger_reason, trigger_snapshot_json, before_score_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                place_id,
                route.evidence_fingerprint,
                "eligible" if route.eligible else "not_eligible",
                route.reason,
                json.dumps(snapshot, ensure_ascii=False),
                json.dumps(score.to_dict(), ensure_ascii=False),
                now,
            ),
        )
        connection.commit()


def mark_research_needs_retry(db_path: str | Path, place_id: str, error: str) -> None:
    with connect(db_path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET research_status = 'needs_retry', research_error = ?, updated_at = ?
            WHERE place_id = ?
            """,
            (error[:2000], _utc_now(), place_id),
        )
        connection.commit()


def record_failed_research_run(
    db_path: str | Path,
    place_id: str,
    *,
    model: str,
    prompt_version: str,
    error: str,
    pipeline_version: str = "catalog-pipeline-v1",
) -> None:
    now = _utc_now()
    with connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO restaurant_research_runs (
                public_restaurant_id, provider, model, prompt_version, pipeline_version,
                status, error, is_current, created_at, completed_at
            ) VALUES (?, 'openai', ?, ?, ?, 'failed', ?, 0, ?, ?)
            """,
            (place_id, model, prompt_version, pipeline_version, error[:2000], now, now),
        )
        connection.commit()


def recover_research_for_retry(
    db_path: str | Path, place_id: str, *, dry_run: bool = False
) -> dict[str, object]:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        candidate = connection.execute(
            """
            SELECT place_id, research_status, research_error, researched_at
            FROM public_restaurants WHERE place_id = ?
            """,
            (place_id,),
        ).fetchone()
        if candidate is None:
            raise ValueError(f"Unknown place_id: {place_id}")
        if candidate["research_status"] == "complete" or candidate["researched_at"]:
            raise ValueError("Completed research cannot be reset")
        if candidate["research_status"] not in {"running", "needs_retry", "failed"}:
            raise ValueError(
                f"Candidate is not recoverable from status {candidate['research_status']!r}"
            )
        runs = connection.execute(
            """
            SELECT id, status FROM restaurant_research_runs
            WHERE public_restaurant_id = ? ORDER BY id
            """,
            (place_id,),
        ).fetchall()
        running_run_ids = [int(row["id"]) for row in runs if row["status"] == "running"]
        address_runs = connection.execute(
            """
            SELECT id FROM address_research_runs
            WHERE public_restaurant_id = ? AND status = 'running' ORDER BY id
            """,
            (place_id,),
        ).fetchall()
        address_run_ids = [int(row["id"]) for row in address_runs]
        result = {
            "place_id": place_id,
            "dry_run": dry_run,
            "previous_status": candidate["research_status"],
            "new_status": "pending",
            "preserved_research_runs": len(runs),
            "research_runs_marked_needs_retry": running_run_ids,
            "address_runs_marked_needs_retry": address_run_ids,
            "openai_requests_made": 0,
        }
        if dry_run:
            return result
        now = _utc_now()
        if running_run_ids:
            connection.executemany(
                """
                UPDATE restaurant_research_runs
                SET status = 'needs_retry', completed_at = ?,
                    error = COALESCE(error, 'Operator recovered interrupted or ambiguous attempt')
                WHERE id = ?
                """,
                ((now, run_id) for run_id in running_run_ids),
            )
        if address_run_ids:
            connection.executemany(
                """
                UPDATE address_research_runs
                SET status = 'needs_retry', completed_at = ?,
                    error = COALESCE(error, 'Operator recovered interrupted or ambiguous attempt')
                WHERE id = ?
                """,
                ((now, run_id) for run_id in address_run_ids),
            )
        connection.execute(
            """
            UPDATE public_restaurants
            SET research_status = 'pending', research_error = NULL, updated_at = ?
            WHERE place_id = ?
            """,
            (now, place_id),
        )
        connection.commit()
        return result


def recalculate_from_stored_evidence(db_path: str | Path, *, place_id: str | None = None) -> int:
    """Recalculate all completed rows for free after changing score weights."""

    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                p.place_id,
                p.evidence_json,
                p.primary_category,
                r.quality_score,
                r.underexposure_score,
                r.digital_footprint_score,
                rr.id AS research_run_id,
                rr.structured_research_json
            FROM public_restaurants p
            JOIN restaurants r ON r.place_id = p.place_id
            LEFT JOIN restaurant_research_runs rr ON rr.id = (
                SELECT current.id FROM restaurant_research_runs current
                WHERE current.public_restaurant_id=p.place_id
                  AND current.status='complete'
                ORDER BY current.is_current DESC, current.id DESC LIMIT 1
            )
            WHERE p.research_status = 'complete' AND (? IS NULL OR p.place_id = ?)
            """,
            (place_id, place_id),
        ).fetchall()

        count = 0
        for row in rows:
            raw = json.loads(row["evidence_json"] or "{}")
            evidence = FiyuEvidence(**raw)
            internal = InternalSignals(
                quality_score=float(row["quality_score"] or 0),
                underexposure_score=float(row["underexposure_score"] or 0),
                digital_footprint_score=float(row["digital_footprint_score"] or 0),
            )
            try:
                structured = json.loads(row["structured_research_json"] or "{}")
            except json.JSONDecodeError:
                structured = {}
            from .card_enrichment import scoring_research_view

            scoring_structured = scoring_research_view(structured)
            score = evaluate_fiyu_candidate(
                evidence,
                internal,
                scoring_structured,
                primary_category=row["primary_category"],
            )
            now = _utc_now()
            connection.execute(
                """
                UPDATE public_restaurants
                SET local_signal = ?, hiddenness_signal = ?, quality_signal = ?,
                    independence_signal = ?, local_discovery_score = ?,
                    local_discovery_classification = ?,
                    local_discovery_components_json = ?,
                    local_discovery_contribution = ?,
                    tourist_visibility_classification = ?, tourist_orientation = ?,
                    tourist_orientation_basis = ?,
                    tourist_signals_json = ?, local_audience_signals_json = ?,
                    product_eligible = ?,
                    product_eligibility_classification = ?,
                    product_eligibility_reasons_json = ?,
                    fiyu_score = ?, fiyu_confidence = ?,
                    confidence_band = ?, score_band = ?, score_version = ?,
                    updated_at = ?
                WHERE place_id = ?
                """,
                (
                    score.local_signal,
                    score.hiddenness_signal,
                    score.quality_signal,
                    score.independence_signal,
                    score.local_discovery_score,
                    score.local_discovery_classification,
                    json.dumps(score.local_discovery_components, ensure_ascii=False),
                    score.local_discovery_contribution,
                    score.tourist_visibility_classification,
                    score.tourist_orientation,
                    score.tourist_orientation_basis,
                    json.dumps(evidence.tourist_signals, ensure_ascii=False),
                    json.dumps(evidence.local_audience_signals, ensure_ascii=False),
                    int(score.product_eligible),
                    score.product_eligibility_classification,
                    json.dumps(score.product_eligibility_reasons, ensure_ascii=False),
                    score.fiyu_score,
                    score.fiyu_confidence,
                    score.confidence_band,
                    score.score_band,
                    score.score_version,
                    now,
                    row["place_id"],
                ),
            )
            _record_score_calculation(
                connection,
                place_id=row["place_id"],
                evidence=evidence,
                structured_research=scoring_structured,
                score=score,
                source_research_run_id=row["research_run_id"],
                now=now,
            )
            snapshot = _low_footprint_snapshot(evidence, score)
            route = assess_low_footprint_eligibility(
                local_discovery_score=score.local_discovery_score,
                fiyu_score=score.fiyu_score,
                research_confidence=score.fiyu_confidence,
                evidence_source_count=evidence.total_evidence_sources,
                product_eligibility=ProductEligibility(
                    score.product_eligible,
                    score.product_eligibility_classification,
                    score.product_eligibility_reasons,
                ),
                chain_excluded=score.chain_excluded,
                fingerprint_payload=snapshot,
            )
            connection.execute(
                """
                UPDATE public_restaurants
                SET low_footprint_route_evaluated=1,
                    low_footprint_route_eligible=?, low_footprint_trigger_reason=?,
                    low_footprint_trigger_score_json=? WHERE place_id=?
                """,
                (
                    int(route.eligible),
                    route.reason,
                    json.dumps(snapshot, ensure_ascii=False),
                    row["place_id"],
                ),
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO low_footprint_research_runs (
                    public_restaurant_id, evidence_fingerprint, status,
                    trigger_reason, trigger_snapshot_json, before_score_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["place_id"],
                    route.evidence_fingerprint,
                    "eligible" if route.eligible else "not_eligible",
                    route.reason,
                    json.dumps(snapshot, ensure_ascii=False),
                    json.dumps(score.to_dict(), ensure_ascii=False),
                    now,
                ),
            )
            count += 1
        connection.commit()
    return count


def list_public_restaurants(
    db_path: str | Path,
    *,
    published_only: bool = False,
    limit: int = 100,
) -> list[dict[str, object]]:
    ensure_public_schema(db_path)
    condition = "WHERE p.is_published = 1" if published_only else ""
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT
                p.*,
                r.title AS candidate_title,
                r.latitude,
                r.longitude,
                r.neighborhood,
                r.broad_category AS candidate_category,
                r.internal_fiyu_score
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            {condition}
            ORDER BY p.fiyu_score DESC NULLS LAST, r.internal_fiyu_score DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    decoded: list[dict[str, object]] = []
    for row in rows:
        item = dict(row)
        # Public/internal-audit label: this is a web-language signal,
        # not proof of customer nationality or local residency.
        item["local_language_web_signal"] = item.pop("local_signal", None)
        for field in (
            "food_tags_json",
            "signature_dishes_json",
            "evidence_urls_json",
            "local_discovery_components_json",
            "tourist_signals_json",
            "local_audience_signals_json",
            "product_eligibility_reasons_json",
        ):
            output = field.removesuffix("_json")
            try:
                item[output] = json.loads(item.pop(field) or "[]")
            except json.JSONDecodeError:
                item[output] = []
        try:
            item["evidence"] = json.loads(item.pop("evidence_json") or "{}")
        except json.JSONDecodeError:
            item["evidence"] = {}
        item["is_published"] = bool(item.get("is_published"))
        decoded.append(item)
    return decoded


def get_public_restaurant(db_path: str | Path, place_id: str) -> dict[str, object] | None:
    rows = _safe_public_rows(
        db_path, where="p.is_published = 1 AND p.place_id = ?", parameters=(place_id,), limit=1
    )
    return rows[0] if rows else None


def get_public_restaurant_detail(db_path: str | Path, place_id: str) -> dict[str, object] | None:
    """Return the public summary plus the latest accepted grounded detail fields."""
    restaurant = get_public_restaurant(db_path, place_id)
    if restaurant is None:
        return None

    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT restaurant_type_en, cuisine_terms_en_json,
                   signature_dishes_en_json, supporting_source_urls_json,
                   created_at
            FROM description_research_runs
            WHERE public_restaurant_id = ? AND status = 'accepted'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (place_id,),
        ).fetchone()

    restaurant["restaurant_type_en"] = row["restaurant_type_en"] if row else None
    restaurant["researched_at"] = row["created_at"] if row else None
    for output, source in (
        ("cuisine_terms_en", "cuisine_terms_en_json"),
        ("signature_dishes_en", "signature_dishes_en_json"),
        ("supporting_source_urls", "supporting_source_urls_json"),
    ):
        try:
            value = json.loads(row[source] or "[]") if row else []
            restaurant[output] = value if isinstance(value, list) else []
        except json.JSONDecodeError:
            restaurant[output] = []
    return restaurant


def list_published_restaurants(db_path: str | Path, *, limit: int = 100) -> list[dict[str, object]]:
    return _safe_public_rows(db_path, where="p.is_published = 1", parameters=(), limit=limit)


def _safe_public_rows(
    db_path: str | Path,
    *,
    where: str,
    parameters: tuple[object, ...],
    limit: int,
    community_minimum: int | None = None,
) -> list[dict[str, object]]:
    ensure_public_schema(db_path)
    if community_minimum is None:
        community_minimum = max(1, int(os.getenv("FIYU_COMMUNITY_MINIMUM_RESPONSES", "5")))
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT p.place_id, p.name_ja, p.name_en, p.primary_category,
                   r.neighborhood, r.address AS canonical_address,
                   p.fiyu_score, p.score_band, p.description_en,
                   p.card_description, p.review_themes_json,
                   p.practical_info_json, p.opening_hours_json,
                   p.hours_display, p.hours_confidence, p.hours_checked_at,
                   p.local_discovery_score, p.local_discovery_classification,
                   p.tourist_visibility_classification, p.tourist_orientation,
                   p.tourist_orientation_basis,
                   p.food_tags_json, p.signature_dishes_json,
                   p.discovery_area, p.discovery_area_type, p.discovery_areas_json,
                   p.multiple_discovery_areas, p.discovery_area_conflict,
                   p.latitude, p.longitude,
                   COALESCE(p.map_location_precision, p.location_precision) AS location_precision,
                   p.verified_core_address, p.core_address_verified,
                   p.full_address_verified, p.map_location_approximate,
                   p.map_display_eligible, p.map_anchor_type, p.location_status,
                   p.location_matched_components_json,
                   p.location_unmatched_components_json,
                   p.location_provenance, p.location_source_reference,
                   p.location_osm_type, p.location_osm_id, p.location_osm_version,
                   p.location_osm_timestamp, p.location_representative_point_method,
                   COUNT(c.response_id) AS community_recommendation_count,
                   COALESCE(SUM(c.recommends), 0) AS community_positive_count
            FROM public_restaurants p
            LEFT JOIN restaurants r ON r.place_id = p.place_id
            LEFT JOIN community_recommendations c ON c.place_id = p.place_id
            WHERE {where}
            GROUP BY p.place_id
            ORDER BY p.fiyu_score DESC
            LIMIT ?
            """,
            (*parameters, limit),
        ).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["category"] = item.pop("primary_category")
        eligible = bool(item.get("map_display_eligible"))
        item["map_display_eligible"] = eligible
        item["core_address_verified"] = bool(item.get("core_address_verified"))
        item["full_address_verified"] = bool(item.get("full_address_verified"))
        item["map_location_approximate"] = bool(item.get("map_location_approximate"))
        item["location_label"] = "Approximate area" if item["map_location_approximate"] else None
        item["distance_sort_eligible"] = bool(eligible and not item["map_location_approximate"])
        item["directions_coordinates_eligible"] = bool(
            eligible and not item["map_location_approximate"]
        )
        # A reviewed core address is the best written navigation target. Some
        # published rows have not completed that review yet, but still retain
        # the canonical Google Places address from the global catalog. Expose
        # that address only as the compact maps search target so restaurant
        # cards can offer navigation without treating unreviewed coordinates as
        # an exact destination.
        item["external_map_search_query"] = item.get("verified_core_address") or item.pop(
            "canonical_address", None
        )
        item["map_anchor_id"] = (
            f"{item.get('location_osm_type')}:{item.get('location_osm_id')}"
            if item.get("map_anchor_type")
            and item.get("location_osm_type")
            and item.get("location_osm_id") is not None
            else None
        )
        for source, target in (
            ("location_matched_components_json", "matched_components"),
            ("location_unmatched_components_json", "unmatched_components"),
        ):
            try:
                value = json.loads(item.pop(source) or "{}")
                item[target] = value if isinstance(value, dict) else {}
            except json.JSONDecodeError:
                item[target] = {}
        item["provenance"] = {
            "attribution": item.pop("location_provenance"),
            "osm_type": item.pop("location_osm_type"),
            "osm_id": item.pop("location_osm_id"),
            "osm_version": item.pop("location_osm_version"),
            "osm_timestamp": item.pop("location_osm_timestamp"),
            "representative_point_method": item.pop("location_representative_point_method"),
        }
        item["source_reference"] = item.pop("location_source_reference")
        if not eligible:
            item["latitude"] = None
            item["longitude"] = None
            item["location_precision"] = None
            item["map_location_approximate"] = False
            item["location_label"] = None
            item["distance_sort_eligible"] = False
            item["directions_coordinates_eligible"] = False
            item["map_anchor_id"] = None
        count = int(item.get("community_recommendation_count") or 0)
        positive = int(item.get("community_positive_count") or 0)
        visible = count >= community_minimum
        item["community_stats_visible"] = visible
        item["community_recommendation_rate"] = (
            round(positive / count, 4) if visible and count else None
        )
        item["score_type"] = "editorial_research"
        try:
            discovery_areas = json.loads(item.pop("discovery_areas_json") or "[]")
            item["discovery_areas"] = discovery_areas if isinstance(discovery_areas, list) else []
        except json.JSONDecodeError:
            item["discovery_areas"] = []
        item["discovery_area_conflict"] = bool(item.get("discovery_area_conflict"))
        item["multiple_discovery_areas"] = bool(item.get("multiple_discovery_areas"))
        for source, target in (
            ("food_tags_json", "food_tags"),
            ("signature_dishes_json", "signature_dishes"),
        ):
            try:
                value = json.loads(item.pop(source) or "[]")
                item[target] = value if isinstance(value, list) else []
            except json.JSONDecodeError:
                item[target] = []
        try:
            themes = json.loads(item.pop("review_themes_json") or "[]")
            from .card_enrichment import ReviewTheme

            public_themes: list[dict[str, object]] = []
            if isinstance(themes, list):
                for theme in themes:
                    if not isinstance(theme, dict):
                        continue
                    try:
                        validated = ReviewTheme.model_validate(theme)
                    except ValueError:
                        continue
                    public_themes.append(
                        {
                            key: getattr(validated, key)
                            for key in (
                                "theme",
                                "sentiment",
                                "supporting_source_count",
                                "confidence",
                            )
                        }
                    )
            item["review_themes"] = public_themes
        except json.JSONDecodeError:
            item["review_themes"] = []
        try:
            practical = json.loads(item.pop("practical_info_json") or "{}")
            if isinstance(practical, dict):
                from .card_enrichment import PracticalInfo, practical_info_is_useful

                practical.pop("source_urls", None)
                practical.pop("checked_at", None)
                item["practical_info"] = (
                    practical
                    if practical_info_is_useful(PracticalInfo.model_validate(practical))
                    else {}
                )
            else:
                item["practical_info"] = {}
        except (json.JSONDecodeError, ValueError):
            item["practical_info"] = {}
        try:
            opening_hours = json.loads(item.pop("opening_hours_json") or "{}")
            if isinstance(opening_hours, dict):
                from .card_enrichment import OpeningHours, hours_are_usable

                opening_hours.pop("sources", None)
                opening_hours.pop("unresolved_conflicts", None)
                item["opening_hours"] = (
                    opening_hours
                    if hours_are_usable(OpeningHours.model_validate(opening_hours))
                    else {}
                )
            else:
                item["opening_hours"] = {}
        except (json.JSONDecodeError, ValueError):
            item["opening_hours"] = {}
        results.append(item)
    return results


def set_publication_status(db_path: str | Path, place_id: str, *, published: bool) -> None:
    ensure_public_schema(db_path)
    with connect(db_path) as connection:
        cursor = connection.execute(
            "UPDATE public_restaurants SET is_published = ?, updated_at = ? WHERE place_id = ?",
            (int(published), _utc_now(), place_id),
        )
        if cursor.rowcount == 0:
            raise ValueError(f"Unknown place_id: {place_id}")
        connection.commit()


def list_review_candidates(db_path: str | Path, *, limit: int = 20) -> list[dict[str, object]]:
    rows = list_public_restaurants(db_path, published_only=False, limit=limit)
    fields = (
        "place_id",
        "name_ja",
        "name_en",
        "candidate_title",
        "primary_category",
        "neighborhood",
        "fiyu_score",
        "fiyu_confidence",
        "confidence_band",
        "score_band",
        "why_fiyu",
        "research_status",
        "verification_status",
        "is_published",
    )
    return [{field: row.get(field) for field in fields} for row in rows]


def export_public_csv(
    db_path: str | Path,
    output_path: str | Path,
    *,
    published_only: bool = False,
) -> int:
    rows = list_public_restaurants(db_path, published_only=published_only, limit=100_000)
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    columns = [
        "place_id",
        "name_ja",
        "name_en",
        "candidate_title",
        "neighborhood",
        "primary_category",
        "food_tags",
        "signature_dishes",
        "local_language_web_signal",
        "fiyu_score",
        "fiyu_confidence",
        "confidence_band",
        "score_band",
        "why_fiyu",
        "verification_status",
        "research_status",
        "is_published",
        "researched_at",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            clean = dict(row)
            clean["food_tags"] = ", ".join(clean.get("food_tags") or [])
            clean["signature_dishes"] = ", ".join(clean.get("signature_dishes") or [])
            writer.writerow(clean)
    return len(rows)
