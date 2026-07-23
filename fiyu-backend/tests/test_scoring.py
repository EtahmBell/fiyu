from fiyu.config import ScoringConfig
from fiyu.normalize import add_chain_features
from fiyu.scoring import score_records


def make_record(title: str, rating: float, reviews: int, website=None, area="A"):
    return {
        "title": title,
        "rating": rating,
        "review_count": reviews,
        "website": website,
        "search_area": area,
        "broad_category": "restaurant",
        "categories": ["Restaurant"],
        "address": "Tokyo",
        "latitude": 35.0,
        "longitude": 139.0,
        "maps_url": "https://maps.example",
        "image_url": None,
        "phone": None,
    }


def test_simple_rule_is_preserved():
    records = [
        make_record("Hidden", 4.5, 60),
        make_record("Popular", 4.7, 900, "https://popular.example"),
    ]
    add_chain_features(records, 4, 3)
    score_records(records, ScoringConfig())
    assert records[0]["matches_simple_rule"] is True
    assert records[1]["matches_simple_rule"] is False


def test_tiny_review_count_gets_penalty():
    records = [
        make_record("Tiny", 4.9, 3),
        make_record("Supported", 4.5, 60),
    ]
    add_chain_features(records, 4, 3)
    score_records(records, ScoringConfig())
    assert records[0]["score_penalty"] > records[1]["score_penalty"]
    assert records[0]["confidence_band"] == "very_low"


def test_score_stays_in_range():
    records = [make_record(f"Place {index}", 4.2 + index / 100, 20 + index) for index in range(20)]
    add_chain_features(records, 4, 3)
    score_records(records, ScoringConfig())
    assert all(0 <= record["internal_fiyu_score"] <= 100 for record in records)
