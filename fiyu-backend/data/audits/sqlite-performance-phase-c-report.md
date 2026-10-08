# SQLite Performance Phase C Report

Date: 2026-10-07

## Scope and invariants

Phase C was a targeted SQLite, index, transaction, and performance pass. It did not change scoring, Quality-v4, specialist tri-state, publication rules, the floor-70 threshold, research semantics, Picks semantics, API serialization, or user data. All schema and benchmark work used disposable database copies; `data/fiyu.db` was not initialized or mutated.

The certified canonical outcome remains 1,203 total restaurants, 851 published, 352 unpublished, and publication threshold 70.

## Implementation

- Added an additive, idempotent unique index on `restaurants(place_id)` through the canonical schema initialization path and through public-schema initialization for existing databases.
- Made the core connection timeout explicit at 15 seconds and applied `PRAGMA busy_timeout = 15000` consistently, while retaining foreign-key enforcement and the existing WAL policy.
- Optimized publication reconciliation by loading evaluation inputs and published duplicate context once per run, then passing that context through the same canonical publication evaluator. No second evaluator was introduced.
- Removed a redundant full database copy/integrity pass from reconciliation. Integrity is checked on the already-required isolated snapshot.
- Documented the SQLite operating and single-writer policy in `README.md`.
- Added a reproducible benchmark helper and focused Phase C tests.

## Index audit

### Added index

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_place_id
ON restaurants(place_id);
```

Uniqueness was validated before choosing the constraint: the canonical source table has 8,086 rows, 8,086 nonblank `place_id` values, 8,086 distinct values, and zero duplicates. The intended ingestion identity is already `placeId`-first, so uniqueness enforces rather than changes the data model. A legacy database containing duplicate IDs now fails initialization clearly instead of producing ambiguous joins.

The write cost is one narrow B-tree update for each candidate insert or `place_id` change. This is justified by the index's use in the public catalog, public detail, research selection, and reconciliation joins.

No other indexes were added. Existing public score, research queue, community recommendation, Quality-v4, and pipeline-run indexes already support their measured paths. Picks was already fast, and additional indexes would have been speculative write overhead.

### Material query plans

Public catalog before:

```text
SEARCH p USING INDEX idx_public_score (is_published=?)
SCAN r LEFT-JOIN
SEARCH c USING INDEX idx_community_recommendations_place (place_id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

Public catalog after:

```text
SEARCH p USING INDEX idx_public_score (is_published=?)
SEARCH r USING INDEX idx_restaurants_place_id (place_id=?) LEFT-JOIN
SEARCH c USING INDEX idx_community_recommendations_place (place_id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

Public detail changed from `SCAN r LEFT-JOIN` to `SEARCH r USING INDEX idx_restaurants_place_id (place_id=?) LEFT-JOIN`.

Standard research selection changed from a full scan of `restaurants` to:

```text
SEARCH p USING INDEX idx_public_research_queue (research_status=?)
SEARCH r USING INDEX idx_restaurants_place_id (place_id=?)
USE TEMP B-TREE FOR LAST TERM OF ORDER BY
```

## Benchmark results

Measurements used the same developer machine and disposable copies of the canonical database. Query figures are medians, with approximate p90 shown. Exact row values and ordering were compared before and after.

| Operation | Rows | Before median / p90 | After median / p90 | Speedup | Parity |
| --- | ---: | ---: | ---: | ---: | --- |
| Public catalog | 851 | 5,194.269 / 5,585.102 ms | 13.901 / 14.735 ms | 373.66x | Exact |
| Public detail | 1 | 5.447 / 6.292 ms | 0.004 / 0.005 ms | 1,361.75x | Exact |
| Picks/map pool | 848 | 14.665 / 18.008 ms | 14.677 / 15.953 ms | 1.00x | Exact |
| Seed selector | 918 | 8.489 / 9.291 ms | 9.425 / 13.738 ms | 0.90x | Exact |
| Standard research selector | 100 | 22.607 / 25.169 ms | 0.265 / 0.350 ms | 85.31x | Exact |
| Quality-v4 selector | 342 | 49.463 / 51.328 ms | 56.061 / 63.851 ms | 0.88x | Exact |

The small seed and Quality-v4 timing movements are sub-15 ms absolute noise and use unchanged plans. They did not justify additional indexes or query changes.

### Publication reconciliation

The same-machine baseline of the old path was 390.535 seconds. The previous audit recorded 196.332 seconds. The optimized full inspection completes in 15.810 seconds: 24.70x faster than the same-machine baseline and 12.42x faster than the prior audit baseline.

The former N+1 path repeatedly loaded the same public/research context and re-ran duplicate queries for each restaurant. The optimized path preloads the joined evaluation set and immutable published-duplicate context once, while invoking the same canonical evaluator for every row. Removing the redundant database copy/integrity pass further reduced fixed overhead. The dominant remaining cost is canonical Python-side policy evaluation over the 1,203-row set.

All 1,203 old and optimized decision results matched exactly on the same indexed database copy. The historical pre-floor-70 artifact also reproduced 538 published to 851 published, with 313 additions and zero removals.

### Pipeline run ledger

- Create a frozen 1,000-item run: 47.375 ms.
- Claim operation: 16.951 ms median, 20.865 ms p90 across 100 sequential claims, including connection and schema assurance.
- Status aggregation: 11.149 ms median, 14.784 ms p90.

Existing ledger indexes and atomic claim behavior are sufficient; no Phase B redesign or new ledger index was warranted.

### Source ingestion

- 10,000 retained candidates: 3.487 seconds.
- 20,000 retained candidates: 6.514 seconds.

The complete retained-corpus cheap-score recomputation remains unchanged because the formula is cohort-relative. At these sizes its linear runtime is reasonable, so no scoring or batching change was made.

## Connection and transaction policy

Core application and pipeline connections now use:

- SQLite connection timeout: 15 seconds.
- `PRAGMA busy_timeout`: 15,000 ms.
- `PRAGMA foreign_keys`: enabled.
- Row factory: `sqlite3.Row` in the shared application helper.
- Journal mode: WAL, which was already the repository policy and is retained rather than newly adopted.
- Transaction mode: SQLite's deferred mode by default, with bounded `BEGIN IMMEDIATE` transactions for operations that need an atomic writer claim or coherent mutation.

WAL fits this workload because readers should coexist with the one catalog-mutating pipeline/admin writer. The hosted Railway deployment remains a read-only snapshot on one replica. Existing SQLite backup helpers use the SQLite backup API and account for live WAL state; their compatibility tests remain authoritative.

Direct connections outside the helper are limited to read-only external/snapshot inspection or backup destinations with distinct needs. They do not justify forcing application row-factory behavior onto those utilities.

The operating recommendation is one catalog-mutating pipeline/admin writer at a time, with concurrent API readers and conservatively claimed research work. Atomic run-item claims prevent duplicate ownership, but Phase C does not turn the system into a distributed, high-concurrency worker platform.

Transaction review found:

- Source ingestion uses one coherent `BEGIN IMMEDIATE` transaction for observation updates, retained-corpus materialization, cohort-relative scoring, and candidate upsert. Although scoring occurs under the writer transaction, the measured 20,000-candidate runtime is acceptable and the atomic source-snapshot semantics are valuable.
- Standard research and Quality-v4 perform provider work outside database transactions, then checkpoint each result per row. Those commits intentionally preserve expensive completed work after a crash and were retained.
- Promotion and reconciliation compute decisions before mutation and apply changes in a bounded coherent transaction. Reconciliation's in-transaction digest checks remain deliberate safety checks.
- Research result, score, and history writes remain one coherent atomic result.

No per-row commit loop was removed where it provides checkpoint durability, and no network call is held inside a SQLite transaction.

## Correctness and compatibility

Direct before/after comparisons were exact for:

- 851 public catalog rows and ordering.
- Public detail lookup and serialization inputs.
- 848 Picks/map pool rows and ordering.
- 918 seed-selector rows and ordering.
- 100 standard research-selector rows and ordering.
- 342 Quality-v4 selector rows and ordering.
- All 1,203 publication decisions.

Existing blocked-row exclusion, API behavior, candidate scoring, publication membership, and threshold behavior remain unchanged. Schema initialization is idempotent on fresh and existing databases. Duplicate legacy `place_id` values fail the unique migration instead of being silently accepted.

## SQLite verdict

1. SQLite remains appropriate for approximately 1,500 published restaurants and a few thousand to tens of thousands of retained candidates under the documented one-writer operating model.
2. The practical risk is write concurrency and operational coordination, not catalog read volume. Multiple concurrent catalog-mutating writers, horizontally scaled writable replicas, or sustained high-contention research workers would exceed the intended model. The explicit busy timeout reduces transient lock failures but is not a substitute for distributed coordination.
3. A database migration is not required before NYC or LA. It should be reconsidered when the product needs multi-region or multi-replica writes, high sustained write concurrency, or operational requirements that cannot preserve a single writable SQLite volume.

## Canonical safety

| Check | Before | After |
| --- | --- | --- |
| `data/fiyu.db` SHA-256 | `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90` | `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90` |
| `seed70.txt` SHA-256 | `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39` | `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39` |

Canonical counts remain 1,203 total, 851 published, and 352 unpublished at threshold 70. SQLite integrity is `ok`. External requests made by this work: zero.

## Validation

- Phase C focused, publication, pipeline, SQLite snapshot, and production-backup tests: 126 passed.
- Phase A source-ingestion compatibility group: 89 passed.
- Phase B run-ledger group: 17 passed.
- Catalog, API, and Picks group: 71 passed with one upstream Starlette deprecation warning.
- Publication and Quality-v4 group: 62 passed.
- Full backend suite: 986 passed with the same upstream warning.
- Ruff: passed on all changed Python files.
- `python -m fiyu.cli demo`: passed with disposable database and CSV outputs.
- `git diff --check`: passed (line-ending conversion warnings only).

## Conclusion

Phase C removes both identified P0-scale performance issues without changing product semantics. No correctness or performance issue blocks proceeding to Phase D: CLI consolidation and unified operator reporting.
