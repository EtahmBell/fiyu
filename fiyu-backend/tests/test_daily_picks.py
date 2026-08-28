from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fiyu import api
from fiyu.daily_picks import (
    InsufficientUnseenPoolError,
    assign_daily_picks,
    get_active_daily_picks,
    get_recent_daily_pick_rounds,
    repair_active_daily_picks,
    reveal_active_daily_picks,
    seed_served_history,
    select_daily_pick_plan,
    served_place_ids,
)
from fiyu.database import SCHEMA, connect
from fiyu.public_catalog import ensure_public_schema

NOW = datetime(2026, 8, 21, 12, tzinfo=UTC)
LATITUDE = 35.658
LONGITUDE = 139.7016


def _insert(
    connection,
    place_id: str,
    *,
    distance_km: float = 1.0,
    precision: str = "exact",
    published: int = 1,
    map_eligible: int = 1,
    score: float = 70.0,
) -> None:
    connection.execute(
        """
        INSERT INTO public_restaurants (
            place_id, name_en, primary_category, food_tags_json,
            signature_dishes_json, discovery_area, discovery_areas_json,
            fiyu_score, local_discovery_score, is_published,
            map_display_eligible, latitude, longitude, map_location_precision,
            created_at, updated_at
        ) VALUES (?, ?, 'restaurant', '[]', '[]', 'Shibuya', '[]', ?, ?, ?, ?, ?, ?, ?, 'now', 'now')
        """,
        (
            place_id,
            place_id,
            score,
            100.0 - score,
            published,
            map_eligible,
            LATITUDE,
            LONGITUDE + distance_km / 90.0,
            precision,
        ),
    )


@pytest.fixture
def daily_picks_db(tmp_path, monkeypatch):
    path = tmp_path / "daily-picks.db"
    with connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()
    ensure_public_schema(path)
    with connect(path) as connection:
        for index in range(130):
            _insert(
                connection,
                f"place-{index:03}",
                distance_km=0.2 + (index % 12) * 0.1,
                precision=("chome" if index % 5 == 0 else "exact"),
                score=float(50 + index % 45),
            )
        _insert(connection, "unpublished", published=0)
        _insert(connection, "not-map-eligible", map_eligible=0)
        connection.commit()
    monkeypatch.setattr(api, "DB_PATH", path)
    return path


def _plan(path, **overrides):
    arguments = {
        "discovery_latitude": LATITUDE,
        "discovery_longitude": LONGITUDE,
        "active_area": "Shibuya",
        "saved_place_ids": set(),
        "served_history": {},
        "now": NOW,
        "requested_count": 3,
        "seed": 42,
    }
    arguments.update(overrides)
    with connect(path) as connection:
        return select_daily_pick_plan(connection, **arguments)


def test_complete_catalog_not_frontend_candidate_subset_drives_selection(daily_picks_db):
    response = TestClient(api.app).post(
        "/daily-picks/assign",
        headers={"X-Fiyu-Client-Id": str(uuid4())},
        json={
            "city_id": "tokyo",
            "candidate_place_ids": ["unpublished", "not-map-eligible"],
            "discovery_latitude": LATITUDE,
            "discovery_longitude": LONGITUDE,
            "active_area": "Shibuya",
            "seed": 42,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["place_ids"]) == 3
    assert all(place_id.startswith("place-") for place_id in body["place_ids"])
    assert [row["place_id"] for row in body["restaurants"]] == body["place_ids"]
    assert all("distance_km" not in row for row in body["restaurants"])


def test_saved_unpublished_and_map_ineligible_are_excluded(daily_picks_db):
    with connect(daily_picks_db) as connection:
        connection.execute(
            "UPDATE public_restaurants SET product_eligible = 0 WHERE place_id = 'place-129'"
        )
        connection.commit()
    selected, metadata = _plan(
        daily_picks_db,
        saved_place_ids={f"place-{index:03}" for index in range(119)},
    )
    assert set(selected) <= {f"place-{index:03}" for index in range(119, 129)}
    assert "place-129" not in selected
    assert "unpublished" not in selected and "not-map-eligible" not in selected
    assert metadata["saved_excluded_count"] == 119


def test_radius_expands_in_order_and_stops_at_first_ten_unseen(daily_picks_db):
    with connect(daily_picks_db) as connection:
        connection.execute("UPDATE public_restaurants SET is_published = 0")
        for index in range(9):
            _insert(connection, f"near-{index}", distance_km=1.0)
        for index in range(4):
            _insert(connection, f"mid-{index}", distance_km=2.6)
        connection.commit()
    _, metadata = _plan(daily_picks_db)
    assert metadata["final_radius_km"] == 3.0
    assert metadata["unseen_by_radius"] == [
        {"radius_km": 1.5, "unseen_count": 9},
        {"radius_km": 2.0, "unseen_count": 9},
        {"radius_km": 3.0, "unseen_count": 13},
    ]


@pytest.mark.parametrize(
    ("base_distance", "added_distance", "expected_radius"),
    [(2.8, 4.2, 5.0), (4.8, 7.0, 8.0)],
)
def test_radius_expands_to_five_and_eight(
    daily_picks_db, base_distance, added_distance, expected_radius
):
    with connect(daily_picks_db) as connection:
        connection.execute("UPDATE public_restaurants SET is_published = 0")
        for index in range(9):
            _insert(connection, f"base-{index}", distance_km=base_distance)
        for index in range(2):
            _insert(connection, f"added-{index}", distance_km=added_distance)
        connection.commit()
    _, metadata = _plan(daily_picks_db)
    assert metadata["final_radius_km"] == expected_radius
    assert [stage["radius_km"] for stage in metadata["unseen_by_radius"]] == [
        radius for radius in (1.5, 2.0, 3.0, 5.0, 8.0) if radius <= expected_radius
    ]


def test_dense_area_stops_at_tighter_first_stage(daily_picks_db):
    with connect(daily_picks_db) as connection:
        connection.execute("UPDATE public_restaurants SET is_published = 0")
        for index in range(10):
            _insert(connection, f"dense-{index}", distance_km=1.4, precision="exact")
        _insert(connection, "farther", distance_km=1.8, precision="exact")
        connection.commit()

    selected, metadata = _plan(daily_picks_db)

    assert metadata["initial_radius_km"] == 1.5
    assert metadata["final_radius_km"] == 1.5
    assert metadata["unseen_by_radius"] == [{"radius_km": 1.5, "unseen_count": 10}]
    assert "farther" not in selected


def test_chome_uncertainty_allowance_applies_at_tighter_first_stage(daily_picks_db):
    with connect(daily_picks_db) as connection:
        connection.execute("UPDATE public_restaurants SET is_published = 0")
        for index in range(10):
            _insert(connection, f"chome-near-{index}", distance_km=2.2, precision="chome")
        connection.commit()

    _, metadata = _plan(daily_picks_db)

    assert metadata["final_radius_km"] == 1.5
    assert metadata["unseen_by_radius"] == [{"radius_km": 1.5, "unseen_count": 10}]


def test_recent_seen_never_repeat_and_old_seen_only_fill_at_max_radius(daily_picks_db):
    all_ids = {f"place-{index:03}" for index in range(130)}
    unseen = {"place-000", "place-001"}
    recent = {"place-002", "place-003"}
    history = {
        place_id: NOW - (timedelta(days=1) if place_id in recent else timedelta(days=8))
        for place_id in all_ids - unseen
    }
    selected, metadata = _plan(daily_picks_db, served_history=history)
    assert unseen <= set(selected)
    assert set(selected).isdisjoint(recent)
    assert metadata["final_radius_km"] == 8.0
    assert metadata["repeat_selected_count"] == 1


def test_no_old_repeat_means_no_partial_round(daily_picks_db):
    saved = {f"place-{index:03}" for index in range(2, 130)}
    with pytest.raises(InsufficientUnseenPoolError):
        _plan(daily_picks_db, saved_place_ids=saved)


def test_exactly_three_unseen_returns_three_without_repeat(daily_picks_db):
    saved = {f"place-{index:03}" for index in range(3, 130)}
    selected, metadata = _plan(daily_picks_db, saved_place_ids=saved)
    assert set(selected) == {"place-000", "place-001", "place-002"}
    assert metadata["repeat_selected_count"] == 0


def test_precision_allowances_and_area_fallback_are_conservative(daily_picks_db):
    with connect(daily_picks_db) as connection:
        connection.execute("UPDATE public_restaurants SET is_published = 0")
        for index in range(10):
            _insert(connection, f"chome-{index}", distance_km=2.5, precision="chome")
        _insert(connection, "far-neighborhood", distance_km=4.2, precision="neighborhood")
        _insert(connection, "area-compatible", distance_km=20, precision="ward")
        connection.commit()
    selected, metadata = _plan(daily_picks_db)
    assert metadata["final_radius_km"] == 2.0
    assert set(selected) <= {f"chome-{index}" for index in range(10)}
    assert "far-neighborhood" not in selected and "area-compatible" not in selected


def test_random_seed_is_reproducible_and_score_signals_do_not_rank(daily_picks_db):
    first, _ = _plan(daily_picks_db, seed=7)
    with connect(daily_picks_db) as connection:
        connection.execute(
            """
            UPDATE public_restaurants
            SET fiyu_score = 100 - fiyu_score,
                local_discovery_score = fiyu_score,
                primary_category = CASE place_id WHEN 'place-000' THEN 'sushi' ELSE 'same' END,
                food_tags_json = '[\"same\"]'
            """
        )
        connection.commit()
    second, _ = _plan(daily_picks_db, seed=7)
    third, _ = _plan(daily_picks_db, seed=8)
    assert first == second
    assert first != third
    assert first != tuple(sorted(first))


def test_active_snapshot_is_reused_and_history_is_atomic(daily_picks_db):
    owner = str(uuid4())
    first = assign_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        discovery_latitude=LATITUDE,
        discovery_longitude=LONGITUDE,
        active_area="Shibuya",
        now=NOW,
        seed=1,
    )
    second = assign_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        discovery_latitude=LATITUDE,
        discovery_longitude=LONGITUDE,
        active_area="Shibuya",
        now=NOW + timedelta(hours=1),
        seed=99,
    )
    assert second == first
    assert get_active_daily_picks(daily_picks_db, owner_id=owner, city_id="tokyo", now=NOW) == first
    assert served_place_ids(daily_picks_db, owner_id=owner) == set(first.place_ids)


def test_reveal_state_is_idempotent_and_persists_with_the_active_round(daily_picks_db):
    owner = str(uuid4())
    assignment = assign_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        discovery_latitude=LATITUDE,
        discovery_longitude=LONGITUDE,
        active_area="Shibuya",
        now=NOW,
        seed=1,
    )
    revealed_at = (NOW + timedelta(minutes=2)).isoformat()

    first = reveal_active_daily_picks(
        daily_picks_db,
        owner_id=owner,
        round_id=assignment.round_id,
        revealed_at=revealed_at,
        now=NOW + timedelta(minutes=2),
    )
    repeated = reveal_active_daily_picks(
        daily_picks_db,
        owner_id=owner,
        round_id=assignment.round_id,
        revealed_at=(NOW + timedelta(minutes=5)).isoformat(),
        now=NOW + timedelta(minutes=5),
    )
    restored = get_active_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        now=NOW + timedelta(hours=1),
    )

    assert first == repeated == revealed_at
    assert restored is not None
    assert restored.place_ids == assignment.place_ids
    assert restored.revealed_at == revealed_at


def test_reveal_cannot_cross_accounts_or_mark_an_expired_round(daily_picks_db):
    owner = str(uuid4())
    assignment = assign_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        discovery_latitude=LATITUDE,
        discovery_longitude=LONGITUDE,
        active_area="Shibuya",
        now=NOW,
        seed=1,
    )

    assert reveal_active_daily_picks(
        daily_picks_db,
        owner_id=str(uuid4()),
        round_id=assignment.round_id,
        revealed_at=NOW.isoformat(),
        now=NOW,
    ) is None


def test_complete_expired_round_remains_recent_for_72_hours_without_interactions(
    daily_picks_db,
):
    owner = str(uuid4())
    assignment = assign_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        discovery_latitude=LATITUDE,
        discovery_longitude=LONGITUDE,
        active_area="Shibuya",
        now=NOW,
        seed=1,
    )

    recent = get_recent_daily_pick_rounds(
        daily_picks_db, owner_id=owner, city_id="tokyo", now=NOW + timedelta(hours=25)
    )
    expired = get_recent_daily_pick_rounds(
        daily_picks_db, owner_id=owner, city_id="tokyo", now=NOW + timedelta(hours=72)
    )

    assert recent == [assignment]
    assert len(recent[0].place_ids) == 3
    assert expired == []
    assert served_place_ids(daily_picks_db, owner_id=owner) == set(assignment.place_ids)


def test_concurrent_assignment_creates_one_snapshot(daily_picks_db):
    owner = str(uuid4())

    def assign():
        return assign_daily_picks(
            daily_picks_db,
            owner_id=owner,
            city_id="tokyo",
            discovery_latitude=LATITUDE,
            discovery_longitude=LONGITUDE,
            active_area="Shibuya",
            now=NOW,
            seed=4,
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        assignments = list(pool.map(lambda _: assign(), range(2)))
    assert assignments[0] == assignments[1]
    with connect(daily_picks_db) as connection:
        assert connection.execute("SELECT count(*) AS n FROM daily_pick_rounds").fetchone()["n"] == 1


def test_local_active_snapshot_repair_is_persisted_and_concurrent_safe(daily_picks_db):
    owner = str(uuid4())
    original = assign_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        discovery_latitude=LATITUDE,
        discovery_longitude=LONGITUDE,
        active_area="Shibuya",
        now=NOW,
        seed=1,
    )
    removed = set(original.place_ids[1:])
    with connect(daily_picks_db) as connection:
        connection.executemany(
            "UPDATE public_restaurants SET product_eligible = 0 WHERE place_id = ?",
            ((place_id,) for place_id in removed),
        )
        connection.commit()

    def repair():
        return repair_active_daily_picks(
            daily_picks_db,
            owner_id=owner,
            city_id="tokyo",
            discovery_latitude=LATITUDE,
            discovery_longitude=LONGITUDE,
            active_area="Shibuya",
            now=NOW + timedelta(hours=1),
            seed=7,
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        repaired = list(pool.map(lambda _: repair(), range(2)))

    assert repaired[0] == repaired[1]
    assert repaired[0] is not None
    assert repaired[0].round_id == original.round_id
    assert repaired[0].place_ids[0] == original.place_ids[0]
    assert len(repaired[0].place_ids) == 3
    assert set(repaired[0].place_ids).isdisjoint(removed)
    assert get_active_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        now=NOW + timedelta(hours=2),
    ) == repaired[0]
    assert set(original.place_ids).issubset(served_place_ids(daily_picks_db, owner_id=owner))
    recent = get_recent_daily_pick_rounds(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        now=NOW + timedelta(hours=25),
    )
    assert recent[0].place_ids == repaired[0].place_ids
    assert set(recent[0].place_ids).isdisjoint(removed)


def test_local_active_snapshot_repair_persists_empty_when_inventory_is_exhausted(
    daily_picks_db,
):
    owner = str(uuid4())
    original = assign_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        discovery_latitude=LATITUDE,
        discovery_longitude=LONGITUDE,
        active_area="Shibuya",
        now=NOW,
        seed=1,
    )
    with connect(daily_picks_db) as connection:
        connection.execute("UPDATE public_restaurants SET product_eligible = 0")
        connection.commit()

    repaired = repair_active_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        discovery_latitude=LATITUDE,
        discovery_longitude=LONGITUDE,
        active_area="Shibuya",
        now=NOW + timedelta(hours=1),
        seed=7,
    )

    assert repaired is not None
    assert repaired.round_id == original.round_id
    assert repaired.place_ids == ()
    assert get_active_daily_picks(
        daily_picks_db,
        owner_id=owner,
        city_id="tokyo",
        now=NOW + timedelta(hours=2),
    ) == repaired
    assert set(original.place_ids).issubset(served_place_ids(daily_picks_db, owner_id=owner))


def test_legacy_history_seed_is_unique(daily_picks_db):
    owner = str(uuid4())
    assert seed_served_history(daily_picks_db, owner_id=owner, place_ids=["place-000", "place-000"]) == 1
    assert seed_served_history(daily_picks_db, owner_id=owner, place_ids=["place-000"]) == 0
