from fiyu.columns import raw_record_from_row


def test_apify_column_mapping():
    row = {
        "placeId": "abc",
        "title": "店",
        "location/lat": "35.1",
        "location/lng": "139.2",
        "totalScore": "4.4",
        "reviewsCount": "88",
        "categoryName": "Japanese restaurant",
        "categories/0": "Restaurant",
        # Apify commonly stores the query rather than the area here.
        "searchString": "restaurant",
    }

    value = raw_record_from_row(row, "Shinjuku_City.csv")

    assert value["place_id"] == "abc"
    assert value["rating"] == 4.4
    assert value["review_count"] == 88
    assert value["search_area"] == "Shinjuku City"
