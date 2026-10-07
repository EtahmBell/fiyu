# Source-safe ingestion — Phase A implementation report

Date: 2026-10-07  
Scope: source ingestion only  
Canonical database: `data/fiyu.db` (read-only verification; never passed to the importer)

## 1. Old architecture

The raw ingestion entry point was `python -m fiyu.cli ingest ...`, which called
`ingest.run_ingestion`:

```text
supported files
  -> readers.iter_input_files / iter_rows
  -> columns.raw_record_from_row
  -> normalize.clean_and_dedupe
  -> normalize.add_chain_features
  -> scoring.score_records
  -> database.replace_restaurants
       DELETE FROM restaurants
       INSERT every surviving row
```

Supported formats remain CSV, TSV, JSON, JSONL, NDJSON, and XLSX. Normalization
requires title, numeric rating, and integer review count; filters closed,
advertisement, and non-food rows; and deduplicates in this order:

1. Place ID
2. CID
3. FID
4. normalized name + address
5. normalized name + rounded coordinates

Duplicate merge behavior remains unchanged: the newest `scraped_at` row is
primary; otherwise input order is deterministic; missing values are filled from
the secondary row; review count uses the maximum; source files/areas are unioned.

Whole-corpus replacement was historically the simplest way to preserve the
cohort-relative cheap score. Chain repetition, area rating priors, and review
percentiles are calculated over the complete candidate set, so the implementation
cleaned and scored the complete input in memory and materialized it wholesale.
There was no persistent source layer from which a complete projection could be
rebuilt safely.

The destructive behavior recreated `restaurants.id`. That mattered because
`public_restaurants.source_restaurant_id` stores the integer ID and Quality-v4,
promotion, and specialist tooling contain joins through that pointer. The pointer
has no foreign-key constraint, while the durable public/catalog identity is
`place_id`.

Read-only canonical verification found:

- 8,086 `restaurants` rows;
- 8,086 distinct, nonblank Place IDs;
- zero broken non-null `public_restaurants.source_restaurant_id` pointers.

Therefore Place ID is the correct source-import identity for the current corpus.
Rows that survive legacy cleaning through CID/FID/name fallbacks but lack a Place
ID are now reported invalid for source-safe persistence because they cannot enter
the existing public pipeline safely.

## 2. New architecture

```text
explicit source_key + complete source snapshot
  -> candidate_source_runs (running)
  -> parse / normalize / validate / same-source dedupe
  -> candidate_source_observations upserted by (source_key, place_id)
  -> prior observations absent from this snapshot marked seen_in_latest_run=0
  -> deterministic merge of every retained source observation
     + legacy canonical candidates not yet represented by an observation
  -> unchanged chain and cheap-score functions over the complete retained cohort
  -> restaurants upserted by place_id while preserving existing id
  -> candidate_source_runs (complete)
  -> existing seed/research/Quality-v4/publication pipeline
```

`restaurants` remains the downstream canonical candidate projection. No public,
research, Quality-v4, score-history, publication, map, Picks, Taste, or user-data
schema was redesigned.

## 3. Schema additions

### `candidate_source_runs`

One row per source import execution:

- integer run ID;
- explicit `source_key`;
- `running|complete|failed` status;
- start/completion timestamps;
- SHA-256 input fingerprint covering source identity, scoring config, category
  mode, ordered file names, and file bytes;
- resolved input files and scoring config JSON;
- rows seen, valid, invalid, and duplicate counts;
- new, updated, and unchanged counts;
- source-local missing count;
- failure summary.

This is deliberately source-ingestion-specific. It is not the future general
pipeline run ledger.

### `candidate_source_observations`

One current observation per `(source_key, place_id)`:

- explicit source identity and stable Place ID/source record key;
- compact normalized candidate JSON containing only fields needed for current
  merging/scoring;
- deterministic record fingerprint;
- first/last seen timestamps and run IDs;
- `seen_in_latest_run` source-local freshness flag.

The table preserves the latest normalized observation, not an unnecessary copy of
the provider's full raw payload. Existing source files remain read-only.

Schema creation is additive and idempotent. No migration is applied automatically
to `data/fiyu.db` by this task.

## 4. Source identity model

Normal ingestion now requires `--source-key`. It is an operator-defined stable
identity using letters, numbers, `.`, `_`, `:`, `/`, or `-`; it is not inferred
from a filename.

Example:

```powershell
python -m fiyu.cli ingest data/raw/nerima `
  --source-key provider-a-tokyo-nerima-v1 `
  --db data/staging.db
```

Each invocation represents the complete latest snapshot for that source key.
Filenames still supply the existing `search_area` fallback, preserving scoring
behavior, but do not define source ownership.

`pipeline_cli import-candidates` is not a raw importer; it is the legacy public
queue seeder. It remains unchanged. `seed-unseeded` remains the preferred queue
selector.

## 5. Observation and omission semantics

- New Place ID: insert the source observation and a new canonical candidate.
- Same source, changed row: update that observation and deterministically refresh
  the candidate projection.
- Second source, existing Place ID: retain both observations and merge to one
  canonical candidate.
- Identical rerun: record a new completed source run, retain one observation,
  report it unchanged, and create no candidate duplicate.
- Omitted from later snapshot: retain the observation, set
  `seen_in_latest_run=0`, and retain the canonical candidate.

Omission never deletes, unpublishes, marks closed, or supplies negative scoring
evidence. Explicit closure/removal policy remains a future, separate decision.

## 6. Canonical upsert behavior and integer safety

The importer materializes all retained observations, including source-stale ones,
then adds legacy canonical candidates that have not yet acquired an observation.
This allows incremental adoption on an existing database without deleting the
legacy corpus.

The unchanged `add_chain_features` and `score_records` functions run across that
complete retained set. Existing rows are updated using their current integer ID;
new Place IDs receive new IDs. Nothing executes `DELETE FROM restaurants`.

`source_restaurant_id` therefore remains valid without rewriting public rows.
The new implementation refuses a pre-existing duplicated canonical Place ID
rather than updating an arbitrary row.

## 7. Transaction and failure behavior

1. Additive schema initialization and a `running` run row are committed first.
2. Files are resolved, hashed, parsed, normalized, validated, and deduplicated.
3. Observation freshness updates, observation upserts, full projection scoring,
   candidate upserts, optional CSV export, metadata, and final `complete` run
   status occur in one `BEGIN IMMEDIATE` transaction.
4. Any parsing/validation failure records the run as `failed`; no observation or
   candidate mutation has begun.
5. Any observation/candidate persistence or export failure rolls back the entire
   import transaction, then marks the already-durable run `failed` in a separate
   short transaction.

The run record is therefore visible after failures without leaving a half-applied
candidate projection. A failed filesystem export can leave a partial export file,
but its database run is failed and all database changes are rolled back.

## 8. Duplicate and invalid input

- Duplicate Place IDs within a source snapshot use the existing deterministic
  merge logic and increment `duplicate_rows`.
- Conflicting duplicate rows prefer the newest `scraped_at`; without a newer
  timestamp, deterministic input order applies. Review count remains the maximum.
- Blank Place ID, malformed rating, and malformed review count are invalid.
- Mixed snapshots may complete with invalid-row counts when at least one valid
  Place ID remains.
- A snapshot with no valid Place ID fails validation and records a failed run;
  it does not mark prior observations stale.

## 9. Destructive legacy path

Normal `fiyu ingest` now routes only through source-safe ingestion and requires
`--source-key`.

Whole-corpus replacement remains only for the bundled demo and test fixtures:

- renamed `run_destructive_ingestion`;
- requires `allow_destructive=True`;
- low-level `replace_restaurants` independently requires the same explicit guard;
- refuses the repository's canonical `data/fiyu.db` path even with the guard;
- no destructive raw-ingest CLI option is exposed.

The `demo` command is explicitly a disposable/demo workflow. Existing fixture
utilities can continue to create complete temporary databases.

## 10. Parity and downstream preservation

A fixed 40-row input was processed through:

1. the guarded legacy whole-corpus normalization/scoring path; and
2. the source-safe observation/materialization path.

Every existing `INSERT_COLUMNS` candidate value matched exactly, including rating,
review count, normalized metadata, chain fields, score components, internal score,
eligibility, seed-facing fields, and provenance arrays.

A researched/published fixture containing a public row, main research run,
Quality-v4 run, score history, specialist state, score/version, evidence,
publication/review state, and integer source pointer was refreshed with changed
source data. Those downstream rows were byte-for-byte unchanged and the candidate
integer ID remained stable.

`seed-unseeded` selected newly imported eligible candidates, excluded seeded rows,
and returned an empty selection after the complete pool was seeded.

## 11. Required five-import scenario

All operations used a temporary SQLite database:

| Import | Source snapshot | Canonical candidates | Observations | Result |
|---|---|---:|---:|---|
| 1 | Source A: 100 unique | 100 | 100 | 100 new candidates/observations |
| 2 | Identical Source A | 100 | 100 | 0 new; 100 unchanged; all IDs stable |
| 3 | Source A: original 100 + 20 | 120 | 120 | 20 new; original IDs stable |
| 4 | Source A omits 10 | 120 | 120 | 10 source-stale; zero deletion; all IDs stable |
| 5 | Source B: 30 overlap + 20 new | 140 | 170 | 30 dual-source candidates, 20 new, zero duplicates |

## 12. Files changed

- `src/fiyu/source_ingestion.py`: source run/observation schema, import
  fingerprints, transactional persistence, projection merge, and Place-ID upsert.
- `src/fiyu/ingest.py`: normal source-safe compatibility entry point and guarded
  destructive fixture helper.
- `src/fiyu/database.py`: explicit guard on whole-corpus replacement.
- `src/fiyu/cli.py`: required `--source-key`; demo routed explicitly to the
  guarded fixture path.
- `tests/test_source_ingestion.py`: additive, idempotency, source overlap,
  omission, ID stability, failure, rollback, parity, downstream, seed, schema,
  and CLI tests.
- `README.md`: source-key and additive snapshot semantics.
- `data/audits/source-safe-ingestion-phase-a-report.md`: this report.

## 13. Validation

- New source-ingestion tests: 13 passed.
- Focused ingestion/scoring/seed/pipeline/publication tests: 119 passed.
- Full backend suite: 959 passed, with one pre-existing Starlette/httpx
  deprecation warning.
- Ruff on changed Python files: passed.
- `git diff --check`: passed.
- No frontend changes.
- External/provider requests: 0.

## 14. Canonical database safety

- `data/fiyu.db` SHA-256 before: `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90`
- `data/fiyu.db` SHA-256 after: `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90`
- `seed70.txt` SHA-256 before: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39`
- `seed70.txt` SHA-256 after: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39`
- SQLite integrity: `ok`
- Canonical public catalog: 1,203 total, 851 published, 352 unpublished
- Publication threshold: 70
- Canonical schema/data mutation by this task: none

## 15. Remaining P0 work

Phase A is sufficient to proceed to the separately scoped **Phase B — durable
pipeline run ledger and atomic research claims**.

Phase A intentionally does not add:

- general pipeline runs/items;
- research claims, leases, concurrency, or retries;
- the separately identified `restaurants.place_id` performance index;
- explicit global SQLite writer/timeout policy;
- publication reconciliation optimization;
- market abstraction or completeness backfills.

One planning clarification emerged: because cheap scoring is cohort-relative, a
source import still recomputes the cheap candidate projection across the complete
retained corpus. This is local deterministic computation, not destructive
persistence. It preserves scoring semantics but means source imports should remain
operator-controlled and should report selection-impact changes in a later
observability pass.
