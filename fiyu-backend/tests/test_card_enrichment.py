import json

import pytest
from pydantic import ValidationError

from fiyu.card_enrichment import (
    CardEnrichment,
    ContactInfo,
    DayHours,
    EnrichmentSource,
    HoursPeriod,
    OpeningHours,
    PracticalInfo,
    ReservationInfo,
    ReviewTheme,
    authorize_card_enrichment_retry,
    backfill_canonical_details,
    backfill_card_enrichment,
    compact_card_description,
    compact_existing_enrichment,
    enrichment_completeness,
    format_opening_hours,
    merge_card_enrichment,
    normalize_candidate_budget,
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


@pytest.mark.parametrize(
    ("raw", "minimum", "maximum", "band"),
    [
        ("¥1–1,000", 0, 1_000, "budget"),
        ("¥1,000–2,000", 1_000, 2_000, "budget"),
        ("¥3,000–6,000", 3_000, 6_000, "upscale"),
        ("¥10,000+", 10_000, None, "splurge"),
    ],
)
def test_normalize_candidate_budget(raw, minimum, maximum, band):
    budget = normalize_candidate_budget(raw)
    assert budget is not None
    assert (budget.minimum, budget.maximum, budget.band) == (minimum, maximum, band)
    assert budget.currency == "JPY"
    assert budget.source_value == raw


def test_ambiguous_budget_stays_unknown_and_contact_requires_provenance():
    assert normalize_candidate_budget("about two thousand yen") is None
    with pytest.raises(ValidationError):
        ContactInfo(phone_number="03-1234-5678")


@pytest.mark.parametrize(
    "contact",
    [
        {
            "booking_methods": ["in_person"],
            "phone_number": "03-1234-5678",
            "booking_url": None,
            "contact_note": "Ask at the restaurant about reservations.",
            "confidence": 0.8,
            "sources": [],
            "checked_at": "2026-08-25T00:00:00+00:00",
        },
        {
            "booking_methods": ["reservation_platform"],
            "phone_number": None,
            "booking_url": "https://reserve.example/yorimichi",
            "contact_note": None,
            "confidence": 0.7,
            "sources": [],
            "checked_at": None,
        },
    ],
)
def test_unsupported_contact_failure_shapes_do_not_discard_valid_enrichment(contact):
    payload = _complete_enrichment().model_dump(mode="json")
    payload["contact"] = contact

    enrichment = CardEnrichment.model_validate(payload)

    assert enrichment.contact == ContactInfo()
    assert enrichment.card_description == payload["card_description"]
    assert len(enrichment.review_themes) == 1
    assert enrichment.practical_info.reservation.status == "recommended"
    assert enrichment.opening_hours.tuesday.status == "open"


def test_malformed_contact_fields_are_dropped_individually():
    payload = _complete_enrichment().model_dump(mode="json")
    payload["contact"] = {
        "booking_methods": ["phone", "unsupported_method"],
        "phone_number": "not a phone number",
        "booking_url": "https://reserve.example/restaurant",
        "contact_note": "Use the official reservation page.",
        "confidence": 0.9,
        "sources": [
            {
                "url": "https://reserve.example/restaurant",
                "source_type": "reservation_platform",
                "checked_at": "2026-08-25T00:00:00+00:00",
            }
        ],
        "checked_at": "2026-08-25T00:00:00+00:00",
    }

    contact = CardEnrichment.model_validate(payload).contact

    assert contact.phone_number is None
    assert contact.booking_methods == ["phone"]
    assert contact.booking_url == "https://reserve.example/restaurant"
    assert contact.contact_note == "Use the official reservation page."


def test_valid_supported_contact_is_preserved_unchanged():
    payload = _complete_enrichment().model_dump(mode="json")
    payload["contact"] = {
        "booking_methods": ["phone", "reservation_platform"],
        "phone_number": "03-1234-5678",
        "booking_url": "https://reserve.example/restaurant",
        "contact_note": "Same-day reservations may be limited.",
        "confidence": 0.9,
        "sources": [
            {
                "url": "https://reserve.example/restaurant",
                "source_type": "reservation_platform",
                "checked_at": "2026-08-25T00:00:00+00:00",
            }
        ],
        "checked_at": "2026-08-25T00:00:00+00:00",
    }

    contact = CardEnrichment.model_validate(payload).contact

    assert contact.model_dump(mode="json") == payload["contact"]


def test_empty_optional_researched_budget_does_not_discard_valid_enrichment():
    payload = _complete_enrichment().model_dump(mode="json")
    payload["budget"] = {
        "currency": "JPY",
        "minimum": None,
        "maximum": None,
        "band": "budget",
        "source_value": None,
        "source_type": "researched_source",
        "confidence": 0.7,
        "sources": [],
        "checked_at": "2026-08-24T00:00:00Z",
    }

    enrichment = CardEnrichment.model_validate(payload)

    assert enrichment.budget is None
    assert enrichment.card_description == payload["card_description"]
    assert len(enrichment.review_themes) == 1
    assert enrichment.practical_info.reservation.status == "recommended"
    assert enrichment.opening_hours.tuesday.status == "open"


def test_malformed_optional_budget_is_discarded_without_weakening_core_validation():
    payload = _complete_enrichment().model_dump(mode="json")
    payload["budget"] = {
        "currency": "JPY",
        "minimum": 5000,
        "maximum": 1000,
        "band": "moderate",
        "source_value": "invalid range",
        "source_type": "researched_source",
        "confidence": 0.7,
        "sources": [],
        "checked_at": "2026-08-24T00:00:00Z",
    }
    assert CardEnrichment.model_validate(payload).budget is None

    payload["card_description"] = "An amazing hidden gem you must visit!"
    with pytest.raises(ValidationError, match="promotional"):
        CardEnrichment.model_validate(payload)


def test_valid_optional_budget_is_preserved_with_provenance():
    payload = _complete_enrichment().model_dump(mode="json")
    payload["budget"] = {
        "currency": "JPY",
        "minimum": 4000,
        "maximum": 4999,
        "band": "moderate",
        "source_value": "¥4,000–¥4,999",
        "source_type": "researched_source",
        "confidence": 0.86,
        "sources": [
            {
                "url": "https://example.com/budget",
                "source_type": "restaurant_directory",
                "checked_at": "2026-08-24T00:00:00Z",
            }
        ],
        "checked_at": "2026-08-24T00:00:00Z",
    }

    budget = CardEnrichment.model_validate(payload).budget
    assert budget is not None
    assert (budget.minimum, budget.maximum) == (4000, 4999)
    assert budget.sources[0].url == "https://example.com/budget"


def test_karaoke_bar_ao_malformed_close_only_discards_affected_days():
    payload = _complete_enrichment().model_dump(mode="json")
    malformed_period = {
        "open": "18:00",
        "close": "last",
        "label": "late_night",
        "last_order": None,
    }
    payload["opening_hours"]["friday"] = {
        "status": "open",
        "periods": [malformed_period],
    }
    payload["opening_hours"]["saturday"] = {
        "status": "open",
        "periods": [malformed_period],
    }

    enrichment = CardEnrichment.model_validate(payload)

    assert enrichment.opening_hours.friday == DayHours()
    assert enrichment.opening_hours.saturday == DayHours()
    assert enrichment.opening_hours.tuesday.status == "open"
    assert enrichment.card_description == payload["card_description"]
    assert len(enrichment.review_themes) == 1
    assert enrichment.practical_info.reservation.status == "recommended"


def test_veganic_monkey_magic_open_days_without_periods_become_unknown():
    payload = _complete_enrichment().model_dump(mode="json")
    for day in ("thursday", "friday", "saturday"):
        payload["opening_hours"][day] = {"status": "open", "periods": []}

    enrichment = CardEnrichment.model_validate(payload)

    for day in ("thursday", "friday", "saturday"):
        assert getattr(enrichment.opening_hours, day) == DayHours()
    assert enrichment.opening_hours.tuesday.status == "open"
    assert enrichment.card_description == payload["card_description"]
    assert len(enrichment.review_themes) == 1
    assert enrichment.practical_info.reservation.status == "recommended"


def test_unusable_optional_hours_block_does_not_discard_core_enrichment():
    payload = _complete_enrichment().model_dump(mode="json")
    payload["opening_hours"] = {"unsupported_schedule_shape": "daily except holidays"}

    enrichment = CardEnrichment.model_validate(payload)

    assert enrichment.opening_hours == OpeningHours()
    assert enrichment.card_description == payload["card_description"]
    assert len(enrichment.review_themes) == 1
    assert enrichment.practical_info.reservation.status == "recommended"


def test_valid_hours_and_valid_periods_survive_optional_hours_sanitization():
    payload = _complete_enrichment().model_dump(mode="json")
    payload["opening_hours"]["friday"]["periods"].append(
        {"open": "22:00", "close": "26:00", "label": "late_night", "last_order": "25:30"}
    )

    enrichment = CardEnrichment.model_validate(payload)

    assert enrichment.opening_hours.friday.status == "open"
    assert len(enrichment.opening_hours.friday.periods) == 3
    assert enrichment.opening_hours.friday.periods[-1].close == "26:00"


@pytest.mark.parametrize(
    "schedule_note",
    [
        "The official site lists Thursday through Saturday, but an older directory hasら",
        "Last entry is listed as 13:00はl",
    ],
)
def test_malformed_mixed_script_schedule_note_is_dropped(schedule_note):
    hours = OpeningHours(reservation_only=True, schedule_note=schedule_note)

    assert hours.schedule_note is None
    assert hours.reservation_only is True


def test_valid_english_and_japanese_optional_notes_are_preserved():
    english = "Friday hours vary during public holidays."
    japanese = "営業時間は不定休です。鮨さいとうの案内をご確認ください。"

    assert OpeningHours(schedule_note=english).schedule_note == english
    assert OpeningHours(schedule_note=japanese).schedule_note == japanese
    assert (
        ContactInfo(contact_note="Book 鮨さいとう through its official reservation page.", sources=[_source()]).contact_note
        == "Book 鮨さいとう through its official reservation page."
    )


def test_malformed_optional_note_does_not_invalidate_enrichment():
    payload = _complete_enrichment().model_dump(mode="json")
    payload["contact"] = {
        "booking_methods": [],
        "phone_number": None,
        "booking_url": None,
        "contact_note": "The official booking page hasら",
        "confidence": 0.8,
        "sources": [],
        "checked_at": "2026-08-24T00:00:00Z",
    }

    enrichment = CardEnrichment.model_validate(payload)

    assert enrichment.contact.contact_note is None
    assert enrichment.card_description == payload["card_description"]
    assert len(enrichment.review_themes) == 1
    assert enrichment.opening_hours.tuesday.status == "open"


def test_compact_existing_enrichment_omits_defaults_and_round_trips_meaningful_values():
    enrichment = _complete_enrichment()
    enrichment.practical_info.seating.counter = False
    enrichment.unresolved_conflicts = ["Published schedules disagree."]

    compact = compact_existing_enrichment(enrichment)

    assert "budget" not in compact
    assert "contact" not in compact
    assert "researched_at" in compact
    assert "unknown" not in json.dumps(compact)
    assert compact["practical_info"]["seating"]["counter"] is False
    assert CardEnrichment.model_validate(compact) == enrichment


def test_compact_existing_enrichment_reduces_description_only_payload():
    enrichment = CardEnrichment(card_description="A small neighborhood restaurant.")

    full = enrichment.model_dump(mode="json")
    compact = compact_existing_enrichment(enrichment)

    assert compact == {"card_description": "A small neighborhood restaurant."}
    assert len(json.dumps(compact)) < len(json.dumps(full)) / 10


def test_local_canonical_backfill_normalizes_budget_but_does_not_promote_candidate_contact(
    tmp_path,
):
    path = _db(tmp_path)
    with connect(path) as connection:
        connection.execute(
            """UPDATE restaurants SET price='¥2,000–3,000', phone='03-1234-5678',
                      website='https://candidate.example/reserve'
               WHERE place_id='published'"""
        )
        connection.execute(
            """UPDATE public_restaurants SET practical_info_json=?
               WHERE place_id='published'""",
            (json.dumps({"reservation": {"status": "walk_ins_ok", "confidence": 0.9}}),),
        )
        connection.commit()

    report = backfill_canonical_details(path)
    assert report["normalized_budget"] == 1
    assert report["candidate_phone_not_promoted"] == 1
    assert report["candidate_website_not_promoted"] == 1
    with connect(path) as connection:
        row = connection.execute(
            """SELECT reservation_status, phone_number, booking_url, budget_json,
                      budget_source_value FROM public_restaurants WHERE place_id='published'"""
        ).fetchone()
    assert row["reservation_status"] == "walk_ins_ok"
    assert row["phone_number"] is None
    assert row["booking_url"] is None
    assert json.loads(row["budget_json"])["band"] == "moderate"
    assert row["budget_source_value"] == "¥2,000–3,000"
    assert backfill_canonical_details(path, dry_run=True)["changed"] == 0


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
