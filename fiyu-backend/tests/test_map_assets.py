"""Tests for the discovery-map asset generator.

Everything here exercises the pure geometry stage -- clipping, stitching,
simplification, quantisation and serialisation. That is deliberately the whole
surface: the PBF-reading stage is a thin pyosmium loop, while the parts that could
silently corrupt the map or break determinism are all pure functions, and those
are testable without a 480 MB fixture.
"""

from __future__ import annotations

import json
from pathlib import Path

from fiyu.map_assets import (
    ATTRIBUTION,
    COORD_DECIMALS,
    EAST,
    NORTH,
    SOUTH,
    WEST,
    Feature,
    RawWay,
    bbox_extent,
    polyline_length,
    quantise,
    simplify,
    split_to_extent,
    stitch_ways,
    write_layer,
    write_line_layer,
)


# ---------------------------------------------------------------------------
# Extent clipping
# ---------------------------------------------------------------------------


def test_split_to_extent_keeps_a_line_fully_inside():
    line = [(35.68, 139.70), (35.69, 139.71), (35.70, 139.72)]
    assert split_to_extent(line) == [line]


def test_split_to_extent_drops_a_line_fully_outside():
    # Osaka: nowhere near the Tokyo extent.
    assert split_to_extent([(34.69, 135.50), (34.70, 135.51)]) == []


def test_split_to_extent_keeps_one_point_beyond_the_edge():
    """A road must visibly leave the frame rather than stop short of it."""
    line = [(35.68, 139.20), (35.68, 139.40), (35.68, 139.70)]
    runs = split_to_extent(line)
    assert len(runs) == 1
    # The outside point immediately before entry is retained.
    assert runs[0][0] == (35.68, 139.40)


def test_split_to_extent_splits_a_line_that_leaves_and_returns():
    line = [
        (35.68, 139.70),  # inside
        (35.68, 139.20),  # far outside
        (35.68, 139.10),  # far outside
        (35.68, 139.75),  # inside again
    ]
    assert len(split_to_extent(line)) == 2


def test_extent_matches_the_frontend_projection():
    """These must stay in step with TOKYO_BOUNDS in projection.ts."""
    assert (WEST, EAST, SOUTH, NORTH) == (139.56, 139.92, 35.52, 35.82)


# ---------------------------------------------------------------------------
# Simplification
# ---------------------------------------------------------------------------


def test_simplify_removes_a_collinear_point():
    line = [(35.60, 139.70), (35.65, 139.75), (35.70, 139.80)]
    assert simplify(line, 0.0001) == [(35.60, 139.70), (35.70, 139.80)]


def test_simplify_keeps_a_real_corner():
    line = [(35.60, 139.70), (35.70, 139.70), (35.70, 139.80)]
    assert len(simplify(line, 0.0001)) == 3


def test_simplify_always_keeps_the_endpoints():
    line = [(35.60 + i * 0.001, 139.70) for i in range(20)]
    result = simplify(line, 0.01)
    assert result[0] == line[0]
    assert result[-1] == line[-1]


def test_simplify_is_a_noop_for_two_points():
    line = [(35.60, 139.70), (35.70, 139.80)]
    assert simplify(line, 0.5) == line


def test_simplify_handles_a_long_line_without_recursing():
    """A coastline must not blow the stack; the implementation is iterative."""
    line = [(35.52 + i * 0.00001, 139.56 + i * 0.00002) for i in range(50_000)]
    assert len(simplify(line, 0.0001)) >= 2


def test_simplify_is_deterministic():
    line = [(35.60 + (i % 7) * 0.002, 139.70 + i * 0.001) for i in range(200)]
    assert simplify(line, 0.0005) == simplify(line, 0.0005)


def test_simplify_tolerance_is_monotonic():
    line = [(35.60 + (i % 5) * 0.001, 139.70 + i * 0.0008) for i in range(150)]
    coarse = simplify(line, 0.002)
    fine = simplify(line, 0.0001)
    assert len(coarse) <= len(fine) <= len(line)


# ---------------------------------------------------------------------------
# Stitching
# ---------------------------------------------------------------------------


def _way(osm_id: int, refs: tuple[int, ...], points: tuple[tuple[float, float], ...]) -> RawWay:
    return RawWay(osm_id=osm_id, node_refs=refs, points=points)


def test_stitch_joins_two_fragments_sharing_an_endpoint():
    a = _way(1, (10, 11), ((35.68, 139.70), (35.68, 139.71)))
    b = _way(2, (11, 12), ((35.68, 139.71), (35.68, 139.72)))
    chains = stitch_ways([a, b])

    assert len(chains) == 1
    # Direction is not canonicalised -- a stroked polyline renders the same either
    # way -- so compare as an undirected path.
    assert chains[0] in (
        [(35.68, 139.70), (35.68, 139.71), (35.68, 139.72)],
        [(35.68, 139.72), (35.68, 139.71), (35.68, 139.70)],
    )


def test_stitch_reverses_a_fragment_when_needed():
    a = _way(1, (10, 11), ((35.68, 139.70), (35.68, 139.71)))
    # Same shared node 11, but this way is digitised in the other direction.
    b = _way(2, (12, 11), ((35.68, 139.72), (35.68, 139.71)))
    chains = stitch_ways([a, b])

    assert len(chains) == 1
    assert len(chains[0]) == 3
    # The shared point appears once, in the middle, whichever way round it runs.
    assert chains[0][1] == (35.68, 139.71)
    assert set(chains[0][::2]) == {(35.68, 139.70), (35.68, 139.72)}


def test_stitch_leaves_disconnected_fragments_apart():
    a = _way(1, (10, 11), ((35.68, 139.70), (35.68, 139.71)))
    b = _way(2, (20, 21), ((35.70, 139.80), (35.70, 139.81)))
    assert len(stitch_ways([a, b])) == 2


def test_stitch_never_makes_an_arbitrary_choice_at_a_junction():
    """Three ways meeting at one node has no single continuation.

    The first chain to reach the junction therefore stops there. The remaining two
    are then each other's only option, so they do join -- which is why this yields
    two chains rather than three. That is deterministic and loses nothing, which is
    what actually matters; the exact grouping is an implementation detail.
    """
    a = _way(1, (10, 11), ((35.68, 139.70), (35.68, 139.71)))
    b = _way(2, (11, 12), ((35.68, 139.71), (35.68, 139.72)))
    c = _way(3, (11, 13), ((35.68, 139.71), (35.69, 139.71)))
    chains = stitch_ways([a, b, c])

    # Every distinct position survives somewhere in the output.
    positions = {point for chain in chains for point in chain}
    assert positions == {
        (35.68, 139.70),
        (35.68, 139.71),
        (35.68, 139.72),
        (35.69, 139.71),
    }
    # And every way contributed: 3 ways of 2 points, sharing one node twice.
    assert sum(len(chain) for chain in chains) == 5


def test_stitch_never_loses_a_way():
    ways = [
        _way(i, (i, i + 1), ((35.68, 139.70 + i * 0.001), (35.68, 139.70 + (i + 1) * 0.001)))
        for i in range(1, 30)
    ]
    chains = stitch_ways(ways)
    # A single unbroken chain of 29 segments is 30 points.
    assert sum(len(chain) for chain in chains) == 30


def test_stitch_is_independent_of_input_order():
    ways = [
        _way(1, (10, 11), ((35.68, 139.70), (35.68, 139.71))),
        _way(2, (11, 12), ((35.68, 139.71), (35.68, 139.72))),
        _way(3, (12, 13), ((35.68, 139.72), (35.68, 139.73))),
    ]
    assert stitch_ways(ways) == stitch_ways(list(reversed(ways)))


def test_stitch_ignores_a_degenerate_way():
    assert stitch_ways([_way(1, (10,), ((35.68, 139.70),))]) == []


# ---------------------------------------------------------------------------
# Quantisation and measurement
# ---------------------------------------------------------------------------


def test_quantise_rounds_to_the_documented_precision():
    assert quantise([(35.123456789, 139.987654321)]) == [[35.12346, 139.98765]]


def test_quantise_collapses_duplicate_points():
    # Two positions 1 cm apart become one point at 5 decimals.
    assert len(quantise([(35.680001, 139.70), (35.680002, 139.70)])) == 1


def test_quantise_keeps_distinct_points():
    assert len(quantise([(35.68, 139.70), (35.69, 139.70)])) == 2


def test_coordinate_precision_is_finer_than_a_viewbox_unit():
    """5 decimals is ~1.1 m; one viewBox unit is ~28 m. Rounding is invisible."""
    assert COORD_DECIMALS == 5


def test_polyline_length_and_bbox_extent_are_positive():
    line = [(35.60, 139.70), (35.70, 139.80)]
    assert polyline_length(line) > 0
    assert bbox_extent(line) > 0


def test_bbox_extent_is_zero_for_a_single_point():
    assert bbox_extent([(35.68, 139.70)]) == 0.0


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def test_write_line_layer_is_compact_and_attributed(tmp_path: Path):
    path, size = write_line_layer(tmp_path, "roads_major", [[[35.68, 139.70], [35.69, 139.71]]])
    document = json.loads(path.read_text(encoding="utf-8"))

    assert document["layer"] == "roads_major"
    assert document["attribution"] == ATTRIBUTION
    assert "openstreetmap.org" in document["source"]
    assert document["count"] == 1
    # Geometry-only layers carry no per-feature ids or tags.
    assert "features" not in document
    assert document["lines"] == [[[35.68, 139.7], [35.69, 139.71]]]
    assert size > 0


def test_write_line_layer_has_no_insignificant_whitespace(tmp_path: Path):
    """Compact separators, checked on the geometry rather than the whole file.

    The attribution string legitimately contains ", " ("contributors, ODbL 1.0"),
    so a naive whole-file check would fail on correct output.
    """
    path, _ = write_line_layer(tmp_path, "x", [[[35.68, 139.70], [35.69, 139.71]]])
    text = path.read_text(encoding="utf-8")
    geometry = text[text.index('"lines"') :]

    assert ", " not in geometry
    assert ": " not in geometry
    assert "\n" not in geometry.rstrip("\n")


def test_write_layer_keeps_tags_for_named_features(tmp_path: Path):
    feature = Feature("node", 42, [[35.68, 139.70]], {"name": "東京"})
    path, _ = write_layer(tmp_path, "stations", [feature])
    document = json.loads(path.read_text(encoding="utf-8"))

    assert document["features"][0]["tags"] == {"name": "東京"}
    assert document["features"][0]["id"] == "n42"


def test_write_layer_preserves_japanese_names_unescaped(tmp_path: Path):
    path, _ = write_layer(tmp_path, "stations", [Feature("node", 1, [[35.6, 139.7]], {"name": "新宿"})])
    # ensure_ascii=False, so the file is readable and smaller.
    assert "新宿" in path.read_text(encoding="utf-8")


def test_write_layer_sorts_features_by_osm_id(tmp_path: Path):
    features = [
        Feature("node", 30, [[35.6, 139.7]]),
        Feature("node", 10, [[35.6, 139.7]]),
        Feature("node", 20, [[35.6, 139.7]]),
    ]
    path, _ = write_layer(tmp_path, "stations", features)
    document = json.loads(path.read_text(encoding="utf-8"))
    assert [f["id"] for f in document["features"]] == ["n10", "n20", "n30"]


def test_output_is_byte_identical_for_identical_input(tmp_path: Path):
    """The determinism guarantee, at the layer where it could actually break.

    Feature order is sorted, line order is sorted by the caller, simplification is
    pure, and nothing consults the clock or a random source -- so the same input
    must serialise to the same bytes.
    """
    lines = [[[35.68, 139.70], [35.69, 139.71]], [[35.60, 139.60], [35.61, 139.61]]]

    first = tmp_path / "a"
    second = tmp_path / "b"
    first.mkdir()
    second.mkdir()

    path_a, size_a = write_line_layer(first, "roads_major", lines)
    path_b, size_b = write_line_layer(second, "roads_major", lines)

    assert path_a.read_bytes() == path_b.read_bytes()
    assert size_a == size_b
