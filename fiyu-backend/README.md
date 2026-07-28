# Fiyu backend MVP

A working Python backend for combining Apify restaurant exports, cleaning and deduplicating them, calculating a transparent **internal/provisional Fiyu candidate score**, exporting a reviewable CSV, and serving nearby candidates through a FastAPI API.

## What this version does

- Reads `.csv`, `.tsv`, `.json`, `.jsonl`, `.ndjson`, and `.xlsx` exports.
- Recursively combines all supported files in a directory.
- Maps the very wide Apify schema to a small normalized restaurant record.
- Deduplicates by `placeId`, then `cid`/`fid`, then a conservative fallback key.
- Removes closed listings, advertisements, invalid rows, and obvious non-food results.
- Detects likely chains using known chain terms, repeated exact names, and repeated website domains.
- Preserves the original rule as `matches_simple_rule`:
  - no website;
  - rating at least 4.2;
  - no more than 100 reviews;
  - not a likely chain.
- Adds continuous scoring so borderline records are not discarded.
- Writes a clean CSV and SQLite database.
- Serves nearby candidates through an API.

## Important product boundary

`internal_fiyu_score` is a **candidate-generation score**, not a verified public quality or localness rating. It is designed to help Fiyu decide which restaurants deserve independent evaluation.

## Score components

The default score is:

```text
45% Bayesian-adjusted quality
30% review underexposure relative to area/category peers
10% limited digital footprint
10% evidence confidence
 5% independent-business likelihood
minus penalties for tiny samples, low ratings, or chain likelihood
```

The weights and thresholds are configurable in `scoring.example.json` or with CLI flags.

## Setup in VS Code

### Windows PowerShell

```powershell
cd path\to\fiyu-backend
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e ".[dev]"
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
```

### macOS/Linux

```bash
cd path/to/fiyu-backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e '.[dev]'
```

On Windows, edit `.vscode/settings.json` if necessary and change:

```json
"python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python"
```

to:

```json
"python.defaultInterpreterPath": "${workspaceFolder}\\.venv\\Scripts\\python.exe"
```

Do the same for the Python command in `.vscode/tasks.json`, or simply run the commands below in the VS Code terminal.

## Put your Apify exports in the project

Copy all 12 datasets into:

```text
data/raw/
```

The filenames can identify the area, such as:

```text
shinjuku.csv
shibuya.csv
setagaya.xlsx
```

When `searchString` is missing, the filename becomes the fallback area name.

## Run ingestion

```bash
python -m fiyu.cli ingest data/raw \
  --db data/fiyu.db \
  --csv-out data/processed/restaurants_scored.csv
```

PowerShell equivalent:

```powershell
python -m fiyu.cli ingest data/raw --db data/fiyu.db --csv-out data/processed/restaurants_scored.csv
```

The output summary reports raw rows, duplicates, excluded rows, candidate count, and simple-rule count.

### Flexible thresholds

```bash
python -m fiyu.cli ingest data/raw \
  --db data/fiyu.db \
  --csv-out data/processed/restaurants_scored.csv \
  --target-rating 4.2 \
  --minimum-rating 3.9 \
  --soft-review-cap 100 \
  --minimum-review-count 5 \
  --maximum-review-count 500 \
  --minimum-candidate-score 55
```

Or edit a JSON file:

```bash
python -m fiyu.cli ingest data/raw --config scoring.example.json
```

## Run the included demo

```bash
python -m fiyu.cli demo
```

## Start the backend

```bash
uvicorn fiyu.api:app --reload --port 8000
```

Open:

```text
http://127.0.0.1:8000/docs
```

### Useful endpoints

```text
GET /health
GET /stats
GET /areas
GET /restaurants/candidates?min_score=60&limit=50
GET /restaurants/candidates?area=Shinjuku%20City&simple_rule_only=true
GET /restaurants/nearby?lat=35.6895&lng=139.6917&radius_km=3&limit=20
GET /restaurants/nearby?lat=35.6895&lng=139.6917&category=ramen
GET /public/restaurants?limit=100
GET /public/restaurants/{place_id}
GET /public/location-anchors
GET /public/restaurants/{place_id}/photo-preview
GET /public/restaurants/{place_id}/photos?limit=5
```

The `/public/restaurants` endpoints return only manually published rows and only
frontend-safe fields. `fiyu_score` is an editorial/research score, not a community rating.
Google ratings, review counts, prices, opening hours, and other operational details are not
part of the public contract.

### Public catalog workflow

```text
scraped data
→ internal candidate score
→ Responses API structured research
→ deterministic public Fiyu score
→ manual publication
→ independently verified map location
```

Research and score recalculation leave rows unpublished. Review and explicitly change
publication status with:

```bash
python -m fiyu.public_cli --db PATH review --limit 20
python -m fiyu.public_cli --db PATH publish --place-id PLACE_ID
python -m fiyu.public_cli --db PATH unpublish --place-id PLACE_ID
```

### Restaurant content language

The backend owns restaurant-content localization. `name_ja` preserves the official Japanese
restaurant name; `name_en` is a natural English name or readable Hepburn-style romanization; and
`why_fiyu` is concise, natural English explaining why the exact restaurant fits Fiyu. The frontend
must display this API content as supplied and must not translate restaurant content itself.

Localize completed stored research in batches with:

```bash
python -m fiyu.public_cli --db PATH localize-content --limit 20
python -m fiyu.public_cli --db PATH localize-content --place-id PLACE_ID --dry-run
python -m fiyu.public_cli --db PATH localize-content --limit 20 --force
```

By default, the command selects completed rows with missing `name_en` or a `why_fiyu` value that is
not clearly English. It uses only stored `name_ja`, `name_en`, and `why_fiyu`; it does not rerun web
search or Google Places. `food_tags` and `signature_dishes` are preserved verbatim and are never
translated merely for localization. Localization also preserves evidence, scores, confidence,
research status, and publication status.

### Independent discovery-map locations

Coordinates from the original scraped exports have no row-level provider provenance and are not
eligible for Fiyu's independent SVG map. They remain internal for candidate research. Public map
coordinates are stored separately and returned only when `map_display_eligible` is true after an
independent source or manual verification is imported.

Export published restaurants into a review worksheet. Scraped coordinates appear only in the
`existing_*` columns and are labeled `UNTRUSTED_REFERENCE_ONLY`; verified coordinate fields remain
blank until a reviewer fills them from independent evidence.

```bash
python -m fiyu.public_cli --db PATH export-location-review \
  --output data/location_review.csv --limit 20
```

Every approved row requires `verified_latitude`, `verified_longitude`, `verification_source`,
`verification_source_reference`, `verified_at`, `location_precision` (`exact` or `approximate`),
and reviewer notes when independently confirming a coordinate identical to the untrusted reference.
Google, scraped, and unknown sources or references are rejected.

Validate the entire worksheet and print per-row results without writing:

```bash
python -m fiyu.public_cli --db PATH import-verified-locations \
  --input data/location_review.csv --dry-run
```

After review, import the same validated file:

```bash
python -m fiyu.public_cli --db PATH import-verified-locations \
  --input data/location_review.csv
```

The import is atomic: any duplicate, swapped coordinate, Tokyo-region violation, missing independent
source evidence, invalid date, or precision error prevents every write. It updates only verified
location fields, eligibility, and `updated_at`; scores, descriptions, evidence, research state, and
publication state are preserved.

Inspect progress with:

```bash
python -m fiyu.public_cli --db PATH location-status
```

`src/fiyu/location_anchors.json` is a review-required anchor template. Coordinates are intentionally
blank rather than invented. A reviewed anchor requires coordinates, independent `source`,
`source_reference`, `verified_at`, an approximate qualifier, and `reviewed: true`. Only complete,
valid reviewed entries are exposed by `GET /public/location-anchors`. The endpoint accepts no user
location, and Fiyu does not store a user's current location for this feature.

### Phase 1: local OpenStreetMap resolution

Fiyu resolves only published restaurants against a user-supplied local Kantō OpenStreetMap extract.
Obtain a current `.osm.pbf` from an OSM extract provider such as Geofabrik, review its terms and
coverage, and keep it outside version control. Fiyu does not download extracts automatically and
does not call public Nominatim.

Install the project dependencies before indexing. The `osmium` Python package streams nodes, ways,
and multipolygon relations and uses disk-backed node-location storage; the application never loads
the full PBF into its own object list.

Build a separate, replace-safe index:

```bash
python -m fiyu.public_cli build-osm-index \
  --pbf PATH_TO_KANTO_OSM_PBF \
  --output data/osm_kanto_locations.sqlite
```

The index contains only food-service and station objects, compact matching tags, representative
points, OSM version/timestamp provenance, and the OSM attribution identifier. Polygon and
multipolygon POIs use a centroid representative point rather than an arbitrary vertex. The builder
writes a temporary SQLite file and atomically replaces the destination only after success.

The builder treats Pyosmium tag keys and values as Unicode Python strings and performs no codec
repair or Latin-1/UTF-8 round-trip. It reports counts for Japanese text, Unicode replacement
characters, and likely mojibake. Replacement characters always fail the build. A likely-mojibake
rate above the conservative default of `0.001` (one object per thousand) also fails; isolated
suspicious source objects below that rate are quarantined with a prominent warning. The threshold
is configurable with `--max-suspicious-rate`, and report detail is capped with
`--diagnostic-detail-limit` (default 50). These are index-integrity controls, not resolver matching
thresholds.

Every build writes `OUTPUT_STEM.encoding-report.json` with UTF-8 object-level diagnostics: the raw
tag value, code points, matched heuristic, alternate names, Japanese-text status, and any
diagnostic-only Latin-1/cp1252 interpretation. Diagnostic interpretations never rewrite source
data. The report also records counts, percentage, quarantine count, and whether the build
succeeded, warned, or failed. A corrupted index must be rebuilt from the original PBF; records are
never repaired heuristically.

Indexes built before this validation was added—including `C:\data\osm\fiyu-kanto-index.sqlite`—must
not be reused. Rebuild them from the original `.osm.pbf`; do not attempt in-place text repair.

Resolve published restaurants without writing first:

```bash
python -m fiyu.public_cli --db PATH resolve-osm-locations \
  --osm-index data/osm_kanto_locations.sqlite \
  --limit 50 --dry-run \
  --output-report data/osm_resolution_report.json
```

After inspecting the report, persist conservative exact matches and the ambiguous review queue:

```bash
python -m fiyu.public_cli --db PATH resolve-osm-locations \
  --osm-index data/osm_kanto_locations.sqlite --limit 50
```

Optional resolver controls include `--place-id`, `--force`, `--no-published-only`, `--threshold`,
and `--runner-up-margin`. Existing Google-derived or unknown coordinates and addresses are never
used as hints. Fuzzy, generic, branch-ambiguous, multi-candidate, neighborhood-conflicting, or
out-of-Tokyo results remain map-ineligible.

`--output-report` must end in `.json` or `.csv`. JSON is written as readable UTF-8 with Japanese
characters unescaped; `.csv` produces actual UTF-8 CSV rather than JSON with a misleading extension.

Export ambiguous OSM candidates:

```bash
python -m fiyu.public_cli --db PATH export-location-review \
  --output data/osm_location_review.csv \
  --status needs_manual_review --limit 100
```

Set one decision (`approve`, `reject`, or `unresolved`) per restaurant, then validate and import:

```bash
python -m fiyu.public_cli --db PATH import-location-review \
  --input data/osm_location_review.csv --dry-run

python -m fiyu.public_cli --db PATH import-location-review \
  --input data/osm_location_review.csv
```

Candidate identity, OSM provenance, coordinates, and restaurant identity fields are immutable in
the review CSV. Imports are atomic and preserve publication, Fiyu scores, research evidence,
descriptions, tags, dishes, and photo-related data.

Create unreviewed area-anchor proposals from exact station names:

```bash
python -m fiyu.public_cli resolve-osm-anchors \
  --osm-index data/osm_kanto_locations.sqlite \
  --anchors src/fiyu/location_anchors.json \
  --output data/location_anchor_review.json
```

Exact station matches are proposals only. A human must validate them, add the verification date,
and set `reviewed: true`. Only valid reviewed anchors reach the public API.

Inspect resolution state with:

```bash
python -m fiyu.public_cli --db PATH location-status
```

Public map attribution is available from `GET /public/map-config` and currently reads
`Map data © OpenStreetMap contributors`. This is product configuration, not legal advice; OSM type,
ID, version, timestamp, and source references are retained for attribution and reproducibility.

`fiyu.address_geocoder.AddressGeocoder` is the provider-neutral extension point for a future local
Digital Agency ABR Geocoder adapter. It accepts only independently verified Japanese addresses and
can return normalized address, coordinates, address identifiers, precision, warnings, and
provenance. Phase 1 implements no Google geocoding and no network geocoder.

### Discovery-area provenance

The original `*_Initial.csv` search batches provide discovery provenance, not verified restaurant
locations. Their Google-derived addresses and coordinates are never imported or used by the OSM
resolver. The reviewed source mapping lives in `src/fiyu/discovery_area_sources.json`; filename
semantics are not inferred in application code. Ogibashi is explicitly reviewed as a neighborhood
rather than silently treated as a ward.

Audit the source files and write a machine-readable report:

```bash
python -m fiyu.public_cli audit-discovery-areas \
  --source-dir data \
  --public-csv data/processed/public_restaurants.csv \
  --report data/processed/discovery_area_audit.json
```

Generate a new enriched file without overwriting the existing public export:

```bash
python -m fiyu.public_cli enrich-discovery-areas \
  --source-dir data \
  --input data/processed/public_restaurants.csv \
  --output data/processed/public_restaurants_enriched.csv \
  --report data/processed/discovery_area_generation_report.json
```

Preview and then apply the provenance-only database import:

```bash
python -m fiyu.public_cli --db data/fiyu.db import-discovery-areas \
  --input data/processed/public_restaurants_enriched.csv --dry-run \
  --report data/processed/discovery_area_import_preview.json

python -m fiyu.public_cli --db data/fiyu.db import-discovery-areas \
  --input data/processed/public_restaurants_enriched.csv \
  --report data/processed/discovery_area_import_report.json
```

The import matches only by `place_id` and updates only discovery provenance plus `updated_at`.
Publication, research, scores, evidence, descriptions, tags, dishes, verified OSM provenance,
coordinates, and map eligibility are preserved. Multiple source occurrences remain in
`discovery_areas_json`; no first area is silently selected.

The OSM resolver uses reviewed wards as corroborating geography, and can use independently reviewed
area anchors within `--anchor-radius-km`. Unanchored neighborhoods are only weak hints. Geography
alone cannot verify a restaurant, fuzzy-name-only candidates remain unresolved, conflicts block
automatic verification, and matching thresholds are unchanged. Existing map-eligible locations are
never rewritten by resolver reruns, including when `--force` is supplied.

The resolver uses both `addr:*` tags and point-in-polygon inference against Tokyo's 23 special-ward
administrative relations. The index stores boundary OSM IDs, versions, bounding boxes, and complete
polygon/multipolygon geometry in `osm_ward_boundaries`. Builds must find all 23 wards or they fail
atomically. Indexes created before ward-boundary support must therefore be rebuilt:

```bash
python -m fiyu.public_cli build-osm-index \
  --pbf C:\data\osm\kanto-260726.osm.pbf \
  --output C:\data\osm\fiyu-kanto-index.sqlite
```

Resolver reports distinguish exact, strong normalized, and weak fuzzy identity evidence. Multiple
discovery wards are permitted search hints and are reported with `multiple_discovery_areas`; they
are not conflicts by themselves. A true conflict requires an explicit reason such as malformed or
contradictory reviewed provenance. Weak fuzzy matches never become reviewable solely because their
coordinates fall inside an expected ward. Reports preserve address-tag and spatial ward inference,
boundary provenance, conflicts, best in-area and global diagnostic candidates, aggregate candidate
classes, a final resolution reason, and a recommended next action.

`likely_not_represented_in_osm` is a conservative routing category, not a claim that a restaurant
is absent from OSM. It requires a complete ward-boundary index, no exact or strong candidate in an
allowed ward, no exact adjacent-ward candidate, and only weak fuzzy candidates remaining.

### Google Place Photos

Google Places is retained only for photos during the MVP. Photo endpoints fetch fresh resource
metadata and media URLs on demand using the server-side `GOOGLE_PLACES_SERVER_KEY`; resource names
and media URLs are never stored. Responses preserve image dimensions, author attribution,
`googleMapsUri`, and available content-reporting links. Restaurant-list queries never trigger photo
requests.

Google photos must be displayed separately from the custom SVG map with required Google Maps and
author attribution. Directions, transit, live hours, phone data, ratings, and review counts are left
to outbound map applications; Fiyu calls no Directions API and exposes no map API key.

### Community-data integrity

Editorial Fiyu scores and future community recommendations are separate. Community totals and rates
are derived only from stored, unique user responses in `community_recommendations`; there is no
public aggregate-seeding endpoint. Visibility defaults off, and the rate remains `null` until the
response count reaches `FIYU_COMMUNITY_MINIMUM_RESPONSES` (default `5`). Zero responses are therefore
not presented as a negative rating, and community data never changes `fiyu_score`.

### Backend environment

Local frontend origins default to `http://localhost:3000` and
`http://127.0.0.1:3000`. Override them with a comma-separated value:

```text
FIYU_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

`GOOGLE_PLACES_SERVER_KEY` is backend-only and must never be sent to the frontend.
Do not commit `.env` files, SQLite databases, scraped datasets, or API keys.

## Run tests

```bash
pytest
```

## Clean output columns

The generated CSV includes the restaurant identity and core source fields, plus:

- `adjusted_rating`
- `quality_score`
- `underexposure_score`
- `digital_footprint_score`
- `confidence_score`
- `independent_score`
- `score_penalty`
- `internal_fiyu_score`
- `candidate_tier`
- `confidence_band`
- `matches_simple_rule`
- `candidate_eligible`
- `score_reasons`

## Recommended next product steps

1. Run ingestion on the 12 exports.
2. Sort `restaurants_scored.csv` by `internal_fiyu_score`.
3. Spot-check the top 100 across all areas.
4. Record only obvious failure labels: `credible`, `uncertain`, `not_hidden`, `chain`, `closed`, `wrong_category`.
5. Tune thresholds in `scoring.example.json`.
6. Connect a simple frontend to `/restaurants/nearby`.
7. Keep the internal score separate from any future independently evaluated public Fiyu Score.
