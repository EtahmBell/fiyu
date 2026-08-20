import json

import pytest
from pydantic import ValidationError

from fiyu.card_enrichment import (
    CardEnrichment,
    DayHours,
    EnrichmentSource,
    HoursPeriod,
    OpeningHours,
    PracticalInfo,
    ReservationInfo,
    ReviewTheme,
    authorize_card_enrichment_retry,
    backfill_card_enrichment,
    compact_card_description,
    enrichment_completeness,
    format_opening_hours,
    merge_card_enrichment,
    persist_card_enrichment,
    scoring_research_view,
)
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema


def _source(kind="official_website", checked="2026-08-20T00:00:00+00:00"):
    return EnrichmentSource(url=f"https://example.com/{kind}", source_type=kind, checked_at=checked)


def _hours(*, source="official_website", checked="2026-08-20T00:00:00+00:00"):
    service = DayHours(
        status="open",
        periods=[
            HoursPeriod(open="11:30", close="14:00", label="lunch"),
            HoursPeriod(open="17:30", close="22:00", label="dinner"),
        ],
    )
    return OpeningHours(
        monday=DayHours(status="closed"),
        tuesday=service,
        wednesday=service,
        thursday=service,
        friday=service,
        saturday=service,
        sunday=service,
        confidence=0.9,
        checked_at=checked,
        sources=[_source(source, checked)],
    )


def _complete_enrichment() -> CardEnrichment:
    return CardEnrichment(
        card_description="Tiny neighborhood sushi counter with a traditional Edomae focus.",
        card_description_confidence=0.9,
        card_description_source_urls=["https://example.com/official"],
        review_themes=[
            ReviewTheme(
                theme="seasonal nigiri selection",
                sentiment="positive",
                supporting_source_count=2,
                confidence=0.8,
                source_urls=["https://example.com/a", "https://example.org/b"],
            )
        ],
        practical_info=PracticalInfo(
            reservation=ReservationInfo(status="recommended", confidence=0.8),
            confidence=0.8,
            source_urls=["https://example.com/official"],
            checked_at="2026-08-20T00:00:00+00:00",
        ),
        opening_hours=_hours(),
        researched_at="2026-08-20T00:00:00+00:00",
    )


def _db(tmp_path):
    path = tmp_path / "enrichment.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute("CREATE TABLE fiyu_restaurant_seen (owner_id TEXT, place_id TEXT)")
        connection.executemany(
            """INSERT INTO restaurants
               (place_id, title, rating, review_count, quality_score,
                underexposure_score, digital_footprint_score)
               VALUES (?, ?, 4.5, 20, 80, 80, 80)""",
            [("published", "Published"), ("hidden", "Hidden")],
        )
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        for place_id, published in (("published", 1), ("hidden", 0)):
            connection.execute(
                """INSERT INTO public_restaurants (
                    place_id, name_en, description_en, fiyu_score,
                    local_discovery_score, research_status, is_published,
                    latitude, longitude, location_precision, created_at, updated_at
                ) VALUES (?, ?, ?, 82, 74, 'complete', ?, 35.0, 139.0, 'exact', 'now', 'now')""",
                (
                    place_id,
                    place_id.title(),
                    (
                        "A compact neighborhood izakaya focused on seasonal plates. "
                        "Its small counter creates a quiet, informal setting."
                    ),
                    published,
                ),
            )
            connection.execute(
                """INSERT INTO restaurant_research_runs (
                    public_restaurant_id, provider, model, prompt_version,
                    pipeline_version, status, structured_research_json,
                    is_current, created_at, completed_at
                ) VALUES (?, 'openai', 'mock', 'old', 'v1', 'complete', ?, 1, ?, ?)""",
                (
                    place_id,
                    json.dumps(
                        {
                            "description_en": "A compact neighborhood izakaya focused on seasonal plates.",
                            "evidence_urls": ["https://example.com/a", "https://example.org/b"],
                        }
                    ),
                    "2026-08-01T00:00:00+00:00",
                    "2026-08-01T00:00:00+00:00",
                ),
            )
        connection.execute("INSERT INTO fiyu_restaurant_seen VALUES ('user-a', 'published')")
        connection.commit()
    return path


def _add_published(path, place_id, *, score, local_score, card_description=None):
    with connect(path) as connection:
        connection.execute(
            """INSERT INTO restaurants
               (place_id, title, rating, review_count, quality_score,
                underexposure_score, digital_footprint_score)
               VALUES (?, ?, 4.5, 20, 80, 80, 80)""",
            (place_id, place_id.title()),
        )
        connection.execute(
            """INSERT INTO public_restaurants (
                place_id, name_en, card_description, card_enrichment_json,
                fiyu_score, local_discovery_score, research_status, is_published,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'complete', 1, 'now', 'now')""",
            (
                place_id,
                place_id.title(),
                card_description,
                CardEnrichment(
                    card_description=card_description,
                    card_description_confidence=0.8 if card_description else None,
                ).model_dump_json(),
                score,
                local_score,
            ),
        )
        connection.commit()


def test_card_description_is_compact_and_rejects_promotional_copy():
    source = (
        "A compact six-seat neighborhood sushi counter serving traditional Edomae sushi. "
        "The room centers on a quiet counter experience with seasonal fish."
    )
    assert len(compact_card_description(source)) <= 180
    assert compact_card_description("An amazing hidden gem you must visit!") is None


def test_specific_review_themes_survive_and_weak_or_generic_themes_are_filtered():
    enrichment = CardEnrichment.model_validate(
        {
            "review_themes": [
                {
                    "theme": "handmade gyoza",
                    "sentiment": "positive",
                    "supporting_source_count": 2,
                    "confidence": 0.85,
                    "source_urls": ["https://a.example", "https://b.example"],
                },
                {
                    "theme": "good food",
                    "sentiment": "positive",
                    "supporting_source_count": 3,
                    "confidence": 0.9,
                    "source_urls": ["https://a.example", "https://b.example"],
                },
                {
                    "theme": "seasonal sashimi",
                    "sentiment": "positive",
                    "supporting_source_count": 1,
                    "confidence": 0.6,
                    "source_urls": ["https://a.example"],
                },
            ]
        }
    )
    assert [item.theme for item in enrichment.review_themes] == ["handmade gyoza"]
    assert "review_text" not in enrichment.model_dump_json()


def test_malformed_or_mechanically_clipped_review_themes_are_filtered():
    enrichment = CardEnrichment.model_validate(
        {
            "review_themes": [
                {
                    "theme": "charcoal-grilled skewers and",
                    "sentiment": "positive",
                    "supporting_source_count": 2,
                    "confidence": 0.8,
                    "source_urls": ["https://a.example", "https://b.example"],
                },
                {
                    "theme": "quiet counter atmosphere客層",
                    "sentiment": "practical",
                    "supporting_source_count": 2,
                    "confidence": 0.8,
                    "source_urls": ["https://a.example", "https://b.example"],
                },
                {
                    "theme": "quiet counter atmosphere",
                    "sentiment": "practical",
                    "supporting_source_count": 2,
                    "confidence": 0.8,
                    "source_urls": ["https://a.example", "https://b.example"],
                },
            ]
        }
    )
    assert [item.theme for item in enrichment.review_themes] == ["quiet counter atmosphere"]


def test_review_theme_schema_forbids_copied_review_text():
    with pytest.raises(ValidationError):
        ReviewTheme.model_validate(
            {
                "theme": "handmade gyoza",
                "sentiment": "positive",
                "supporting_source_count": 2,
                "confidence": 0.8,
                "source_urls": ["https://a.example", "https://b.example"],
                "review_text": "verbatim review",
            }
        )


def test_practical_info_keeps_unknowns_and_equal_conflicts_become_unknown():
    first = CardEnrichment(
        practical_info=PracticalInfo(
            reservation=ReservationInfo(status="required", confidence=0.8),
            confidence=0.8,
            checked_at="2026-08-20T00:00:00+00:00",
        ),
        researched_at="2026-08-20T00:00:00+00:00",
    )
    second = CardEnrichment(
        practical_info=PracticalInfo(
            reservation=ReservationInfo(status="usually_not_needed", confidence=0.8),
            confidence=0.8,
            checked_at="2026-08-20T00:00:00+00:00",
        ),
        researched_at="2026-08-20T00:00:00+00:00",
    )
    assert merge_card_enrichment(first, second).practical_info.reservation.status == "unknown"
    assert PracticalInfo().seating.counter is None


def test_practical_notes_do_not_publish_clipped_fragments():
    info = PracticalInfo(
        other=[
            "Reservations are provisional until restaurant",
            "Telephone reservations are available.",
        ]
    )
    assert info.other == ["Telephone reservations are available."]


def test_hours_normalize_split_service_closed_days_and_display():
    hours = _hours()
    assert hours.monday.status == "closed"
    assert len(hours.tuesday.periods) == 2
    display = format_opening_hours(hours)
    assert display and "11:30" in display and "17:30" in display


def test_irregular_and_reservation_only_hours_have_deterministic_display():
    assert format_opening_hours(OpeningHours(tuesday=DayHours(status="irregular"))) == "Hours vary"
    assert format_opening_hours(OpeningHours(reservation_only=True)) == "Reservation only"


def test_irregular_hours_preserve_periods_and_ambiguous_last_order_becomes_unknown():
    hours = OpeningHours.model_validate(
        {
            "monday": {
                "status": "irregular",
                "periods": [
                    {
                        "open": "17:00",
                        "close": "23:00",
                        "last_order": "food 21:00; drinks 21:30",
                    }
                ],
            }
        }
    )
    assert hours.monday.status == "irregular"
    assert hours.monday.periods[0].last_order is None
    assert format_opening_hours(hours) == "Hours vary"


def test_newer_official_hours_supersede_older_directory_hours():
    older = CardEnrichment(
        opening_hours=_hours(source="restaurant_directory", checked="2026-01-01T00:00:00+00:00")
    )
    newer_hours = _hours(checked="2026-08-20T00:00:00+00:00")
    newer_hours.tuesday.periods[0].open = "12:00"
    merged = merge_card_enrichment(older, CardEnrichment(opening_hours=newer_hours))
    assert merged.opening_hours.tuesday.periods[0].open == "12:00"


def test_equal_strength_conflicting_hours_remain_uncertain():
    first = _hours()
    second = _hours()
    second.tuesday.periods[0].open = "12:00"
    merged = merge_card_enrichment(
        CardEnrichment(opening_hours=first), CardEnrichment(opening_hours=second)
    )
    assert merged.opening_hours.unresolved_conflicts
    assert merged.opening_hours.tuesday.status == "unknown"


def test_enrichment_is_excluded_from_scoring_input():
    structured = {
        "matched_restaurant": True,
        "card_enrichment": {"unresolved_conflicts": ["hours"]},
    }
    assert scoring_research_view(structured) == {"matched_restaurant": True}


def test_persistence_is_append_only_and_does_not_change_product_state(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        before = dict(
            connection.execute(
                """SELECT fiyu_score, local_discovery_score, is_published,
                          latitude, longitude, location_precision
                   FROM public_restaurants WHERE place_id='published'"""
            ).fetchone()
        )
        persist_card_enrichment(
            connection,
            place_id="published",
            incoming=_complete_enrichment(),
            provider="test",
            model=None,
            prompt_version="test-v1",
        )
        persist_card_enrichment(
            connection,
            place_id="published",
            incoming=_complete_enrichment(),
            provider="test",
            model=None,
            prompt_version="test-v2",
            phase="second",
        )
        connection.commit()
        after = dict(
            connection.execute(
                """SELECT fiyu_score, local_discovery_score, is_published,
                          latitude, longitude, location_precision
                   FROM public_restaurants WHERE place_id='published'"""
            ).fetchone()
        )
        runs = connection.execute(
            "SELECT count(*) FROM restaurant_card_enrichment_runs WHERE public_restaurant_id='published'"
        ).fetchone()[0]
    assert before == after
    assert runs == 2


def test_phase_a_backfill_is_published_only_zero_cost_and_idempotent(tmp_path):
    path = _db(tmp_path)
    first = backfill_card_enrichment(path, phase="local")
    second = backfill_card_enrichment(path, phase="local")
    assert first["published_restaurants_inspected"] == 1
    assert first["responses_requests"] == 0
    assert first["web_search_actions"] == 0
    assert first["enriched_from_existing_evidence"] == 1
    assert second["enriched_from_existing_evidence"] == 0
    with connect(path) as connection:
        assert connection.execute(
            "SELECT card_description FROM public_restaurants WHERE place_id='published'"
        ).fetchone()[0]
        assert (
            connection.execute(
                "SELECT card_description FROM public_restaurants WHERE place_id='hidden'"
            ).fetchone()[0]
            is None
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM fiyu_restaurant_seen WHERE owner_id='user-a'"
            ).fetchone()[0]
            == 1
        )


def test_phase_a_does_not_count_an_empty_timestamp_as_enrichment(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            "UPDATE public_restaurants SET description_en=NULL WHERE place_id='published'"
        )
        connection.execute(
            "UPDATE restaurant_research_runs SET structured_research_json='{}' "
            "WHERE public_restaurant_id='published'"
        )
        connection.commit()
    report = backfill_card_enrichment(path, phase="local")
    assert report["enriched_from_existing_evidence"] == 0
    with connect(path) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM restaurant_card_enrichment_runs "
                "WHERE public_restaurant_id='published'"
            ).fetchone()[0]
            == 0
        )


def test_already_complete_restaurant_is_skipped_by_paid_plan(tmp_path):
    path = _db(tmp_path)
    with connect(path) as connection:
        persist_card_enrichment(
            connection,
            place_id="published",
            incoming=_complete_enrichment(),
            provider="test",
            model=None,
            prompt_version="test-v1",
        )
        connection.commit()
    plan = backfill_card_enrichment(path, phase="research", dry_run=True)
    assert plan["maximum_responses_requests"] == 0


def test_paid_batch_limit_and_priority_order_are_deterministic(tmp_path):
    path = _db(tmp_path)
    _add_published(path, "missing-high", score=95, local_score=70)
    _add_published(path, "missing-local", score=90, local_score=95)
    _add_published(
        path,
        "described-top",
        score=99,
        local_score=99,
        card_description="Compact documented restaurant description.",
    )
    plan = backfill_card_enrichment(path, phase="research", dry_run=True, limit=2)
    assert plan["maximum_responses_requests"] == 2
    assert [item["place_id"] for item in plan["selected_candidates"]] == [
        "missing-high",
        "missing-local",
    ]
    assert plan["selected_candidates"][0]["missing_categories"] == [
        "card_description",
        "review_themes",
        "practical_info",
        "opening_hours",
    ]


def test_completed_batch_naturally_advances_to_next_candidate(tmp_path):
    path = _db(tmp_path)
    _add_published(path, "first", score=99, local_score=90)
    _add_published(path, "second", score=98, local_score=90)
    _add_published(path, "third", score=97, local_score=90)

    class Response:
        output_parsed = _complete_enrichment()
        id = "batch-response"
        model = "test-model"
        output = ()
        usage = None

    class Responses:
        def parse(self, **_kwargs):
            return Response()

    class Client:
        responses = Responses()

    first = backfill_card_enrichment(
        path, phase="research", limit=2, client=Client(), model="test-model"
    )
    first_ids = [item["place_id"] for item in first["selected_candidates"]]
    next_plan = backfill_card_enrichment(path, phase="research", limit=2, dry_run=True)
    next_ids = [item["place_id"] for item in next_plan["selected_candidates"]]
    assert set(first_ids).isdisjoint(next_ids)
    assert "third" in next_ids


def test_one_failed_restaurant_does_not_stop_paid_batch(tmp_path):
    path = _db(tmp_path)
    _add_published(path, "failure-a", score=99, local_score=90)
    _add_published(path, "success-b", score=98, local_score=90)

    class Response:
        output_parsed = _complete_enrichment()
        id = "success"
        model = "test-model"
        output = ()
        usage = None

    class Responses:
        calls = 0

        def parse(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                raise ValueError("known request failure")
            return Response()

    class Client:
        responses = Responses()

    result = backfill_card_enrichment(
        path, phase="research", limit=2, client=Client(), model="test-model"
    )
    assert [item["status"] for item in result["results"]] == ["failed", "complete"]
    assert result["responses_requests"] == 2
    assert result["successful_runs"] == 1
    assert result["failed_runs"] == 1


def test_ambiguous_paid_backfill_is_not_automatically_duplicated(tmp_path):
    path = _db(tmp_path)

    class Responses:
        def parse(self, **_kwargs):
            raise TimeoutError("ambiguous timeout")

    class Client:
        responses = Responses()

    result = backfill_card_enrichment(path, phase="research", client=Client(), limit=1)
    assert result["responses_requests"] == 1
    assert result["results"][0]["status"] == "needs_retry"
    retry_plan = backfill_card_enrichment(path, phase="research", dry_run=True)
    assert retry_plan["maximum_responses_requests"] == 0
    with connect(path) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM restaurant_card_enrichment_runs "
                "WHERE phase='phase_b_research'"
            ).fetchone()[0]
            == 1
        )
    preview = authorize_card_enrichment_retry(path, "published", dry_run=True)
    assert preview["new_status"] == "retry_authorized"
    assert (
        backfill_card_enrichment(path, phase="research", dry_run=True)["maximum_responses_requests"]
        == 0
    )
    authorize_card_enrichment_retry(path, "published")
    assert (
        backfill_card_enrichment(path, phase="research", dry_run=True)["maximum_responses_requests"]
        == 1
    )


def test_explicit_failed_paid_backfill_can_be_resumed_by_operator(tmp_path):
    path = _db(tmp_path)

    class Responses:
        def parse(self, **_kwargs):
            raise ValueError("request rejected before completion")

    class Client:
        responses = Responses()

    result = backfill_card_enrichment(path, phase="research", client=Client(), limit=1)
    assert result["results"][0]["status"] == "failed"
    assert (
        backfill_card_enrichment(path, phase="research", dry_run=True)["maximum_responses_requests"]
        == 0
    )
    retry_plan = backfill_card_enrichment(path, phase="research", dry_run=True, retry_failed=True)
    assert retry_plan["maximum_responses_requests"] == 1


def test_targeted_backfill_requests_missing_fields_once_and_preserves_score(tmp_path):
    path = _db(tmp_path)
    calls = []

    class Response:
        output_parsed = _complete_enrichment()
        id = "enrichment-response"
        model = "test-model"
        output = ()
        usage = None

    class Responses:
        def parse(self, **kwargs):
            calls.append(kwargs)
            return Response()

    class Client:
        responses = Responses()

    with connect(path) as connection:
        before_score = connection.execute(
            "SELECT fiyu_score FROM public_restaurants WHERE place_id='published'"
        ).fetchone()[0]
    result = backfill_card_enrichment(
        path, phase="research", client=Client(), model="test-model", limit=1
    )
    assert result["responses_requests"] == 1
    assert len(calls) == 1
    prompt = calls[0]["input"][1]["content"]
    assert "review_themes" in prompt and "opening_hours" in prompt
    assert (
        backfill_card_enrichment(path, phase="research", dry_run=True)["maximum_responses_requests"]
        == 0
    )
    with connect(path) as connection:
        after_score = connection.execute(
            "SELECT fiyu_score FROM public_restaurants WHERE place_id='published'"
        ).fetchone()[0]
    assert before_score == after_score


def test_completeness_requires_description_hours_and_one_useful_middle_layer():
    assert enrichment_completeness(_complete_enrichment())["complete_enough"] is True
    sparse = CardEnrichment(card_description="A small neighborhood sushi counter.")
    assert enrichment_completeness(sparse)["complete_enough"] is False
