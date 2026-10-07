# Fiyu pipeline scale-readiness v2

Date: 2026-10-07  
Scope: repository inspection plus read-only inspection of `data/fiyu.db`  
Decision horizon: grow Tokyo Catalog v1 from 851 to roughly 1,500 published restaurants without changing score policy, Quality-v4, specialist semantics, or the publication floor.

## Executive verdict

The current system is suitable for a small, sequential, operator-supervised batch drawn from the already-seeded queue. It is **not yet safe enough for a broad new-source import followed by an unattended large paid wave**.

The limiting factor is not catalog size and is not SQLite. It is the boundary between raw sources and the stateful catalog:

1. `fiyu ingest` still deletes and reconstructs all 8,086 `restaurants` rows.
2. `restaurants.id` is reassigned, while `public_restaurants.source_restaurant_id` stores that unstable integer without a foreign key. Place ID is the real durable identity.
3. Standard research checkpoints each restaurant but has no durable batch record or atomic worker claim. Two workers can select the same pending row and make duplicate paid requests.
4. The public catalog list query lacks an index on `restaurants.place_id`; its representative SQL took a 5.414-second median locally. Picks and the seed/research selectors were milliseconds.
5. Publication reconciliation is a correct, safety-oriented administrative path but took 196.3 seconds for 1,203 rows. It should be made one-pass before it becomes routine, without changing its evaluator.

SQLite remains appropriate for an internal catalog of roughly 1,500 published rows and a few tens of thousands of candidates. WAL is enabled, foreign keys are enabled, external calls occur outside long write transactions, and current selectors are mostly fast. One writer, an explicit busy timeout, a single writable catalog process, and backup/snapshot discipline are the appropriate operating model. PostgreSQL would not solve the destructive ingest or duplicate-request risks.

No new restaurant research system is needed. The existing main research, Quality-v4, address, local OSM, low-footprint, card-enrichment, promotion, and publication-reconciliation paths should be reused. What is missing is orchestration: stable import provenance, one coherent run/manifest record, safe claims, field-specific selection, and simpler supported CLI entry points.

## Current canonical lifecycle

```text
CSV/TSV/JSON/JSONL/NDJSON/XLSX source exports
  -> readers + columns.raw_record_from_row
  -> normalize.clean_and_dedupe
       durable match preference: place_id -> cid -> fid -> name/address -> name/coordinates
  -> normalize.add_chain_features
  -> scoring.score_records                         [cheap/internal screen]
  -> database.replace_restaurants                  [DELETE + rebuild: unsafe boundary]
  -> public_catalog.seed_unseeded_public_queue     [additive by place_id]
  -> research_worker.run_research_batch            [1 paid response; evidence + identity/address]
  -> public_score.evaluate_fiyu_candidate          [deterministic production-v3 base]
  -> optional low-footprint/address/card passes
  -> quality_v4_backfill.run_quality_v4_backfill   [1 paid response; shadow-only, checkpointed]
  -> quality_v4_promotion                          [audited transactional promotion]
  -> specialist tri-state                          [versioned deterministic semantics]
  -> publication_reconciliation                    [threshold 70 + product policy]
  -> public_catalog/API                            [published + product eligible]
  -> daily_picks._published_catalog                [+ map eligible + coordinates]
```

### Stage matrix

| Stage | Input / output | Durable key and storage | Entry point | Mutation / idempotency / resume | Calls, failures, retries, concurrency | Principal tests |
|---|---|---|---|---|---|---|
| Raw ingest | Provider files -> normalized raw candidates | In-memory until `restaurants`; preferred key `place_id` | `fiyu ingest`, `run_ingestion` | Destructive whole-corpus replace. Same complete inputs dedupe logically, but IDs/timestamps churn. No run checkpoint. | No external call. Parse/validation failure before DB write leaves DB intact; DB transaction rolls back. CSV export occurs after DB commit, so export failure can leave DB updated. Assumes one importer. | ingest/readers/normalize/database tests |
| Cheap screen | Cleaned full cohort -> signals, internal score, eligibility | `restaurants.place_id`; score/config in row and `metadata` | part of `ingest` | Deterministic for the same complete cohort/config; cohort-relative features mean adding sources can alter scores. | No external call. Whole cohort is held in memory. | scoring/ingestion tests |
| Candidate selection | Eligible unseeded rows -> deterministic selection | place ID; selection returned in CLI JSON only | `pipeline_cli seed-unseeded --dry-run` | Read-only dry-run; stable hash ordering for fixed seed and DB. Exact selected IDs are not durably registered unless operator saves output. | No external call. Correlated `NOT EXISTS` is indexed on public PK. | `test_seed_unseeded.py` |
| Seed | Selected candidates -> `public_restaurants` pending rows | `public_restaurants.place_id` PK | `seed-unseeded`; legacy `import-candidates`/`public_cli seed` | New command uses `BEGIN IMMEDIATE`, `ON CONFLICT DO NOTHING`, exact selected IDs, and is safe to repeat. Legacy seed repeatedly upserts top rows and refreshes unstable source ID/time. | One writer. Rollback on failure. | seed/public-catalog/pipeline tests |
| Main research / identity | Pending row -> structured research, evidence, identity, initial score and embedded address/card data | place ID; `restaurant_research_runs`, address tables, score history, public row | `pipeline_cli research` or `run` | Per-row pre-call `needs_retry` checkpoint and a `running` run record. Success commits evidence/score/history together. No batch manifest. | Sequential; one Responses call per selected row, up to four web actions. Timeout/ambiguous failure -> `needs_retry`; deterministic/schema/content failure -> `failed`. Explicit recovery. Two workers can race because selection and claim are separate. | research worker, retry, catalog pipeline, address tests |
| Low-footprint | Sparse high-potential evidence -> supplemental research | place ID + evidence fingerprint; low-footprint run | `research-low-footprint`; automatic in `run` | Fingerprinted and generally no-op on repeat. Failure recovery is less uniform than main research. | Paid, sequential; per-row state. | low-footprint tests |
| Location / discovery | Names/address/areas -> verified OSM location or approximate area anchor | place ID; address evidence, geocode results, location history; OSM type/id | `verify-location`, `public_cli` address/OSM commands | Deterministic local steps are rerunnable for fixed indexes. Imports have dry-run/validation. Stronger location precedence prevents weaker overwrite. | Mostly offline. Optional address research is paid and has explicit retry state. | address, OSM, discovery, pipeline tests |
| Quality-v4 | Completed base research -> quality-only shadow evidence and shadow score | place ID + quality version; `quality_v4_research_runs`; JSON manifest/results | `quality-v4-backfill` | Strongest batch model in repository: exact selection, run ID, pre-call pending outcome, per-row JSONL and manifest flush, one request per selected row, completed skip, targeted retry/floor modes. `--force` is intentionally dangerous. | Sequential. Timeout/429/5xx/credit ambiguity is retryable; validation/content failures remain failed. No absence-as-negative change. | Quality-v4 backfill/retry tests |
| Promotion / specialist | Audited shadow rows -> production score/version and tri-state semantics | place ID; score history and public row; backup + report | `quality-v4-promote`, version fix, specialist migration | Dry-run first, cohort assertions, backup required, transaction, parity/integrity checks; safe with stated preconditions and idempotency checks. | No provider call. One writer. | promotion/version/specialist tests |
| Publication | Stored canonical state -> exact membership at floor 70 | place ID; public row + metadata; backup/report/change log | `reconcile-publication` | Dry-run and cohort audit; real run requires backup and transaction. Repeating after success yields no changes. | No provider call. Correct but slow inspection path. | publication/evaluator/reconciliation tests |
| Public API | Canonical row -> sanitized list/detail/map response | place ID | `/public/restaurants`, detail, map endpoints | Read-only. Does not expose raw research tables or whole raw rows. | Runtime SQLite readers; hosted snapshot is documented as read-only and one replica. | API/public catalog/map tests |
| Picks | Published catalog -> eligible location-aware pool and assignments | place ID plus user/round state | `daily_picks._published_catalog`, API assignment routes | Catalog read is deterministic; assignment/history writes use `BEGIN IMMEDIATE`. Requires published, product eligible, map eligible, coordinates. | No restaurant-research calls. | daily Picks/taste tests |

## Raw ingestion safety

`database.replace_restaurants` runs `DELETE FROM restaurants` followed by reinsertion of the supplied records. It is still a complete-corpus rebuild.

- Stable identity: `place_id` is the durable public key. `cid` is a secondary ingest key. `fid` participates in in-memory dedupe but is not persisted. Fallback name/address and name/coordinate keys are not durable aliases.
- Integer IDs: `restaurants.id` changes on rebuild. `source_restaurant_id` can therefore point to the wrong/missing raw row until seeding refreshes it. Most important joins correctly use `place_id`, but the integer pointer is misleading state.
- Second source: safe only when included with every existing source in a complete rebuild. Source file/area arrays preserve merged provenance on the winning candidate, but there is no durable observation per source/run.
- Partial ward refresh: not safe as an ingest input because it would delete every other raw candidate.
- Import failure: normalization happens before DB mutation; the SQL replace is transactional. A database exception rolls back. The optional CSV is written after commit, so DB and export can diverge if export fails.
- Repeating a complete source set: does not create logical duplicates when keys match, but reassigns integer IDs and rewrites metadata.
- Staleness/deletion: impossible to distinguish “not observed in this run,” “source removed,” “restaurant closed,” and “entity deleted” after replacement.
- Provenance: only collapsed `source_files_json`/`source_areas_json` exists on the canonical candidate. Original observations, source row, import hash, first/last seen, and tombstone reason are absent.

Classification: **BLOCKER BEFORE LARGE-SCALE NEW-WARD INGESTION**.

Minimum compatible future model:

1. Add `candidate_source_runs` (run ID, source ID/market, input hash, config hash, started/completed/status/counts).
2. Add immutable/upserted `candidate_source_observations` keyed by source + source entity key + observation fingerprint, preserving raw-normalized fields and seen timestamps.
3. Make `restaurants.place_id` indexed/unique when non-null and treat it as the canonical candidate identity. Add an alias table later only for cross-ID merges; do not replace Place ID today.
4. Materialize/upsert the current candidate projection from observations in a transaction. Mark source observations stale only after a successful complete source run; never infer global deletion from one ward file.
5. Retain `restaurants.id` only as an internal surrogate; stop using it as a durable public pointer. Join and reconcile by place ID.
6. Provide inspect/dry-run counts and a promotion step. Preserve the existing `run_ingestion` as a deprecated complete-rebuild escape hatch until parity tests pass.

This is a medium change with a migration, but no catalog score/publication mutation should be part of the migration.

## Run, manifest, resumability, and failure model

There is no pipeline-wide batch model. Current concepts are:

- source import: no run or manifest;
- seed-unseeded: selector and exact IDs in process output, no durable record;
- main research: durable per-row runs and public status, no batch identity/selector/source hash;
- Quality-v4: JSON manifest + JSONL per-row checkpoints + DB row runs, including request/action/token counters;
- promotion/migrations/reconciliation: JSON/Markdown/change artifacts, backup SHA, cohort assertions;
- address/card/description/low-footprint: separate run tables and fingerprints with different status vocabularies.

The recommended common envelope is one `pipeline_runs` record plus `pipeline_run_items`:

```text
pipeline_runs:
  run_id, operation, market_id, status, created/completed_at,
  selector_json, selected_ids_hash, config/version_json, source_hashes_json,
  requested/completed/failed/retryable/skipped counts,
  request/web-action/token counts, estimated_cost_basis_json,
  artifact_paths_json, error_summary_json

pipeline_run_items:
  run_id, place_id/source_observation_id, ordinal,
  status, attempt_count, claimed_by, lease_expires_at,
  outcome/error_category, provider_response_id,
  request/web-action/token counts, started/completed_at
```

Quality-v4 artifacts remain valid and should not be migrated. New code should wrap/reuse their fields and status semantics. A selection is frozen before paid work. Claiming an item is an atomic conditional update. Success or failure checkpoints one item. A repeated invocation resumes the same run or creates a new run only for explicitly selected retryable items.

### Rerun classification

| Command / operation | Classification | Guardrail |
|---|---|---|
| `fiyu ingest` | **NOT SAFE TO RERUN** for a partial source; **SAFE WITH PRECONDITION** for the full corpus | Full source set only; preserve DB backup; integer IDs still churn |
| `pipeline_cli import-candidates` / `public_cli seed` | **SAFE WITH PRECONDITIONS** | Legacy top-N upsert; can repeatedly touch existing rows and unstable source IDs |
| `seed-unseeded` | **SAFE TO RERUN** | Fixed seed/threshold; completed seeds disappear from selection; transaction and conflict ignore |
| `research` | **SAFE WITH FLAGS/PRECONDITIONS** | Pending only by default; failed requires explicit retry; ambiguous `needs_retry` requires recovery first |
| `run` | **SAFE WITH PRECONDITIONS** | Per-row completed work reused, but no frozen batch and no multiworker claim; limit <=100 |
| `quality-v4-backfill` | **SAFE WITH FLAGS/PRECONDITIONS** | Default/retry/floor selectors skip complete; never use broad `--force` for ordinary resume |
| Quality-v4 promotion | **SAFE WITH PRECONDITIONS** | Exact cohort, dry-run, backup, parity; repeat is no-op/idempotent |
| Publication reconciliation | **SAFE WITH PRECONDITIONS** | Exact threshold/cohort, dry-run, backup; repeat is no-op |
| Deterministic score/address/canonical-detail recalculation | **SAFE TO RERUN** for fixed versions/input | Fingerprints or state comparison prevent duplicate history where implemented |
| OSM resolution/imports | **SAFE WITH FLAGS/PRECONDITIONS** | Fixed index, dry-run, reviewed input; `--force` only for an exact row |
| Legacy manual publish/unpublish | **SAFE WITH PRECONDITIONS** | State-set is idempotent but bypasses canonical reconciliation workflow |
| Old one-off scripts | **UNKNOWN unless artifact-specific assertions are read** | Do not treat historical migration scripts as production entry points |

### Crash/failure outcomes

| Failure | Persisted state | Retry safety / operator visibility | Main risk |
|---|---|---|---|
| Provider timeout/connection after send | Main/Quality-v4 pre-call state is retryable/ambiguous; run row records error | Explicit recovery required; inspect run/error first | A retry may duplicate provider spend because request outcome is unknowable |
| 429/credit/5xx | Quality-v4 categorizes retryable; main research usually records error/failed or needs-retry according to ambiguity | Per-row retry possible | Standard research categories are less structured than Quality-v4 |
| Malformed structured response | Failed run; canonical result not committed | Safe to inspect and selectively retry, not blind retry | Paid request with no usable result |
| Identity conflict | Evidence/conflict retained; publication/product/location logic can block or require review | Deterministic reevaluation safe | Must not auto-merge aliases |
| Database lock | SQLite exception; transaction rolls back | Usually safe to retry, but not consistently categorized in manifests | Operator lacks a common run summary; default timeout is implicit |
| Process termination/restart | Completed rows stay complete; in-flight row remains ambiguous/running/needs-retry depending on exact point | Per-row history enables diagnosis | No batch owner/lease; stale `running` recovery is command-specific |
| Disk full/write error | Current transaction rolls back; artifact and DB checkpoints can diverge | Verify DB/artifact hashes and integrity before resume | No central run status reconciles both sinks |
| Partial batch | Prior rows committed, later rows untouched | Normal single-worker resume skips completed rows | Exact original batch membership is not reproducible outside Quality-v4 without saved CLI output |

## SQLite operational and query review

`database.connect` enables WAL and foreign keys on every connection. Python's connection default currently yields a 5,000 ms busy timeout, but the application does not state it explicitly. Transactions are short; provider calls occur between committed pre-call state and later result persistence rather than inside a database write transaction. This is correct for SQLite.

Correctness risks:

- two writers can race on research selection because there is no atomic claim/lease;
- the hosted README requires a persistent Railway volume and one backend replica, but this is operational convention rather than an enforced startup invariant;
- local pipeline mutation must not target the hosted read-only snapshot while API replicas serve it;
- per-row state and artifacts can diverge on disk failure;
- `source_restaurant_id` is not stable through raw rebuilds.

Performance evidence from the same canonical DB:

| Read-only operation | Result rows | Median |
|---|---:|---:|
| Open read-only DB | 1 | 0.280 ms |
| Public catalog list SQL | 851 | **5,414 ms** |
| Picks catalog SQL | 848 | 16.009 ms |
| Seed-unseeded selector | 918 | 9.469 ms |
| Main research selector | 100 | 23.443 ms |
| Quality-v4 selector | 1,203 | 0.776 ms |
| Full publication reconciliation inspection | 1,203 | **196,332 ms** |

The catalog list plan uses `idx_public_score`, then `SCAN r LEFT-JOIN`, plus temporary B-trees for group/order. `restaurants.place_id` has no index, so joining 851 public rows to 8,086 candidates is needlessly expensive. Add `CREATE UNIQUE INDEX ... ON restaurants(place_id) WHERE place_id IS NOT NULL` after proving the current invariant, or a non-unique index first if migration safety requires it. Consider a preaggregated community subquery so grouping does not sort the complete joined result.

Picks uses `idx_public_score` and a small temporary order by. At 848 rows it is already fast. Seed uses `idx_restaurants_candidate` plus the public primary key. Research currently scans the 8,086-row candidate table and joins by public PK; an index on `restaurants.place_id` fixes that too. Quality-v4 is fast at this size.

The 196-second reconciliation is an administrative O(N) evaluator implemented with repeated connections/lookups, effectively much more expensive than a one-pass load. Preload all public rows, relevant latest research runs, score history, and candidate signals once; run the exact same pure evaluator in memory; then write changes in one transaction. Keep parity tests against the current implementation.

Verdict: **keep SQLite**. Add an explicit connection timeout/busy timeout, use one pipeline writer, atomic item claims before considering concurrency, a documented backup/snapshot/restore check, and the missing join index. Do not move to PostgreSQL for this milestone.

## CLI inventory and target hierarchy

Status labels: canonical means the recommended supported path; transitional means still needed but should be wrapped; legacy means overlapping behavior should be deprecated after parity wrappers exist.

| Surface | Commands | Status and recommendation |
|---|---|---|
| `fiyu.cli` | `ingest`, `demo`, `write-config`, `export-map-assets`, `production-snapshot` | `ingest` is canonical implementation but unsafe interface until source-run/upsert work; other commands are safe utilities. |
| `pipeline_cli` core | `inspect`, `seed-unseeded`, `research`, `run`, `score`, `status` | Canonical direction. Add durable run IDs/manifests and market argument. |
| `pipeline_cli` legacy overlap | `import-candidates` | Legacy alias for queue seeding, confusingly named like raw import. Deprecate after docs/tests move to `seed-unseeded`. |
| `pipeline_cli` retries | `retry-research`, `retry-address-research`, `retry-card-enrichment` | Canonical safety controls; retain explicit authorization. Consolidate under `research retry --kind`. |
| `pipeline_cli` location/content | `research-low-footprint`, `verify-location`, `restore-best-location`, `backfill-published-locations`, `backfill-card-enrichment`, `backfill-canonical-details` | Transitional but valuable. Keep behavior; organize under `research`, `location`, and `enrichment`. |
| `pipeline_cli` audited migrations | `quality-v4-backfill`, `quality-v4-promote`, `quality-v4-fix-specialist-version`, `specialist-tristate-migrate`, `reconcile-publication` | Canonical historical/current operations. Version-fix and specialist migration become archival after their certified cohort is immutable; never delete artifacts. |
| `pipeline_cli` manual review | `review`, `approve`, `reject`, `publish` | Keep for explicit operator decisions; canonical publication membership remains reconciliation. |
| `public_cli` duplicated core | `init`, `seed`, `research`, `recalculate`, `publish`, `unpublish`, `review`, `list`, `export` | Legacy overlap. Preserve until wrappers and docs/tests migrate; then warn/deprecate. |
| `public_cli` content | `localize-content`, `research-descriptions` | Transitional targeted tools; place under `enrichment`. |
| `public_cli` address/location | `export-location-review`, `import-verified-locations`, `location-status`, `discover-addresses`, `recalculate-address-decisions`, `export-geocoding-inputs`, `geocode-address-file`, `replace-location`, `export-address-review`, `import-address-review`, `geocode-verified-addresses`, `address-resolution-status`, `build-osm-index`, `resolve-osm-locations`, `import-location-review`, `resolve-osm-anchors` | Valuable and tested, but too dispersed. Wrap under `fiyu location ...`; do not rewrite algorithms. |
| `public_cli` discovery | `audit-discovery-areas`, `enrich-discovery-areas`, `import-discovery-areas` | Reusable deterministic tooling; move under `fiyu geography ...`. |
| Standalone audit/migration scripts | Quality experiments, closure audits, challenge/sample runners | Historical/reproducibility artifacts, not a production workflow. Keep immutable and clearly label paid scripts. |

Target hierarchy:

```text
fiyu source inspect|import|status
fiyu candidates inspect|seed
fiyu research plan|run|retry|status
fiyu quality-v4 plan|run|retry|promote|status
fiyu enrichment price|card|description
fiyu location audit|resolve|review|import|status
fiyu publication inspect|reconcile|status
fiyu catalog export|snapshot|audit
```

One shared `--run-id`, `--market`, `--dry-run`, `--manifest-out`, and selector vocabulary should be used. Keep old modules as wrappers until command-parity tests and docs are complete.

## Observability

Already present:

- ingest cleaning/deduplication counts and score reasons in process output;
- seed pool/selected/seeded/race-skip counts and exact selected IDs;
- per-row main/address/card/Quality-v4 run histories;
- response IDs, web actions and token metadata in the stronger research paths;
- Quality-v4 manifest/results/error categories;
- promotion/reconciliation backups, hashes, parity and change reports;
- closure reports for ward/cuisine/price/score/map coverage.

Missing or inconsistent:

- discovered/new/updated/stale/rejected per source run;
- durable cheap-screen distributions and rejection reasons tied to an import run;
- one exact standard-research batch membership and lifecycle;
- common error taxonomy and retryability across main, address, card, and low-footprint passes;
- deterministic cost calculation (prices are intentionally not stored; store usage and a named price-table version if later added);
- one post-run coverage snapshot and comparison to its pre-run baseline;
- stale-running/lease visibility;
- artifact/DB checkpoint reconciliation.

Every operation should emit one JSON run summary with source, cheap screen, seed, research, Quality-v4, publication, and coverage sections. A Markdown rendering can be generated from the same JSON. No dashboard is required.

## Current source coverage and local path to ~1,500

The raw corpus remains 12 special-ward sources plus Ogibashi, not all Tokyo. Counts are by `restaurants.search_area`; public city normalization can differ.

| Source area | Candidates | Eligible | Seeded | Published | Eligible unseeded |
|---|---:|---:|---:|---:|---:|
| Setagaya | 707 | 216 | 89 | 65 | 127 |
| Shibuya | 705 | 221 | 118 | 89 | 103 |
| Toshima | 705 | 252 | 123 | 97 | 129 |
| Chiyoda | 704 | 164 | 64 | 40 | 100 |
| Taito | 704 | 261 | 130 | 89 | 131 |
| Minato | 703 | 225 | 101 | 62 | 124 |
| Chuo | 700 | 211 | 101 | 57 | 110 |
| Ota | 700 | 273 | 100 | 83 | 173 |
| Adachi | 699 | 300 | 100 | 76 | 200 |
| Suginami | 697 | 250 | 104 | 76 | 146 |
| Koto | 645 | 228 | 99 | 64 | 129 |
| Shinjuku | 398 | 157 | 72 | 52 | 85 |
| Ogibashi | 19 | 7 | 2 | 1 | 5 |

Missing special-ward source batches include Arakawa, Bunkyo, Edogawa, Itabashi, Katsushika, Kita, Meguro, Nakano, Nerima, Shinagawa, and Sumida. Some published rows in these cities exist through overlap/other sources, but they are not independently covered source cohorts.

Available local pools:

- 227 completed but auto-rejected plus 14 completed needs-review. These are not 241 free additions: most have already failed score/product policy. Re-evaluation without new evidence is a no-op.
- the **149-row floor-70 rescue cohort** remains production-v3, unpublished, and separately defined. The prior local audit estimated 50 median, 64 p75, and 76 p90 possible additions from up to 149 Quality-v4 calls. It is not already included in the 851.
- 111 seeded unresolved rows: 103 pending, 4 failed, 4 needs-retry. Internal bands are one at 65–69.99, 107 at 70–74.99, and three at 75–79.99.
- 1,562 eligible unseeded raw candidates total. The normal >=60 pool is 918: 471 at 60–64.99 and 447 at 65–69.99. The remaining 644 are below 60 and have no defensible historical conversion cohort; lowering the cheap seed floor is not recommended merely to hit a number.

Observed completed-research publication rates by original internal band are 34.18% for 60–64.99, 72.06% for 65–69.99, 91.64% for 70–74.99, 93.33% for 75–79.99, and 90.32% for 80+. These are selection-biased historical rates, not guarantees.

### Scenarios

| Scenario | Workload | Likely additions | Result | Interpretation |
|---|---|---:|---:|---|
| Conservative | Research 111 unresolved; seed/research 918 >=60; Quality-v4 the 149 rescue and successful new research | ~430–450 | ~1,280–1,300 | Uses roughly 20%/50% low-band conversion, ~80 unresolved, ~35 rescue. Existing source is insufficient. |
| Base | Same 1,178 candidate/rescue population | **~635** | **~1,486** | ~102 unresolved + historical-band estimate 483 + rescue median 50. Falls ~14 short and has no quality/operational buffer. |
| High-yield | Same pool, optimistic 45%/80% low-band conversion, near-complete unresolved, rescue p90 | ~750 | ~1,600 | Arithmetically enough, but optimistic and still geographically concentrated. Do not plan capacity on it. |

Paid volume is larger than the candidate count: a newly seeded row normally needs one main Responses request and one Quality-v4 request, with optional low-footprint or address fallback. Processing all 111 unresolved plus 918 new seeds is up to about 2,058 baseline main/Quality-v4 requests, plus 149 rescue Quality-v4 requests (about 2,207 total), before optional fallbacks. Exact usage must be planned from a frozen manifest and bounded tranches.

Conclusion: existing raw supply is close in the base case but not reliably sufficient. The 149 rescue cohort improves yield without new sourcing. A balanced expansion to thin/missing wards is still necessary for a confident 1,500 target and should occur only after source-safe ingest exists.

## Existing targeted research and normalization capabilities

### Price

- Canonical fields are `budget_json`/`budget_source_value`; `CardEnrichment.BudgetInfo` records JPY bounds, band, source type, confidence, source, and checked time.
- Main research can return structured card enrichment. Phase-B card research explicitly supports sourced budget.
- `backfill-canonical-details` and phase-A card enrichment can normalize existing `restaurants.price` locally. Of 228 published rows lacking canonical budget, 155 still have a nonblank raw price hint; only unambiguous supported JPY formats will normalize.
- The remaining unknowns should first be inspected for existing structured research/card evidence. There is no clean field-specific “missing budget only” paid selector; current phase-B selection is card-completeness oriented and may research more fields than needed.
- Reuse the existing card schema/persistence/retry model. Add a `--missing budget` selector and no-op fingerprint; do not build a new research pipeline.

### Discovery area

- Existing fields include candidate city/neighborhood/address/coordinates, source/search areas, public discovery-area provenance, verified address ward/neighborhood/street, OSM ward boundaries/address areas, map precision/anchor, and deterministic `human_area_label` fallback.
- 804 published rows lack the dedicated reviewed `discovery_area`, but that is not equivalent to having no usable geography. Most have city/neighborhood/address and 848 are map ready.
- Reuse `audit/enrich/import-discovery-areas`, verified address components, OSM boundary inference, and deterministic fallback. Build a local proposal/report first; require review for conflicts. No LLM/web call is justified for deterministic geography.

### Cuisine and food tags

- Candidate `category` and `broad_category` are preserved. Main research writes `primary_category` and food tags; raw evidence is retained.
- Existing normalization is a small, code-level broad-category mapping, not a versioned accepted cuisine taxonomy. Published data contains 320 distinct primary labels and language/spelling/specificity variants.
- This is an offline taxonomy problem: preserve raw label, derive versioned normalized cuisine and family, and retain independent food tags. Do not flatten useful specialist labels and do not web-research ordinary synonyms.

### New wards

- Readers and raw-row normalization already accept arbitrary source files and derive source context. Existing discovery-manifest/OSM tools can support new files.
- What cannot safely be parameterized today is persistence: importing only a thin ward deletes the rest of `restaurants`.
- Reuse readers, cleaning, dedupe, scoring, discovery provenance, and seed/research. Add source-scoped observation/upsert persistence; do not create a separate ward pipeline.

## Data normalization target

Use a raw-preserving, derived-value model:

1. Preserve source observation label/value, source/run identity, timestamp, and evidence.
2. Store derived fields separately: `normalized_cuisine_id`, `cuisine_family_id`, normalized price band, normalized market/administrative area, and current specialist tri-state.
3. Add a small versioned taxonomy registry (`taxonomy_name`, `version`, mapping file hash) and record the version on derived rows/catalog snapshots.
4. Make remapping deterministic and dry-run-able. Produce changed/unchanged/unmapped/conflict counts and exact IDs.
5. Backfill on a snapshot/temp DB, compare API/Picks/publication invariants, then transactionally promote derived values only. Scoring inputs remain unchanged unless a separate future scoring project explicitly approves it.
6. Keep market-specific aliases/configuration separate from universal cuisine families; Tokyo terminology need not be erased to support NYC/LA.

Specialist tri-state is already the strongest example: raw provenance, explicit `specialist|not_specialist|unknown`, schema version, and neutral unknown semantics. Follow that pattern.

## Market readiness

Tokyo hardcoding is extensive but mostly intentional for Tokyo v1. It becomes a blocker only when a second market is introduced.

| Area | Examples | Classification / action |
|---|---|---|
| Research prompts/signals | “Tokyo restaurant,” Japanese/local sources, Japanese-source counts/share | Product-intentional Tokyo v1; **must become market prompt/signal config** before NYC/LA. Do not reinterpret Japanese source metrics as universal localness. |
| Geography | `TOKYO_BOUNDS`, 23 ward names/adjacency, `canonical_tokyo_ward`, Japanese address/chome parsing, Tokyo OSM boundary completeness | **Must change before multi-city.** Put resolver/parser choice, bounds, admin levels and accepted granularities behind market config. |
| Map/Picks | Shibuya reference point, Tokyo center/bounds/radii, city label fallback | Configure by market. Radius policy may remain product-specific per market. |
| Price | JPY parser/bands and <=¥3,000 affordable Picks slot | **Must change before multi-city.** Currency, parser and affordability thresholds are market config; preserve canonical numeric/currency values. |
| Source/discovery | `*_Initial.csv`, 23-ward manifest, station/ward/chome assumptions | Source configuration per market; Tokyo source files remain unchanged. |
| API/user city | literal `city_id='tokyo'`, label Tokyo | Already resembles a city identifier but must validate against a registry rather than special-case one string. |
| Time | UTC persistence; no broad restaurant-hours timezone logic observed | Keep UTC timestamps; add market timezone (`Asia/Tokyo`, `America/New_York`, `America/Los_Angeles`) for local-day/hour behavior. |
| Scoring/publication | score versions and floor 70 | Keep unchanged. Market rollout should not silently fork scoring policy. |

Minimal abstraction:

```python
MarketConfig(
    market_id="tokyo",
    display_name="Tokyo",
    country_code="JP",
    timezone="Asia/Tokyo",
    currency="JPY",
    center=(...),
    bounds=(...),
    admin_parser="tokyo_special_wards",
    supported_location_granularity=("ward", "neighborhood", "chome", "block"),
    price_normalizer="jpy_v1",
    source_config="tokyo_sources_v1",
)
```

Add `market_id` to source runs, candidates, public rows, and run manifests before multi-city. Do not build a worldwide geography ontology.

## Cost efficiency and concurrency

Avoid paid calls in this order:

1. run deterministic canonical-detail/price and discovery-area proposals from stored raw/research/address/OSM data;
2. check current field completeness and input fingerprints;
3. freeze an exact eligible selection;
4. skip rows with a successful current-version result;
5. use field-specific targeted research only for unresolved gaps;
6. retain neutral unknown/no-evidence semantics.

Two main research workers today can both read the same pending row, then both mark/start and send a request. SQLite serializes their short writes but does not serialize the external work. Quality-v4 is also designed and documented as sequential; its pre-call checkpoint improves recovery but is not a general lease. API reads can coexist with one pipeline writer under WAL. Two writers can hit the implicit five-second busy timeout.

Parallel research is not needed before 1,500. Provider cost is not reduced by concurrency, and wall-clock improvement is less valuable than exact-once selection. If later required, first add atomic `pending -> claimed` transition with owner/lease/attempt, frozen run items, provider idempotency support if available, bounded concurrency (for example 2–4), rate limiting, and crash/lease tests.

## Security boundary check

- OpenAI and Google server keys are read only in backend modules. Supabase service-role usage is backend-only; README explicitly warns against frontend exposure.
- Public runtime does not require OpenAI credentials.
- Admin raw-candidate/stat endpoints require `_require_admin_access`; omitting `FIYU_ADMIN_API_KEY` disables them. Pipeline mutation is CLI-based, not exposed as public research endpoints.
- Public restaurant responses are explicit sanitized projections; raw candidate rows, raw run payloads, full research evidence, errors, and usage metadata are not returned.
- Restaurant research inputs are catalog/provider data, not user taste, saved, visit, profile, or notification data.
- This audit read variable names and code paths only; it did not print secret values. Audit artifacts contain catalog aggregates, code findings, IDs only where pre-existing artifacts do, and no user secrets.

## Test architecture

Strong existing coverage protects deterministic scoring, ingestion/normalization, main research and retry, address/OSM resolution, card enrichment, Quality-v4 backfill/promotion/version parity, specialist migration, publication reconciliation, public API, map visibility, and Picks.

Tests required before refactoring:

1. source-run import is additive across two wards and a rerun is a no-op;
2. failed source run leaves current observations/projection unchanged;
3. stable place identity and public join survive source updates and integer ID changes;
4. stale/missing/closed source semantics are explicit and source-scoped;
5. two workers cannot claim the same research item;
6. kill at pre-request, post-request/pre-response, and post-response/pre-commit produces defined retry state and no automatic duplicate request;
7. run manifest exact membership, counters, retry categories, and resume parity;
8. database-lock/busy-timeout classification and retry behavior;
9. public-list query plan uses the candidate place-ID index and performance does not regress;
10. optimized reconciliation produces byte-for-byte equivalent decisions/reasons to the existing evaluator;
11. market config keeps Tokyo outputs unchanged and isolates NYC/LA bounds/currency/parser fixtures;
12. normalization preserves raw labels, versions derived mappings, and leaves score/publication/Picks invariants unchanged.

## Prioritized backlog

### P0 — before the next large seed/research wave

| Item | Evidence / risk | Minimal fix | Affected areas | Migration / catalog mutation | Complexity / payoff / tests |
|---|---|---|---|---|---|
| Source-safe ingestion | `replace_restaurants` deletes all candidates; no source run/observation/stale semantics; unstable integer pointer | Add source runs + observations, dry-run, source-scoped upsert/materialization; join public by place ID | ingest, database, normalize boundary, CLI | Schema migration; no score/publication mutation | Medium; removes catastrophic partial-import risk; tests 1–4 above |
| Durable batch + atomic research claim | Standard research has per-row runs but no batch selection and two workers can duplicate spend | Add run/items envelope, freeze IDs, atomic conditional claim/lease, common retry categories; initially enforce concurrency=1 | public catalog, research worker, catalog pipeline, CLI | Small/medium schema migration; no catalog decision changes | Medium; exact resume/cost/accounting; tests 5–8 |
| Candidate place-ID index and invariant audit | Public list median 5.4 s; plan scans 8,086 candidates; research join also scans | Audit duplicate/null IDs, add partial unique or safe non-unique `restaurants(place_id)` index; preserve fallback raw keys | database/schema, migrations | Index migration only | Small; major API/read improvement; query-plan/API tests |
| Explicit writer/timeout policy | One-writer assumption lives in docs; timeout implicit | Set `busy_timeout`/connection timeout explicitly, identify pipeline writer in run record, fail clearly if another active writer; keep Railway hosted DB read-only/one replica | database, startup/docs, run model | No catalog mutation | Small; boring lock failure; lock/concurrency tests |

### P1 — before ~1,500 / regular pipeline use

| Item | Minimal fix and payoff | Complexity |
|---|---|---|
| Reconciliation performance | Bulk preload latest run/history/candidate state and call the same pure evaluator; assert parity. Reduces ~196 s administrative audit. | Medium |
| Operator summary | Render one JSON/Markdown summary from run/items and coverage SQL; include source, screen, seed, research, V4, publication, usage, errors. | Small/medium |
| Field-specific completeness selectors | Add local-first `missing-budget`, discovery-area proposal, cuisine-normalization plan; paid budget research only after no-op detection. | Medium |
| CLI consolidation wrappers | Introduce target hierarchy, warnings for legacy duplicates, shared selector/run flags; no algorithm rewrite. | Medium |
| Backup/restore runbook | Verified snapshot, SHA/integrity, free-space check, restore drill; reconcile DB and external JSONL checkpoints. | Small |

### P2 — before NYC/LA

- Add `market_id` and the minimal market registry; parameterize bounds, admin parser, currency/price rules, timezone, center/radii, prompt locale, sources.
- Version cuisine/location/price taxonomies with market-aware aliases.
- Add cross-market source/run manifests and API city validation.
- Review durable identity namespace/aliases if Google Place ID is not sufficient across providers/markets.

### P3 — nice to have

- Bounded parallel research after claims/leases and rate-limit telemetry exist.
- Cost estimates from a versioned local price table; usage remains authoritative.
- Compact historical run artifacts after retention policy exists.
- A lightweight operator UI only if JSON/Markdown reports prove insufficient.

## Recommended implementation sequence

1. **Phase A — stable source ingestion.** Add tests, source-run/observation schema, dry-run and source-scoped upsert/materialization. Preserve the existing full rebuild behind an explicitly named legacy command. Prove canonical catalog/hash invariants on a copied DB.
2. **Phase B — run ledger and safe claims.** Add generic run/items tables and wrap standard seed/research first. Freeze selection, add one-writer claim/lease, error taxonomy and summary. Do not parallelize.
3. **Phase C — SQLite/query corrections.** Add the place-ID index, explicit busy timeout, query-plan regression tests, and bulk publication inspection with decision parity.
4. **Phase D — operator workflow/CLI.** Add the hierarchical wrappers and one run report; deprecate overlap without deleting commands.
5. **Phase E — local-first completeness.** Deterministic price/discovery/cuisine plans, then field-specific paid selectors only for unresolved rows. Run this as the first production workload after optimization.
6. **Phase F — market boundary.** Add `market_id`/Tokyo config and parity fixtures before any NYC/LA sourcing.

Each phase is independently testable and committable. No phase changes score weights, Quality-v4 semantics, specialist tri-state, the 70 floor, or current membership.

## What not to do

- Do not migrate to PostgreSQL for 1,500 restaurants.
- Do not rewrite the scoring/research/location pipeline.
- Do not add distributed queues or multiworker research before atomic claims.
- Do not retune scores, lower the floor, or reopen Quality-v4 semantics.
- Do not re-research all 851 published rows.
- Do not pay an LLM for deterministic price parsing, discovery geography, or cuisine synonyms.
- Do not build a generalized worldwide location platform.
- Do not make new-ward ingestion a separate pipeline.
- Do not rebuild personalization/Picks; its catalog query is already fast and its eligibility is correct.
- Do not migrate old audit history into the new run ledger; link immutable artifact paths/hashes.

## Safety certification

- `data/fiyu.db` SHA-256 before and after: `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90` (identical)
- `seed70.txt` SHA-256 before and after: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39` (identical)
- SQLite integrity: `ok`
- Foreign-key violations: `0`
- Canonical catalog: 1,203 total, 851 published, 352 unpublished, threshold 70
- External/provider requests: `0`

## Validation performed

- Focused pipeline/seed/Quality-v4/promotion/publication/public-catalog/Picks/SQLite tests: **161 passed**.
- Full backend suite: **946 passed**, with one pre-existing Starlette/httpx deprecation warning.
- Ruff on `scripts/audit_pipeline_scale_readiness_v2.py`: passed.
- Audit summary JSON parsed and asserted against canonical counts, Quality-v4 completion, and unchanged hashes.
- `git diff --check`: passed.
- No frontend files were changed and no provider call was made.

## Immediate decision

The very next implementation task should be **Phase A: source-run + source-observation persistence with a dry-run, source-scoped additive import and stable place-ID projection**, beginning with invariant tests on a temporary DB. Include the candidate place-ID index in that same foundation only if migration review confirms no duplicates; otherwise make it the immediately following small change.

Do not touch scoring, Quality-v4 logic, the 70 floor, publication membership, public API contracts, Picks/Taste, or concurrency yet.

After optimization, the first production workload should be **(c) a deterministic data-completeness backfill**, specifically local-only budget/discovery/cuisine proposals. It is the lowest-cost end-to-end proof of the new run ledger and reports, makes no provider calls, and cannot change publication membership. Next run the 149-row rescue cohort as a frozen bounded paid batch. A new seed wave should follow only after source-safe ingestion, run claims, and the new-ward source plan are proven.
