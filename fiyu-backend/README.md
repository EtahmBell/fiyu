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

### Account and Contact configuration

Supabase Auth provides email/password identity; Fiyu does not store passwords
or mint its own auth tokens. Authenticated profiles, Lists/saves, Log visits and
seen-restaurant history are stored in Supabase Postgres under the stable Auth
user UUID. The restaurant catalog and anonymous-owner data remain in SQLite.

Copy `.env.example` to `.env` and set `SUPABASE_URL` and
`SUPABASE_ANON_KEY` to the same project configured by the web client. Also set
`SUPABASE_SERVICE_ROLE_KEY` on the backend only. The service-role key must never
be placed in a `NEXT_PUBLIC_*` variable or mobile/web client bundle.

Apply the checked-in shared-data migration to the linked Supabase project:

```powershell
supabase db push
```

Then run the additive local SQLite schema setup used by the catalog and
anonymous flow:

```powershell
python -m fiyu.cli demo
```

An Expo client can later authenticate with the same Supabase project and send
its access token to this API, producing the same stable Supabase user UUID.
The API verifies that bearer token first and scopes every shared-data operation
to the derived UUID; it never accepts a user ID from a request body or query.

Authenticated profile photos use the public-read Supabase Storage bucket
`avatars`. Browser writes use the signed-in Supabase session and are restricted
by Storage policies to `<auth user UUID>/avatar.webp`; the profile stores the
versioned public URL in `fiyu_user_profiles.avatar_url`. The bucket and policies
are created by the checked-in migrations applied through `supabase db push`.

Profile provisioning is idempotent. A database trigger creates a profile for
new `auth.users` rows, the provisioning migration backfills existing Auth users,
and authenticated profile reads/saves ensure the row exists before continuing.
The backend intentionally does not fall back to local SQLite when
`SUPABASE_SERVICE_ROLE_KEY` is missing; authenticated profile requests return a
configuration error instead of appearing to save data outside Supabase.

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

`fiyu.address_geocoder.AddressGeocoder` is the provider-neutral extension point for local address
providers. The MVP provider reads a replace-safe local OpenStreetMap address index; the optional
Digital Agency ABR adapter remains available but is not required. Neither provider falls back to
Google geocoding or a network geocoder.

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

### Independent web-address fallback

Fiyu resolves locations in stages: exact independent OSM evidence first, public web-address
evidence second, independent address geocoding third, and a documented manual tail last. Address
research answers whether a street address belongs to the exact restaurant. Geocoding answers only
which coordinates correspond to an already verified Japanese address. Neither operation changes
the deterministic Fiyu score.

The backend uses the OpenAI Responses API built-in `web_search` tool only from explicit research
commands. List and detail API requests never initiate paid calls. The existing full restaurant
research request now returns editorial/scoring evidence and a separate optional `address_evidence`
object in one structured response. Acceptable combined evidence is persisted through the same
deterministic validator as standalone discovery, so no second address request is needed. Missing,
weak, conflicting, or branch-ambiguous combined evidence remains eligible for a later standalone
fallback after OSM classifies the restaurant as `likely_not_represented_in_osm`.

Address sources are classified by an explicit host/source policy registry:

- Strong: official restaurant sites, demonstrably restaurant-controlled social or reservation
  pages, direct restaurant confirmation, government/open-data listings, and attributed company
  press releases. A PR TIMES page is recorded as an attributed third-party-hosted press release;
  it is not mislabeled as restaurant-controlled submission evidence.
- Secondary: permitted booking platforms or business directories, established local editorial
  sources, and independent Japanese blogs. Under the optimistic MVP policy, one matching secondary
  source can support a provisional address.
- Lead only: snippets, reposts, unattributed aggregators, weak user-generated content, and unknown
  sources. Google Maps, Tabelog, and Instagram web-search references are retained as leads but do
  not independently verify an address.

A source title containing the restaurant name is not sufficient. Tabelog, Google/Maps, Instagram,
and other restricted platforms are forcibly reclassified as lead-only after model parsing, so a
model-proposed label cannot bypass policy.

Automatic acceptance keeps the identity, branch, and discovery-area hard blockers, but uses an
optimistic MVP source policy. Strong evidence can be `verified`; exact identity plus a matching
secondary source or two agreeing weak sources is `provisional_high`; probable identity or a sole
qualifying lead-only source is `provisional_medium`. All provisional decisions are labeled and
retain their reasons. Prefecture, municipality/ward,
neighborhood, and street/block conflicts are material and block verification. Building, floor,
suite/unit, room, and entrance-description conflicts are non-material for a discovery-map pin:
they are retained internally, prevent `full_address_verified`, and are never presented as confirmed.
When the core agrees, `core_address_verified=true` and `verified_core_address` contains only the
agreed components. Original source strings remain unchanged in address evidence.

Deterministic comparison applies Unicode NFKC, canonical ASCII/Japanese hyphens, optional-space
removal, and equivalent Japanese `丁目`/`番`/`番地`/`号` notation. Thus `1-13`, `1丁目13`, and
`１丁目１３` compare as one street/block value, while genuinely different numbers remain a material
conflict. Floor comparison likewise treats `1階` as `1F` and `地下1階` as `B1F`. These forms are
comparison keys only; the stored source display text is never rewritten.

Every source address and conflicting candidate also carries `address_temporality`: `current`,
`historical`, `future`, or `unknown`. Only explicit wording such as `旧住所`, `移転前`,
`以前の住所`, an address followed by `から移転`, `現住所`, or `移転先` changes that classification.
Different addresses alone never imply history. Historical and future addresses remain in the
internal provenance report but are excluded from active component conflicts. Navigation labels and
move-explanation sentences are removed from parsed building/floor fields while remaining available
in `address_text_as_displayed`.

Location precision uses `exact_entrance`, `building`, `parcel_or_street_number`, `block`,
`neighborhood`, `ward`, or `unknown`. Entrance/building/parcel results can be map eligible. Accepted
block results can be eligible with `map_location_approximate=true`. Neighborhood and ward results
do not automatically qualify. Research alone never sets coordinates or `map_display_eligible`.

Schema changes are additive. Initialize or migrate once before using a paid dry run:

```powershell
python -m fiyu.public_cli --db data\fiyu.db init
```

The OSM resolver persists `location_resolution_reason` when run without `--dry-run`. Standalone
address selection includes only published, map-ineligible rows whose persisted reason is
`likely_not_represented_in_osm`. It excludes ambiguous exact-name candidates, OSM manual-review
rows, verified locations, unpublished rows, and already accepted addresses. For the first backfill
from a database created before reason persistence, pass the already-reviewed detailed resolver JSON
with `--resolution-report`; it supplies reasons read-only and does not import or approve any OSM row.

Plan one restaurant without an API request or database write:

```powershell
python -m fiyu.public_cli --db data\fiyu.db discover-addresses `
  --place-id PLACE_ID --limit 1 --web-action-budget 1 --plan-only `
  --resolution-report C:\data\osm\reports\osm-with-ward-boundaries.json `
  --output-report data\address-one-plan.json
```

Make one paid request but persist nothing:

```powershell
python -m fiyu.public_cli --db data\fiyu.db discover-addresses `
  --place-id PLACE_ID --limit 1 --web-action-budget 1 --dry-run `
  --resolution-report C:\data\osm\reports\osm-with-ward-boundaries.json `
  --output-report data\address-one-paid-preview.json
```

Plan the initial 19-record population:

```powershell
python -m fiyu.public_cli --db data\fiyu.db discover-addresses `
  --limit 19 --web-action-budget 1 --plan-only `
  --resolution-report C:\data\osm\reports\osm-with-ward-boundaries.json `
  --output-report data\address-19-plan.json
```

Run the batch as a paid no-write preview:

```powershell
python -m fiyu.public_cli --db data\fiyu.db discover-addresses `
  --limit 19 --web-action-budget 1 --dry-run `
  --resolution-report C:\data\osm\reports\osm-with-ward-boundaries.json `
  --output-report data\address-19-paid-preview.json
```

After reviewing the plan and a paid preview, persist audited runs and evidence by omitting both
mode flags:

```powershell
python -m fiyu.public_cli --db data\fiyu.db discover-addresses `
  --limit 19 --web-action-budget 1 `
  --resolution-report C:\data\osm\reports\osm-with-ward-boundaries.json `
  --output-report data\address-19-results.json
```

`--plan-only` makes no API request and performs no database write. `--dry-run` may make paid
Responses/web-search calls but performs no database write. A persistent run records the response
ID, model, Fiyu-generated queries, model-reported queries, actual web actions, cached/skipped
queries, search-call references, citations, source evidence,
request count, web-search action count, input/cached/output/reasoning/total tokens, failures, and
explicit retry count. Core logic stores usage units rather than hard-coded prices. Identical
standalone query sets are skipped unless `--force` is supplied. SDK automatic retries are disabled
so every paid request is visible in the audit record. `--web-action-budget` (with the deprecated
`--max-search-actions` alias) is passed to the provider as `max_tool_calls`. Because the provider
may still return more `web_search_call` action records than requested, this is documented as a
requested provider budget rather than an absolute pre-execution guarantee. The backend records
`limit_reached`/`limit_exceeded`, rejects automatic acceptance, and stops the remaining batch on an
observed overrun. Actual actions cannot be retroactively prevented.

Compact mode is on by default: low search context, at most four retained sources, 160 characters per
evidence summary, three conflicts, and 4,000 output tokens. The 4,000-token response budget replaces
the insufficient 1,800-token default that could truncate the current address schema. Tune these with
`--max-retained-sources`, `--max-evidence-summary-chars`, `--max-conflicting-candidates`,
`--max-output-tokens`, and `--no-compact-research` without changing identity checks.

Standalone address research sends a Pydantic-derived strict JSON Schema through Responses API
`text.format` and then validates the returned text with Pydantic. The backend receives and audits the
raw Response before parsing: response status, incomplete reason, response IDs, usage, web actions,
output character count, refusal/provider state, truncation, and a compact parse-error summary remain
available even when JSON is incomplete. Normal reports never include the raw partial output, and
incomplete evidence is never persisted.

Truncated responses are not retried by default. `--retry-truncated` permits exactly one retry with a
deterministically doubled output budget. A retry is allowed only when unused cumulative web-action
budget remains; both response IDs, both attempts' usage, actual web actions, and `retry_count` are
reported. Operators should normally rerun explicitly with a larger `--max-output-tokens` value.

Discovery reports retain the backward-compatible `completed`, `failed`, and `persisted` counters,
and add unambiguous `provider_completed`, `pipeline_accepted`, `pipeline_rejected`,
`research_records_persisted`, `verified_addresses_persisted`, and
`unresolved_evidence_persisted` counters.

Saved paid evidence can be re-evaluated after deterministic policy changes without another API,
web-search, or geocoder call. Preview one restaurant or every restaurant with saved evidence:

```powershell
python -m fiyu.public_cli --db data\fiyu.db recalculate-address-decisions `
  --place-id PLACE_ID --dry-run

python -m fiyu.public_cli --db data\fiyu.db recalculate-address-decisions `
  --all --dry-run
```

After reviewing the preview, persist the new decisions by omitting `--dry-run`:

```powershell
python -m fiyu.public_cli --db data\fiyu.db recalculate-address-decisions `
  --place-id PLACE_ID

python -m fiyu.public_cli --db data\fiyu.db recalculate-address-decisions --all
```

Recalculation reconstructs the latest saved evidence, reapplies source policy, normalization,
temporality, component agreement, and acceptance, then appends an `address_decision_audits` row.
It does not alter the original `address_evidence`, research run, response/usage audit, or search
attempts. Dry-run opens the existing schema read-only and writes nothing.

Export address candidates that require review:

```powershell
python -m fiyu.public_cli --db data\fiyu.db export-address-review `
  --output data\address-review.xlsx --limit 100
```

`.xlsx` is the recommended review format. Every cell—including place IDs, evidence IDs,
fingerprints, postal codes, and address components such as `1-13`—is written with Excel's text
number format so Excel does not silently convert street/block values into dates. UTF-8 BOM CSV is
still supported, but do not open the CSV by double-clicking it in Excel: import it explicitly and
set every identifier, fingerprint, postal-code, and address-component column to **Text**.

The exporter selects only the newest address evidence per restaurant and resolves its effective
decision in this order: a valid manual review decision for that evidence, otherwise the newest
deterministic recalculation audit, otherwise the original research decision. Manual decisions are
not silently overridden by later deterministic recalculation; newer research evidence supersedes
decisions attached to older evidence. By default, only published, map-ineligible records whose
effective resolution is exactly `address_needs_review` are exported. Verified, rejected, failed,
not-researched, conflicting, and superseded records are excluded.

Review files show both the original and effective states through `previous_acceptance_status`,
`current_acceptance_status`, `current_resolution_status`, `current_review_reasons`,
`latest_decision_at`, and `latest_decision_source`. The component fields, agreed core, conflicts,
historical/excluded evidence, precision, and approximate flag come from the latest recalculated
agreement. `effective_decision_fingerprint` binds the file to that exact decision snapshot.

Reviewers may choose `approve_core_location`, `approve_full_address`, `reject`, or `unresolved`
(`approve` remains a backward-compatible full-address alias). The export shows agreed and disputed
components, source JSON, proposed precision, approximate status, and whether validated geocoding
could make the row map eligible. A core approval never forces selection of a disputed building or
floor. Decisions require reviewer identity and
a strict `YYYY-MM-DD` date. Imports reject duplicate restaurant decisions and modified/stale
evidence, preserve append-only decision history, and allow at most one approved address per
restaurant. Preview and apply with:

```powershell
python -m fiyu.public_cli --db data\fiyu.db import-address-review `
  --input data\address-review-reviewed.xlsx --dry-run

python -m fiyu.public_cli --db data\fiyu.db import-address-review `
  --input data\address-review-reviewed.xlsx
```

Import re-resolves the latest effective decision and rejects stale evidence or decision
fingerprints, superseded evidence, records no longer needing review, changed candidate/address
fields, duplicate restaurants, unknown decisions, and spreadsheet date conversions such as
`Jan-13` in place of `1-13`. Dry-run performs these checks without applying schema changes or data
writes. Manual decisions are append-only; importing a review no longer rewrites the original
research evidence decision.

The MVP address provider is `local-osm-addresses`. Rebuild a separate address-capable index from
the local Geofabrik PBF; the build is atomic and does not modify the older restaurant index:

```powershell
python -m fiyu.public_cli build-osm-index `
  --pbf C:\data\osm\kanto-latest.osm.pbf `
  --output C:\data\osm\fiyu-kanto-address-index.sqlite
```

The `osm_addresses` table stores address nodes, addressed entrances, addressed building polygons,
safe address-interpolation objects, and addressed restaurant POIs. The `osm_address_areas` table
separately stores explicit OSM block, chōme, and neighborhood polygons inside one unambiguous Tokyo
ward. Area anchors use a centroid only when it lies inside the polygon; otherwise a deterministic
point-on-surface scan finds an interior point and respects polygon holes. Linear address objects use
their cumulative-length midpoint. OSM type/ID/version/timestamp, geometry level,
representative-point method, source reference, matched components, and
`Map data © OpenStreetMap contributors` attribution are retained. The old
index contains some POI `addr:*` tags but does not contain the complete standalone address layer,
so it must not be used with `local-osm-addresses` until rebuilt.

Japanese address comparison applies Unicode NFKC, compatible dash forms, `丁目`/`番`/`番地`/`号`,
Arabic and common Japanese numeric forms, optional `東京都`, and explicit chōme, block, and final
sub-number components. An exact full-number match remains exact. Exact chōme-plus-block with a
missing or different final sub-number is an approximate `provisional_medium` map pin. Chōme-only,
wrong-block, wrong-ward, wrong-neighborhood, and neighborhood-centroid candidates are not accepted;
numeric closeness never substitutes for an exact block match. Raw and normalized forms remain in
the index, along with complete `addr:*` tags.

Strict point matching remains the default. To permit the discovery-map-only area hierarchy
(block, then chōme, then neighborhood), add the explicit flag below. The optional minimum prevents
fallback below the selected precision; for example, `chome` permits block and chōme but rejects a
neighborhood anchor.

```powershell
python -m fiyu.public_cli geocode-address-file `
  --input data\geocoding-inputs.json `
  --output data\osm-geocoder-area-results.json `
  --provider local-osm-addresses `
  --osm-index C:\data\osm\fiyu-kanto-address-index.sqlite `
  --allow-area-fallback `
  --minimum-area-precision neighborhood
```

Indexes built before `osm_address_areas` was added remain valid for strict address lookup but cannot
perform area fallback. Rebuild them from the PBF; the resolver reports
`area_fallback_unavailable` instead of deriving a centroid from address points.

First recalculate saved evidence under the current optimistic MVP policy without any network call:

```powershell
python -m fiyu.public_cli --db data\fiyu.db recalculate-address-decisions `
  --all --mvp-policy --dry-run

python -m fiyu.public_cli --db data\fiyu.db recalculate-address-decisions `
  --all --mvp-policy
```

Export agreed core addresses only. Disputed building, floor, suite, unit, and entrance fields are
never included:

```powershell
python -m fiyu.public_cli --db data\fiyu.db export-geocoding-inputs `
  --output data\geocoding-inputs.json --limit 100
```

Geocode one address or the whole file locally without network access:

```powershell
python -m fiyu.public_cli geocode-address-file `
  --input data\geocoding-inputs.json `
  --output data\osm-geocoder-one.json `
  --provider local-osm-addresses `
  --osm-index C:\data\osm\fiyu-kanto-address-index.sqlite `
  --place-id PLACE_ID

python -m fiyu.public_cli geocode-address-file `
  --input data\geocoding-inputs.json `
  --output data\osm-geocoder-results.json `
  --provider local-osm-addresses `
  --osm-index C:\data\osm\fiyu-kanto-address-index.sqlite `
  --limit 100
```

Add `--include-candidates --diagnostic-limit 10` to include component-level candidate diagnostics
for approximate or rejected records. Diagnostics retain the OSM type/ID, complete `addr:*` fields,
parsed hierarchy, coordinates, geometry method/span, exact matches and differences, and the
accept/reject reason. Distance is reported only when a trusted reference coordinate is available.

Each output retains the place ID, input fingerprint, raw/normalized address, coordinates,
prefecture/ward/neighborhood, matched components, match status, precision/approximate flag,
provider/version, OSM object provenance, source reference, and warnings. `not_found`, `ambiguous`,
ward mismatch, and address-number mismatch are isolated per record. Use `--dry-run` to print the
proposed result report without writing the result JSON file.

```json
[
  {
    "raw_address": "東京都台東区谷中1丁目2-3",
    "normalized_address": "台東区谷中1-2-3",
    "latitude": 35.727,
    "longitude": 139.77,
    "prefecture": "東京都",
    "municipality_or_ward": "台東区",
    "neighborhood": "谷中",
    "matched_components": {"ward": "台東区", "neighborhood": "谷中", "address_number": "1-2-3"},
    "match_level": "address",
    "status": "matched_exact",
    "precision": "exact",
    "map_location_approximate": false,
    "provider": "local_osm_addresses",
    "provider_version": "osm-address-index-v2",
    "osm_type": "node",
    "osm_id": 1234,
    "osm_version": 5,
    "osm_timestamp": "2026-07-01T00:00:00Z",
    "source_reference": "https://www.openstreetmap.org/node/1234",
    "input_fingerprint": "sha256-of-the-exported-address-decision",
    "place_id": "PUBLIC_PLACE_ID"
  }
]
```

Validate geocoder results without writing, then apply them:

```powershell
python -m fiyu.public_cli --db data\fiyu.db geocode-verified-addresses `
  --results data\osm-geocoder-results.json --limit 100 --dry-run

python -m fiyu.public_cli --db data\fiyu.db geocode-verified-addresses `
  --results data\osm-geocoder-results.json --limit 100
```

Only the agreed core address is sent to the geocoder. Tokyo bounds, swapped coordinates, current
input fingerprint, derived precision, core-ward agreement, and provider provenance are checked
before map eligibility. Exact address nodes, entrances, and addressed buildings are normal pins;
block results and interpolation spans no wider than 150 meters are approximate pins. With the
explicit area flag, an exact-component OSM block/chōme/neighborhood polygon may also become an
approximate MVP pin. Ward/city centroids, nearby unrelated addresses, numeric closeness, and
ambiguous polygons remain rejected. Area matches always become
`location_provisional`, never `location_verified`; other verified addresses become
`location_verified`; high/medium
provisional addresses become `location_provisional`. Both can set `map_display_eligible=true`.
Existing verified OSM locations are
excluded and never overwritten. Public restaurant responses may expose `verified_core_address`,
coordinates, `location_precision`, `map_anchor_type`, `map_anchor_id`, `location_status`,
`map_location_approximate`, matched/unmatched components, and OSM provenance; they never expose disputed
building/floor data as verified. Restaurants without eligible coordinates continue to appear with
coordinates suppressed.

Area pins are labeled `Approximate area`. Their stable `map_anchor_id` lets the frontend cluster
restaurants sharing one polygon without jitter. `distance_sort_eligible` and
`directions_coordinates_eligible` are false for approximate pins, so these coordinates must not be
used for nearest sorting or directions. `external_map_search_query` contains the independently
verified written address for an external map search instead.

The migration is additive: public rows gain location tier/status fields; address evidence
gains parsed-detail and deterministic agreement fields; verified addresses gain a dedicated
`geocoding_address`; run/search tables gain requested-budget and query-origin audit fields; geocode
results gain input fingerprints; and `location_history` retains active, superseded, and removed
coordinate records. Existing coordinates and publication state are not promoted or rewritten by
migration.

Corrections are explicit and reversible. Preview and apply a replacement:

```powershell
python -m fiyu.public_cli --db data\fiyu.db replace-location `
  --place-id PLACE_ID --latitude 35.0 --longitude 139.0 `
  --source-reference SOURCE --reason "Corrected restaurant location" `
  --reviewed-by Ethan --reviewed-at YYYY-MM-DD --dry-run

python -m fiyu.public_cli --db data\fiyu.db replace-location `
  --place-id PLACE_ID --latitude 35.0 --longitude 139.0 `
  --source-reference SOURCE --reason "Corrected restaurant location" `
  --reviewed-by Ethan --reviewed-at YYYY-MM-DD
```

Remove a pin while keeping the restaurant in list/detail views with `--remove` and no coordinates.
Existing manual/OSM locations require the additional explicit `--allow-manual-override` flag.
Previous coordinates are appended to `location_history`, never deleted.

The safe bulk MVP workflow is intentionally composed from separate commands: plan/research with
`discover-addresses`, recalculate, export geocoding inputs, run local OSM address lookup, dry-run the
results import, then persist. This keeps request estimates and every write boundary visible;
it is never run during API requests.

Inspect aggregate address, source, geocoding, failure, and raw usage status with:

```powershell
python -m fiyu.public_cli --db data\fiyu.db address-resolution-status
```

The manual tail uses the address-review workflow for evidence-backed raw addresses and the existing
independent location-review import for direct confirmation, on-site verification, trusted
contributor evidence, or evidence-backed coordinate corrections. Required reviewer, date, method,
precision, source reference, and notes prevent provenance-free map eligibility. Google-derived
addresses and coordinates remain identity hints only and are never independent SVG-map evidence.

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
