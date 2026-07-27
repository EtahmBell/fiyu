import pytest

from fiyu import google_places


def test_photo_metadata_and_attribution_are_preserved_without_live_network(monkeypatch):
    monkeypatch.setattr(
        google_places,
        "fetch_photo_metadata",
        lambda *args, **kwargs: {
            "googleMapsUri": "https://maps.google.com/place",
            "photos": [{
                "name": "places/p1/photos/photo-1",
                "widthPx": 1600,
                "heightPx": 900,
                "flagContentUri": "https://google.example/flag-photo",
                "authorAttributions": [{
                    "displayName": "Author",
                    "uri": "https://author.example",
                    "photoUri": "https://author.example/photo",
                    "flagContentUri": "https://author.example/flag",
                }],
            }],
        },
    )
    seen = []

    def media(resource_name, **kwargs):
        seen.append(resource_name)
        return "https://photos.example/fresh"

    monkeypatch.setattr(google_places, "fetch_photo_media", media)
    photos = google_places.get_place_photos("p1", limit=1)
    assert seen == ["places/p1/photos/photo-1"]
    assert photos[0]["width"] == 1600
    assert photos[0]["height"] == 900
    assert photos[0]["author_attributions"][0]["display_name"] == "Author"
    assert photos[0]["google_maps_uri"] == "https://maps.google.com/place"
    assert photos[0]["flag_content_uri"] == "https://google.example/flag-photo"
    assert "resource_name" not in photos[0]


def test_missing_and_malformed_photos_are_controlled(monkeypatch):
    monkeypatch.setattr(
        google_places, "fetch_photo_metadata", lambda *args, **kwargs: {}
    )
    with pytest.raises(google_places.GooglePlacesNoPhotosError):
        google_places.get_place_photos("p1", limit=1)

    with pytest.raises(google_places.GooglePlacesProviderError):
        google_places.normalize_photo_metadata({"photos": "bad"})
