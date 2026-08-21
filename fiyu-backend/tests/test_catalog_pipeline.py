import json

import pytest

from fiyu.catalog_pipeline import (
    _current_score_policy_decision,
    _row,
    _shared_address_prefix,
    apply_automatic_publication,
    auto_publish_readiness,
    backfill_legacy_published_locations,
    location_update_allowed,
    mark_location_attempted,
    publish_candidate,
    publish_readiness,
    restore_best_location_from_history,
    review_candidate,
    run_candidate_pipeline,
    run_pipeline_batch,
    verify_location,
)
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import (
    ensure_public_schema,
    recover_research_for_retry,
    save_research_result,
)
from fiyu.public_score import FiyuEvidence, InternalSignals, calculate_fiyu_score
from fiyu.research_worker import run_research_batch


def _db(tmp_path):
    path = tmp_path / "pipeline.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            """
            INSERT INTO restaurants (
                place_id, title, address, neighborhood, rating, review_count,
                candidate_eligible, internal_fiyu_score, confidence_score,
                quality_score, underexposure_score, digital_footprint_score,
                source_areas_json, score_reasons_json, source_files_json
            ) VALUES ('place-1', 'Restaurant', 'Tokyo', 'Shibuya', 4.4, 30,
                      1, 80, 80, 80, 75, 70, '[]', '[]', '[]')
            """
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, source_restaurant_id, research_status, is_published,
                created_at, updated_at
            ) VALUES ('place-1', 1, 'pending', 0, 'now', 'now')
            """
        )
        connection.execute(
            """
            CREATE TABLE fiyu_restaurant_seen (
                owner_id TEXT NOT NULL, place_id TEXT NOT NULL
            )
            """
        )
        connection.execute("INSERT INTO fiyu_restaurant_seen VALUES ('user-b', 'existing')")
        connection.commit()
    return path


def _save(path, *, name="Restaurant"):
    evidence = FiyuEvidence(
        matched_restaurant=True,
        identity_confidence=0.95,
        official_language="ja",
        japanese_source_count=3,
        tourist_coverage="low",
        specialist_restaurant=True,
        independent_positive_source_count=2,
        total_evidence_sources=4,
    )
    score = calculate_fiyu_score(evidence, InternalSignals(80, 75, 70))
    save_research_result(
        path,
        place_id="place-1",
        evidence=evidence,
        score=score,
        name_ja=name,
        name_en="Restaurant",
        primary_category="Sushi",
        food_tags=["Sushi"],
        signature_dishes=["Nigiri"],
        why_fiyu="Grounded evidence.",
        description_en="A focused independent sushi restaurant.",
        evidence_urls=["https://example.com/source"],
        model_name="test-model",
        prompt_version="test-prompt",
        structured_research={"name_ja": name},
    )
    return score


def test_research_is_versioned_and_score_is_reproducible(tmp_path):
    path = _db(tmp_path)
    first_score = _save(path, name="First")
    second_score = _save(path, name="Second")
    assert first_score == second_score
    with connect(path) as connection:
        runs = connection.execute(
            "SELECT structured_research_json, is_current FROM restaurant_research_runs ORDER BY id"
        ).fetchall()
    assert len(runs) == 2
    assert json.loads(runs[0][0])["name_ja"] == "First"
    assert [row[1] for row in runs] == [0, 1]


def test_conflicting_blocks_keep_shared_chome_polygon_prefix():
    prefix = _shared_address_prefix({
        "municipality_or_ward": ["Taito", "台東区"],
        "neighborhood": ["竜泉", "竜泉"],
        "street_or_block": ["1-2-3", "1-9-8"],
    })
    assert prefix == {"ward": "Taito", "neighborhood": "竜泉", "chome": "1"}


def test_conflicting_chomes_keep_shared_neighborhood_polygon_prefix():
    prefix = _shared_address_prefix({
        "municipality_or_ward": ["Taito", "台東区"],
        "neighborhood": ["竜泉", "竜泉"],
        "street_or_block": ["1-2-3", "2-9-8"],
    })
    assert prefix == {"ward": "Taito", "neighborhood": "竜泉", "chome": None}


def test_publish_requires_review_but_location_is_non_blocking(tmp_path):
    path = _db(tmp_path)
    _save(path)
    with pytest.raises(ValueError, match="review_approval"):
        publish_candidate(path, "place-1")
    unresolved = publish_readiness(path, "place-1", require_approval=False)
    assert unresolved.publishable
    assert unresolved.warnings == ("location_not_attempted",)
    mark_location_attempted(path, "place-1")
    readiness = publish_readiness(path, "place-1", require_approval=False)
    assert readiness.publishable
    assert not readiness.map_eligible
    assert readiness.warnings == ("location_unresolved_or_map_unavailable",)
    review_candidate(path, "place-1", decision="approved", reviewed_by="operator")
    publish_candidate(path, "place-1")
    with connect(path) as connection:
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM fiyu_restaurant_seen").fetchone()[0] == 1


def test_legacy_backfill_finalizes_valid_location_without_changing_catalog_or_user_state(
    tmp_path,
):
    path = _db(tmp_path)
    _save(path)
    with connect(path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET is_published=1, latitude=35.7, longitude=139.7,
                map_display_eligible=1, location_source='openstreetmap',
                location_precision='exact',
                location_verification_status='manually_verified',
                location_status=NULL, map_location_precision=NULL,
                location_attempted_at=NULL
            WHERE place_id='place-1'
            """
        )
        before = connection.execute(
            """
            SELECT fiyu_score, description_en, food_tags_json, is_published
            FROM public_restaurants WHERE place_id='place-1'
            """
        ).fetchone()
        connection.commit()

    result = backfill_legacy_published_locations(
        path,
        osm_index=tmp_path / "unused-poi.sqlite",
        osm_address_index=tmp_path / "unused-address.sqlite",
    )

    assert result["published_inspected"] == 1
    assert result["missing_before"] == 1
    assert result["successfully_backfilled"] == 1
    assert result["missing_after"] == 0
    with connect(path) as connection:
        after = connection.execute(
            """
            SELECT fiyu_score, description_en, food_tags_json, is_published,
                   latitude, longitude, map_location_precision, location_status,
                   location_attempted_at
            FROM public_restaurants WHERE place_id='place-1'
            """
        ).fetchone()
        seen_count = connection.execute(
            "SELECT COUNT(*) FROM fiyu_restaurant_seen"
        ).fetchone()[0]
    assert tuple(after[:4]) == tuple(before)
    assert tuple(after[4:6]) == (35.7, 139.7)
    assert after[6] == "exact"
    assert after[7] == "location_active"
    assert after[8]
    assert seen_count == 1


def test_rejected_candidate_cannot_publish(tmp_path):
    path = _db(tmp_path)
    _save(path)
    mark_location_attempted(path, "place-1")
    review_candidate(path, "place-1", decision="rejected", reviewed_by="operator")
    with pytest.raises(ValueError, match="review_approval"):
        publish_candidate(path, "place-1")


def test_research_dry_run_never_calls_openai_or_mutates(tmp_path, monkeypatch):
    path = _db(tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = run_research_batch(path, limit=1, dry_run=True)
    assert result["maximum_responses_requests"] == 1
    with connect(path) as connection:
        assert connection.execute(
            "SELECT research_status FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == "pending"
        assert connection.execute("SELECT COUNT(*) FROM restaurant_research_runs").fetchone()[0] == 0


def test_complete_pipeline_dry_run_plans_without_mutation(tmp_path, monkeypatch):
    path = _db(tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = run_candidate_pipeline(
        path, "place-1", osm_index="not-opened-in-dry-run.sqlite", dry_run=True
    )
    assert result["research"]["maximum_responses_requests"] == 1
    assert result["location"]["will_attempt"] is True
    assert result["publication"] == "deterministic_after_location_resolution"


class _RaisingResponses:
    def __init__(self, error):
        self.error = error
        self.calls = 0

    def parse(self, **_kwargs):
        self.calls += 1
        raise self.error


class _RaisingClient:
    def __init__(self, error):
        self.responses = _RaisingResponses(error)


def _run_with_error(path, monkeypatch, error):
    import fiyu.research_worker as worker

    client = _RaisingClient(error)
    monkeypatch.setenv("OPENAI_API_KEY", "not-real")
    monkeypatch.setattr(worker, "load_dotenv", lambda: None)
    monkeypatch.setattr(worker, "OpenAI", lambda **_kwargs: client)
    result = run_research_batch(path, limit=1, model="test-model")
    return result, client


def test_explicit_api_failure_records_failed_attempt(tmp_path, monkeypatch):
    path = _db(tmp_path)
    result, client = _run_with_error(path, monkeypatch, ValueError("request rejected"))
    assert result["failed"] == 1
    assert client.responses.calls == 1
    with connect(path) as connection:
        candidate = connection.execute(
            "SELECT research_status FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()
        run = connection.execute(
            "SELECT status, error FROM restaurant_research_runs WHERE public_restaurant_id = 'place-1'"
        ).fetchone()
    assert candidate[0] == "failed"
    assert run[0] == "failed"
    assert "request rejected" in run[1]


def test_timeout_is_ambiguous_and_never_automatically_retried(tmp_path, monkeypatch):
    path = _db(tmp_path)
    result, client = _run_with_error(path, monkeypatch, TimeoutError("connection timed out"))
    assert result["failed"] == 1
    assert client.responses.calls == 1
    with connect(path) as connection:
        assert connection.execute(
            "SELECT research_status FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == "needs_retry"
        assert connection.execute(
            "SELECT status FROM restaurant_research_runs WHERE public_restaurant_id = 'place-1'"
        ).fetchone()[0] == "needs_retry"
    second = run_research_batch(path, limit=1, model="test-model")
    assert second["queued"] == 0
    assert client.responses.calls == 1


def test_operator_recovers_orphaned_running_state_without_openai_call(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET research_status = 'running' WHERE place_id = 'place-1'"
        )
        connection.execute(
            """
            INSERT INTO address_research_runs (
                public_restaurant_id, provider, model, status, started_at,
                prompt_version, schema_version
            ) VALUES ('place-1', 'openai', 'test-model', 'running', 'now', 'p', 's')
            """
        )
        connection.commit()
    preview = recover_research_for_retry(path, "place-1", dry_run=True)
    assert preview["new_status"] == "pending"
    assert preview["openai_requests_made"] == 0
    with connect(path) as connection:
        assert connection.execute(
            "SELECT research_status FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == "running"
    applied = recover_research_for_retry(path, "place-1")
    assert applied["address_runs_marked_needs_retry"]
    with connect(path) as connection:
        assert connection.execute(
            "SELECT research_status FROM public_restaurants WHERE place_id = 'place-1'"
        ).fetchone()[0] == "pending"
        assert connection.execute(
            "SELECT status FROM address_research_runs WHERE public_restaurant_id = 'place-1'"
        ).fetchone()[0] == "needs_retry"


def test_completed_research_is_never_reset(tmp_path):
    path = _db(tmp_path)
    _save(path)
    with pytest.raises(ValueError, match="Completed research cannot be reset"):
        recover_research_for_retry(path, "place-1")


def test_confident_poi_does_not_invoke_address_fallback(tmp_path, monkeypatch):
    from fiyu import address_geocoding, osm_resolver

    path = _db(tmp_path)
    monkeypatch.setattr(
        osm_resolver,
        "resolve_osm_locations",
        lambda *_args, **_kwargs: {"reports": [{"status": "osm_auto_verified"}]},
    )
    called = []
    monkeypatch.setattr(
        address_geocoding,
        "geocode_verified_addresses",
        lambda *_args, **_kwargs: called.append(True),
    )
    result = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )
    assert result["method"] == "poi"
    assert result["address_fallback_attempted"] is False
    assert called == []


def test_unresolved_poi_invokes_existing_address_fallback(tmp_path, monkeypatch):
    from fiyu import address_geocoder, address_geocoding, osm_resolver

    path = _db(tmp_path)
    monkeypatch.setattr(
        osm_resolver,
        "resolve_osm_locations",
        lambda *_args, **_kwargs: {
            "reports": [{"status": "unresolved", "resolution_reason": "only_weak_candidates"}]
        },
    )
    geocoder_options = []
    monkeypatch.setattr(
        address_geocoder,
        "LocalOSMAddressGeocoder",
        lambda _path, **kwargs: geocoder_options.append(kwargs) or object(),
    )
    calls = []

    def fallback(*_args, **kwargs):
        calls.append(kwargs)
        return {"location_verified": 0, "location_provisional": 1, "reports": []}

    monkeypatch.setattr(address_geocoding, "geocode_verified_addresses", fallback)
    result = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )
    assert result["method"] == "address_fallback"
    assert len(calls) == 1
    assert calls[0]["limit"] == 1
    assert calls[0]["place_id"] == "place-1"
    assert calls[0]["dry_run"] is False
    assert calls[0]["published_only"] is False
    assert geocoder_options == [
        {"allow_area_fallback": True, "minimum_area_precision": "ward"}
    ]


def test_unresolved_poi_and_address_use_final_reviewed_area_fallback(tmp_path, monkeypatch):
    from fiyu import address_geocoder, address_geocoding, osm_resolver

    path = _db(tmp_path)
    monkeypatch.setattr(
        osm_resolver,
        "resolve_osm_locations",
        lambda *_args, **_kwargs: {"reports": [{"status": "unresolved"}]},
    )
    monkeypatch.setattr(
        address_geocoder, "LocalOSMAddressGeocoder", lambda _path, **_kwargs: object()
    )
    monkeypatch.setattr(
        address_geocoding,
        "geocode_verified_addresses",
        lambda *_args, **_kwargs: {
            "location_verified": 0,
            "location_provisional": 0,
            "failed": 1,
        },
    )
    result = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )
    assert result["method"] == "area_anchor"
    assert result["trusted_area_anchor"]["area_name"] == "Shibuya"


def test_existing_verified_address_skips_paid_address_research(tmp_path, monkeypatch):
    from fiyu import address_geocoder, address_geocoding, address_research, osm_resolver

    path = _db(tmp_path)
    monkeypatch.setattr(
        osm_resolver,
        "resolve_osm_locations",
        lambda *_args, **_kwargs: {"reports": [{"status": "unresolved"}]},
    )
    monkeypatch.setattr(
        address_geocoder, "LocalOSMAddressGeocoder", lambda _path, **_kwargs: object()
    )
    monkeypatch.setattr(
        address_geocoding,
        "geocode_verified_addresses",
        lambda *_args, **_kwargs: {
            "selected": 1,
            "location_verified": 1,
            "location_provisional": 0,
        },
    )
    calls = []
    monkeypatch.setattr(
        address_research,
        "run_address_discovery",
        lambda *_args, **kwargs: calls.append(kwargs),
    )

    result = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )

    assert result["method"] == "address_fallback"
    assert result["existing_address_evidence_avoided_responses_fallback"] is True
    assert result["cost"]["address_fallback_responses_requests"] == 0
    assert calls == []


@pytest.mark.parametrize(
    "resolution_reason",
    [
        "exact_name_candidate_missing_geographic_corroboration",
        "strong_name_candidate_missing_geographic_corroboration",
        "no_strong_candidate",
        "ambiguous_same_name_candidates",
    ],
)
def test_safe_osm_failures_invoke_dedicated_fallback_once(
    tmp_path, monkeypatch, resolution_reason
):
    from fiyu import address_geocoder, address_geocoding, address_research, osm_resolver

    path = _db(tmp_path)
    monkeypatch.setattr(
        osm_resolver,
        "resolve_osm_locations",
        lambda *_args, **_kwargs: {
            "reports": [
                {"status": "unresolved", "resolution_reason": resolution_reason}
            ]
        },
    )
    monkeypatch.setattr(
        address_geocoder, "LocalOSMAddressGeocoder", lambda _path, **_kwargs: object()
    )
    geocode_calls = []

    def geocode(*_args, **_kwargs):
        geocode_calls.append(True)
        return (
            {"selected": 0, "location_verified": 0, "location_provisional": 0}
            if len(geocode_calls) == 1
            else {"selected": 1, "location_verified": 1, "location_provisional": 0}
        )

    monkeypatch.setattr(address_geocoding, "geocode_verified_addresses", geocode)
    research_calls = []

    def research(*_args, **kwargs):
        research_calls.append(kwargs)
        return {
            "persisted": 1,
            "usage_totals": {
                "response_request_count": 1,
                "web_search_action_count": 2,
            },
        }

    monkeypatch.setattr(address_research, "run_address_discovery", research)

    result = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )

    assert len(research_calls) == 1
    assert research_calls[0]["place_id"] == "place-1"
    assert research_calls[0]["published_only"] is False
    assert len(geocode_calls) == 2
    assert result["cost"] == {
        "address_fallback_responses_requests": 1,
        "address_fallback_web_search_actions": 2,
        "existing_evidence_avoided_fallback_request": False,
    }


def test_address_timeout_requires_explicit_recovery_and_never_auto_retries(
    tmp_path, monkeypatch
):
    from fiyu.address_research import (
        fail_address_run,
        recover_address_research_for_retry,
        start_address_run,
    )

    path = _db(tmp_path)
    run_id = start_address_run(
        path,
        place_id="place-1",
        model="test-model",
        forced=False,
        combined_research=False,
    )
    fail_address_run(path, run_id, TimeoutError("outcome unknown"))
    with connect(path) as connection:
        run = connection.execute(
            "SELECT status FROM address_research_runs WHERE id=?", (run_id,)
        ).fetchone()
        candidate = connection.execute(
            "SELECT address_resolution_status FROM public_restaurants WHERE place_id='place-1'"
        ).fetchone()
    assert run[0] == "needs_retry"
    assert candidate[0] == "address_research_needs_retry"

    preview = recover_address_research_for_retry(path, "place-1", dry_run=True)
    assert preview["openai_requests_made"] == 0
    recover_address_research_for_retry(path, "place-1")
    with connect(path) as connection:
        assert connection.execute(
            "SELECT status FROM address_research_runs WHERE id=?", (run_id,)
        ).fetchone()[0] == "retry_authorized"


def test_completed_accepted_address_research_cannot_be_reset(tmp_path):
    from fiyu.address_research import recover_address_research_for_retry

    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO verified_restaurant_addresses (
                public_restaurant_id, address_raw, verification_method,
                evidence_references_json, verified_by, verified_at, status,
                created_at, updated_at
            ) VALUES ('place-1', 'Tokyo', 'test', '[]', 'test', 'now',
                      'address_verified', 'now', 'now')
            """
        )
        connection.commit()
    with pytest.raises(ValueError, match="cannot be reset"):
        recover_address_research_for_retry(path, "place-1")


def _make_auto_publishable(path, *, map_eligible=True, score_publishable=True):
    _save(path)
    with connect(path) as connection:
        run = connection.execute(
            """
            SELECT id, score_json FROM restaurant_research_runs
            WHERE public_restaurant_id='place-1' AND is_current=1
            """
        ).fetchone()
        score = json.loads(run["score_json"])
        score["publishable"] = score_publishable
        connection.execute(
            "UPDATE restaurant_research_runs SET score_json=? WHERE id=?",
            (json.dumps(score), run["id"]),
        )
        connection.execute(
            """
            UPDATE public_restaurants
            SET location_attempted_at='now', map_display_eligible=?,
                location_verification_status=?, latitude=?, longitude=?
            WHERE place_id='place-1'
            """,
            (
                int(map_eligible),
                "location_provisional" if map_eligible else "unresolved",
                35.68 if map_eligible else None,
                139.77 if map_eligible else None,
            ),
        )
        connection.commit()


def test_automatic_publication_uses_score_policy_and_defensible_location(tmp_path):
    path = _db(tmp_path)
    _make_auto_publishable(path)
    readiness = auto_publish_readiness(path, "place-1")
    assert readiness.publishable
    result = apply_automatic_publication(path, "place-1")
    assert result["outcome"] == "auto_published"
    with connect(path) as connection:
        row = connection.execute(
            "SELECT is_published, review_status FROM public_restaurants WHERE place_id='place-1'"
        ).fetchone()
    assert tuple(row) == (1, "auto_published")


def test_automatic_publication_ignores_location_and_web_identity_diagnostic(tmp_path):
    no_location = _db(tmp_path / "location")
    _make_auto_publishable(no_location, map_eligible=False)
    assert apply_automatic_publication(no_location, "place-1")["published"] is True

    score_rejected = _db(tmp_path / "score")
    _make_auto_publishable(score_rejected, score_publishable=False)
    with connect(score_rejected) as connection:
        row = connection.execute(
            "SELECT evidence_json FROM public_restaurants WHERE place_id='place-1'"
        ).fetchone()
        evidence = json.loads(row[0])
        evidence["identity_confidence"] = 0.50
        connection.execute(
            "UPDATE public_restaurants SET evidence_json=? WHERE place_id='place-1'",
            (json.dumps(evidence),),
        )
        connection.commit()
    assert apply_automatic_publication(score_rejected, "place-1")["published"] is True


def _add_effective_address_resolution(path, *, add_audit=True):
    agreement = json.dumps({
        "material_conflicting_components": [],
        "component_values": {
            "municipality_or_ward": ["中野区"],
            "neighborhood": ["東中野"],
            "street_or_block": ["4-19-8"],
        },
    })
    with connect(path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO address_evidence (
                public_restaurant_id, identity_status, identity_confidence,
                address_raw, municipality_or_ward, neighborhood, street_or_block,
                component_agreement_json, core_address_verified,
                full_address_verified, map_location_approximate,
                source_evidence_json, conflicting_addresses_json,
                search_queries_json, warnings_json, recommended_action,
                research_summary, acceptance_status, acceptance_reasons_json,
                evidence_fingerprint, created_at, updated_at
            ) VALUES (
                'place-1', 'confirmed', 0.95, '東京都中野区東中野4-19-8',
                '中野区', '東中野', '4-19-8', ?, 1, 1, 0,
                '[]', '[]', '[]',
                '["A separate older listing is not merged as branch evidence."]',
                'Use the confirmed current identity.',
                'Current sources consistently identify the same restaurant.',
                'provisional', '[]', 'resolved-address',
                '2099-01-01T00:00:00+00:00', '2099-01-01T00:00:00+00:00'
            )
            """,
            (agreement,),
        )
        if add_audit:
            connection.execute(
                """
                INSERT INTO address_decision_audits (
                    public_restaurant_id, address_evidence_id, decision_version,
                    acceptance_status, resolution_status, acceptance_reasons_json,
                    component_agreement_json, temporal_evidence_json,
                    original_evidence_fingerprint, created_at
                ) VALUES (
                    'place-1', ?, 'test-v1', 'provisional',
                    'address_provisionally_accepted', '[]', ?, '[]',
                    'resolved-address', '2099-01-01T00:01:00+00:00'
                )
                """,
                (cursor.lastrowid, agreement),
            )
        connection.commit()


def _set_historical_address_conflict(path, text):
    with connect(path) as connection:
        row = connection.execute(
            """
            SELECT p.evidence_json, r.id, r.structured_research_json, r.score_json
            FROM public_restaurants p
            JOIN restaurant_research_runs r ON r.public_restaurant_id=p.place_id
            WHERE p.place_id='place-1' AND r.is_current=1
            """
        ).fetchone()
        evidence = json.loads(row["evidence_json"])
        evidence["conflicting_evidence"] = True
        structured = json.loads(row["structured_research_json"])
        structured["address_evidence"] = {
            "identity_status": "confirmed",
            "identity_confidence": 0.95,
            "branch_name": None,
            "conflicting_address_candidates": [],
            "recommended_action": text,
            "warnings": [],
            "research_summary": text,
        }
        score = json.loads(row["score_json"])
        score["publishable"] = False
        score["blocking_conflict"] = True
        score["conflict_classification"] = "material"
        connection.execute(
            "UPDATE public_restaurants SET evidence_json=? WHERE place_id='place-1'",
            (json.dumps(evidence),),
        )
        connection.execute(
            "UPDATE restaurant_research_runs SET structured_research_json=?, score_json=? "
            "WHERE id=?",
            (json.dumps(structured), json.dumps(score), row["id"]),
        )
        connection.commit()


def test_newer_effective_address_audit_clears_same_domain_historical_conflict(tmp_path):
    path = _db(tmp_path)
    _make_auto_publishable(path, score_publishable=False)
    _set_historical_address_conflict(
        path, "A same-name listing creates an unresolved identity conflict."
    )
    _add_effective_address_resolution(path)
    decision = _current_score_policy_decision(path, dict(_row(path, "place-1")))
    assert decision["historical_score_publishable"] is False
    assert decision["conflict_superseded"] is True
    assert decision["publishable"] is True


def test_current_structural_address_evidence_can_resolve_without_audit_row(tmp_path):
    path = _db(tmp_path)
    _make_auto_publishable(path, score_publishable=False)
    _set_historical_address_conflict(
        path, "A same-name listing creates an unresolved address identity conflict."
    )
    _add_effective_address_resolution(path, add_audit=False)
    decision = _current_score_policy_decision(path, dict(_row(path, "place-1")))
    assert decision["conflict_superseded"] is True
    assert decision["publishable"] is True


def test_current_policy_demotes_identity_confidence_to_diagnostic(tmp_path):
    path = _db(tmp_path)
    _make_auto_publishable(path)
    with connect(path) as connection:
        row = connection.execute(
            "SELECT evidence_json FROM public_restaurants WHERE place_id='place-1'"
        ).fetchone()
        evidence = json.loads(row[0])
        evidence["identity_confidence"] = 0.79
        connection.execute(
            "UPDATE public_restaurants SET evidence_json=? WHERE place_id='place-1'",
            (json.dumps(evidence),),
        )
        connection.commit()
    decision = _current_score_policy_decision(path, dict(_row(path, "place-1")))
    assert decision["diagnostics"]["identity_confidence"] == 0.79
    assert decision["publishable"] is True


def test_current_policy_demotes_research_confidence_to_diagnostic(tmp_path):
    path = _db(tmp_path)
    _make_auto_publishable(path)
    with connect(path) as connection:
        row = connection.execute(
            "SELECT id, score_json FROM restaurant_research_runs "
            "WHERE public_restaurant_id='place-1' AND is_current=1"
        ).fetchone()
        score = json.loads(row["score_json"])
        score["fiyu_confidence"] = 54.99
        connection.execute(
            "UPDATE restaurant_research_runs SET score_json=? WHERE id=?",
            (json.dumps(score), row["id"]),
        )
        connection.commit()
    decision = _current_score_policy_decision(path, dict(_row(path, "place-1")))
    assert "minimum_confidence" not in decision["conditions"]
    assert decision["publishable"] is True


@pytest.mark.parametrize(
    ("conflict_text", "expected_reason", "expected_publishable"),
    [
        (
            "The identity conflict includes a confirmed permanent closure.",
            "protected_non_address_conflict_domain",
            True,
        ),
        (
            "The address conflict includes an unresolved evidence integrity problem.",
            "protected_non_address_conflict_domain",
            False,
        ),
    ],
)
def test_address_audit_cannot_clear_protected_conflict_domain(
    tmp_path, conflict_text, expected_reason, expected_publishable
):
    path = _db(tmp_path)
    _make_auto_publishable(path, score_publishable=False)
    _set_historical_address_conflict(path, conflict_text)
    _add_effective_address_resolution(path)
    decision = _current_score_policy_decision(path, dict(_row(path, "place-1")))
    assert decision["conflict_superseded"] is False
    assert expected_reason in decision["supersession_reasons"]
    assert decision["publishable"] is expected_publishable


def test_batch_isolates_failures_and_reports_publication(monkeypatch, tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO restaurants (
                place_id, title, address, neighborhood, rating, review_count,
                candidate_eligible, internal_fiyu_score, confidence_score,
                quality_score, underexposure_score, digital_footprint_score,
                source_areas_json, score_reasons_json, source_files_json
            ) VALUES ('place-2', 'Second', 'Tokyo', 'Shibuya', 4.4, 30,
                      1, 80, 80, 80, 75, 70, '[]', '[]', '[]')
            """
        )
        connection.execute(
            """
            INSERT INTO public_restaurants (
                place_id, source_restaurant_id, research_status, is_published,
                created_at, updated_at
            ) VALUES ('place-2', 2, 'pending', 0, 'now', 'now')
            """
        )
        connection.commit()

    import fiyu.catalog_pipeline as pipeline

    def one(_db_path, place_id, **_kwargs):
        if place_id == "place-1":
            raise RuntimeError("isolated")
        return {"place_id": place_id, "published": True, "publication": {}}

    monkeypatch.setattr(pipeline, "run_candidate_pipeline", one)
    result = run_pipeline_batch(path, osm_index="poi.sqlite", limit=2)
    assert result["completed"] == 1
    assert result["failed"] == 1
    assert result["published"] == 1


def test_batch_stage_counts_represent_50_selected_49_processed_one_research_failure():
    from fiyu.catalog_pipeline import _batch_stage_counts

    results = [
        {
            "candidate": {"place_id": f"place-{index}"},
            "published": index % 2 == 0,
            "research": {"failed": 0},
            "location": {"method": "area_anchor" if index == 0 else "poi"},
            "low_footprint_research": {
                "results": [{"status": "failed"}] if index == 1 else []
            },
        }
        for index in range(49)
    ]
    results.append({"place_id": "failed", "research": {"failed": 1}, "location": None})
    counts = _batch_stage_counts(results, [])
    assert counts == {
        "completed": 49,
        "research_failures": 1,
        "low_footprint_failures": 1,
        "location_unresolved_nonfatal": 0,
        "fatal_pipeline_failures": 0,
        "failed": 1,
    }


def test_batch_summary_reports_scores_location_enrichment_and_usage(monkeypatch, tmp_path):
    path = _db(tmp_path)
    import fiyu.catalog_pipeline as pipeline

    monkeypatch.setattr(
        pipeline,
        "run_candidate_pipeline",
        lambda *_args, **_kwargs: {
            "place_id": "place-1",
            "published": True,
            "publication": {"outcome": "published"},
            "research": {
                "responses_requests": 1,
                "web_search_actions": 3,
                "token_usage": {
                    "input_tokens": 100,
                    "output_tokens": 20,
                    "total_tokens": 120,
                },
            },
            "low_footprint_research": {
                "responses_requests": 0,
                "web_search_actions": 0,
            },
            "cost": {
                "address_fallback_responses_requests": 0,
                "address_fallback_web_search_actions": 0,
            },
            "candidate": {
                "fiyu_score": 82.5,
                "score_band": "strong",
                "local_discovery_score": 71.0,
                "local_discovery_classification": "local_discovery",
                "low_footprint_route_eligible": False,
                "low_footprint_research_attempted": False,
                "location_precision": "exact",
                "card_enrichment_json": "{}",
            },
        },
    )
    result = run_pipeline_batch(path, osm_index="poi.sqlite", limit=1)
    summary = result["batch_summary"]
    assert summary["fiyu_score"]["average"] == 82.5
    assert summary["local_discovery_classifications"] == {"local_discovery": 1}
    assert summary["location_precision"] == {"exact": 1}
    assert summary["card_enrichment_completeness"] == {"sparse": 1}
    assert summary["external_usage"] == {
        "responses_requests": 1,
        "web_search_actions": 3,
        "token_usage": {"input_tokens": 100, "output_tokens": 20, "total_tokens": 120},
    }


def test_batch_resume_skips_already_terminal_candidates(monkeypatch, tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants SET review_status='auto_rejected'
            WHERE place_id='place-1'
            """
        )
        connection.commit()
    import fiyu.catalog_pipeline as pipeline

    calls = []
    monkeypatch.setattr(
        pipeline,
        "run_candidate_pipeline",
        lambda *_args, **_kwargs: calls.append(True),
    )
    result = run_pipeline_batch(path, osm_index="poi.sqlite", limit=10)
    assert result["selected"] == 0
    assert calls == []


def test_reviewed_area_anchor_is_broadest_fallback_and_remains_approximate(
    tmp_path, monkeypatch
):
    from fiyu import (
        address_geocoder,
        address_geocoding,
        address_research,
        catalog_pipeline,
        osm_resolver,
    )

    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET discovery_area='Shibuya' WHERE place_id='place-1'"
        )
        connection.commit()
    monkeypatch.setattr(
        osm_resolver,
        "resolve_osm_locations",
        lambda *_args, **_kwargs: {"reports": [{"status": "unresolved"}]},
    )
    monkeypatch.setattr(
        address_geocoder, "LocalOSMAddressGeocoder", lambda _path, **_kwargs: object()
    )
    monkeypatch.setattr(
        address_geocoding,
        "geocode_verified_addresses",
        lambda *_args, **_kwargs: {
            "selected": 0,
            "location_verified": 0,
            "location_provisional": 0,
        },
    )
    monkeypatch.setattr(
        address_research,
        "run_address_discovery",
        lambda *_args, **_kwargs: {"persisted": 0, "usage_totals": {}},
    )
    monkeypatch.setattr(
        catalog_pipeline,
        "apply_best_available_polygon_fallback",
        lambda *_args, **_kwargs: {
            "status": "location_provisional", "precision": "area",
            "map_location_approximate": True, "area_name": "Shibuya",
        },
    )

    result = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )
    assert result["method"] == "area_anchor"
    assert result["trusted_area_anchor"]["area_name"] == "Shibuya"


def test_discovery_area_anchor_does_not_override_candidate_locality(
    tmp_path, monkeypatch
):
    from fiyu import (
        address_geocoder,
        address_geocoding,
        address_research,
        catalog_pipeline,
        osm_resolver,
    )

    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET discovery_area='Shinjuku' WHERE place_id='place-1'"
        )
        connection.execute(
            """
            UPDATE restaurants SET neighborhood='Daizawa', city='Setagaya City',
                address='2-36-21 Daizawa, Setagaya City, Tokyo'
            WHERE place_id='place-1'
            """
        )
        connection.commit()
    monkeypatch.setattr(
        osm_resolver,
        "resolve_osm_locations",
        lambda *_args, **_kwargs: {"reports": [{"status": "unresolved"}]},
    )
    monkeypatch.setattr(
        address_geocoder, "LocalOSMAddressGeocoder", lambda _path, **_kwargs: object()
    )
    monkeypatch.setattr(
        address_geocoding,
        "geocode_verified_addresses",
        lambda *_args, **_kwargs: {
            "selected": 0,
            "location_verified": 0,
            "location_provisional": 0,
        },
    )
    monkeypatch.setattr(
        address_research,
        "run_address_discovery",
        lambda *_args, **_kwargs: {"persisted": 0, "usage_totals": {}},
    )
    monkeypatch.setattr(
        catalog_pipeline,
        "apply_best_available_polygon_fallback",
        lambda *_args, **_kwargs: None,
    )
    result = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )
    assert result["method"] == "unresolved"
    assert result["trusted_area_anchor"] is None


def _location(precision, *, source="local_osm_addresses", valid=True):
    return {
        "latitude": 35.65 if valid else None,
        "longitude": 139.71 if valid else None,
        "map_display_eligible": int(valid),
        "location_status": "location_provisional" if valid else "invalidated",
        "map_location_precision": precision,
        "map_anchor_type": precision,
        "location_source": source,
    }


@pytest.mark.parametrize(
    ("existing", "candidate"),
    [
        ("exact", "address"),
        ("address", "block"),
        ("address", "chome"),
        ("address", "area"),
        ("block", "chome"),
        ("block", "neighborhood"),
        ("block", "area"),
        ("chome", "neighborhood"),
        ("chome", "area"),
        ("neighborhood", "area"),
    ],
)
def test_valid_location_cannot_be_downgraded(existing, candidate):
    assert not location_update_allowed(_location(existing), _location(candidate))


@pytest.mark.parametrize(
    "candidate", ["neighborhood", "chome", "address", "exact"]
)
def test_area_location_can_be_upgraded(candidate):
    assert location_update_allowed(_location("area"), _location(candidate))


@pytest.mark.parametrize(
    "candidate", ["area", "neighborhood", "chome", "block", "address", "exact"]
)
def test_unresolved_location_can_be_upgraded(candidate):
    assert location_update_allowed(_location("unresolved", valid=False), _location(candidate))


def test_same_precision_requires_stronger_provenance():
    area_anchor = _location("area", source="reviewed_osm_area_anchor")
    local_osm = _location("area", source="local_osm_addresses")
    assert location_update_allowed(area_anchor, local_osm)
    assert not location_update_allowed(local_osm, area_anchor)
    assert not location_update_allowed(local_osm, local_osm)


def test_invalidated_location_can_be_replaced():
    existing = _location("exact")
    existing["location_status"] = "invalidated"
    assert location_update_allowed(existing, _location("area"))


def test_map_eligible_rerun_preserves_chome_and_history(tmp_path, monkeypatch):
    from fiyu import address_geocoder, address_geocoding, address_research, osm_resolver

    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET discovery_area='Shibuya', latitude=35.645, longitude=139.710,
                location_source='local_osm_addresses', location_precision='approximate',
                map_location_precision='chome', map_anchor_type='chome',
                location_status='location_provisional', map_display_eligible=1
            WHERE place_id='place-1'
            """
        )
        connection.execute(
            """
            INSERT INTO location_history (
                public_restaurant_id, latitude, longitude, location_source,
                location_verification_status, location_precision,
                map_location_approximate, map_anchor_type, map_display_eligible,
                location_status, change_reason, created_at
            ) VALUES ('place-1', 35.645, 139.710, 'local_osm_addresses',
                      'location_provisional', 'chome', 1, 'chome', 1,
                      'location_provisional', 'test chome', 'now')
            """
        )
        connection.commit()
    monkeypatch.setattr(
        osm_resolver,
        "resolve_osm_locations",
        lambda *_args, **_kwargs: {"reports": [{"status": "unresolved"}]},
    )
    monkeypatch.setattr(
        address_geocoder, "LocalOSMAddressGeocoder", lambda _path, **_kwargs: object()
    )
    monkeypatch.setattr(
        address_geocoding,
        "geocode_verified_addresses",
        lambda *_args, **_kwargs: {
            "selected": 0,
            "location_verified": 0,
            "location_provisional": 0,
        },
    )
    research_calls = []
    monkeypatch.setattr(
        address_research,
        "run_address_discovery",
        lambda *_args, **_kwargs: research_calls.append(True),
    )

    first = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )
    second = verify_location(
        path, "place-1", osm_index="poi.sqlite", osm_address_index="address.sqlite"
    )

    assert first["method"] == second["method"] == "existing_location"
    assert first["trusted_area_anchor"] is second["trusted_area_anchor"] is None
    assert research_calls == []
    with connect(path) as connection:
        current = connection.execute(
            """
            SELECT latitude, longitude, map_location_precision, location_source
            FROM public_restaurants WHERE place_id='place-1'
            """
        ).fetchone()
        history_count = connection.execute(
            "SELECT COUNT(*) FROM location_history WHERE public_restaurant_id='place-1'"
        ).fetchone()[0]
    assert tuple(current) == (35.645, 139.710, "chome", "local_osm_addresses")
    assert history_count == 1


def test_restore_best_location_uses_history_without_external_calls(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET latitude=35.658, longitude=139.7016,
                location_source='reviewed_osm_area_anchor',
                location_precision='approximate', map_location_precision='area',
                map_anchor_type='area', location_status='location_provisional',
                map_display_eligible=1 WHERE place_id='place-1'
            """
        )
        for precision, latitude, longitude, source, osm_id in (
            ("chome", 35.645, 139.710, "local_osm_addresses", 17008298),
            ("area", 35.658, 139.7016, "reviewed_osm_area_anchor", None),
        ):
            connection.execute(
                """
                INSERT INTO location_history (
                    public_restaurant_id, latitude, longitude, location_source,
                    location_verification_status, location_verification_tier,
                    location_precision, map_location_approximate, map_anchor_type,
                    map_display_eligible, location_status, osm_type, osm_id,
                    change_reason, created_at
                ) VALUES ('place-1', ?, ?, ?, 'location_provisional',
                          'provisional_medium', ?, 1, ?, 1,
                          'location_provisional', 'relation', ?, 'test', 'now')
                """,
                (latitude, longitude, source, precision, precision, osm_id),
            )
        connection.commit()

    result = restore_best_location_from_history(path, "place-1")

    assert result["restored"] is True
    assert result["responses_api_calls"] == result["web_search_calls"] == 0
    with connect(path) as connection:
        current = connection.execute(
            """
            SELECT latitude, longitude, map_location_precision, location_source,
                   location_osm_id
            FROM public_restaurants WHERE place_id='place-1'
            """
        ).fetchone()
        history_count = connection.execute(
            "SELECT COUNT(*) FROM location_history WHERE public_restaurant_id='place-1'"
        ).fetchone()[0]
    assert tuple(current) == (
        35.645,
        139.710,
        "chome",
        "local_osm_addresses",
        17008298,
    )
    assert history_count == 2
