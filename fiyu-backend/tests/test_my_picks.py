from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Lock
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import (
    api,
    my_pick_identity_bootstrap,
    my_pick_processor,
    my_picks,
    pipeline_cli,
    quality_v4_backfill,
    research_worker,
)
from fiyu.address_geocoder import AddressGeocodeResult, AddressGeocoderLookupError
from fiyu.database import SCHEMA, connect
from fiyu.my_pick_identity_bootstrap import (
    MyPickIdentityBootstrap,
    MyPickIdentityBootstrapCall,
)
from fiyu.pipeline_runs import (
    claim_next_pipeline_item,
    create_pipeline_run,
    finish_pipeline_item,
    get_pipeline_run_status,
    mark_pipeline_item_running,
)
from fiyu.public_catalog import ensure_public_schema
from fiyu.quality_v4 import QUALITY_PRODUCTION_SCORE_VERSION


@pytest.fixture
def catalog(tmp_path):
    path = tmp_path / "my-picks.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(path)
    my_picks.ensure_my_pick_schema(path)
    return path


def add_canonical(
    path,
    place_id: str,
    *,
    score: float = 65,
    published: bool = False,
    latitude: float | None = 35.68,
    longitude: float | None = 139.75,
    map_ready: bool = True,
    product_eligible: bool = True,
    research_status: str = "complete",
    score_version: str = QUALITY_PRODUCTION_SCORE_VERSION,
    precision: str = "exact",
):
    with connect(path) as connection:
        connection.execute(
            """
            INSERT INTO public_restaurants(
                place_id, name_en, primary_category, latitude, longitude,
                map_display_eligible, map_location_precision, product_eligible,
                fiyu_score, score_version, research_status, is_published,
                created_at, updated_at
            ) VALUES (?, ?, 'izakaya', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'now', 'now')
            """,
            (
                place_id,
                f"Restaurant {place_id}",
                latitude,
                longitude,
                int(map_ready),
                precision,
                int(product_eligible),
                score,
                score_version,
                research_status,
                int(published),
            ),
        )
        connection.commit()


def confirmed_bootstrap(name: str = "Independent canonical name"):
    return MyPickIdentityBootstrapCall(
        result=MyPickIdentityBootstrap(
            identity_status="confirmed",
            identity_confidence=0.95,
            canonical_name_en=name,
            city="Tokyo",
            neighborhood="Chiyoda",
            primary_category="Japanese",
            supporting_urls=[
                "https://restaurant.example/",
                "https://editorial.example/restaurant",
            ],
            independent_source_count=2,
        ),
        provider_requests=1,
        web_search_actions=1,
    )


def test_identity_bootstrap_prompt_separates_untrusted_name_and_address():
    captured = {}

    class Responses:
        def parse(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                output_parsed=confirmed_bootstrap().result,
                output=[],
                status="completed",
            )

    my_pick_identity_bootstrap.run_my_pick_identity_bootstrap(
        user_name_hint="Ramen Sawada",
        user_address_hint="1-5-12 Kichijoji Minamicho",
        model="test-model",
        client=SimpleNamespace(responses=Responses()),
    )

    prompt = captured["input"][1]["content"]
    assert "User-supplied restaurant name: 'Ramen Sawada'" in prompt
    assert "User-supplied address: '1-5-12 Kichijoji Minamicho'" in prompt
    assert "discovery hints, not canonical facts" in prompt
    assert "opaque-google-place-id" not in prompt


def test_existing_published_current_score_is_ready_without_worker(catalog):
    add_canonical(catalog, "published", score=82, published=True)
    work, created = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="published"
    )

    assert created is True
    assert work["status"] == "ready"
    assert work["attempt_count"] == 0
    assert work["provider_request_count"] == 0
    result = my_picks.canonical_result(catalog, work)
    assert result["fiyu_score"] == 82
    assert result["score_version"] == QUALITY_PRODUCTION_SCORE_VERSION
    assert result["is_public"] is True
    assert result["recommendation_review_status"] == "not_eligible"


def test_unknown_identity_is_durable_without_seed_floor_or_provider_call(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google_places",
        external_place_id="brand-new",
        display_name_hint="Brand New",
    )

    assert work["status"] == "pending"
    assert work["provider_request_count"] == 0
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM public_restaurants WHERE place_id='brand-new'"
        ).fetchone()[0] == 0


def test_low_score_is_private_ready_result_and_not_reviewed(catalog):
    add_canonical(catalog, "low", score=48)
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="low"
    )

    assert work["status"] == "ready"
    assert my_picks.canonical_result(catalog, work)["fiyu_score"] == 48
    assert my_picks.recommendation_review_count(catalog, "low") == 0


def test_strong_unpublished_result_queues_once_and_never_publishes(catalog):
    add_canonical(catalog, "strong", score=76)
    first, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="strong"
    )
    second, created = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="strong"
    )

    assert created is False
    assert first["id"] == second["id"]
    assert my_picks.recommendation_review_count(catalog, "strong") == 1
    assert my_picks.canonical_result(catalog, second)["recommendation_review_status"] == "pending"
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT submission_count FROM my_pick_recommendation_reviews "
            "WHERE canonical_place_id='strong'"
        ).fetchone()[0] == 2
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id='strong'"
        ).fetchone()[0] == 0


def test_concurrent_duplicate_creates_one_shared_job(catalog):
    def submit(_index):
        return my_picks.create_or_get_canonical_work(
            catalog, provider="google_places", external_place_id="concurrent"
        )[0]["id"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        work_ids = list(pool.map(submit, range(8)))

    assert len(set(work_ids)) == 1
    with connect(catalog) as connection:
        row = connection.execute(
            "SELECT COUNT(*) AS count, MAX(provider_request_count) AS requests "
            "FROM my_pick_canonical_work"
        ).fetchone()
    assert row["count"] == 1
    assert row["requests"] == 0


def test_location_and_coverage_states_use_canonical_map_evidence(catalog):
    add_canonical(catalog, "outside", score=75, latitude=34.6, longitude=135.5)
    add_canonical(
        catalog, "unresolved", score=75, latitude=None, longitude=None, map_ready=False
    )
    add_canonical(catalog, "area", score=75, precision="area")

    outside, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="outside"
    )
    unresolved, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="unresolved"
    )
    area, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="area"
    )

    assert outside["status"] == "outside_coverage"
    assert my_picks.canonical_result(catalog, outside)["map_ready"] is False
    assert unresolved["status"] == "needs_location"
    unresolved_result = my_picks.canonical_result(catalog, unresolved)
    assert unresolved_result["latitude"] is None
    assert unresolved_result["longitude"] is None
    assert unresolved_result["result_ready"] is True
    assert area["status"] == "ready"
    assert my_picks.canonical_result(catalog, area)["map_ready"] is True


def test_user_submitted_address_uses_strong_local_osm_match(monkeypatch, tmp_path):
    observed = {}

    class Geocoder:
        def __init__(self, index_path):
            observed["index_path"] = str(index_path)

        def geocode(self, address, *, place_id, input_fingerprint):
            observed.update(address=address, place_id=place_id)
            return AddressGeocodeResult(
                normalized_address="東京都武蔵野市吉祥寺南町1-1-4",
                latitude=35.7021,
                longitude=139.5798,
                address_level_match="building",
                precision="exact",
                provider="local_osm_addresses",
                source_reference="https://www.openstreetmap.org/way/123",
                prefecture="東京都",
                municipality_or_ward="Musashino",
                input_fingerprint=input_fingerprint,
            )

    monkeypatch.setattr(my_pick_processor, "LocalOSMAddressGeocoder", Geocoder)
    address = (
        "〒180-0003 Tokyo, Musashino, Kichijoji Minamicho, "
        "1 Chome−1−4 Mikawaya Building, 1F"
    )
    assert my_pick_processor._submitted_address_polygon_components(address) == (
        "Musashino",
        "Kichijoji Minamicho",
        "1",
        "1",
        "4",
    )
    result = my_pick_processor.resolve_submitted_address_location(
        address=address,
        place_id="sawada",
        osm_address_index=tmp_path / "address.sqlite",
    )

    assert observed["place_id"] == "sawada"
    assert observed["address"].startswith("〒180-0003 Tokyo")
    assert result == {
        "latitude": 35.7021,
        "longitude": 139.5798,
        "precision": "building",
        "approximate": False,
        "source_reference": "https://www.openstreetmap.org/way/123",
    }


def test_user_submitted_address_rejects_ambiguous_local_match(monkeypatch, tmp_path):
    class Geocoder:
        def __init__(self, _index_path):
            pass

        def geocode(self, _address, **_kwargs):
            raise AddressGeocoderLookupError("ambiguous", "multiple candidates")

    monkeypatch.setattr(my_pick_processor, "LocalOSMAddressGeocoder", Geocoder)
    assert my_pick_processor.resolve_submitted_address_location(
        address="Tokyo address with a typo",
        place_id="ambiguous",
        osm_address_index=tmp_path / "address.sqlite",
    ) is None


def test_location_only_retry_preserves_score_and_private_public_boundary(
    catalog, monkeypatch, tmp_path
):
    add_canonical(
        catalog,
        "sawada",
        score=65.11,
        latitude=None,
        longitude=None,
        map_ready=False,
    )
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google_places",
        external_place_id="sawada",
        identity_bootstrap_name_hint="Ramen Sawada",
        identity_bootstrap_address_hint=(
            "Tokyo, Musashino, Kichijoji Minamicho, 1 Chome-1-4"
        ),
    )
    assert work["status"] == "needs_location"

    monkeypatch.setattr(
        my_pick_processor,
        "resolve_submitted_address_location",
        lambda **_kwargs: {
            "latitude": 35.7021,
            "longitude": 139.5798,
            "precision": "building",
            "approximate": False,
            "source_reference": "https://www.openstreetmap.org/way/123",
        },
    )
    monkeypatch.setattr(
        my_pick_processor,
        "run_research_batch",
        lambda *_args, **_kwargs: pytest.fail("research checkpoint was rerun"),
    )
    monkeypatch.setattr(
        my_pick_processor,
        "run_quality_v4_backfill",
        lambda *_args, **_kwargs: pytest.fail("Quality-v4 checkpoint was rerun"),
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog,
        osm_index=tmp_path / "poi.sqlite",
        osm_address_index=tmp_path / "address.sqlite",
    )
    summary = my_picks.run_my_pick_worker(
        catalog,
        processor=processor,
        worker_id="location-retry",
        work_id=str(work["id"]),
        retry_location=True,
        detailed=True,
    )

    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    result = my_picks.canonical_result(catalog, completed)
    assert summary["provider_requests"] == 0
    assert summary["quality_v4_attempted"] == 0
    assert summary["canonical_research_attempted"] == 0
    assert completed["status"] == "ready"
    assert completed["private_location_source"] == "user_submitted_address_local_osm"
    assert result["result_ready"] is True
    assert result["map_ready"] is True
    assert result["fiyu_score"] == 65.11
    assert (result["latitude"], result["longitude"]) == (35.7021, 139.5798)
    assert my_picks.recommendation_review_count(catalog, "sawada") == 0
    with connect(catalog) as connection:
        canonical = connection.execute(
            "SELECT latitude, longitude, map_display_eligible, is_published "
            "FROM public_restaurants WHERE place_id='sawada'"
        ).fetchone()
    assert tuple(canonical) == (None, None, 0, 0)


def test_location_only_retry_miss_keeps_scored_result_and_uses_normal_fallback(
    catalog, monkeypatch, tmp_path
):
    add_canonical(
        catalog,
        "location-miss",
        score=65.11,
        latitude=None,
        longitude=None,
        map_ready=False,
    )
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google_places",
        external_place_id="location-miss",
        identity_bootstrap_address_hint="Tokyo address with typo",
    )
    calls = []
    monkeypatch.setattr(
        my_pick_processor,
        "resolve_submitted_address_location",
        lambda **_kwargs: None,
    )

    def fallback(*_args, **kwargs):
        calls.append(kwargs)
        return {"cost": {}}

    monkeypatch.setattr(my_pick_processor, "verify_location", fallback)
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog,
        osm_index=tmp_path / "poi.sqlite",
        osm_address_index=tmp_path / "address.sqlite",
    )
    my_picks.run_my_pick_worker(
        catalog,
        processor=processor,
        worker_id="location-miss",
        work_id=str(work["id"]),
        retry_location=True,
    )

    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    result = my_picks.canonical_result(catalog, completed)
    assert calls[0]["allow_address_research"] is False
    assert completed["status"] == "needs_location"
    assert result["result_ready"] is True
    assert result["map_ready"] is False
    assert result["fiyu_score"] == 65.11


def test_stale_known_restaurant_reuses_identity_and_requires_research(catalog):
    add_canonical(catalog, "stale", research_status="pending", score_version="old-v3")
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google_places", external_place_id="stale"
    )

    assert work["canonical_place_id"] == "stale"
    assert work["status"] == "researching"
    assert my_picks.canonical_result(catalog, work)["fiyu_score"] is None


def test_mocked_canonical_worker_returns_low_score_without_parallel_scoring(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="other", external_place_id="new-1"
    )

    def canonical_pipeline(job):
        assert job["id"] == work["id"]
        add_canonical(catalog, "resolved-low", score=41)
        return "resolved-low"

    counts = my_picks.run_my_pick_worker(
        catalog, processor=canonical_pipeline, worker_id="test-worker"
    )

    assert counts == {"completed": 1, "failed": 0}
    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert completed["status"] == "ready"
    assert my_picks.canonical_result(catalog, completed)["fiyu_score"] == 41


def test_worker_failure_is_retryable_and_polling_does_not_retry(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="other", external_place_id="temporary-failure"
    )
    calls = 0

    def unavailable(_job):
        nonlocal calls
        calls += 1
        raise TimeoutError("provider unavailable")

    assert my_picks.run_my_pick_worker(
        catalog, processor=unavailable, worker_id="test-worker"
    ) == {"completed": 0, "failed": 1}
    failed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert failed["status"] == "failed_retryable"
    assert failed["retryable"] == 1
    assert calls == 1
    assert my_picks.get_canonical_work(catalog, str(work["id"]))["status"] == (
        "failed_retryable"
    )
    assert calls == 1


def test_retryable_worker_job_succeeds_without_duplicate_shared_work(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="other", external_place_id="retry-once"
    )

    def unavailable(_job):
        raise TimeoutError("temporary provider failure")

    my_picks.run_my_pick_worker(
        catalog, processor=unavailable, worker_id="first-attempt"
    )

    def succeeds(_job):
        add_canonical(catalog, "retry-result", score=58)
        return "retry-result"

    result = my_picks.run_my_pick_worker(
        catalog,
        processor=succeeds,
        worker_id="second-attempt",
        retry_failed=True,
        detailed=True,
    )

    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert completed["status"] == "ready"
    assert completed["attempt_count"] == 2
    assert result["ready"] == 1
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM my_pick_canonical_work"
        ).fetchone()[0] == 1


def test_hard_reset_removes_failed_work_and_exclusive_transient_candidate(catalog):
    external_id = "hard-reset-placeholder"
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=external_id
    )
    place_id, _ = my_pick_processor.ensure_my_pick_candidate(
        catalog,
        provider="google",
        external_place_id=external_id,
        display_name_hint=None,
    )
    with connect(catalog) as connection:
        connection.execute(
            """
            UPDATE my_pick_canonical_work
            SET canonical_place_id=?, status='failed_retryable', failure_code='provider_unavailable'
            WHERE id=?
            """,
            (place_id, work["id"]),
        )
        connection.commit()

    plan = my_picks.inspect_my_pick_hard_reset(catalog, str(work["id"]))
    result = my_picks.hard_reset_my_pick_canonical_work(catalog, str(work["id"]))

    assert plan["will_delete_transient_placeholder"] is True
    assert result == {
        "deleted_canonical_work": 1,
        "deleted_transient_placeholder": True,
        "preserved_canonical_restaurant": False,
    }
    assert my_picks.get_canonical_work(catalog, str(work["id"])) is None
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM public_restaurants WHERE place_id=?", (place_id,)
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM restaurants WHERE place_id=?", (place_id,)
        ).fetchone()[0] == 0

    fresh, created = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=external_id
    )
    assert created is True
    assert fresh["status"] == "pending"
    assert fresh["attempt_count"] == 0


def test_hard_reset_recreated_work_claims_research_past_preserved_success_ledger(
    catalog,
):
    external_id = "hard-reset-research-ledger"
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=external_id
    )
    place_id, _ = my_pick_processor.ensure_my_pick_candidate(
        catalog,
        provider="google",
        external_place_id=external_id,
        canonical_name="Research fixture",
    )
    scope = f"my-pick:{work['id']}"
    config = {
        "model": "test-model",
        "prompt_version": research_worker.PROMPT_VERSION,
        "pipeline_version": research_worker.RESEARCH_PIPELINE_VERSION,
    }
    with connect(catalog) as connection:
        connection.execute(
            "UPDATE my_pick_canonical_work SET canonical_place_id=?, status='needs_review' "
            "WHERE id=?",
            (place_id, work["id"]),
        )
        connection.commit()
    first_run = create_pipeline_run(
        catalog,
        run_type="standard_restaurant_research",
        item_keys=[place_id],
        work_key=research_worker._research_work_key("test-model", scope),
        selector={"execution_scope_token": research_worker.research_scope_token(scope)},
        config=config,
        requested_item_count=1,
    )
    first_claim = claim_next_pipeline_item(catalog, first_run, worker_id="first-worker")
    mark_pipeline_item_running(
        catalog, first_claim["id"], first_claim["claim_token"], provider_request_started=True
    )
    with connect(catalog) as connection:
        research_run = connection.execute(
            """
            INSERT INTO restaurant_research_runs(
                public_restaurant_id, provider, model, prompt_version, pipeline_version,
                status, is_current, created_at, completed_at
            ) VALUES (?, 'openai', 'test-model', ?, ?, 'complete', 1, 'now', 'now')
            """,
            (
                place_id,
                research_worker.PROMPT_VERSION,
                research_worker.RESEARCH_PIPELINE_VERSION,
            ),
        )
        connection.execute(
            "UPDATE public_restaurants SET research_status='complete' WHERE place_id=?",
            (place_id,),
        )
        research_run_id = int(research_run.lastrowid)
        connection.commit()
    finish_pipeline_item(
        catalog,
        first_claim["id"],
        first_claim["claim_token"],
        state="succeeded",
        result_reference={"restaurant_research_run_id": research_run_id},
    )

    my_picks.hard_reset_my_pick_canonical_work(catalog, str(work["id"]))
    recreated, created = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=external_id
    )
    recreated_place_id, _ = my_pick_processor.ensure_my_pick_candidate(
        catalog,
        provider="google",
        external_place_id=external_id,
        canonical_name="Research fixture",
    )
    second_run = create_pipeline_run(
        catalog,
        run_type="standard_restaurant_research",
        item_keys=[recreated_place_id],
        work_key=research_worker._research_work_key("test-model", scope),
        selector={"execution_scope_token": research_worker.research_scope_token(scope)},
        config=config,
        requested_item_count=1,
    )
    second_claim = claim_next_pipeline_item(
        catalog, second_run, worker_id="second-worker"
    )
    mark_pipeline_item_running(
        catalog,
        second_claim["id"],
        second_claim["claim_token"],
        provider_request_started=True,
    )

    assert created is True
    assert recreated["id"] == work["id"]
    assert recreated_place_id == place_id
    assert second_claim["claim_reason"] == "stale_ledger_artifact_missing"
    assert get_pipeline_run_status(catalog, second_run)["provider_requests"] == 1
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM restaurant_research_runs WHERE public_restaurant_id=?",
            (place_id,),
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM pipeline_run_items WHERE place_id=? AND state='succeeded'",
            (place_id,),
        ).fetchone()[0] == 1


def test_hard_reset_allows_unshared_needs_review_work(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="needs-review-reset"
    )
    with connect(catalog) as connection:
        connection.execute(
            "UPDATE my_pick_canonical_work SET status='needs_review', "
            "failure_code='identity_not_confirmed' WHERE id=?",
            (work["id"],),
        )
        connection.commit()

    result = my_picks.hard_reset_my_pick_canonical_work(catalog, str(work["id"]))

    assert result["deleted_canonical_work"] == 1
    assert my_picks.get_canonical_work(catalog, str(work["id"])) is None


def test_hard_reset_preserves_existing_public_restaurant(catalog):
    add_canonical(catalog, "existing-public", score=80, published=True)
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="existing-public"
    )
    with connect(catalog) as connection:
        connection.execute(
            "UPDATE my_pick_canonical_work SET status='failed_retryable' WHERE id=?",
            (work["id"],),
        )
        connection.commit()

    result = my_picks.hard_reset_my_pick_canonical_work(catalog, str(work["id"]))

    assert result["deleted_canonical_work"] == 1
    assert result["deleted_transient_placeholder"] is False
    assert result["preserved_canonical_restaurant"] is True
    with connect(catalog) as connection:
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id='existing-public'"
        ).fetchone()[0] == 1


def test_worker_cli_dry_run_is_read_only(catalog, capsys):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="other", external_place_id="cli-dry-run"
    )

    assert pipeline_cli.main(
        [
            "--db",
            str(catalog),
            "my-picks-worker",
            "--work-id",
            str(work["id"]),
            "--osm-index",
            "unused.sqlite",
            "--dry-run",
        ],
        canonical=True,
    ) == 0

    output = json.loads(capsys.readouterr().out)
    assert output["jobs_selected"] == 1
    assert output["provider_requests"] == 0
    assert output["catalog_mutations"] == 0
    assert my_picks.get_canonical_work(catalog, str(work["id"]))["attempt_count"] == 0
    assert my_picks.get_canonical_work(catalog, str(work["id"]))["status"] == "pending"


def test_unresolved_canonical_result_never_exposes_internal_identifiers(catalog):
    external_id = "ChIJ-provider-RUyUK4yYI8QE"
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=external_id
    )
    place_id, _ = my_pick_processor.ensure_my_pick_candidate(
        catalog,
        provider="google",
        external_place_id=external_id,
        display_name_hint=None,
    )
    with connect(catalog) as connection:
        connection.execute(
            "UPDATE public_restaurants SET name_en=?, name_ja=? WHERE place_id=?",
            (external_id, str(work["id"]), place_id),
        )
        connection.execute(
            "UPDATE my_pick_canonical_work SET canonical_place_id=? WHERE id=?",
            (place_id, work["id"]),
        )
        connection.commit()

    unresolved = my_picks.canonical_result(
        catalog, my_picks.get_canonical_work(catalog, str(work["id"]))
    )

    assert unresolved["name_en"] is None
    assert unresolved["name_ja"] is None
    assert external_id not in {unresolved["name_en"], unresolved["name_ja"]}
    assert str(work["id"]) not in {unresolved["name_en"], unresolved["name_ja"]}

    with connect(catalog) as connection:
        connection.execute(
            "UPDATE public_restaurants SET name_en='Resolved Izakaya' WHERE place_id=?",
            (place_id,),
        )
        connection.commit()
    resolved = my_picks.canonical_result(
        catalog, my_picks.get_canonical_work(catalog, str(work["id"]))
    )
    assert resolved["name_en"] == "Resolved Izakaya"


def test_missing_research_provider_is_a_safe_retryable_failure(catalog, monkeypatch):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="provider-unconfigured",
        identity_bootstrap_hint="Provider Restaurant Chiyoda",
    )

    def unavailable(*_args, **_kwargs):
        raise RuntimeError("OPENAI_API_KEY is missing; private-detail-must-not-leak")

    monkeypatch.setattr(my_pick_processor, "run_research_batch", unavailable)
    bootstrap_calls = 0

    def bootstrap(*_args, **_kwargs):
        nonlocal bootstrap_calls
        bootstrap_calls += 1
        return confirmed_bootstrap()

    monkeypatch.setattr(
        my_pick_processor,
        "run_my_pick_identity_bootstrap",
        bootstrap,
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused-before-location.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="provider-test", detailed=True
    )
    failed = my_picks.get_canonical_work(catalog, str(work["id"]))

    assert summary["failed_retryable"] == 1
    assert summary["bootstrap_with_legacy_query"] == 1
    assert failed["status"] == "failed_retryable"
    assert failed["failure_code"] == "research_provider_unconfigured"
    assert "private-detail" not in json.dumps(failed)
    assert failed["identity_bootstrap_status"] == "confirmed"
    assert failed["canonical_place_id"] == "provider-unconfigured"
    my_picks.run_my_pick_worker(
        catalog,
        processor=processor,
        worker_id="provider-retry",
        retry_failed=True,
        detailed=True,
    )
    assert bootstrap_calls == 1


def test_ambiguous_bootstrap_stays_needs_review_without_creating_candidate(
    catalog, monkeypatch
):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google",
        external_place_id="opaque-ambiguous",
        identity_bootstrap_name_hint="Ramen Sawada",
        identity_bootstrap_address_hint="A contradictory Tokyo address",
    )
    ambiguous = MyPickIdentityBootstrapCall(
        result=MyPickIdentityBootstrap(
            identity_status="ambiguous",
            identity_confidence=0.2,
            independent_source_count=0,
            ambiguity_reason="Many plausible restaurants",
        ),
        provider_requests=1,
        web_search_actions=2,
    )
    monkeypatch.setattr(
        my_pick_processor,
        "run_my_pick_identity_bootstrap",
        lambda *_args, **_kwargs: ambiguous,
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="ambiguous", detailed=True
    )

    updated = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert updated["status"] == "needs_review"
    assert updated["failure_code"] == "identity_not_confirmed"
    assert updated["canonical_place_id"] is None
    assert updated["identity_bootstrap_status"] == "ambiguous"
    assert summary["bootstrap_identity_ambiguous"] == 1
    assert summary["bootstrap_with_name_address"] == 1
    assert summary["provider_requests"] == 1


def test_legacy_unknown_without_query_hint_fails_closed_without_fabrication(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="legacy-no-hint"
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="legacy", detailed=True
    )

    updated = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert updated["status"] == "needs_review"
    assert updated["failure_code"] == "identity_not_confirmed"
    assert updated["identity_bootstrap_hint"] is None
    assert summary["provider_requests"] == 0


def test_bootstrap_duplicate_reuses_existing_canonical_restaurant(catalog, monkeypatch):
    add_canonical(catalog, "existing-alias", score=77)
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google",
        external_place_id="opaque-new-provider-id",
        identity_bootstrap_hint="Restaurant existing-alias",
    )
    monkeypatch.setattr(
        my_pick_processor,
        "run_my_pick_identity_bootstrap",
        lambda *_args, **_kwargs: confirmed_bootstrap("Restaurant existing-alias"),
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="duplicate", detailed=True
    )

    updated = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert updated["status"] == "ready"
    assert updated["canonical_place_id"] == "existing-alias"
    assert summary["duplicates_reused_after_bootstrap"] == 1
    assert summary["canonical_candidates_created"] == 0


def test_bootstrapped_candidate_enters_normal_research_without_seed_or_opaque_prompt(
    catalog,
):
    opaque_id = "opaque-google-sawada"
    place_id, created = my_pick_processor.ensure_my_pick_candidate(
        catalog,
        provider="google",
        external_place_id=opaque_id,
        canonical_name="らぁ麺 さわ田",
        canonical_name_ja="らぁ麺 さわ田",
        canonical_name_en="Raa Men Sawada",
        city="Musashino",
        neighborhood="Kichijoji Minamicho",
        address="1-5-12 Kichijoji Minamicho, Musashino, Tokyo",
        primary_category="ramen",
    )

    candidate = research_worker.get_research_candidate(catalog, place_id)
    plan = research_worker.run_research_batch(
        catalog, place_id=place_id, limit=1, dry_run=True
    )
    prompt = research_worker._restaurant_prompt(candidate)

    assert created is True
    assert candidate["title"] == "らぁ麺 さわ田"
    assert candidate["address"] == "1-5-12 Kichijoji Minamicho, Musashino, Tokyo"
    assert plan["candidates"] == [place_id]
    assert opaque_id not in prompt
    assert "Raa Men Sawada" in prompt  # Canonical bootstrap identity is available to queries.
    assert "らぁ麺 さわ田" in prompt
    assert "intentionally omitted" in prompt
    with connect(catalog) as connection:
        stored = connection.execute(
            "SELECT candidate_eligible, internal_fiyu_score, source_files_json "
            "FROM restaurants WHERE place_id=?",
            (place_id,),
        ).fetchone()
    assert stored["candidate_eligible"] == 0
    assert stored["internal_fiyu_score"] is None
    assert stored["source_files_json"] == '["my_pick:google"]'


def test_unknown_my_pick_research_executes_past_stale_same_scope_ledger(
    catalog, monkeypatch
):
    external_id = "opaque-google-sawada"
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google",
        external_place_id=external_id,
        identity_bootstrap_name_hint="Ramen Sawada",
        identity_bootstrap_address_hint=(
            "Japan, 〒180-0003 Tokyo, Musashino, Kichijoji Minamicho, "
            "1 Chome−1−4 Mikawaya Building, 1F"
        ),
    )
    stale_run = create_pipeline_run(
        catalog,
        run_type="standard_restaurant_research",
        item_keys=[external_id],
        work_key=research_worker._research_work_key(
            "test-model", f"my-pick:{work['id']}"
        ),
        selector={},
        config={
            "model": "test-model",
            "prompt_version": research_worker.PROMPT_VERSION,
            "pipeline_version": research_worker.RESEARCH_PIPELINE_VERSION,
        },
        requested_item_count=1,
    )
    stale_claim = claim_next_pipeline_item(
        catalog, stale_run, worker_id="pre-reset-worker"
    )
    mark_pipeline_item_running(
        catalog, stale_claim["id"], stale_claim["claim_token"]
    )
    finish_pipeline_item(
        catalog,
        stale_claim["id"],
        stale_claim["claim_token"],
        state="succeeded",
    )

    bootstrap = MyPickIdentityBootstrapCall(
        result=MyPickIdentityBootstrap(
            identity_status="confirmed",
            identity_confidence=0.95,
            canonical_name_ja="らぁ麺 さわ田",
            canonical_name_en="Raa Men Sawada",
            city="Musashino",
            neighborhood="Kichijoji Minamicho",
            address="1 Chome−1−4 Mikawaya Building, 1F",
            primary_category="Ramen restaurant",
            supporting_urls=[
                "https://restaurant.example/sawada",
                "https://editorial.example/sawada",
            ],
            independent_source_count=2,
        ),
        provider_requests=1,
        web_search_actions=1,
    )
    monkeypatch.setattr(
        my_pick_processor, "run_my_pick_identity_bootstrap", lambda **_kwargs: bootstrap
    )
    monkeypatch.setenv("OPENAI_API_KEY", "not-real")
    monkeypatch.setattr(research_worker, "load_dotenv", lambda: None)
    monkeypatch.setattr(
        research_worker, "OpenAI", lambda **_kwargs: SimpleNamespace(responses=None)
    )
    research_calls = []

    def research_response(candidate, **_kwargs):
        research_calls.append(dict(candidate))
        with connect(catalog) as connection:
            assert connection.execute(
                "SELECT status FROM restaurant_research_runs "
                "WHERE public_restaurant_id=? ORDER BY id DESC LIMIT 1",
                (external_id,),
            ).fetchone()[0] == "running"
        return SimpleNamespace(
            id="response-research-sawada",
            model="test-model",
            status="completed",
            output=[],
            usage=SimpleNamespace(
                input_tokens=10,
                output_tokens=5,
                total_tokens=15,
                model_dump=lambda: {
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "total_tokens": 15,
                },
            ),
            output_parsed={
                "matched_restaurant": True,
                "identity_confidence": 0.95,
                "name_ja": "らぁ麺 さわ田",
                "name_en": "Raa Men Sawada",
                "primary_category": "Ramen restaurant",
                "food_tags": ["ramen"],
                "signature_dishes": ["shoyu ramen"],
                "official_language": "ja",
                "japanese_source_count": 2,
                "english_tourist_source_count": 0,
                "tourist_coverage": "low",
                "reservation_platform_count": 0,
                "official_website_found": True,
                "social_profile_count": 1,
                "chain_classification": "independent_single",
                "known_location_count": 1,
                "specialist_status": "specialist",
                "independent_positive_source_count": 2,
                "total_evidence_sources": 2,
                "conflicting_evidence": False,
                "local_audience": "high",
                "tourist_orientation": "low",
                "international_visibility": "low",
                "corporate_visibility": "low",
                "venue_format": "fixed_venue",
                "food_drink_primary": True,
                "why_fiyu": "Independent ramen specialist with grounded local evidence.",
                "evidence_urls": [
                    "https://restaurant.example/sawada",
                    "https://editorial.example/sawada",
                ],
            },
        )

    monkeypatch.setattr(research_worker, "_research_response", research_response)

    def locate(db_path, place_id, **_kwargs):
        with connect(db_path) as connection:
            connection.execute(
                "UPDATE public_restaurants SET latitude=35.703, longitude=139.58, "
                "map_display_eligible=1, map_location_precision='exact' "
                "WHERE place_id=?",
                (place_id,),
            )
            connection.commit()
        return {"cost": {}}

    def quality(db_path, *, place_id, **_kwargs):
        inspection = quality_v4_backfill.inspect_quality_v4_backfill(
            db_path, place_id=place_id
        )
        assert [row["place_id"] for row in inspection["eligible_rows"]] == [place_id]
        with connect(db_path) as connection:
            connection.execute(
                "UPDATE public_restaurants SET fiyu_score=42, score_version=? "
                "WHERE place_id=?",
                (QUALITY_PRODUCTION_SCORE_VERSION, place_id),
            )
            connection.commit()
        return {"completed": 1, "responses_requests": 1, "web_search_actions": 1}

    monkeypatch.setattr(my_pick_processor, "verify_location", locate)
    monkeypatch.setattr(my_pick_processor, "run_quality_v4_backfill", quality)
    monkeypatch.setattr(
        my_pick_processor, "promote_quality_v4_allowlist", lambda *_args, **_kwargs: {}
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused.sqlite", model="test-model"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="scoped-sawada", detailed=True
    )
    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    diagnostics = my_picks.get_my_pick_stage_diagnostics(catalog, str(work["id"]))

    assert len(research_calls) == 1
    assert research_calls[0]["place_id"] == external_id
    assert research_calls[0]["source_files_json"] == '["my_pick:google"]'
    assert summary["canonical_research_scheduled"] == 1
    assert summary["canonical_research_attempted"] == 1
    with connect(catalog) as connection:
        research_error = connection.execute(
            "SELECT research_error FROM public_restaurants WHERE place_id=?",
            (external_id,),
        ).fetchone()[0]
        durable_internal = connection.execute(
            "SELECT quality_score, underexposure_score, digital_footprint_score "
            "FROM restaurants WHERE place_id=?",
            (external_id,),
        ).fetchone()
    assert summary["canonical_research_completed"] == 1, research_error
    assert tuple(durable_internal) == (50.0, 50.0, 50.0)
    assert summary["identity_bootstrap_provider_requests"] == 1
    assert summary["canonical_research_provider_requests"] == 1
    assert summary["location_completed"] == 1
    assert summary["quality_v4_completed"] == 1
    assert completed["status"] == "ready"
    assert diagnostics["canonical_research_scheduled"] is True
    assert diagnostics["canonical_research_attempted"] is True
    assert diagnostics["canonical_research_provider_requests"] == 1
    assert diagnostics["canonical_research_completed"] is True
    assert diagnostics["score_version"] == QUALITY_PRODUCTION_SCORE_VERSION
    with connect(catalog) as connection:
        stored = connection.execute(
            "SELECT research_status, fiyu_score, score_version, is_published "
            "FROM public_restaurants WHERE place_id=?",
            (external_id,),
        ).fetchone()
    assert tuple(stored) == (
        "complete",
        42.0,
        QUALITY_PRODUCTION_SCORE_VERSION,
        0,
    )


def test_incomplete_canonical_research_blocks_location_and_quality(catalog, monkeypatch):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google",
        external_place_id="research-incomplete",
        identity_bootstrap_name_hint="Ramen Sawada",
        identity_bootstrap_address_hint="Kichijoji, Tokyo",
    )
    calls = {"location": 0, "quality": 0}
    monkeypatch.setattr(
        my_pick_processor,
        "run_my_pick_identity_bootstrap",
        lambda *_args, **_kwargs: confirmed_bootstrap("Raa Men Sawada"),
    )

    def incomplete(db_path, *, place_ids, **_kwargs):
        place_id = place_ids[0]
        with connect(db_path) as connection:
            connection.execute(
                """
                INSERT INTO restaurant_research_runs(
                    public_restaurant_id, provider, model, prompt_version,
                    pipeline_version, status, error, is_current, created_at, completed_at
                ) VALUES (?, 'openai', 'test-model', 'test-prompt',
                          'catalog-pipeline-v1', 'needs_retry',
                          'TimeoutError: provider timeout', 0, 'now', 'now')
                """,
                (place_id,),
            )
            connection.execute(
                "UPDATE public_restaurants SET research_status='needs_retry', "
                "research_error='TimeoutError: provider timeout' WHERE place_id=?",
                (place_id,),
            )
            connection.commit()
        return {"completed": 0, "failed": 1, "responses_requests": 1}

    monkeypatch.setattr(my_pick_processor, "run_research_batch", incomplete)
    monkeypatch.setattr(
        my_pick_processor,
        "verify_location",
        lambda *_args, **_kwargs: calls.__setitem__("location", calls["location"] + 1),
    )
    monkeypatch.setattr(
        my_pick_processor,
        "run_quality_v4_backfill",
        lambda *_args, **_kwargs: calls.__setitem__("quality", calls["quality"] + 1),
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="research-incomplete", detailed=True
    )
    updated = my_picks.get_canonical_work(catalog, str(work["id"]))

    assert updated["failure_code"] == "canonical_research_incomplete"
    assert updated["status"] == "failed_retryable"
    assert summary["canonical_research_scheduled"] == 1
    assert summary["canonical_research_attempted"] == 1
    assert summary["canonical_research_completed"] == 0
    assert summary["quality_v4_attempted"] == 0
    assert calls == {"location": 0, "quality": 0}
    diagnostics = my_picks.get_my_pick_stage_diagnostics(catalog, str(work["id"]))
    assert diagnostics["identity_bootstrap_completed"] is True
    assert diagnostics["canonical_research_attempted"] is False
    assert diagnostics["canonical_research_provider_requests"] == 0
    assert diagnostics["canonical_research_completed"] is False
    assert diagnostics["canonical_research_failure_code"] == "TimeoutError"
    assert diagnostics["canonical_research_missing_requirements"] == [
        "research_status:needs_retry",
        "failure_class:TimeoutError",
    ]
    assert diagnostics["accepted_source_count"] is None
    assert diagnostics["canonical_research_claim_status"] == "not_selected"
    assert diagnostics["location_attempted"] is False
    assert diagnostics["quality_v4_attempted"] is False


def test_stage_diagnostics_use_latest_scoped_run_not_prior_attempt(catalog):
    external_id = "diagnostic-current-attempt"
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=external_id
    )
    place_id, _ = my_pick_processor.ensure_my_pick_candidate(
        catalog,
        provider="google",
        external_place_id=external_id,
        canonical_name="Diagnostic fixture",
    )
    with connect(catalog) as connection:
        connection.execute(
            "UPDATE my_pick_canonical_work SET canonical_place_id=?, status='researching' "
            "WHERE id=?",
            (place_id, work["id"]),
        )
        connection.commit()
    scope = f"my-pick:{work['id']}"
    work_key = research_worker._research_work_key("test-model", scope)
    config = {
        "model": "test-model",
        "prompt_version": research_worker.PROMPT_VERSION,
        "pipeline_version": research_worker.RESEARCH_PIPELINE_VERSION,
    }
    prior_run = create_pipeline_run(
        catalog,
        run_type="standard_restaurant_research",
        item_keys=[place_id],
        work_key=work_key,
        selector={"execution_scope_token": research_worker.research_scope_token(scope)},
        config=config,
        requested_item_count=1,
    )
    prior = claim_next_pipeline_item(catalog, prior_run, worker_id="prior-worker")
    mark_pipeline_item_running(
        catalog, prior["id"], prior["claim_token"], provider_request_started=True
    )
    finish_pipeline_item(
        catalog, prior["id"], prior["claim_token"], state="succeeded"
    )
    active_run = create_pipeline_run(
        catalog,
        run_type="standard_restaurant_research",
        item_keys=[place_id],
        work_key=research_worker._research_work_key("test-model", "other-scope"),
        selector={},
        config=config,
        requested_item_count=1,
    )
    active = claim_next_pipeline_item(catalog, active_run, worker_id="active-worker")
    current_run = create_pipeline_run(
        catalog,
        run_type="standard_restaurant_research",
        item_keys=[place_id],
        work_key=work_key,
        selector={"execution_scope_token": research_worker.research_scope_token(scope)},
        config=config,
        requested_item_count=1,
    )

    assert active is not None
    assert claim_next_pipeline_item(
        catalog, current_run, worker_id="current-worker"
    ) is None
    diagnostics = my_picks.get_my_pick_stage_diagnostics(catalog, str(work["id"]))

    assert diagnostics["canonical_research_scheduled"] is True
    assert diagnostics["canonical_research_attempted"] is False
    assert diagnostics["canonical_research_provider_requests"] == 0
    assert diagnostics["canonical_research_claim_status"] == "blocked_by_active_lease"
    assert diagnostics["canonical_research_skip_reason"] is None


def test_stage_diagnostics_explain_current_artifact_skip(catalog):
    place_id = "diagnostic-current-artifact"
    add_canonical(catalog, place_id)
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=place_id
    )
    scope = f"my-pick:{work['id']}"
    with connect(catalog) as connection:
        connection.execute(
            """
            INSERT INTO restaurant_research_runs(
                public_restaurant_id, provider, model, prompt_version, pipeline_version,
                status, evidence_urls_json, is_current, created_at, completed_at
            ) VALUES (?, 'openai', 'test-model', ?, ?, 'complete', '[]', 1, 'now', 'now')
            """,
            (
                place_id,
                research_worker.PROMPT_VERSION,
                research_worker.RESEARCH_PIPELINE_VERSION,
            ),
        )
        connection.commit()
    run_id = create_pipeline_run(
        catalog,
        run_type="standard_restaurant_research",
        item_keys=[place_id],
        work_key=research_worker._research_work_key("test-model", scope),
        selector={"execution_scope_token": research_worker.research_scope_token(scope)},
        config={
            "model": "test-model",
            "prompt_version": research_worker.PROMPT_VERSION,
            "pipeline_version": research_worker.RESEARCH_PIPELINE_VERSION,
        },
        requested_item_count=1,
    )

    assert claim_next_pipeline_item(catalog, run_id, worker_id="skip-worker") is None
    diagnostics = my_picks.get_my_pick_stage_diagnostics(catalog, str(work["id"]))

    assert diagnostics["canonical_research_attempted"] is False
    assert diagnostics["canonical_research_provider_requests"] == 0
    assert diagnostics["canonical_research_claim_status"] == "skipped"
    assert diagnostics["canonical_research_skip_reason"] == (
        "current_artifact_already_complete"
    )


def test_zero_row_quality_v4_selection_is_not_reported_as_promotion_failure(
    catalog, monkeypatch
):
    add_canonical(
        catalog,
        "quality-not-selected",
        score_version="public-v3-local-discovery-specialist-tristate",
    )
    with connect(catalog) as connection:
        connection.execute(
            "UPDATE public_restaurants SET evidence_json=? WHERE place_id=?",
            ('{"matched_restaurant":true,"identity_confidence":0.9}', "quality-not-selected"),
        )
        connection.commit()
    monkeypatch.setattr(
        my_pick_processor,
        "run_quality_v4_backfill",
        lambda *_args, **_kwargs: {"selected_count": 0, "completed": 0, "failed": 0},
    )
    monkeypatch.setattr(my_picks, "mark_canonical_work_researching", lambda *_args, **_kwargs: None)
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused.sqlite"
    )

    with pytest.raises(my_pick_processor.MyPickProcessingError) as captured:
        processor(
            {
                "id": str(uuid4()),
                "claim_token": "test-claim",
                "provider": "google",
                "external_place_id": "quality-not-selected",
                "attempt_count": 1,
            }
        )

    assert captured.value.code == "quality_v4_not_executed"
    assert captured.value.status == "needs_review"


def test_genuine_quality_promotion_validation_failure_still_needs_review(
    catalog, monkeypatch
):
    add_canonical(
        catalog,
        "quality-invalid",
        score_version="public-v3-local-discovery-specialist-tristate",
    )
    with connect(catalog) as connection:
        connection.execute(
            "UPDATE public_restaurants SET evidence_json=? WHERE place_id=?",
            ('{"matched_restaurant":true,"identity_confidence":0.9}', "quality-invalid"),
        )
        connection.commit()
    monkeypatch.setattr(
        my_pick_processor,
        "run_quality_v4_backfill",
        lambda *_args, **_kwargs: {"selected_count": 1, "completed": 1, "failed": 0},
    )
    monkeypatch.setattr(
        my_pick_processor,
        "promote_quality_v4_allowlist",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            ValueError("shadow/production recomputation mismatch")
        ),
    )
    monkeypatch.setattr(my_picks, "mark_canonical_work_researching", lambda *_args, **_kwargs: None)
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused.sqlite"
    )

    with pytest.raises(my_pick_processor.MyPickProcessingError) as captured:
        processor(
            {
                "id": str(uuid4()),
                "claim_token": "test-claim",
                "provider": "google",
                "external_place_id": "quality-invalid",
                "attempt_count": 1,
            }
        )

    assert captured.value.code == "quality_v4_promotion_needs_review"
    assert captured.value.status == "needs_review"


def test_developer_diagnostics_separate_internal_quality_from_promotion(catalog):
    add_canonical(
        catalog,
        "quality-diagnostic",
        score=42,
        score_version="public-v3-local-discovery-specialist-tristate",
    )
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="quality-diagnostic"
    )
    with connect(catalog) as connection:
        connection.execute(
            """
            INSERT INTO quality_v4_research_runs(
                public_restaurant_id, provider, model, status,
                quality_research_version, quality_case_strength_version,
                score_version, prompt_version, adjustment_guardrail,
                shadow_v4_score, created_at, completed_at
            ) VALUES (?, 'openai', 'test', 'complete', 'quality-v4-research-1',
                      'quality-v4-case-strength-1', 'quality-v4-shadow-1',
                      'quality-v4-prompt-1', 15, 42, 'now', 'now')
            """,
            ("quality-diagnostic",),
        )
        connection.execute(
            """
            UPDATE my_pick_canonical_work
            SET status='needs_review', failure_code='quality_v4_promotion_needs_review'
            WHERE id=?
            """,
            (work["id"],),
        )
        connection.commit()

    diagnostics = my_picks.get_my_pick_stage_diagnostics(catalog, str(work["id"]))

    assert diagnostics["quality_v4_completed"] is True
    assert diagnostics["quality_v4_internal_score_present"] is True
    assert diagnostics["quality_v4_promotion_attempted"] is True
    assert diagnostics["quality_v4_promotion_status"] == "failed"
    assert (
        diagnostics["quality_v4_promotion_failure_code"]
        == "quality_v4_promotion_needs_review"
    )
    assert diagnostics["private_result_eligible"] is False
    assert diagnostics["recommendation_review_eligible"] is False


def test_completed_research_with_insufficient_identity_evidence_needs_review(
    catalog, monkeypatch
):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google",
        external_place_id="insufficient-evidence",
        identity_bootstrap_name_hint="Ramen Sawada",
        identity_bootstrap_address_hint="Kichijoji, Tokyo",
    )
    monkeypatch.setattr(
        my_pick_processor,
        "run_my_pick_identity_bootstrap",
        lambda *_args, **_kwargs: confirmed_bootstrap("Raa Men Sawada"),
    )

    def insufficient(db_path, *, place_ids, **_kwargs):
        with connect(db_path) as connection:
            connection.execute(
                "UPDATE public_restaurants SET research_status='complete', "
                "evidence_json='{\"matched_restaurant\":false,"
                "\"identity_confidence\":0.3}' WHERE place_id=?",
                (place_ids[0],),
            )
            connection.commit()
        return {"completed": 1, "responses_requests": 1}

    quality_calls = 0

    def quality(*_args, **_kwargs):
        nonlocal quality_calls
        quality_calls += 1

    monkeypatch.setattr(my_pick_processor, "run_research_batch", insufficient)
    monkeypatch.setattr(my_pick_processor, "run_quality_v4_backfill", quality)
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="insufficient-evidence", detailed=True
    )
    updated = my_picks.get_canonical_work(catalog, str(work["id"]))

    assert updated["status"] == "needs_review"
    assert updated["failure_code"] == "identity_not_confirmed"
    assert summary["canonical_research_completed"] == 1
    assert summary["quality_v4_attempted"] == 0
    assert quality_calls == 0


def test_unstructured_worker_failure_is_normalized_before_storage(catalog):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="unsafe-failure"
    )

    class UnsafeFailure(RuntimeError):
        code = "provider payload: private diagnostic"

    def fails(_job):
        raise UnsafeFailure("raw secret")

    my_picks.run_my_pick_worker(catalog, processor=fails, worker_id="safe-failure")
    failed = my_picks.get_canonical_work(catalog, str(work["id"]))

    assert failed["failure_code"] == "processing_error"


@pytest.mark.parametrize(
    ("score", "precision", "expected_reviews"),
    [(43.0, "exact", 0), (74.0, "area", 1)],
)
def test_production_processor_reuses_canonical_stages_without_publishing(
    catalog, monkeypatch, score, precision, expected_reviews
):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google",
        external_place_id=f"new-{int(score)}",
        identity_bootstrap_name_hint="Independent Restaurant",
        identity_bootstrap_address_hint="1-2-3 Chiyoda, Tokyo",
    )
    calls = {"research": 0, "location": 0, "quality": 0, "promotion": 0}

    def research(db_path, **_kwargs):
        calls["research"] += 1
        with connect(db_path) as connection:
            connection.execute(
                """
                UPDATE public_restaurants
                SET name_en='Independent canonical name', research_status='complete',
                    evidence_json='{"matched_restaurant":true,"identity_confidence":0.95}',
                    product_eligible=1, review_status='ready'
                WHERE place_id=?
                """,
                (f"new-{int(score)}",),
            )
            connection.commit()
        return {"completed": 1, "responses_requests": 1, "web_search_actions": 2}

    def locate(db_path, place_id, **_kwargs):
        calls["location"] += 1
        with connect(db_path) as connection:
            connection.execute(
                """
                UPDATE public_restaurants
                SET latitude=35.68, longitude=139.75, map_display_eligible=1,
                    map_location_precision=? WHERE place_id=?
                """,
                (precision, place_id),
            )
            connection.commit()
        return {"cost": {"address_fallback_responses_requests": 0}}

    def quality(db_path, *, place_id, **_kwargs):
        calls["quality"] += 1
        with connect(db_path) as connection:
            connection.execute(
                """
                UPDATE public_restaurants SET fiyu_score=?, score_version=?
                WHERE place_id=?
                """,
                (score, QUALITY_PRODUCTION_SCORE_VERSION, place_id),
            )
            connection.commit()
        return {"completed": 1, "responses_requests": 1, "web_search_actions": 1}

    def promote(db_path, *, place_ids):
        calls["promotion"] += 1
        with connect(db_path) as connection:
            assert connection.execute(
                "SELECT is_published FROM public_restaurants WHERE place_id=?",
                (place_ids[0],),
            ).fetchone()[0] == 0
        return {"promoted": 1}

    monkeypatch.setattr(my_pick_processor, "run_research_batch", research)
    bootstrap_inputs = []

    def bootstrap(*_args, **kwargs):
        bootstrap_inputs.append(kwargs)
        return confirmed_bootstrap()

    monkeypatch.setattr(my_pick_processor, "run_my_pick_identity_bootstrap", bootstrap)
    monkeypatch.setattr(my_pick_processor, "verify_location", locate)
    monkeypatch.setattr(my_pick_processor, "run_quality_v4_backfill", quality)
    monkeypatch.setattr(my_pick_processor, "promote_quality_v4_allowlist", promote)
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused-in-mocked-test.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog,
        processor=processor,
        worker_id="actual-adapter-test",
        detailed=True,
    )

    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert completed["status"] == "ready"
    assert my_picks.canonical_result(catalog, completed)["fiyu_score"] == score
    assert summary["provider_requests"] == 3
    assert summary["web_search_actions"] == 4
    assert summary["bootstrap_identity_confirmed"] == 1
    assert summary["bootstrap_with_name_address"] == 1
    assert summary["bootstrap_with_legacy_query"] == 0
    assert bootstrap_inputs == [{
        "user_name_hint": "Independent Restaurant",
        "user_address_hint": "1-2-3 Chiyoda, Tokyo",
        "model": None,
    }]
    assert summary["canonical_candidates_created"] == 1
    assert summary["canonical_research_scheduled"] == 1
    assert summary["canonical_research_attempted"] == 1
    assert summary["canonical_research_completed"] == 1
    assert summary["location_attempted"] == 1
    assert summary["location_completed"] == 1
    assert summary["quality_v4_attempted"] == 1
    assert summary["quality_v4_completed"] == 1
    assert summary["review_queue_additions"] == expected_reviews
    assert calls == {"research": 1, "location": 1, "quality": 1, "promotion": 1}
    with connect(catalog) as connection:
        candidate = connection.execute(
            "SELECT rating, review_count, candidate_eligible, source_files_json "
            "FROM restaurants WHERE place_id=?",
            (f"new-{int(score)}",),
        ).fetchone()
        assert tuple(candidate[:3]) == (0.0, 0, 0)
        assert candidate["source_files_json"] == '["my_pick:google"]'
        assert connection.execute(
            "SELECT is_published FROM public_restaurants WHERE place_id=?",
            (f"new-{int(score)}",),
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT score_version FROM public_restaurants WHERE place_id=?",
            (f"new-{int(score)}",),
        ).fetchone()[0] == QUALITY_PRODUCTION_SCORE_VERSION


@pytest.mark.parametrize(
    ("coordinates", "expected_status", "quality_calls"),
    [(None, "needs_location", 1), ((34.69, 135.50), "outside_coverage", 0)],
)
def test_production_processor_preserves_unresolved_and_outside_location_states(
    catalog, monkeypatch, coordinates, expected_status, quality_calls
):
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id=f"location-{expected_status}",
        identity_bootstrap_hint="Location Restaurant Tokyo",
    )

    def research(db_path, **_kwargs):
        with connect(db_path) as connection:
            connection.execute(
                """
                UPDATE public_restaurants SET research_status='complete',
                    evidence_json='{"matched_restaurant":true,"identity_confidence":0.9}',
                    product_eligible=1, review_status='ready'
                WHERE place_id=?
                """,
                (f"location-{expected_status}",),
            )
            connection.commit()
        return {"completed": 1}

    def locate(db_path, place_id, **_kwargs):
        if coordinates is not None:
            with connect(db_path) as connection:
                connection.execute(
                    """
                    UPDATE public_restaurants SET latitude=?, longitude=?,
                        map_display_eligible=1, map_location_precision='exact'
                    WHERE place_id=?
                    """,
                    (*coordinates, place_id),
                )
                connection.commit()
        return {"cost": {}}

    quality_count = 0

    def quality(db_path, *, place_id, **_kwargs):
        nonlocal quality_count
        quality_count += 1
        with connect(db_path) as connection:
            connection.execute(
                "UPDATE public_restaurants SET fiyu_score=62, score_version=? "
                "WHERE place_id=?",
                (QUALITY_PRODUCTION_SCORE_VERSION, place_id),
            )
            connection.commit()
        return {"completed": 1}

    monkeypatch.setattr(my_pick_processor, "run_research_batch", research)
    monkeypatch.setattr(
        my_pick_processor,
        "run_my_pick_identity_bootstrap",
        lambda *_args, **_kwargs: confirmed_bootstrap(f"Location {expected_status}"),
    )
    monkeypatch.setattr(my_pick_processor, "verify_location", locate)
    monkeypatch.setattr(my_pick_processor, "run_quality_v4_backfill", quality)
    monkeypatch.setattr(
        my_pick_processor, "promote_quality_v4_allowlist", lambda *_args, **_kwargs: {}
    )
    processor = my_pick_processor.ProductionMyPickProcessor(
        catalog, osm_index="unused-in-mocked-test.sqlite"
    )

    summary = my_picks.run_my_pick_worker(
        catalog, processor=processor, worker_id="location-test", detailed=True
    )

    completed = my_picks.get_canonical_work(catalog, str(work["id"]))
    assert completed["status"] == expected_status
    assert summary[expected_status] == 1
    assert quality_count == quality_calls
    if expected_status == "needs_location":
        result = my_picks.canonical_result(catalog, completed)
        assert result["latitude"] is None
        assert result["longitude"] is None


def test_ready_unpublished_my_pick_is_an_independent_personal_map_relationship(
    catalog, monkeypatch
):
    add_canonical(catalog, "private-map-pick", score=64, published=False)
    work, _ = my_picks.create_or_get_canonical_work(
        catalog, provider="google", external_place_id="private-map-pick"
    )
    monkeypatch.setattr(api, "DB_PATH", catalog)
    monkeypatch.setattr(
        api.shared_user_data,
        "list_my_picks",
        lambda *, user_id: [{"canonical_work_id": work["id"]}],
    )
    monkeypatch.setattr(api.shared_user_data, "get_active_daily_picks", lambda **_kwargs: None)
    monkeypatch.setattr(api.shared_user_data, "get_recent_daily_pick_rounds", lambda **_kwargs: [])
    monkeypatch.setattr(api.shared_user_data, "latest_visit_ratings", lambda **_kwargs: {})
    monkeypatch.setattr(
        api.shared_user_data,
        "saved_place_ids",
        lambda **_kwargs: {"private-map-pick"},
    )
    monkeypatch.setattr(
        api.shared_user_data,
        "visited_place_ids",
        lambda **_kwargs: ["private-map-pick"],
    )
    monkeypatch.setattr(api, "_together_discovery_assignments", lambda *_args: [])

    rows = api._authenticated_map_restaurants("account-a")

    assert [row["place_id"] for row in rows] == ["private-map-pick"]
    assert rows[0]["is_my_pick"] is True
    assert rows[0]["is_saved"] is True
    assert rows[0]["is_visited"] is True
    assert rows[0]["is_discovered"] is False


def test_private_user_address_location_is_visible_only_on_owner_personal_map(
    catalog, monkeypatch
):
    add_canonical(
        catalog,
        "private-address-pick",
        score=65.11,
        published=False,
        latitude=None,
        longitude=None,
        map_ready=False,
    )
    work, _ = my_picks.create_or_get_canonical_work(
        catalog,
        provider="google",
        external_place_id="private-address-pick",
        identity_bootstrap_address_hint=(
            "Tokyo, Musashino, Kichijoji Minamicho, 1 Chome-1-4"
        ),
    )
    claimed = my_picks.claim_next_canonical_work(
        catalog,
        worker_id="private-map-test",
        retry_location=True,
        work_id=str(work["id"]),
    )
    my_picks.mark_canonical_work_researching(
        catalog, str(work["id"]), str(claimed["claim_token"]),
        place_id="private-address-pick",
    )
    my_picks.save_private_my_pick_location(
        catalog,
        str(work["id"]),
        str(claimed["claim_token"]),
        latitude=35.7021,
        longitude=139.5798,
        precision="building",
        approximate=False,
        source_reference="https://www.openstreetmap.org/way/123",
    )
    my_picks.complete_canonical_work_from_catalog(
        catalog,
        str(work["id"]),
        str(claimed["claim_token"]),
        place_id="private-address-pick",
    )
    monkeypatch.setattr(api, "DB_PATH", catalog)
    monkeypatch.setattr(
        api.shared_user_data,
        "list_my_picks",
        lambda *, user_id: (
            [{"canonical_work_id": work["id"]}] if user_id == "owner" else []
        ),
    )
    monkeypatch.setattr(api.shared_user_data, "get_active_daily_picks", lambda **_kwargs: None)
    monkeypatch.setattr(api.shared_user_data, "get_recent_daily_pick_rounds", lambda **_kwargs: [])
    monkeypatch.setattr(api.shared_user_data, "latest_visit_ratings", lambda **_kwargs: {})
    monkeypatch.setattr(api.shared_user_data, "saved_place_ids", lambda **_kwargs: set())
    monkeypatch.setattr(api.shared_user_data, "visited_place_ids", lambda **_kwargs: [])
    monkeypatch.setattr(api, "_together_discovery_assignments", lambda *_args: [])

    owner_rows = api._authenticated_map_restaurants("owner")
    assert len(owner_rows) == 1
    assert owner_rows[0]["place_id"] == "private-address-pick"
    assert owner_rows[0]["is_my_pick"] is True
    assert owner_rows[0]["map_display_eligible"] is True
    assert owner_rows[0]["directions_coordinates_eligible"] is False
    assert (owner_rows[0]["latitude"], owner_rows[0]["longitude"]) == (
        35.7021,
        139.5798,
    )
    assert api._authenticated_map_restaurants("other-user") == []
    assert api._map_eligible_public_restaurants_for_place_ids(
        ["private-address-pick"]
    ) == []

@pytest.fixture
def my_pick_api(catalog, monkeypatch):
    user_ids = {"token-a": str(uuid4()), "token-b": str(uuid4())}
    rows: dict[tuple[str, str, str], dict[str, object]] = {}

    def authenticate(header):
        token = (header or "").removeprefix("Bearer ")
        if token not in user_ids:
            raise api.SupabaseAuthError("invalid")
        return {"id": user_ids[token]}

    quota_lock = Lock()

    def quota(*, user_id):
        now = datetime.now(UTC)
        recent = sorted(
            datetime.fromisoformat(str(row["created_at"]))
            for key, row in rows.items()
            if key[0] == user_id
            and datetime.fromisoformat(str(row["created_at"])) >= now - timedelta(hours=24)
        )
        used = len(recent)
        return {
            "limit": 3,
            "used": used,
            "remaining": max(3 - used, 0),
            "window_hours": 24,
            "next_available_at": (
                (recent[0] + timedelta(hours=24)).isoformat() if used >= 3 else None
            ),
        }

    def create_or_get(*, user_id, provider, external_place_id, display_name_hint, user_query_hint, user_name_hint, user_address_hint, canonical_work_id):
        with quota_lock:
            key = (user_id, provider, external_place_id)
            reused = key in rows
            if not reused:
                current_quota = quota(user_id=user_id)
                if current_quota["remaining"] == 0:
                    raise api.shared_user_data.MyPickQuotaExceeded(current_quota)
                now = datetime.now(UTC).isoformat()
                rows[key] = {
                    "id": str(uuid4()),
                    "user_id": user_id,
                    "provider": provider,
                    "external_place_id": external_place_id,
                    "display_name_hint": display_name_hint,
                    "user_query_hint": user_query_hint,
                    "user_name_hint": user_name_hint,
                    "user_address_hint": user_address_hint,
                    "canonical_work_id": canonical_work_id,
                    "status": "pending",
                    "created_at": now,
                    "updated_at": now,
                }
            return {**rows[key], "reused": reused}

    def list_rows(*, user_id):
        return [dict(row) for key, row in rows.items() if key[0] == user_id]

    def get_row(*, user_id, my_pick_id):
        return next(
            (
                dict(row)
                for key, row in rows.items()
                if key[0] == user_id and row["id"] == my_pick_id
            ),
            None,
        )

    def sync(**values):
        changed = 0
        for row in rows.values():
            if row["canonical_work_id"] == values["canonical_work_id"]:
                row.update(values)
                changed += 1
        return changed

    monkeypatch.setattr(api, "DB_PATH", catalog)
    monkeypatch.setattr(api, "authenticated_supabase_user", authenticate)
    monkeypatch.setattr(api.shared_user_data, "configured", lambda: True)
    monkeypatch.setattr(api.shared_user_data, "create_or_get_my_pick", create_or_get)
    monkeypatch.setattr(api.shared_user_data, "list_my_picks", list_rows)
    monkeypatch.setattr(api.shared_user_data, "get_my_pick", get_row)
    monkeypatch.setattr(api.shared_user_data, "get_my_pick_quota", quota)
    monkeypatch.setattr(api.shared_user_data, "sync_my_pick_result", sync)
    return TestClient(api.app), user_ids, rows


def my_pick_payload(external_place_id: str, **values):
    return {
        "provider": "google",
        "external_place_id": external_place_id,
        "user_name_hint": "User restaurant name",
        "user_address_hint": "1-2-3 User address, Tokyo",
        **values,
    }


def test_api_auth_ownership_idempotency_and_shared_work(my_pick_api):
    client, _user_ids, rows = my_pick_api
    payload = {
        "provider": "google_places",
        "external_place_id": "new-shared",
        "user_query_hint": "Toritsune Shizendo",
        "user_name_hint": "Toritsune Shizendo",
        "user_address_hint": "1-2-3 Sotokanda, Chiyoda, Tokyo",
    }
    assert client.post("/my-picks", json=payload).status_code == 401

    first = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-a"}
    )
    repeated = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-a"}
    )
    other = client.post(
        "/my-picks",
        json={**payload, "user_query_hint": "鳥つね自然洞", "user_name_hint": "鳥つね自然洞"},
        headers={"Authorization": "Bearer token-b"},
    )

    assert first.status_code == repeated.status_code == other.status_code == 202
    assert first.json()["my_pick_id"] == repeated.json()["my_pick_id"]
    assert first.json()["my_pick_id"] != other.json()["my_pick_id"]
    assert first.json()["user_query_hint"] == "Toritsune Shizendo"
    assert other.json()["user_query_hint"] == "鳥つね自然洞"
    assert first.json()["user_name_hint"] == "Toritsune Shizendo"
    assert other.json()["user_name_hint"] == "鳥つね自然洞"
    assert len(rows) == 2
    with connect(api.DB_PATH) as connection:
        work_rows = connection.execute(
            "SELECT submission_count, provider_request_count, identity_bootstrap_hint, "
            "identity_bootstrap_name_hint, identity_bootstrap_address_hint "
            "FROM my_pick_canonical_work"
        ).fetchall()
    assert [
        (
            row["submission_count"],
            row["provider_request_count"],
            row["identity_bootstrap_hint"],
            row["identity_bootstrap_name_hint"],
            row["identity_bootstrap_address_hint"],
        )
        for row in work_rows
    ] == [
        (2, 0, "Toritsune Shizendo", "Toritsune Shizendo", "1-2-3 Sotokanda, Chiyoda, Tokyo")
    ]
    other_read = client.get(
        f"/my-picks/{first.json()['my_pick_id']}",
        headers={"Authorization": "Bearer token-b"},
    )
    assert other_read.status_code == 404
    own_list = client.get("/my-picks", headers={"Authorization": "Bearer token-a"})
    assert own_list.status_code == 200
    assert [row["my_pick_id"] for row in own_list.json()] == [first.json()["my_pick_id"]]


def test_api_explicitly_projects_result_ready_without_map_readiness(my_pick_api):
    client, _user_ids, _rows = my_pick_api
    add_canonical(
        api.DB_PATH,
        "scored-no-map",
        score=65.11,
        latitude=None,
        longitude=None,
        map_ready=False,
    )

    response = client.post(
        "/my-picks",
        json=my_pick_payload("scored-no-map"),
        headers={"Authorization": "Bearer token-a"},
    )

    assert response.status_code == 202
    payload = response.json()
    assert payload["status"] == "needs_location"
    assert payload["result_ready"] is True
    assert payload["fiyu_score"] == 65.11
    assert payload["map_ready"] is False

def test_shared_worker_completion_projects_to_both_waiting_users(my_pick_api):
    client, _user_ids, rows = my_pick_api
    payload = my_pick_payload("two-user-new")
    first = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-a"}
    )
    second = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-b"}
    )
    assert first.status_code == second.status_code == 202

    def canonical_pipeline(_job):
        add_canonical(api.DB_PATH, "two-user-result", score=59)
        return "two-user-result"

    result = my_picks.run_my_pick_worker(
        api.DB_PATH,
        processor=canonical_pipeline,
        worker_id="shared-projection",
        on_update=api._sync_my_pick_projection,
        detailed=True,
    )

    assert result["ready"] == 1
    assert len(rows) == 2
    assert {row["status"] for row in rows.values()} == {"ready"}
    assert {row["canonical_place_id"] for row in rows.values()} == {
        "two-user-result"
    }


def test_api_rejects_user_controlled_canonical_fields(my_pick_api):
    client, _users, _rows = my_pick_api
    response = client.post(
        "/my-picks",
        json={
            "provider": "google_places",
            "external_place_id": "unsafe",
            "latitude": 35.0,
            "fiyu_score": 99,
            "is_published": True,
        },
        headers={"Authorization": "Bearer token-a"},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"provider": "google", "external_place_id": "missing-both"},
        {
            "provider": "google", "external_place_id": "missing-address",
            "user_name_hint": "Restaurant",
        },
        {
            "provider": "google", "external_place_id": "blank-name",
            "user_name_hint": "  ", "user_address_hint": "Tokyo",
        },
    ],
)
def test_api_requires_both_user_owned_identity_hints(my_pick_api, payload):
    client, _users, _rows = my_pick_api
    response = client.post(
        "/my-picks", json=payload, headers={"Authorization": "Bearer token-a"}
    )
    assert response.status_code == 422


def test_api_enforces_three_distinct_my_picks_per_rolling_day(my_pick_api):
    client, _users, _rows = my_pick_api
    headers = {"Authorization": "Bearer token-a"}
    responses = [
        client.post(
            "/my-picks",
            json=my_pick_payload(f"quota-{index}"),
            headers=headers,
        )
        for index in range(4)
    ]

    assert [response.status_code for response in responses] == [202, 202, 202, 429]
    detail = responses[-1].json()["detail"]
    assert detail["code"] == "my_pick_quota_exhausted"
    assert detail["quota"]["remaining"] == 0
    assert detail["quota"]["next_available_at"] is not None


def test_same_my_pick_is_reused_after_quota_is_exhausted(my_pick_api):
    client, _users, _rows = my_pick_api
    headers = {"Authorization": "Bearer token-a"}
    payloads = [
        my_pick_payload(f"same-safe-{index}")
        for index in range(3)
    ]
    created = [client.post("/my-picks", json=payload, headers=headers) for payload in payloads]
    repeated = client.post("/my-picks", json=payloads[0], headers=headers)

    assert repeated.status_code == 202
    assert repeated.json()["my_pick_id"] == created[0].json()["my_pick_id"]
    assert client.get("/my-picks/quota", headers=headers).json()["used"] == 3


def test_known_public_restaurant_still_consumes_a_new_account_slot(my_pick_api):
    client, _users, _rows = my_pick_api
    add_canonical(api.DB_PATH, "already-public", score=82, published=True)
    headers = {"Authorization": "Bearer token-a"}

    created = client.post(
        "/my-picks",
        json=my_pick_payload("already-public"),
        headers=headers,
    )

    assert created.status_code == 202
    assert created.json()["status"] == "ready"
    assert client.get("/my-picks/quota", headers=headers).json()["used"] == 1


def test_retrying_same_durable_failed_pick_does_not_consume_another_slot(my_pick_api):
    client, users, rows = my_pick_api
    headers = {"Authorization": "Bearer token-a"}
    payload = my_pick_payload("retry-durable")
    first = client.post("/my-picks", json=payload, headers=headers)
    key = (users["token-a"], "google", "retry-durable")
    rows[key]["status"] = "failed_retryable"

    retried = client.post("/my-picks", json=payload, headers=headers)

    assert retried.status_code == 202
    assert retried.json()["my_pick_id"] == first.json()["my_pick_id"]
    assert client.get("/my-picks/quota", headers=headers).json()["used"] == 1


def test_rolling_quota_restores_a_slot_after_twenty_four_hours(my_pick_api):
    client, user_ids, rows = my_pick_api
    headers = {"Authorization": "Bearer token-a"}
    for index in range(3):
        assert client.post(
            "/my-picks",
            json=my_pick_payload(f"rolling-{index}"),
            headers=headers,
        ).status_code == 202
    rows[(user_ids["token-a"], "google", "rolling-0")]["created_at"] = (
        datetime.now(UTC) - timedelta(hours=24, seconds=1)
    ).isoformat()

    quota = client.get("/my-picks/quota", headers=headers)
    fourth = client.post(
        "/my-picks",
        json=my_pick_payload("rolling-3"),
        headers=headers,
    )
    assert quota.json() == {
        "limit": 3, "used": 2, "remaining": 1, "window_hours": 24,
        "next_available_at": None,
    }
    assert fourth.status_code == 202


def test_quota_endpoint_is_authenticated_and_account_scoped(my_pick_api):
    client, _users, _rows = my_pick_api
    assert client.get("/my-picks/quota").status_code == 401
    client.post(
        "/my-picks",
        json=my_pick_payload("owned-quota"),
        headers={"Authorization": "Bearer token-a"},
    )
    assert client.get(
        "/my-picks/quota", headers={"Authorization": "Bearer token-a"}
    ).json()["used"] == 1
    assert client.get(
        "/my-picks/quota", headers={"Authorization": "Bearer token-b"}
    ).json()["used"] == 0


def test_concurrent_distinct_submissions_cannot_exceed_quota(my_pick_api):
    client, users, rows = my_pick_api

    def submit(index):
        return client.post(
            "/my-picks",
            json=my_pick_payload(f"race-{index}"),
            headers={"Authorization": "Bearer token-a"},
        ).status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        statuses = list(pool.map(submit, range(6)))

    assert statuses.count(202) == 3
    assert statuses.count(429) == 3
    assert sum(1 for key in rows if key[0] == users["token-a"]) == 3


def test_migration_has_rls_atomic_idempotency_and_server_side_rate_limit():
    migration = (
        api.BACKEND_ROOT / "supabase/migrations/202610130001_my_picks.sql"
    ).read_text(encoding="utf-8")
    assert "enable row level security" in migration
    assert "auth.uid() = user_id" in migration
    assert "unique (user_id, provider, external_place_id)" in migration
    assert "pg_advisory_xact_lock" in migration
    assert "my_pick_rate_limit" in migration
    assert "grant execute" in migration and "service_role" in migration
    assert "authenticated;" in migration
    quota_migration = (
        api.BACKEND_ROOT / "supabase/migrations/202610180001_my_pick_quota.sql"
    ).read_text(encoding="utf-8")
    assert "interval '24 hours'" in quota_migration
    assert ">= 3" in quota_migration
    assert "my_pick_quota_exhausted" in quota_migration
    assert "get_fiyu_my_pick_quota" in quota_migration
    assert quota_migration.index("existing_pick.id is not null") < quota_migration.index(
        "my_pick_quota_exhausted"
    )
    assert "pg_advisory_xact_lock" in quota_migration

    hard_reset_migration = (
        api.BACKEND_ROOT
        / "supabase/migrations/202610200001_my_pick_dev_hard_reset.sql"
    ).read_text(encoding="utf-8")
    assert "hard_reset_fiyu_my_pick_projection" in hard_reset_migration
    assert "user_id <> p_user_id" in hard_reset_migration
    assert "pg_advisory_xact_lock" in hard_reset_migration
    assert "delete from public.fiyu_my_picks" in hard_reset_migration
    assert "to service_role" in hard_reset_migration
    assert "authenticated;" in hard_reset_migration
    query_hint_migration = (
        api.BACKEND_ROOT
        / "supabase/migrations/202610200002_my_pick_user_query_hint.sql"
    ).read_text(encoding="utf-8")
    assert "add column if not exists user_query_hint" in query_hint_migration
    assert "p_user_query_hint text" in query_hint_migration
    assert "to service_role" in query_hint_migration
    assert "authenticated;" in query_hint_migration
    name_address_migration = (
        api.BACKEND_ROOT
        / "supabase/migrations/202610200003_my_pick_name_address_hints.sql"
    ).read_text(encoding="utf-8")
    assert "add column if not exists user_name_hint" in name_address_migration
    assert "add column if not exists user_address_hint" in name_address_migration
    assert "p_user_name_hint text" in name_address_migration
    assert "p_user_address_hint text" in name_address_migration
    assert "to service_role" in name_address_migration
