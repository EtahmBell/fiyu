from fiyu.normalize import add_chain_features, clean_and_dedupe


def record(place_id, title, reviews=10, category="Restaurant"):
    return {
        "place_id": place_id,
        "cid": None,
        "fid": None,
        "title": title,
        "rating": 4.3,
        "review_count": reviews,
        "category": category,
        "categories": [category],
        "permanently_closed": False,
        "temporarily_closed": False,
        "is_advertisement": False,
        "search_area": "A",
        "source_file": "a.csv",
        "scraped_at": None,
    }


def test_dedupe_uses_place_id_and_keeps_max_review_count():
    rows = [record("p1", "A", 10), record("p1", "A", 15)]
    cleaned, stats = clean_and_dedupe(rows)
    assert len(cleaned) == 1
    assert cleaned[0]["review_count"] == 15
    assert stats.duplicate_rows == 1


def test_chain_detection_by_repeated_domain():
    rows = [record(f"p{index}", f"Branch {index}") for index in range(3)]
    for item in rows:
        item["website"] = "https://chain.example/location"
    add_chain_features(rows, title_threshold=4, domain_threshold=3)
    assert all(item["chain_flag"] for item in rows)
