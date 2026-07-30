# Generated map geography — do not edit by hand

Every `.json` file in this directory is machine-generated from an OpenStreetMap
extract. Hand-edits will be silently destroyed the next time the generator runs.

Hand-authored map data lives elsewhere, on purpose:

| File | Contents |
| --- | --- |
| `src/lib/map/basemap.ts` | The stylised Tokyo Bay fill and the ward label positions |
| `src/lib/map/landmarks.ts` | Landmark selection and glyphs, station prominence tiers, park labels |

## Regenerating

Requires the Kanto extract and the backend's `osmium` dependency. Takes several
minutes: it is three streaming passes over a 480 MB file.

```bash
cd fiyu-backend
python -m fiyu.cli export-map-assets \
  --pbf C:/data/osm/kanto-latest.osm.pbf \
  --out ../fiyu-frontend/src/lib/map/generated
```

Both flags have those values as defaults, so `python -m fiyu.cli
export-map-assets` alone is equivalent when run from `fiyu-backend/`.

The command reads only the PBF. It does not open the database, does not touch
restaurant data, and writes nothing outside `--out`.

## What each layer is, and where it comes from

| File | OSM selector | Rendered as |
| --- | --- | --- |
| `roads_major.json` | `highway=motorway\|trunk\|primary` | Arterial road network, all zooms |
| `roads_secondary.json` | `highway=secondary` | Secondary roads, detail level 2+ |
| `rail_surface.json` | `railway=rail`, excluding yards/sidings/disused | Dashed rail corridors, all zooms |
| `rail_subway.json` | `railway=subway`, same exclusions | Fine dashed lines, detail level 2+ |
| `waterways.json` | `waterway=river\|canal` | Sumida and the canal network |
| `water.json` | `natural=water\|bay`, `waterway=riverbank\|dock`, `landuse=reservoir` | Water fills |
| `parks.json` | `leisure=park\|garden` | Green space fills |
| `wards.json` | `boundary=administrative` + `admin_level=7` | Ward outlines |
| `stations.json` | `railway=station` nodes with a name | Station rings and labels |

Geometry-only layers (roads, rail, waterways) are written as bare `lines` arrays
with no ids or tags — nothing in the map addresses an individual road segment, and
for a layer of hundreds of chains that metadata cost more than the coordinates it
labelled. Layers whose features are addressable by name (`stations`, `parks`,
`wards`) keep `features` with ids and tags.

## Attribution

Every file carries `attribution` and `source` fields. The credit is rendered in
the map legend via `OSM_ATTRIBUTION` in `src/lib/map/geography.ts`.

> Map data © OpenStreetMap contributors, ODbL 1.0

This is a licence obligation, not a courtesy. Do not remove it from the UI.

## Processing applied

1. **Clip** to the Fiyu map extent (139.56–139.92 E, 35.52–35.82 N) with a small
   pad so features cross the frame edge cleanly rather than stopping short.
2. **Stitch** way fragments that share an endpoint *node id*. OSM splits a road at
   every junction, so this is what turns hundreds of 2-point fragments into whole
   corridors — and it is what makes step 3 effective.
3. **Simplify** with Ramer–Douglas–Peucker, per-layer tolerance.
4. **Quantise** to 5 decimal places (~1.1 m, well under one viewBox unit ≈ 28 m).

Determinism: features are sorted by OSM id, lines are sorted lexicographically,
simplification and stitching are pure functions, and nothing consults the clock or
a random source. The same PBF produces byte-identical output.

## Guarantees

- No Google map tiles, Google-derived coordinates, or Google geometry.
- No runtime network requests for base-map data; the browser never parses a PBF.
- No fabricated roads, stations or shorelines. The one drawn-by-hand shape is the
  Tokyo Bay fill in `basemap.ts`, which is labelled as stylised because OSM models
  the open bay as coastline rather than as a closed polygon.
