# Restaurant pipeline scale-readiness audit

Date: 2026-10-02  
Scope: current repository and a read-only inspection of `data/fiyu.db`  
Decision horizon: expanding from 263 Picks-eligible/published restaurants toward 1,500–2,000 launch-quality Tokyo restaurants

## 1. Executive summary

The current backend is not an ID-resolution pipeline. It cannot take a Google Place ID, Google Maps URL, OSM ID, name, or coordinates alone and independently construct a candidate. The effective minimum for a candidate that can reach the public catalog is:

- a nonblank `placeId` (or one of its accepted column aliases),
- a nonblank title,
- a numeric rating,
- an integer review count.

The last three values are required before the row survives ingestion. `placeId` is not strictly required to exist in the internal `restaurants` table, because `cid`, `fid`, name+address, or name+coordinates can provide an ingestion deduplication key. It is, however, required by `seed_public_queue`, and therefore required for the current enrichment/publication pipeline. A Place ID by itself is insufficient: no code calls Google Place Details to recover the missing title, rating, review count, category, address, or coordinates.

The architecture has two materially different layers:

1. **Candidate ingest and internal scoring** reads a complete collection of CSV/TSV/JSON/JSONL/NDJSON/XLSX files, normalizes and deduplicates it in memory, scores the complete cohort, then deletes and replaces every row in `restaurants`.
2. **Public catalog processing** is stateful and keyed by `public_restaurants.place_id`. It performs OpenAI Responses API research with web search, deterministic public scoring, optional low-footprint research, local OSM location resolution and address fallback, then deterministic auto-publication.

The first layer is a whole-corpus rebuild, not an append importer. It has no dry-run or staging/promotion command. The second layer is sequential, bounded to 100 rows per invocation, isolates per-candidate failures, and uses restaurant-level states as checkpoints. It has no batch/job record, input manifest, cursor, seeded shuffle, worker queue, or global concurrency control.

The current database already contains considerably more supply than the 263 visible restaurants suggest:

| Snapshot metric | Count |
|---|---:|
| Internal `restaurants` | 8,086 |
| Internally eligible at score >= 55 | 2,765 |
| Seedable at the default catalog threshold >= 60 | 2,121 |
| Seedable >= 60 but not in `public_restaurants` | 1,621 |
| `public_restaurants` | 500 |
| Research complete | 320 |
| Pending research | 176 |
| Failed / needs retry | 3 / 1 |
| Published and product visible | 263 |
| Picks eligible (`published + product + map`) | 263 |

Consequently, the first scale experiment should not ingest new restaurants. It should evaluate a reviewed, balanced sample from the 176 already-pending rows and then audit the 1,621 unseeded score>=60 rows. The existing pool may be arithmetically sufficient to approach 1,500 visible restaurants, but it is drawn from only 12 wards plus one neighborhood source and its composition has not been shown to be launch-balanced.

### Readiness verdict

The backend is suitable for a **small, sequential, operator-supervised pilot**. It is not ready for an unattended 1,500-candidate auto-publication run.

The principal blockers for unattended scale are:

- automatic publication does not hard-gate on `map_display_eligible`, identity confidence, research confidence, or the computed `blocking_conflict` result;
- the raw ingest is destructive whole-corpus replacement, has no dry-run, and does not reconcile removed/closed candidates with already-published public rows;
- the system has no durable batch manifest/checkpoint, while one retry subflow (low-footprint research) lacks a normal operator retry command;
- source coverage is structurally biased: the checked-in discovery manifest covers 12 of Tokyo's 23 special wards plus Ogibashi, and the pipeline has no stratified selection facility.

## 2. Current pipeline diagram

```text
Apify/Google-derived source files (complete candidate rows, not IDs only)
  |
  v
readers.iter_input_files / iter_rows
  |  CSV, TSV, JSON, JSONL, NDJSON, XLSX; paths sorted deterministically
  v
columns.raw_record_from_row
  |  normalize selected aliases; ignore most wide raw columns
  v
normalize.clean_and_dedupe
  |  require title + rating + review_count; remove closed/ads/non-food;
  |  dedupe by place_id, then cid, then fid, else name+address/name+coordinates
  v
normalize.add_chain_features
  |  known-chain terms + repeated normalized titles/domains in this corpus
  v
scoring.score_records
  |  cohort-relative provisional internal score and candidate_eligible
  v
database.replace_restaurants
  |  DELETE and rebuild the entire restaurants table
  v
public_catalog.seed_public_queue
  |  select top eligible rows by internal score; UPSERT by place_id
  v
research_worker.run_research_batch
  |  one OpenAI Responses request per restaurant, web search, structured evidence,
  |  embedded address evidence and card enrichment
  v
public_score.evaluate_fiyu_candidate
  |  deterministic public Fiyu score, product/access/chain classifications
  v
optional low_footprint_research.run_low_footprint_research
  |  second paid pass for high-local-discovery but sparse evidence
  v
catalog_pipeline.verify_location
  |-- local OSM POI exact match
  |-- already accepted independent address -> local OSM address geocoder
  |-- local OSM polygon fallback from defensible area context
  |-- paid web address research -> local OSM address geocoder
  `-- reviewed OSM area anchor / unresolved
  v
catalog_pipeline.apply_automatic_publication
  |  display/category/research/score + score>=75 + product eligible + not chain
  |  (location/confidence/conflict are not hard publication conditions)
  v
public API
  |-- public listing/detail: published + product eligible
  `-- Picks: published + product eligible + map eligible + coordinates
```

## 3. Stage-by-stage lifecycle

| Stage | Current implementation | Input -> output | Records/files touched | External dependency | Determinism / rerun / failure | Publication effect |
|---|---|---|---|---|---|---|
| File discovery | `readers.iter_input_files` | file/dir paths -> sorted supported files | source files, read-only | none | Deterministic for the same filesystem. Unsupported or empty input raises. | Indirect |
| Row mapping | `columns.raw_record_from_row` | wide provider row -> compact raw record | memory only | none | Deterministic. Only declared aliases are retained. | Indirect |
| Cleaning/deduplication | `normalize.clean_and_dedupe` | normalized rows -> one candidate per dedupe key | memory only | none | Deterministic for ordered inputs. Invalid/closed/ad/non-food rows are counted and dropped. | Dropped rows cannot become candidates |
| Chain features | `normalize.add_chain_features` | cleaned corpus -> chain flags/digital type | memory only | none | Deterministic but corpus-dependent. Repeated title/domain thresholds change with the input universe. | Chain rows fail internal eligibility |
| Internal score | `scoring.score_records` | candidate corpus -> internal components/eligibility | memory, later `restaurants` | none | Deterministic but cohort-dependent because area/global priors and review percentiles use the complete corpus. | `candidate_eligible` and default seed threshold gate entry |
| Candidate persistence | `database.replace_restaurants` | all scored candidates -> rebuilt table | deletes/reinserts `restaurants`; replaces metadata; optional scored CSV | none | **Conditionally idempotent.** Values reproduce, but integer IDs and timestamps change. A full-corpus input is mandatory. | Public rows survive separately by `place_id`; missing candidate joins can break later work |
| Public queue seed | `public_catalog.seed_public_queue` | top eligible candidate rows -> public queue | UPSERT `public_restaurants` | none | Idempotent by public `place_id`, but updates `source_restaurant_id` and `updated_at`. `LIMIT` is not pagination and does not exclude already-seeded rows. | Creates `pending` public records |
| Main research | `research_worker.run_research_batch` | pending candidate plus hints -> structured research/evidence/card/address | `restaurant_research_runs`, `address_research_runs`, address evidence/audits, `public_restaurants`, card enrichment runs | OpenAI Responses API + built-in web search | Model output is not deterministic. Completed rows are reused; per-row failures are isolated. SDK automatic retries are disabled. Ambiguous network outcomes become `needs_retry`. | Required: `research_status='complete'` |
| Public score | `public_score.evaluate_fiyu_candidate`, persisted by `save_research_result` | stored evidence + internal signals -> public score/result | `public_restaurants`, append/dedupe `score_calculation_runs` | none | Deterministic. Evidence fingerprint prevents duplicate score-run history for identical inputs/version. | Score>=75, product eligibility and chain exclusion are hard auto-publication rules |
| Sparse-evidence route | `assess_low_footprint_eligibility` and `run_low_footprint_research` | high discovery + score>=60 + sparse evidence -> optional second result | low-footprint and restaurant research runs; score/public fields | OpenAI Responses + web search | One operator-authorized request per eligible state. Fingerprinted eligibility. Failures mark attempted and remove route eligibility; no dedicated CLI recovery exists. | Can improve evidence/score before publication |
| OSM POI identity/location | `osm_resolver.resolve_osm_locations` | researched name/category/area -> OSM candidate ranking | local OSM index read-only; match candidates and public location fields | local OSM PBF-derived SQLite index | Deterministic for fixed index/config. Exact identity, geography, score threshold 80 and runner margin 20 required for auto verification. | Map eligibility only; current publication readiness treats location as a warning |
| Address research fallback | `address_research.run_address_discovery` | candidate names/area -> source-bounded address evidence | address runs, attempts, evidence, decisions, verified address | OpenAI Responses + web search | Structured validation and deterministic acceptance. Query fingerprints suppress repeated searches. Failures isolated; ambiguous outcomes require explicit authorization. | Supports location and conflict diagnostics |
| Local address geocoding | `address_geocoding.geocode_verified_addresses`; `LocalOSMAddressGeocoder` | accepted independent address -> OSM coordinate/polygon | local OSM address index; geocode results/location history/public location | local OSM index | Deterministic; rejects cross-ward, wrong number, and ambiguous equally precise candidates. | Enables map/Picks eligibility |
| Broad location fallback | `apply_best_available_polygon_fallback`, `_apply_trusted_area_anchor` | verified or candidate/discovery area context -> stable approximate OSM point | public location, `location_history` | local OSM index/config | Deterministic stable point. Location precedence prevents weaker locations overwriting stronger ones. | Enables map eligibility at approximate precision |
| Auto-publication | `auto_publish_readiness`, `apply_automatic_publication` | complete record -> `auto_published` or `auto_rejected` | public row | none | Deterministic for stored/current evidence. Auto-rejected rows are excluded from normal future batch selection. | Direct |
| Manual review/publication | `review_candidate`, `publish_candidate`, legacy `public_cli publish/unpublish` | operator decision -> status | public row | none | State mutation; repeat set is effectively idempotent. | Direct |
| Optional content passes | localization, grounded descriptions, card-enrichment backfill | researched/published record -> improved display fields | dedicated run history/public fields | OpenAI; web search for some passes | Per-row isolation; various fingerprints/statuses. Not part of normal `run` publication minimum. | Not a hard gate |
| Runtime visibility | `public_catalog`, `daily_picks._published_catalog` | public rows -> API/Picks pool | read-only query | none | Deterministic query. | Detail/list require published+product; Picks additionally require map+coordinates |

## 4. True candidate input contract

### Supported file routes

`fiyu.cli ingest` accepts one or more files or directories. Recursion is supported for directories. Supported extensions are:

- `.csv`
- `.tsv`
- `.json`
- `.jsonl`
- `.ndjson`
- `.xlsx`

JSON may be a single object, a list, or an object containing `items`, `data`, or `results`. XLSX reads every nonempty worksheet using its first row as headers. There is no REST/admin endpoint that creates raw candidates and no candidate-specific append command.

### Accepted aliases

Important normalized aliases include:

| Internal field | Accepted input columns |
|---|---|
| `place_id` | `placeId`, `place_id`, `googlePlaceId` |
| `title` | `title`, `name`, `displayName` |
| `address` | `address`, `formattedAddress` |
| coordinates | `location/lat`, `latitude`, `lat`, `location.lat`; `location/lng`, `longitude`, `lng`, `lon`, `location.lng` |
| category | `categoryName`, `category`, `primaryType`; plus `categories/*` |
| rating | `totalScore`, `rating`, `score` |
| review count | `reviewsCount`, `reviewCount`, `userRatingCount` |
| maps URL | `url`, `googleMapsUri`, `mapsUrl` |
| source area | `searchString`, `search_string`, `query`, `locationQuery`; in practice the filename stem replaces this value in `raw_record_from_row` |

Other retained hints are city, state, postal code, neighborhood, website, phone, price, close flags, ad flag, image URL, language, country code, and scrape timestamp.

### Minimums by lifecycle point

| Goal | Actual minimum |
|---|---|
| Survive internal cleaning | title + rating + review count + any dedupe key |
| Dedupe key | first available of place ID, CID, FID; otherwise normalized name+address; otherwise normalized name+rounded coordinates |
| Receive a meaningful internal score | above, with area/category strongly recommended because scoring cohorts otherwise collapse to filename/`restaurant` defaults |
| Enter `public_restaurants` | all of the above **and a nonblank place ID**, `candidate_eligible=1`, internal score at/above seed threshold |
| Be researchable with reasonable identity safety | place ID + name; address/neighborhood/city/category/discovery area are important identity and search hints |
| Obtain an exact map location | researched names plus defensible area/address evidence and a matching local OSM object/address |

The practical large-batch minimum is therefore not “ID only.” It is at least:

```csv
placeId,title,totalScore,reviewsCount,categoryName,searchString,address,city,neighborhood,location/lat,location/lng,scrapedAt,permanentlyClosed,isAdvertisement
```

Only the first four are structurally essential to the public path. The other fields are needed to avoid weak cohort scoring, same-name/branch ambiguity, and poor location resolution.

### Identifier behavior

- `restaurants.id` is an autoincrement integer assigned during each full rebuild. It is not stable.
- `public_restaurants.place_id` is the durable catalog key and primary key.
- `source_restaurant_id` is refreshed during seeding but has no foreign-key constraint, deliberately tolerating whole-table rebuilds.
- `cid` is persisted on `restaurants`; `fid` is used while deduplicating but is not persisted by `INSERT_COLUMNS`.
- There is no alias/external-ID table. CID/FID do not become public aliases.
- A Google Maps URL is stored as a hint but is not parsed into a Place ID.
- OSM IDs are location provenance, not restaurant identity keys.

### Can a Place ID alone seed a batch?

No. The row is rejected before storage because title, rating, and review count are missing. The only Google Places API integration requests `photos,googleMapsUri`; it does not fetch place details. To start from IDs alone, a separate upstream resolver would first have to produce the required candidate records. That resolver does not exist in this repository.

## 5. External ID and Google boundary

### Current technical reality

- Google Place IDs are stored in `restaurants.place_id` and then used as `public_restaurants.place_id`.
- `public_restaurants.place_id` is unique because it is the primary key. `restaurants.place_id` has neither a unique constraint nor an index; uniqueness relies on in-memory cleaning for each ingest.
- The Place ID is not modeled as an alias. It is the durable public entity key.
- The raw candidate corpus appears to be Apify exports of Google Maps data. Persisted candidate fields include title, address, city, neighborhood, coordinates, category, rating, review count, website, maps URL, image URL, price, phone, and scrape time.
- Main research explicitly treats supplied Google address/coordinates as untrusted identity hints and instructs the model not to copy them into independent address evidence.
- Google Places API is used only by runtime photo endpoints. It fetches fresh photo resource metadata, Google Maps URI, and transient media URLs. The module states that the result is never persisted.
- A photo request can make one metadata request and one media request per returned photo; it has a 10-second timeout and no cache in this repository.
- Place IDs are not refreshed or re-resolved. Duplicate public Place IDs collapse through the primary key; duplicate internal IDs are merged in memory.

### What can become public/canonical

| Candidate/Google-derived value | Current use |
|---|---|
| Place ID | durable Fiyu catalog key |
| title | research identity hint; publication display-name fallback in readiness; joined candidate title for internal/admin views |
| category | internal cohort/category; publication category fallback in readiness; research normally writes canonical `primary_category` |
| address | research hint; **also exposed as `external_map_search_query` when no reviewed core address exists** |
| coordinates | internal hint only; rejected for map eligibility unless independently replaced |
| rating/review count | internal candidate quality and underexposure inputs; not exposed in public restaurant contract |
| website/phone | internal footprint/hints; explicitly not promoted into canonical contact fields |
| price bucket | stored candidate hint; a limited JPY vocabulary can be promoted by `backfill_canonical_details` into normalized canonical budget with source type `candidate_price_import` |
| maps URL/image URL | stored candidate hints; not the public photo path |

Google data is not directly plotted on the Fiyu OSM map. OSM-backed or manually reviewed coordinates set `map_display_eligible`. Candidate area/address/neighborhood hints can nevertheless affect OSM matching or broad polygon fallback, so Google-derived context has an indirect role in resolution. Raw candidate address can also be offered as an external maps search query.

### Boundary issues for separate review

This audit makes no legal conclusion, but the following technical facts deserve product/legal-data-boundary review:

1. the Google Place ID is the primary Fiyu catalog identifier rather than a namespaced alias;
2. candidate address is exposed as a navigation search fallback when no independently reviewed address exists;
3. candidate price buckets can be promoted into canonical budget data;
4. candidate-derived names/categories can satisfy publication readiness fallbacks;
5. Google photo metadata/media is fetched live and has no local caching/attribution lifecycle beyond response normalization.

## 6. Canonical location resolution

### Source precedence

The active-location replacement order is enforced by `location_update_allowed` using precision first and provenance second. Precision ranks from unresolved through ward/area, neighborhood, chome, block, building, exact/POI/rooftop. Provenance ranks include candidate/area fallbacks below local OSM addresses, OpenStreetMap POIs, and manual reviewed overrides.

The normal `verify_location` path is:

1. Invalidate a reviewed area anchor if current evidence contradicts its ward.
2. Resolve a local OSM food POI by researched Japanese/English names and discovery geography.
3. If not auto-verified and an address index is supplied, geocode already-accepted independent address evidence first.
4. If none exists and there is no active valid location, try an OSM polygon from the deepest defensible address/discovery/candidate context.
5. If polygon context is unavailable, run paid web address research; when accepted, geocode it against the local OSM address index.
6. If still unresolved, retry polygon fallback and finally a reviewed OSM area anchor.
7. Mark location attempted. Unresolved location remains off the map.

### Authoritative fields

- **Latitude/longitude:** OSM POI coordinates, local OSM address/building/block coordinates, stable point inside an OSM polygon, a reviewed OSM area anchor, or an explicit independent manual import/correction.
- **Written address:** accepted/verified address evidence becomes `verified_core_address`/`normalized_address`; the candidate address remains a separate joined fallback.
- **Ward/neighborhood/area:** researched address components and OSM tags/boundaries; reviewed discovery manifest/anchors provide corroboration and broad fallback.
- **Map eligibility:** requires an accepted location write with coordinates and provenance; raw candidate/Google/unknown source is rejected by location import and sanitized out of OSM resolver input.

Google is never authoritative for map coordinates. Public Nominatim is not called. The preferred path is local OSM data. Alternate offline geocoders exist for reviewed JSON results and Japan's Digital Agency Address Base Registry (`abrg`), but the unified pipeline uses the local OSM address geocoder.

### POI matching and branch protection

The OSM resolver:

- normalizes Japanese, English, alternate, and official names;
- checks cuisine/category, neighborhood, OSM address tags, discovery ward/area, reviewed anchors, and Tokyo bounds;
- penalizes branch markers present only on the OSM candidate, generic names, out-of-area candidates, and multiple exact-name candidates;
- requires exactly one eligible exact match, score >=80, a >=20 runner-up margin, expected geography, and no blocking warning for auto verification;
- sends strong but non-unique results to manual review or leaves them unresolved;
- stores up to 20 ranked candidates and detailed score components/warnings.

Address acceptance independently blocks low identity confidence (<0.6), nonmatching name, unresolved branch name, non-street-level address, unverified core components, closure/replacement language, and material address component conflict. Strong automatic acceptance generally requires confirmed identity >=0.85 and sufficient qualifying source agreement.

### Important qualification

The map-resolution safeguards are substantially stronger than the publication gate. `publish_readiness` records unresolved location only as a warning, and current tests explicitly expect automatic publication to ignore unavailable location. A wrong/ambiguous branch can therefore remain published outside Picks even when it is not map eligible. In addition, current score policy computes conflict diagnostics but does not include `blocking_conflict`, identity confidence, or research confidence in the actual `publishable` conditions.

## 7. Enrichment architecture and field inventory

### Identity and food

| Field | Canonical source/transformation | Confidence/missing behavior | Publication mandatory? |
|---|---|---|---|
| `name_ja`, `name_en` | main structured research; optional localization pass | Pydantic length/schema validation; candidate title can satisfy readiness when both absent | Some display name is mandatory, but researched names are not individually mandatory |
| `primary_category` | main research | candidate category/broad category can satisfy readiness | Some category is mandatory |
| `food_tags` | main research, max bounded list | empty allowed | No |
| `signature_dishes` | main research, bounded list | empty allowed; claims should have evidence | No |
| description / Why Fiyu | main research; optional grounded-description/localization passes | bounded structured text; unsupported grounded descriptions rejected | Main research requires `why_fiyu`; readiness does not independently inspect copy |
| aliases | OSM alternate names exist only in match candidates | no canonical restaurant-alias table | No |

### Location and discovery

| Field | Source | Missing/conflict behavior | Mandatory? |
|---|---|---|---|
| discovery area(s) | reviewed `discovery_area_sources.json` crosswalk and source row provenance | multiple occurrences retained; inconsistent names create conflict | Needed for strong automatic OSM matching, not publication |
| normalized/verified address | deterministic acceptance of independently sourced research evidence | historical/future and lead-only sources do not verify; conflicts preserved | Not publication; important for map |
| lat/lon | local OSM/manual hierarchy | unresolved remains null/off map; stronger existing location is preserved | Required for Picks, not generic publication |
| ward/neighborhood | OSM boundary/address tags or verified address | cross-ward conflicts rejected | Not generic publication |

### Format, atmosphere, practical information

The canonical `CardEnrichment` schema supports:

- seating: counter, tables, private rooms, small-capacity flag;
- visit style: solo-, group-, and date-friendly flags;
- service periods: lunch, dinner, late night;
- payment: cash only, cards, electronic payment;
- reservation status/confidence;
- booking methods, canonical phone/booking URL/contact note with source provenance;
- normalized weekly opening hours, overnight times through 29:59, display string, confidence and conflicts;
- normalized per-person budget with currency/min/max/band/source/confidence;
- up to five review themes, each requiring at least two independent URLs;
- a restrained card description.

There is no canonical numeric capacity, no broad atmosphere enum such as intimate/lively/casual/refined, and no direct ingestion of the wide raw provider `additionalInfo/Atmosphere/*` fields. Those raw columns are ignored by `columns.py`. `small_capacity` is only a nullable boolean.

Card enrichment is presentation-oriented. It can contribute bounded fixed-venue evidence to product eligibility, but presentation copy itself is excluded from scoring. Missing card enrichment does not block publication. A record is classified `strong`, `usable`, or `sparse`; that classification is reported, not used as a hard publication gate.

### Price

- Raw `price` is a candidate hint.
- Only explicit finite JPY ranges such as `¥1–¥1,000` or lower-bound `¥10,000+` are normalized deterministically.
- Researched budget requires a supporting source.
- Unknown or structurally empty budget remains null.
- Price does not directly enter Fiyu Score or publication eligibility. It affects end-user Picks affordability logic when a canonical budget ceiling is known.

### Fiyu-specific fields

- Internal quality, underexposure, digital footprint, confidence and independence are deterministic candidate-stage values.
- Main research produces evidence for local discovery, chain classification, access, fixed-venue/product suitability, audience/visibility, distinctiveness and conflicts.
- Public Fiyu Score, Local Discovery score, confidence, product eligibility, chain exclusion and score bands are deterministic Python results.
- Community recommendations are stored separately and do not affect the current score or publication path.

## 8. AI / LLM usage

No model is called in `scoring.py`, `public_score.py`, OSM matching, address component comparison, product eligibility arithmetic, publication policy arithmetic, or the Picks selector. The normal hosted recommendation selection is deterministic. An optional model-assisted Taste phrasing path exists elsewhere in the product, but it does not choose restaurants or alter restaurant scores.

| Pass | Module | Default/config | Calls and web budget | Validation/cache/retry |
|---|---|---|---|---|
| Main restaurant research | `research_worker` | `OPENAI_MODEL`, default `gpt-5.6-luna`; prompt v7; low reasoning | 1 Responses `parse` per candidate; max 4 web-search actions | `RestaurantResearch` Pydantic schema; source URLs bounded; run/evidence/usage stored. `OpenAI(max_retries=0)`. Ambiguous connection/timeout -> explicit retry required. No explicit output-token cap in this call. |
| Low-footprint pass | `low_footprint_research` | same default; v4 | at most 1 response; max 8 web actions; max 12,000 output tokens | structured `RestaurantResearch`; fingerprinted eligibility/run state; no automatic retry |
| Standalone address research | `address_research` | same default; prompt v2/schema v3 | normally 1 response; max 4 web actions; max 4,000 output tokens; optional one truncated-output retry | strict JSON schema, deterministic source policy/component agreement/acceptance; query fingerprint cache; automatic SDK retry disabled |
| Embedded address research | main response | same as main | no extra response if usable address evidence is returned | persisted as a combined address run |
| Targeted card enrichment | `card_enrichment` | same default; v3 | 1 response; max 5 web actions | strict `CardEnrichment`; input fingerprints/status; ambiguous retry requires authorization; no explicit output cap |
| Grounded description | `description_research` | default `gpt-5.6-luna`; v1 | 1 response; max 2 web actions only if stored evidence is insufficient; 1,200 output tokens | exact place ID, no unsupported claims, confidence >=0.65, observed source URL validation; no automatic paid retry |
| Localization | `localization_worker` | same default | 1 response; no web search | two-field Pydantic result; per-row isolation. It uses the SDK default retry configuration rather than `max_retries=0`. |

OpenAI web search is the access mechanism for official sites, official social profiles, reservation platforms, directories, local publications/blogs, press releases and other sources. Fiyu does not directly scrape those providers in pipeline code. Raw page/search content is not stored; structured summaries, URLs, classifications, conflicts and usage metadata are stored.

The maximum normal-path provider work for a difficult restaurant is approximately:

- 1 main Responses request / up to 4 web actions;
- optionally 1 low-footprint request / up to 8 web actions;
- optionally 1 standalone address fallback request / up to 4 web actions.

Thus the worst configured normal path is up to 3 Responses requests and 16 web-search actions per restaurant, before optional later description/card passes. Actual totals are recorded in batch output and run tables. Current API prices are not encoded locally; cost requires a separate current-price check.

## 9. Provider/source inventory

| Provider/source | Role | Access/credentials | Rate limiting, timeout, cache, provenance | Failure mode |
|---|---|---|---|---|
| Apify-style Google Maps exports | candidate universe and internal rating/review/footprint hints | files supplied by operator; no Apify client here | no rate logic; source filename and scrape time retained | malformed/missing required fields dropped; whole ingest can fail on invalid file |
| OpenAI Responses + web search | restaurant, address, local-footprint, descriptions, cards, localization | `OPENAI_API_KEY`; optional `OPENAI_MODEL` | sequential calls; explicit tool-action caps; most clients `max_retries=0`; run/source/token metadata stored; no response-result cache, but status/fingerprints prevent many repeats | per-row failed/needs_retry; address over-budget can stop remaining standalone batch |
| OpenStreetMap local PBF/index | POIs, names, cuisine, address objects, polygons, ward boundaries, map assets | local files; no live credential | zero network calls; OSM IDs/version/timestamp/source references stored | missing/stale index, ambiguous candidates, incomplete ward boundaries, no match |
| Digital Agency Address Base Registry | optional alternative offline geocoding | local `abrg` executable and downloaded Tokyo data | subprocess; provider/version/warnings retained | missing data/tool, invalid/ambiguous match |
| Reviewed JSON geocoder results | offline/manual import path | operator-created file | deterministic file lookup and provenance | invalid/ambiguous file row |
| Reviewed discovery manifest | area provenance for source batches | checked-in JSON + `*_Initial.csv` | strict one-to-one file mapping, reviewed flag, row provenance | unmapped/missing file or duplicate/inconsistent identity aborts audit/enrichment |
| Reviewed location anchors | broad OSM fallback | checked-in JSON | requires reviewed flag/date/source and unique context match | ambiguous/no matching anchor leaves unresolved |
| Google Places API | runtime photos only | `GOOGLE_PLACES_SERVER_KEY` | 10s timeout; no retry/backoff/cache; transient normalization | config, timeout, provider/malformed/no-photo errors mapped safely |
| Manual CSV/XLSX review/import | location/address decisions | operator files | strict validation, dry-run in many commands, audit rows | invalid row can block import |

No public Nominatim call exists. Supabase integrations are user/account storage and are not part of restaurant enrichment.

## 10. Duplicate, branch, move and closure handling

### Exact duplicates

Within one complete ingest, the first available key is used:

1. `place_id`
2. `cid`
3. `fid`
4. normalized name + normalized address
5. normalized name + coordinates rounded to five decimals

Duplicate rows merge. The newer `scraped_at` row becomes primary; missing values are filled from the other row; review count becomes the maximum; source areas/files are unioned. Rating comes from the chosen primary row, not an average.

### Gaps

- If two records have different nonblank Place IDs, name/address/coordinate similarity is never consulted. They can represent the same physical restaurant twice.
- Japanese/English spelling variants with different external IDs are not entity-resolved.
- Exact or near-identical coordinates are not a cross-ID duplicate check.
- There is no moved-entity alias/history model at candidate level.
- A current closed row is dropped from the rebuilt `restaurants` table, but an existing `public_restaurants` row with that Place ID is not automatically unpublished or deleted.
- `restaurants.place_id` has no database uniqueness constraint, so protection is only in the ingestion function.

### Branches and chains

Distinct branches with distinct Place IDs can coexist technically. Repeated names/domains may classify them as a chain and make them internally ineligible; this is intentionally conservative but can exclude legitimate small multi-location brands. Research later distinguishes independent single venues, distinct-concept small groups, same-brand small chains, and large chains/franchises.

OSM and address pipelines preserve branch names, penalize unexpected branch markers, require geographic corroboration, and leave ambiguous same-name branches unresolved. Those controls protect map coordinates. They do not repair a wrong upstream Place ID, and current auto-publication does not use identity/conflict diagnostics as hard conditions.

### Repeated batches

- Feeding the same restaurant in three files in one full ingest merges it if the dedupe ID is the same.
- Feeding it in three separate **complete-corpus** rebuilds replaces the internal row each time; public research persists by Place ID.
- Feeding only the third small file does not append—it deletes all other internal candidates.
- Feeding the same entity under three different Place IDs can create three catalog records.

## 11. Idempotency, resume and failure recovery

### Classification

| Operation | Classification | Reason |
|---|---|---|
| raw ingest | conditionally idempotent | same full corpus/config reproduces scores, but deletes/reinserts, changes IDs/timestamps, and can leave public rows orphaned if corpus is incomplete |
| scored CSV export | idempotent content for same records | rewritten/sorted by score; filesystem write occurs after DB rebuild |
| public seeding | conditionally idempotent | UPSERT by Place ID, but updates source ID/time and a small limit repeatedly touches the same top rows |
| main research | resumable, not deterministic | completed rows skipped; paid model output varies; pending states checkpoint each row |
| main research retry | explicit/conditional | timeout/connection ambiguity intentionally blocks automatic retry to avoid duplicate charges |
| deterministic score recalc | idempotent current state | same stored evidence/version yields same score; history fingerprint deduplicates |
| low-footprint research | one-shot/conditionally resumable | eligibility fingerprinted, but failure marks attempted and removes route eligibility; no standard retry command |
| OSM resolution | conditionally idempotent | fixed index yields same candidates; already map-eligible rows are preserved; candidate rows are replaced for unresolved runs |
| address research | resumable/conditional | query cache and run status prevent unsafe repeats; explicit retry authorization required |
| local address geocoding | conditionally idempotent | fixed accepted address/index produces same output; run/history rows are append-oriented |
| location fallback/history | conditionally idempotent | active value protected by precision/provenance rank; history can append |
| auto-publication | idempotent state set | same evidence gives same decision; auto-rejected rows become terminal for ordinary batch selection |
| card local backfill | idempotent by fingerprint/merge | uses stored evidence only |
| paid card backfill | resumable/conditional | run status and fingerprint prevent repeats; explicit ambiguous retry |

### Checkpoint model

There is no `pipeline_jobs` or `batch_items` table. Checkpointing is distributed across:

- `public_restaurants.research_status`, `review_status`, location fields and retry flags;
- append-oriented research/address/card/score/location history tables;
- evidence/input/query fingerprints;
- per-row commits.

This is enough to survive many single-process interruptions, but not enough to reproduce exactly which 500 IDs constituted a batch unless the operator saves an external manifest.

### If a 500-restaurant run dies at item 317

A single 500-row invocation is impossible: `run_pipeline_batch` rejects limits above 100. The correct operation is five or more <=100 tranches, ideally from a saved explicit-ID manifest.

After interruption:

1. Stop; do not immediately repeat paid calls.
2. Run `pipeline_cli status` and inspect the last candidate plus all `needs_retry`/`failed` rows.
3. Rows with complete main research are reusable: rerunning their explicit `--place-id` proceeds to location/publication without another main research call.
4. Pending rows can be run normally.
5. For an ambiguous main request, run `retry-research --place-id ... --dry-run`, then authorize the state change without `--dry-run`, then invoke `run --place-id ...` separately.
6. Use `retry-address-research` for a standalone ambiguous address run.
7. Failed deterministic/schema/content results should be inspected, not blindly retried.
8. A failed/ambiguous low-footprint run has no equivalent supported retry command; treat it as manual remediation and a scale-readiness gap.
9. Resume from the next unfinished ID in the external manifest; do not rely on `LIMIT` alone to reconstruct batch membership.

## 12. Database and state model

### Core relationships

```text
restaurants (id; no unique place_id constraint; rebuilt as a corpus)
       | logical join by place_id, no FK
       v
public_restaurants (place_id PK; durable canonical/public state)
       |--< restaurant_research_runs
       |      `--< score_calculation_runs
       |--< low_footprint_research_runs
       |--< restaurant_card_enrichment_runs
       |--< description_research_runs
       |--< location_match_candidates (place_id, rank PK)
       |--< address_research_runs
       |      `--< address_search_attempts
       |      `--< address_evidence
       |             |--< address_decision_audits
       |             |--< address_review_decisions
       |             `--- verified_restaurant_addresses (one per restaurant)
       |--< address_geocode_results
       `--< location_history
```

### Table purposes and uniqueness

| Table | Purpose | Important uniqueness/index behavior |
|---|---|---|
| `restaurants` | compact raw candidate, internal features and score | integer PK only; no Place-ID unique/index; area/category/score/geo indexes |
| `metadata` | ingest time/count/config/status | key PK |
| `public_restaurants` | current canonical enrichment, score, location, publication | Place ID PK; research/status and published-score indexes |
| `restaurant_research_runs` | append-oriented main/low-footprint structured research audit | no unique current-run constraint; indexed by restaurant/current/time |
| `score_calculation_runs` | deterministic score snapshots | unique `(public_restaurant_id, evidence_fingerprint)` |
| `low_footprint_research_runs` | eligibility and paid pass lifecycle | unique `(public_restaurant_id, evidence_fingerprint)` |
| `restaurant_card_enrichment_runs` | local/embedded/paid card passes | unique `(public_restaurant_id, phase, input_fingerprint)` |
| `description_research_runs` | accepted/failed grounded descriptions and usage | append-only, no uniqueness |
| `location_match_candidates` | ranked OSM candidates | composite PK Place ID + rank |
| `address_research_runs` | paid request lifecycle/usage | append-only |
| `address_search_attempts` | generated/actual query audit | fingerprint index, not unique |
| `address_evidence` | structured source observations and deterministic decision inputs | append-only, fingerprint stored but not unique |
| `address_decision_audits` | deterministic decision versions | append-only |
| `address_review_decisions` | human decisions | append-only |
| `verified_restaurant_addresses` | current accepted address | Place ID PK |
| `address_geocode_results` | local/offline geocoder outputs | append-only |
| `location_history` | active/replaced/invalidated location history | append-only |

There is no candidate rejection table separate from `restaurants` cleaning stats; dropped input rows exist only in command summary/source files. There is no pipeline batch/job table.

The database uses SQLite WAL and foreign keys. Pipeline loops are sequential and commit frequently, usually once per stage/restaurant. No explicit `busy_timeout` is configured.

## 13. Publication and product visibility gates

### Internal eligibility

A candidate is internally eligible when:

- raw rating >=3.9;
- review count between 5 and 500;
- not chain-flagged;
- internal score >=55.

The default public seed adds an additional internal score >=60 rule.

### Base publication readiness

`publish_readiness` requires:

- stable Place ID;
- a display name from researched names or candidate title;
- a category from researched or candidate category;
- completed research;
- a stored deterministic score and score version;
- manual approval only when using the manual `publish_candidate` path.

Location attempted/map eligible are warnings only.

### Automatic score policy

Current auto-publication hard conditions are exactly:

- `product_eligible` true;
- current Fiyu score >=75;
- not excluded as a same-brand/large chain.

Identity confidence, Fiyu confidence and conflict state are reported under `diagnostics` and are not conditions. This is intentional in current regression tests for confidence. `blocking_conflict` is calculated and historical conflict supersession is audited, but it is not included in the final conditions dictionary.

Product exclusions are affirmative restricted access (members/referral/invitation), mobile/catering/service-only, entertainment-first with food secondary, non-dining service, and evidence-integrity failure. Unsupported or unknown evidence generally fails open to an eligible visit-ready candidate entity.

### Visibility surfaces

- Public list/detail: `is_published=1 AND product_eligible=1`.
- Picks: above plus `map_display_eligible=1`, non-null coordinates, and radius/precision policy.
- Map coordinates are blanked from public rows when not map eligible.
- A published row can therefore exist but not appear in Picks/map.

A low-score restaurant can remain in `restaurants` or `public_restaurants` unpublished. A fully researched/enriched restaurant can fail product eligibility or Fiyu score. A researched restaurant can be map eligible but auto-rejected; the current snapshot has 57 mapped unpublished rows. Conversely, code permits publication without map eligibility even though the current snapshot happens to have no such published row.

## 14. Fiyu Score flow

### Internal candidate score

Confirmed code weights:

- quality: 45%
- underexposure: 30%
- digital footprint: 10%
- confidence: 10%
- independence: 5%

Quality uses an area-prior-adjusted rating. Underexposure is inverse log-review percentile against area+category peers, falling back to area and global cohorts. Candidate confidence is 80% log-scaled review count and 20% ten-field completeness. Chain, very small samples and ratings below 3.9 incur penalties/caps. Missing mandatory rating/review count causes row rejection; optional missing fields reduce completeness or use explicit defaults.

### Public score v3

Confirmed code weights:

- quality: 45%
- hiddenness: 15%
- independence/distinctiveness: 15%
- Local Discovery: 25%

Hiddenness is:

- 40% internal underexposure;
- 25% tourist hiddenness;
- 15% reservation scarcity;
- 20% digital scarcity.

Independence is 70% chain classification, 20% known-location count, 10% specialist status. Local Discovery is separately weighted across underexposure (25%), web scarcity (15%), international obscurity (15%), local-audience orientation (15%), independence (20%) and distinctiveness (10%).

Known chains cap the Fiyu score below 55. Non-venue product exclusions cap it below 50; restricted access is a product gate rather than a quality penalty.

Fiyu confidence is separate from score:

- 40% identity confidence;
- 30% source coverage, saturated at five sources;
- 15% review-language evidence (100 if known, otherwise 25);
- 15% consistency (0 on conflict, otherwise 100).

Confidence does not raise the score and currently does not block publication.

### Persistence/recomputation

- Main and low-footprint research calculate and persist current fields plus a research-run score JSON.
- `score_calculation_runs` stores a fingerprinted deterministic snapshot.
- `pipeline_cli score --place-id` / `public_cli recalculate` recomputes from stored evidence without a model call.
- A new raw ingest recomputes internal scores but does not automatically recompute public scores.
- Targeted card enrichment does not automatically recompute Fiyu Score.
- Score recalculation does not automatically reevaluate/unpublish publication state; an explicit pipeline/publication pass is needed.

## 15. Existing batch and operator tools

### Current preferred normal path

`python -m fiyu.pipeline_cli --db ...` is the preferred unified operator interface:

- `import-candidates --limit N --min-score S`
- `run [--place-id ID | --limit N] --osm-index PATH [--osm-address-index PATH] [--model M] [--dry-run]`
- `research`, `research-low-footprint`, `score`, `verify-location`
- explicit main/address/card retry authorization commands
- inspection, status, review, approval, rejection, publication
- local/published location and card/canonical-detail backfills

`run` is sequential and accepts 1–100 candidates. `--dry-run` plans the main research request and reports that location would be attempted; it does not simulate the full post-research location/publication result. It calls schema initialization, so the safest strict dry-run target is a disposable database copy.

### Raw ingest

```text
python -m fiyu.cli ingest INPUT... --db DB --csv-out CSV [threshold flags]
```

This is the only current candidate-universe importer. It supports multiple files/directories but no append, dry-run, resume, shuffle, seed, filter-by-area, or concurrency. It processes all rows in memory and rebuilds `restaurants`.

### Specialized/legacy interface

`python -m fiyu.public_cli --db ...` remains active for:

- schema init, legacy seed/research/list/export/review/publish/unpublish;
- localization and grounded descriptions;
- discovery-area audit/enrich/import;
- OSM index build/resolve/review/anchor resolve;
- address research/recalculation/review/import;
- geocoding input export, local file/OSM/ABR geocoding, result import;
- manual location replacement/invalidation and status reports.

It overlaps the unified CLI for seed/research/publication. The unified CLI should drive the normal restaurant lifecycle; `public_cli` should be used only for its specialized audited operations.

### Scripts directory

The checked-in `scripts/` currently contains score/personalization audit tools, not restaurant batch ingestion tools. There is no maintained candidate shuffler, batch manifest runner, or catalog QA report generator.

### Randomization and concurrency

No restaurant catalog command randomizes candidates. Inputs are sorted; seed order is internal score then confidence; run order is completed-first then `updated_at`, Place ID. There is no async/worker concurrency in catalog enrichment loops.

## 16. Candidate plan for approximately 1,500 additional restaurants

### A. Required source fields

At minimum: Place ID, title, rating, review count. For launch quality, also provide category, reviewed source area/file, address/city/neighborhood hints, scrape timestamp, closed/ad flags, and preferably coordinates for internal identity diagnostics only.

### B. ID type

The public path specifically needs the external Place ID currently used by the source corpus. CID/FID/name/address/coordinates can dedupe an internal row but cannot seed it into the public workflow. OSM IDs are not candidate IDs.

### C. Independent recovery

Once a full candidate row survives internal scoring, OpenAI web research can independently recover names, cuisine/tags/dishes, identity evidence, local/international visibility, chain/access/product facts, address evidence, card/practical fields and sources. Local OSM resolves authoritative map position. It does **not** independently recover the required initial rating/review inputs from a Place ID.

### D. Stratification

Broad random sampling alone is unsafe. Internal scoring and downstream research cannot correct an upstream source universe that overrepresents sushi, counter dining, central wards, highly reviewed businesses, or Google-visible venues. Sampling should be stratified before ingestion at least by:

- all 23 special wards / intended launch neighborhoods;
- broad cuisine/category;
- review-count bands and rating bands;
- imported price band when available;
- venue format proxies (cafe/bar/izakaya/restaurant, counter/table where known);
- chain/brand likelihood;
- source/query template.

The current corpus covers Adachi, Chiyoda, Chuo, Koto, Minato, Ota, Setagaya, Shibuya, Shinjuku, Suginami, Taito, Toshima and the Ogibashi neighborhood. Eleven wards are absent from the reviewed source manifest.

### E. Candidate-source bias

Risks include Google/Apify ranking bias, query-language bias, tourist/central-area visibility, category-query bias, review-count survivorship, source-specific closure lag, and the internal candidate score's preference for ratings/review patterns already present in each area cohort.

### F. Avoiding a one-format catalog

Set target quotas before acquisition; collect multiple query templates per area/category; deduplicate the complete universe; produce a pre-ingest balance report; apply a deterministic seeded shuffle **within strata**; and preserve stratum/source fields in an external manifest. Do not take the first 1,500 results or rely on the pipeline's score ordering as a diversity mechanism.

## 17. Proposed randomization and batch strategy

### Important existing-pool finding

At the default seed threshold there are 2,121 candidates, of which 1,621 are not in the public queue. Before buying/acquiring 1,500 new rows, evaluate whether this pool can supply the target after research attrition and balance constraints. At the current snapshot, 263 of 320 completed research rows are visible (82.2%), but this is not a controlled yield estimate and should not be extrapolated without rejection-stratified QA.

### Deterministic ordering

Because the CLI has no seeded shuffle or manifest input, generate and retain an external manifest containing:

- Place ID;
- source file/query and acquisition timestamp;
- ward/neighborhood/category/price/review-count strata;
- deterministic shuffle seed and rank;
- raw-ingest status, seed status, research status, location status, publication result;
- attempts and operator notes.

Use explicit `--place-id` runs in manifest order for the first pilots. A future batch runner may automate this, but no production change is proposed in this audit.

### Tranche recommendation

- Dry-run plan: 10 explicit, balanced candidates.
- First paid pilot: the same 10.
- Second tranche: 25 if the first passes QA.
- Third/fourth: 50.
- Mature maximum: 100 per invocation, the enforced code limit.
- Do not attempt 250 or 500 as one command. They exceed the current limit and create too much paid/QA exposure without a batch checkpoint.

Twenty-five is the recommended initial operating batch after the 10-row pilot. It is small enough to manually review every identity/location/publication decision and to bound worst-configured normal-path exposure at 75 Responses requests / 400 web actions, while being large enough to reveal source-coverage and rejection patterns. Those maxima assume every row triggers both optional fallbacks; actual usage should be taken from run output.

## 18. Concurrency, limits, runtime and cost

- Catalog loops are synchronous and sequential.
- There is no worker queue, asyncio fan-out, thread pool, process pool or provider semaphore.
- SQLite uses WAL, but no busy timeout and no cross-process job lease exist. Running two operators/workers against the same queue risks duplicate selections, state races and locks.
- Main `run` is capped at 100. Low-footprint default is 5 and capped at 25. Card backfill can select large counts but still calls sequentially.
- Most OpenAI clients disable SDK retries. There is no exponential backoff/sleep. Ambiguous requests deliberately require operator recovery.
- Google photos have a 10-second timeout and no retry/cache.
- Local OSM operations can scan/rank up to 250 name candidates per restaurant, but are local and normally much cheaper than web research.
- Frequent per-stage SQLite connections/commits favor recovery over throughput.
- Main research and low-footprint structured web research are the likely dominant cost and runtime. Address fallback is next. OSM resolution/scoring are local.
- No duration model is encoded, so elapsed time cannot be responsibly projected. Measure p50/p95 response time in the pilot.
- No API price table is stored. Obtain current model/web-search pricing separately before approval.

## 19. Scale-readiness risk register

| Severity | Risk | Evidence/impact | Required operational response before scale |
|---|---|---|---|
| **BLOCKER** | Unattended publication can ignore branch/conflict/confidence/location diagnostics | Current conditions are product eligibility, score>=75, not-chain; tests confirm location and confidence are diagnostic. Wrong/ambiguous identity can be publicly visible outside Picks. | Manual identity/location/publication QA for every pilot row; do not enable unattended large-scale publication until policy is separately reviewed. |
| **BLOCKER** | New-candidate ingest is destructive and has no dry-run/staging promotion | `replace_restaurants` deletes the complete internal table; omitted/closed candidates are not reconciled with published rows. | Only rebuild a disposable clone from the full old+new corpus; diff and approve before any production replacement. |
| **HIGH** | No durable batch manifest/job/cursor | Per-row state resumes work but cannot reconstruct intended batch/order/seed. | External immutable manifest and explicit IDs. |
| **HIGH** | `import-candidates --limit N` is not pagination | Repeated small calls keep selecting/upserting the same top N. | Seed once with a limit covering the intended score-qualified universe; verify newly inserted count separately. |
| **HIGH** | Different Place IDs are never entity-deduped | Duplicate physical restaurants can publish; exact/near coordinates and spelling variants are ignored across IDs. | Pre-ingest cross-ID duplicate QA and post-resolution duplicate checks. |
| **HIGH** | Closed/removed source rows do not unpublish public rows | Whole rebuild can remove `restaurants` row while durable public row remains live. | Explicit removed/closed reconciliation report before promotion. |
| **HIGH** | Low-footprint failure recovery gap | Failure marks attempted/ineligible; no operator retry command analogous to other paid passes. | Treat failures as manual stop items; do not silently continue at scale. |
| **HIGH** | Source geography/category bias | Only 12 wards plus one neighborhood in current manifest; no stratified selector. | Define acquisition quotas and balance report before new sourcing. |
| **HIGH** | SQLite has no multi-worker lease/busy timeout | Concurrent scale workers can race/lock. | Run one pipeline process; do not parallelize against one DB. |
| **MEDIUM** | Seed/public score divergence after ingest | Internal cohort scores change, but public scores/publication are not automatically recomputed. | Explicit score/republication audit after approved corpus rebuild. |
| **MEDIUM** | Auto-rejected state is terminal for normal batch selection | Improved evidence/policy does not naturally reenter the queue. | Explicit per-ID reevaluation plan. |
| **MEDIUM** | OSM/PBF indexes are dated July/August 2026 in the inspected environment | Moves/closures/new POIs may be stale for an October expansion. | Rebuild/revalidate indexes from an approved current extract before publication-scale location work. |
| **MEDIUM** | No DB uniqueness on internal Place ID | A code-path regression/manual write can introduce duplicates. | Read-only duplicate assertion in every QA report. |
| **MEDIUM** | Main/card calls have no explicit output-token cap | Per-request cost bound is less precise than low-footprint/address calls. | Capture tokens and impose operator stop thresholds. |
| **MEDIUM** | Candidate price/address can cross the reference/canonical boundary | Budget promotion and navigation search fallback use candidate values. | Separate data-boundary review. |
| **MEDIUM** | README workflow language is partially stale | It describes manual publication/location ordering, while code auto-publishes and treats location as warning. | Use code/tests as authority; update docs in a separate task. |
| **LOW** | Frequent connections/commits reduce throughput | Safe but slower at 1,500 rows. | Measure first; optimize only after correctness gates. |
| **LOW** | Optional localization uses SDK default retries | Retry policy differs from paid research passes. | Keep outside critical pilot or capture request counts. |

## 20. Recommended first dry run

Do not ingest new restaurants. First validate the current pending supply.

### Candidate count and selection

Select 10 of the 176 pending public rows using a fixed external seed and quotas spanning:

- at least five discovery areas;
- at least five broad categories;
- low/mid/high internal-score bands among pending candidates;
- varied review-count/price availability;
- at least two names with plausible branch ambiguity and two sparse-digital-footprint rows.

Save the exact Place IDs and seed in a CSV/JSON manifest. The current CLI cannot do this selection itself.

### Database and command

Create a consistent disposable SQLite clone that includes the main DB plus committed WAL state. There is no operator clone command; use the repository's SQLite backup approach, not a bare copy of `fiyu.db` while WAL is active.

For each manifest ID, run against the clone:

```powershell
python -m fiyu.pipeline_cli --db data/staging/fiyu-scale-pilot.db run `
  --place-id PLACE_ID `
  --osm-index C:\data\osm\fiyu-kanto-index.sqlite `
  --osm-address-index C:\data\osm\fiyu-kanto-address-index-v2.sqlite `
  --dry-run
```

This reports model selection and maximum main-request/web-action exposure without calling OpenAI. It does not prove the eventual location/publication result. Before the paid pilot, rebuild or explicitly accept the age of the local OSM indexes.

### Capture

- immutable candidate manifest and source strata;
- CLI JSON output per candidate;
- pre/post DB counts and hashes for the disposable clone;
- projected response/web-action maximum;
- current research/review/location state;
- actual paid-run output later, including tokens/actions/failures;
- OSM resolution candidates/reasons;
- deterministic publication decision and every diagnostic.

### Stop conditions

Do not scale beyond 10 if any of the following occurs:

- wrong or ambiguous entity/branch auto-publishes;
- any candidate hint is treated as verified coordinates;
- unexpected paid retry/duplicate request;
- failed low-footprint work cannot be safely accounted for;
- source/action/token maxima are exceeded or usage cannot be reconciled;
- DB lock/corruption/integrity issue;
- duplicate physical restaurant under multiple Place IDs;
- more than 10% unresolved identities or more than 20% unresolved map locations in the pilot;
- material category/geography skew relative to the manifest;
- any publication lacks a reviewable reason trail.

## 21. Per-batch QA report

Every tranche should emit one compact report with the following sections.

### Ingestion/selection

- source universe count; selected count; attempted/completed/fatal failures;
- raw invalid, closed, ad, non-food, exact duplicates;
- new vs already-seeded Place IDs;
- rejected/auto-rejected/pending/retry-required;
- deterministic manifest seed/rank and config hash.

### Identity/location resolution

- matched/unmatched and identity-confidence distribution;
- branch ambiguity and material-conflict counts;
- exact/strong/weak OSM match counts;
- exact/block/chome/neighborhood/area/unresolved precision;
- missing coordinates, approximate map points, cross-ward conflicts;
- candidate-to-OSM distance only when both coordinates are independently valid;
- duplicate OSM objects and near-coordinate cross-ID clusters.

### Enrichment coverage

- Japanese/English name, category, food tag, signature dish, description;
- canonical budget and imported-vs-researched source;
- hours, reservation, contact/booking, seating, service period, payment;
- card enrichment `strong`/`usable`/`sparse`;
- evidence source count/types and low-footprint routing outcomes.

### Publication

- researched, scoreable, product eligible, chain excluded;
- auto-published, manually published, auto-rejected, unpublished;
- published-but-not-map and mapped-but-unpublished;
- rejection/missing/readiness reasons;
- Fiyu Score, Local Discovery and confidence distributions/bands;
- count of published rows with conflict/low identity/low confidence diagnostics.

### Catalog balance

- ward/neighborhood and discovery-source distribution;
- cuisine/broad category and common food tags;
- price band and unknown price;
- counter/table/private-room/small-capacity;
- solo/group/date and service-period distribution;
- chain/group affiliation and access model;
- comparison with target quotas and cumulative catalog.

### Quality and operations

- suspicious score/component outliers;
- duplicate Place IDs and possible cross-ID duplicates;
- closed/moved/replaced signals;
- low-confidence and source-conflict records;
- elapsed total and p50/p95 per stage;
- Responses requests, web actions, input/output/total tokens;
- retry, timeout, provider/schema failure counts;
- SQLite lock/error count.

## 22. Exact sequence toward 1,500–2,000 eligible restaurants

1. Freeze a consistent backup and immutable snapshot metrics. Keep one pipeline writer.
2. Do the 10-row read-only dry-run plan from current pending rows.
3. Run the same 10 as a paid pilot only after cost approval; manually inspect every source, identity, score, location and publication result.
4. Run 25 current pending rows, then 50, with QA/stop review after each.
5. Audit all 2,121 currently seedable rows for ward/category/price/format balance and cross-ID duplicates. Do not acquire 1,500 new candidates until this report shows the existing gap.
6. Seed the intended existing pool on a staging clone with one sufficiently large `import-candidates` limit. Do not repeat small limits expecting pagination.
7. Process explicit manifest IDs in 25-row tranches, graduating to 50 and at most 100 only after stable QA.
8. Estimate attainable yield and balance from controlled tranche results. The current 1,621 unseeded score>=60 rows may support a substantial portion of the target.
9. If supply gaps remain, design a 23-ward, category/price/format-stratified acquisition plan. Require full candidate rows, not Place IDs alone.
10. Add every new source file to a reviewed discovery manifest and run discovery/source audits.
11. On a disposable clone, ingest the **complete existing plus new corpus**. Compare cleaning, duplicate, chain, cohort-score, removed/closed and source-balance deltas. Never ingest only the new files into the production catalog DB.
12. Reconcile every removed/closed previously public Place ID and every public row missing its internal candidate.
13. Recompute/audit public scores whose internal signals changed and explicitly reevaluate publication state.
14. Refresh/rebuild OSM POI/address indexes from an approved current extract; validate all 23 ward boundaries.
15. Continue staged research in explicit manifest order with cost/runtime/quality reports.
16. Require manual review for branch/conflict/low-confidence diagnostics until a separate publication-gate decision is implemented and tested.
17. After reaching target balance and quality, create and integrity-check a scrubbed production snapshot; deploy one writer-free runtime copy.
18. Continue closure/move/duplicate freshness audits after launch; the current pipeline has no automatic reconciliation scheduler.

## 23. Files and functions that govern the workflow

Primary normal-path files:

- `src/fiyu/readers.py`
- `src/fiyu/columns.py`
- `src/fiyu/normalize.py`
- `src/fiyu/ingest.py`
- `src/fiyu/database.py`
- `src/fiyu/config.py`
- `src/fiyu/scoring.py`
- `src/fiyu/cli.py`
- `src/fiyu/public_catalog.py`
- `src/fiyu/research_worker.py`
- `src/fiyu/public_score.py`
- `src/fiyu/local_discovery.py`
- `src/fiyu/catalog_pipeline.py`
- `src/fiyu/pipeline_cli.py`

Location and source-provenance files:

- `src/fiyu/discovery_areas.py`
- `src/fiyu/discovery_area_sources.json`
- `src/fiyu/location_anchors.json`
- `src/fiyu/osm_index.py`
- `src/fiyu/osm_resolver.py`
- `src/fiyu/address_research.py`
- `src/fiyu/address_geocoder.py`
- `src/fiyu/address_geocoding.py`
- `src/fiyu/location_verification.py`
- `src/fiyu/location_import.py`
- `src/fiyu/location_corrections.py`
- `src/fiyu/osm_review.py`
- `src/fiyu/address_review.py`

Optional content/runtime files:

- `src/fiyu/card_enrichment.py`
- `src/fiyu/description_research.py`
- `src/fiyu/localization_worker.py`
- `src/fiyu/public_cli.py`
- `src/fiyu/google_places.py`
- `src/fiyu/daily_picks.py`
- `src/fiyu/production_snapshot.py`
- `src/fiyu/sqlite_snapshot.py`

Representative regression coverage consulted:

- `tests/test_columns.py`
- `tests/test_normalize.py`
- `tests/test_scoring.py`
- `tests/test_public_catalog.py`
- `tests/test_public_score.py`
- `tests/test_catalog_pipeline.py`
- `tests/test_osm_pipeline.py`
- `tests/test_address_research.py`
- `tests/test_card_enrichment.py`
- `tests/test_daily_picks.py`

## 24. Bottom line

The pipeline owns substantial canonical enrichment after a complete provider-derived candidate row enters the system, but it does not resolve an external ID into that starting row. It is deterministic and auditable in scoring/location policy, and reasonably recoverable one restaurant at a time. It is not yet a safe unattended bulk platform: corpus ingest is replace-all, selection is unrandomized/unstratified, batch identity is external, retry coverage is incomplete, and publication treats important identity/location diagnostics as nonblocking.

Use the existing 176 pending and 1,621 unseeded score>=60 candidates to validate yield and balance first. Start with 10 explicit dry-run IDs, then 10 paid, then 25. Do not ingest a new 1,500-row corpus or run a maximum-size tranche until the blocker-level publication and whole-corpus reconciliation risks have an approved operating control or a separate implementation fix.
