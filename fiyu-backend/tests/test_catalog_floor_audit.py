from scripts.audit_catalog_floor import deterministic_sample, in_band, percentile, stats


def test_floor_band_boundaries_are_half_open() -> None:
    assert in_band(68.0, 68.0, 70.0)
    assert in_band(69.99, 68.0, 70.0)
    assert not in_band(70.0, 68.0, 70.0)


def test_percentiles_and_statistics_are_deterministic() -> None:
    values = [1, 2, 3, 4, 5]
    assert percentile(values, 0.5) == 3
    result = stats(values, include_stddev=True)
    assert result["median"] == 3
    assert result["mean"] == 3
    assert result["stddev"] == 1.41


def test_deterministic_sample_spans_ordered_range() -> None:
    rows = [{"score": float(index), "place_id": str(index)} for index in range(30)]
    selected = deterministic_sample(rows, 5)
    assert [row["score"] for row in selected] == [0.0, 7.0, 14.0, 22.0, 29.0]
