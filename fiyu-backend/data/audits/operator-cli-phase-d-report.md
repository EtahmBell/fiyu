# Operator CLI Phase D report

Date: 2026-10-07

## 1. Executive summary

Phase D establishes `python -m fiyu.cli pipeline` as the single supported restaurant-pipeline namespace without replacing the Phase A, B, C, Quality-v4, or publication implementations. Existing module and command paths remain thin compatibility aliases. New read-only source, run, catalog, funnel, and coverage reports use stored state and do not execute publication reconciliation.

The full supported workflow and exact commands are in [`docs/pipeline-operator-runbook.md`](../../docs/pipeline-operator-runbook.md).

## 2. CLI inventory

Legend: **Normal** is supported routine production use; **Advanced** is current but requires specialist intent; **Legacy** remains compatible but is not the recommended path; **Fixture** is explicitly non-production; **Historical** is audit/experiment-only. “Mutation/spend/resume” records catalog mutation, possible provider spend, and durable resume support. Evidence states whether tests or current documentation exercise/reference the surface.

### Primary `fiyu.cli` surface

| Command | Purpose | Classification and safety | Mutation / spend / resume | Overlap and evidence | Disposition |
| --- | --- | --- | --- | --- | --- |
| `pipeline` | Route to the consolidated catalog CLI | Normal, safe according to child command | Child-dependent | New focused routing tests and runbook | Canonical |
| `ingest` | Phase A source import | Legacy, production-safe additive behavior | Mutates / no spend / source run durable | Same `run_source_ingestion`; source tests and old docs | Compatibility alias with notice |
| `demo` | Replace disposable demo corpus | Fixture only; canonical target refused downstream | Destructive fixture / no spend / no resume | Demo tests and README | Retain, clearly fixture-only |
| `write-config` | Write default scoring config | Utility | Writes named file / no spend | README/config support | Retain utility |
| `export-map-assets` | Build frontend base map assets from local PBF | Advanced offline utility | Writes named output / no spend | README map documentation | Retain advanced |
| `production-snapshot` | Create scrubbed hosted API snapshot | Advanced deployment utility; output replacement requires `--force` | Writes output / no spend | Snapshot tests and README | Retain advanced |

### Consolidated `fiyu pipeline` surface

| Command | Purpose | Classification and safety | Mutation / spend / resume | Overlap and evidence | Disposition |
| --- | --- | --- | --- | --- | --- |
| `ingest` | Import/refresh one source snapshot | Normal | Mutates candidates/source ledger / no spend / source-run status | Canonical adapter to Phase A; focused/source tests | Canonical |
| `source-run-status` | Inspect one source run and impact | Normal read-only | None / no spend | New tests/runbook | Canonical |
| `source-runs` | List recent source runs | Normal read-only | None / no spend | New tests/runbook | Canonical |
| `backup` | Non-overwriting SQLite backup | Normal safety prerequisite | Writes new backup only / no spend | New integrity/non-overwrite tests | Canonical |
| `inspect` | Inspect candidate/review rows | Normal read-only | None / no spend | Existing pipeline implementation/docs | Canonical candidate inspection |
| `import-candidates` | Seed top-N candidates | Legacy production command; repeated calls are not pagination | Mutates seed queue / no spend | Overlaps `seed-unseeded`; catalog tests/docs | Retain compatibility, mark legacy |
| `seed-unseeded` | Deterministically select/seed absent eligible rows | Normal | Dry-run or mutation / no spend / manifest reproducible | Seed tests/runbook | Canonical seeding |
| `research` | Select, create, and execute a standard research run | Normal paid operation after dry-run | Mutates / spend / durable run | Research and pipeline tests/runbook | Canonical new run |
| `research-resume` | Resume pending/stale items in a frozen run | Normal paid recovery | Mutates / spend / durable run | New validation tests/runbook | Canonical resume |
| `research-retry` | Retry only `failed_retryable` run items | Normal paid recovery | Mutates / spend / durable run | New validation tests/runbook | Canonical retry |
| `run-status` | Inspect durable pipeline run | Normal read-only | None / no spend | New alias parity and run tests | Canonical status |
| `pipeline-run-status` | Prior name for `run-status` | Legacy read-only | None / no spend | Alias parity test | Compatibility alias |
| `runs` | List recent pipeline runs by type | Normal read-only | None / no spend | New list tests/runbook | Canonical listing |
| `research-low-footprint` | Targeted Japanese/local evidence pass | Advanced | Mutates / spend / row checkpointing | Existing low-footprint tests | Retain advanced |
| `retry-research` | Reset one ambiguous candidate state | Advanced state recovery | Mutates state / no immediate spend | Existing docs/tests | Retain advanced; not run retry |
| `retry-address-research` | Reset one address fallback state | Advanced state recovery | Mutates state / no immediate spend | Existing address tests/docs | Retain advanced |
| `run` | Combined research, score, locate, publish | Advanced compound workflow | Mutates / spend / row checkpointing | Existing pipeline tests/docs | Retain advanced, not normal batch path |
| `score` | Recalculate one row from stored evidence | Advanced | Mutates score/history / no spend | Existing catalog tests | Retain advanced |
| `verify-location` | Resolve one location from local indexes | Advanced | Mutates / no spend | Location tests/docs | Retain advanced |
| `restore-best-location` | Restore strongest stored location history | Advanced recovery | Mutates / no spend | Location tests | Retain advanced |
| `backfill-published-locations` | Apply local location hierarchy | Advanced backfill | Mutates / no spend | Location tests/docs | Retain advanced |
| `backfill-card-enrichment` | Stored/local or explicit research enrichment | Advanced | Local or paid mutation / row checkpointing | Enrichment tests/docs | Retain advanced |
| `backfill-canonical-details` | Normalize existing stored reservation/budget fields | Advanced local backfill | Mutates / no spend | Enrichment tests | Retain advanced |
| `retry-card-enrichment` | Authorize one ambiguous enrichment retry | Advanced recovery | Mutates state / no immediate spend | Enrichment tests | Retain advanced |
| `quality-v4-backfill` | Established sequential Quality-v4 stage | Normal when cohort requires it | Dry-run or paid mutation / resumable checkpoints | Extensive V4 tests/docs | Canonical V4 adapter, unchanged |
| `quality-v4-promote` | Promote audited V4 evidence | Advanced guarded mutation | Dry-run or mutation / no provider spend / backup | Promotion tests/audits | Canonical promotion |
| `quality-v4-fix-specialist-version` | Audited metadata correction | Historical migration | Dry-run or guarded mutation / backup | Version-fix tests/audits | Retain advanced legacy migration |
| `specialist-tristate-migrate` | One-time specialist schema migration | Historical migration | Dry-run or guarded mutation / backup | Migration tests/audits | Retain advanced legacy migration |
| `reconcile-publication` | Audited publication membership reconciliation | Normal final stage with strict inputs | Dry-run or atomic mutation / mandatory backup | Reconciliation tests/runbook | Canonical publication stage |
| `review` | Inspect one candidate for manual review | Advanced read-only | None | Existing catalog tests/docs | Retain advanced |
| `approve` / `reject` | Record manual review decision | Advanced manual mutation | Mutates / no spend | Existing catalog tests/docs | Retain advanced |
| `publish` | Apply canonical publish decision for one row | Advanced manual mutation | Mutates / no spend | Existing catalog tests/docs | Retain advanced |
| `status` | Historical pipeline status aggregate | Legacy read-only | None | Overlaps `catalog-status`; existing docs | Retain compatibility, mark legacy |
| `catalog-status` | Unified catalog, lineage, readiness, recent operations | Normal read-only | None / no spend | New tests/runbook | Canonical status |
| `funnel` | Stored-state expansion funnel and block distributions | Normal read-only | None / no spend | New tests/runbook | Canonical report |
| `coverage` | Ward/area, cuisine, price, discovery, map coverage | Normal read-only | None / no spend | New tests/runbook | Canonical report |

### `fiyu.public_cli` compatibility/advanced surface

This module remains active for specialist location, address, discovery, localization, export, and manual-publication work. It is not the normal end-to-end operator namespace.

| Command | Purpose | Classification / safety | Mutation / spend / resume | Overlap/evidence | Disposition |
| --- | --- | --- | --- | --- | --- |
| `init` | Initialize public schema | Advanced | Additive schema / no spend | Public catalog tests/docs | Retain advanced |
| `seed` | Seed research queue | Legacy | Mutates / no spend | Overlaps pipeline seeding; tests | Compatibility, eventually de-emphasize |
| `research` | Original research worker | Legacy paid | Mutates / spend / older checkpoint path | Overlaps durable pipeline research; tests | Compatibility, eventually deprecate |
| `localize-content` | Localize stored content | Advanced paid | Mutates / spend | Localization tests/docs | Retain advanced |
| `research-descriptions` | Grounded description research | Advanced paid | Mutates / spend/checkpoints | Description tests/docs | Retain advanced |
| `export-location-review` | Export location review file | Advanced read/export | Output only | Location tests/docs | Retain |
| `import-verified-locations` | Import reviewed location decisions | Advanced guarded mutation | Mutates / no spend | Location tests/docs | Retain |
| `location-status` | Location readiness report | Advanced read-only | None | Docs/tests | Retain |
| `discover-addresses` | Address evidence research | Advanced paid | Mutates / spend/checkpoints | Address tests/docs | Retain |
| `recalculate-address-decisions` | Re-evaluate stored address evidence | Advanced local | Mutates / no spend | Address tests/docs | Retain |
| `export-geocoding-inputs` | Export address input file | Advanced read/export | Output only | Geocoding tests/docs | Retain |
| `geocode-address-file` | Run local file geocoder | Advanced local | Output only / no external provider | Geocoder tests/docs | Retain |
| `replace-location` | Replace/remove location with history | Advanced dangerous manual mutation | Mutates / no spend | Location tests/docs | Retain with explicit target/options |
| `export-address-review` | Export unresolved review file | Advanced read/export | Output only | Address tests/docs | Retain |
| `import-address-review` | Import reviewed address decisions | Advanced guarded mutation | Mutates | Address tests/docs | Retain |
| `geocode-verified-addresses` | Import/validate offline geocoder results | Advanced | Mutates / no online spend | Geocoder tests/docs | Retain |
| `address-resolution-status` | Address readiness report | Advanced read-only | None | Address tests/docs | Retain |
| `build-osm-index` | Build local OSM index | Advanced offline utility | Writes named index | OSM tests/docs | Retain |
| `resolve-osm-locations` | Match public rows to OSM | Advanced local | Dry-run/mutates | OSM tests/docs | Retain |
| `import-location-review` | Import OSM match review | Advanced guarded mutation | Mutates | Location tests/docs | Retain |
| `resolve-osm-anchors` | Propose area anchors | Advanced local | Output/local mutation depending options | OSM tests/docs | Retain |
| `audit-discovery-areas` | Audit source-area provenance | Advanced read-only | None | Discovery tests/docs | Retain |
| `enrich-discovery-areas` | Produce enriched discovery CSV | Advanced output | Writes file | Discovery tests/docs | Retain |
| `import-discovery-areas` | Import discovery provenance fields | Advanced guarded mutation | Dry-run/mutates | Discovery tests/docs | Retain |
| `recalculate` | Recompute stored public scores | Legacy/advanced | Mutates score/history | Overlaps pipeline `score`; tests | Retain compatibility |
| `list` | Dump catalog rows as JSON | Legacy debug | Read-only; potentially large | Public tests | Retain debug, not operator default |
| `export` | Export spreadsheet CSV | Advanced export | Output only | Public tests/docs | Retain |
| `publish` / `unpublish` | Direct manual membership changes | Advanced dangerous | Mutates publication | Public tests/docs | Retain guarded/manual; not normal reconciliation |
| `review` | List manual-review rows | Advanced read-only | None | Public tests/docs | Retain |

### Standalone scripts

| Script | Purpose | Classification / safety | Spend/destructive/resume | Evidence and disposition |
| --- | --- | --- | --- | --- |
| `audit_catalog_floor.py` | Historical floor decision audit | Historical read-only | No spend | Audit artifact/tests; retain |
| `audit_floor70_admission_readiness.py` | Floor-70 readiness audit | Historical read-only | No spend | Certified artifacts/tests; retain |
| `audit_floor70_prepublication_v4_final.py` | Final floor-70 prepublication audit | Historical read-only | No spend | Certified artifacts/tests; retain |
| `audit_pipeline_scale_readiness_v2.py` | Scale-readiness audit | Historical read-only | No spend | Phase planning artifact; retain |
| `audit_quality_v4_shadow.py` | Shadow V4 audit | Historical read-only | No spend | V4 docs/artifacts; retain |
| `audit_taste_v2_structure.py` | Taste structure audit | Historical read-only | No spend | Taste tests/artifacts; retain |
| `audit_tokyo_catalog_v1_stable.py` | Tokyo Catalog v1 certification | Historical read-only | No spend | Certification artifact; retain |
| `audit_unknown_semantics.py` | Unknown-semantics audit | Historical read-only | No spend | Tests/artifacts; retain |
| `audit_v4_specialist_tristate_lineage.py` | Specialist lineage audit | Historical read-only | No spend | Tests/artifacts; retain |
| `audit-score-transparency.py` | Score transparency diagnostic | Historical read-only | No spend | Diagnostic utility; retain |
| `benchmark_sqlite_phase_c.py` | Reproduce Phase C benchmarks | Historical benchmark, disposable DBs | No spend | Phase C tests/report; retain |
| `analyze_quality_v4_case_strength.py` | Offline V4 case-strength analysis | Historical experiment | No spend | V4 artifacts; retain |
| `build_quality_v4_final_benchmark.py` | Assemble final validation benchmark | Historical experiment | No spend | V4 artifacts; retain |
| `evaluate_fiyu_score_v4.py` | Offline score-v4 evaluation | Historical experiment | No production mutation/spend | Tests/artifacts; retain |
| `evaluate_personalized_picks.py` | Picks offline evaluation | Historical experiment | No production mutation | Picks tests/artifacts; retain |
| `evaluate_personalized_picks_progression.py` | Picks progression evaluation | Historical experiment | No production mutation | Picks tests/artifacts; retain |
| `evaluate_quality_v4_parity.py` | V4 parity analysis | Historical read-only | No spend | V4 artifacts; retain |
| `run_quality_research_v4_sample.py` | Preproduction V4 sample research | Historical paid experiment | Spend, local checkpoints | Superseded by `quality-v4-backfill`; retain historical, do not use normally |
| `run_quality_v4_challenge.py` | Blinded V4 challenge | Historical paid experiment | Spend, experiment checkpoints | Certified artifacts; retain historical |

No command or script was deleted because tests, documentation, or audit reproducibility still depend on the historical surfaces.

## 3. Canonical workflow

The supported sequence is:

```text
ingest
  -> source-run-status
  -> inspect / seed-unseeded
  -> research
  -> run-status / research-resume / research-retry
  -> quality-v4-backfill when required
  -> quality-v4-promote
  -> reconcile-publication
  -> catalog-status / funnel / coverage
```

Every step calls the existing implementation. The CLI layer does not duplicate scoring, research, Quality-v4, or publication logic.

## 4. Unified summary model

`operator-summary-v1` contains:

- `operation`, `operation_version`, optional `run_id`, `mode`, timestamps, and `status`;
- `input` selector/config/source facts;
- fixed count keys: selected, created, updated, unchanged, skipped, succeeded, retryable failed, terminal failed, and blocked;
- `safety`: database, dry-run, external requests, and mutations;
- artifact references and operation-specific `details`.

Existing Quality-v4 and reconciliation artifacts are not rewritten. The canonical wrapper preserves their established formats while the runbook gives them one consistent place in the workflow.

Exit behavior is 0 for success, argparse's 2 for usage errors, 3 when a canonical paid research operation returns item failures, and nonzero exceptions for violated preconditions/invariants.

## 5. Source-impact report

Each Phase A source run now stores `impact_json` additively. Existing databases receive the column idempotently. Comparison uses the established default seed rule: `candidate_eligible=1` and internal score at least 60.

The report contains canonical counts before/after, new/source-updated/unchanged counts, changed cheap-score count, median and maximum absolute delta, eligibility transition counts, and machine-readable crossing/change IDs.

Disposable sample import:

```text
Candidates before / after: 0 / 5
New / updated / unchanged: 5 / 0 / 0
Cheap scores changed: 0
Became eligible / ineligible: 0 / 0
External requests: 0
```

The focused crossing fixture proves two score changes with median absolute delta 1.5, maximum 2.0, one row becoming eligible (`up`), and one becoming ineligible (`down`).

## 6. Run/status functionality

Source and pipeline status/list functions use URI read-only connections with `query_only=ON`. They do not initialize schemas. Pipeline status includes selected, pending, claimed/running, succeeded, retryable/terminal failures, skipped, attempts, abandoned attempts, request/token/action accounting, timestamps, remaining work, and an explicit `no_remaining_work` boolean.

`research-resume` rejects unknown/wrong-type/completed runs and conflicts with fresh selectors. `research-retry` rejects runs without retryable failures. Neither silently creates a new batch.

## 7. Catalog, funnel, and coverage

Current stored-state catalog output:

- Raw candidates 8,086; seeded/public rows 1,203.
- Published 851; unpublished 352; threshold 70.
- V4 specialist 861; stale V4 0; V3 specialist 231; unscored 111.
- Research pending 103; retryable failures 4; Quality-v4 remaining 342.
- Score at/above threshold but unpublished 30; map/Picks-ready published 848.

Funnel:

```text
8086 raw candidates
 -> 2765 internal eligible
 -> 1203 seeded
 -> 1092 researched
 -> 861 Quality-v4 complete
 -> 881 score >= 70
 -> 851 publication-ready/currently published
```

The 30 above-threshold unpublished rows are visible by stored block reason: 18 score/product-policy rejections, 10 confirmed address-identity conflicts, one wrong-restaurant identity, and one permanent closure.

Coverage exposes full stored distributions in JSON and concise top-10 console summaries. Current completeness is 623/851 published rows with price data, 47/851 with discovery area, and 848/851 map-ready. Cuisine values are intentionally reported as stored and are not normalized in Phase D.

## 8. Performance

Twenty-iteration medians on the canonical-sized database:

| Operation | Median |
| --- | ---: |
| Catalog status | 27.358 ms |
| Funnel | 11.839 ms |
| Coverage | 36.529 ms |
| Recent pipeline runs | 1.869 ms |
| Recent source runs | 1.774 ms |

All are comfortably interactive and far below the one-second target. No full reconciliation is invoked.

## 9. Destructive and dry-run safety

- Whole-corpus fixture replacement still requires `allow_destructive=True` and refuses canonical `data/fiyu.db`.
- `demo` remains confined to its disposable default.
- Backup refuses same-path and existing outputs, consolidates WAL through SQLite backup, and integrity-checks the result.
- Research dry-run selects and budgets work without creating a run or calling a provider.
- Seed, Quality-v4, promotion, specialist migration, and reconciliation retain their existing dry-run semantics and safeguards.
- Promotion and reconciliation retain operation-specific backup requirements.
- Read-only status/report commands are hash-tested for zero mutation.

## 10. Documentation and compatibility

README normal ingestion and public-catalog workflow examples now point to `fiyu pipeline`. The dedicated runbook labels normal, advanced/migration, fixture/destructive, paid, and legacy commands. Historical audit reports remain untouched.

`python -m fiyu.pipeline_cli` and `fiyu ingest` print compatibility notices but call the same underlying implementation. `pipeline-run-status` and `run-status` have exact output parity in focused tests.

## 11. Canonical safety

Expected final verification:

- `data/fiyu.db`: `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90` before and after.
- `seed70.txt`: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39` before and after.
- 1,203 total, 851 published, 352 unpublished, threshold 70.
- SQLite integrity `ok`; external requests 0.

Validation completed before final canonical/hash verification:

- Phase D focused: 11 passed.
- Phase A: 89 passed; Phase B: 27 passed; Phase C: 16 passed.
- Catalog/API/Picks: 147 passed with one upstream Starlette deprecation warning.
- Research: 187 passed; publication: 70 passed; Quality-v4: 53 passed.
- Full backend suite: 997 passed with the same upstream warning.
- Disposable `python -m fiyu.cli demo`: passed.
- Ruff and `git diff --check`: passed (line-ending advisories only).

## 12. Remaining scale-readiness work

Phase D completes the operational foundation. The next phase is Phase E — Data Completeness / Normalization, in this order:

1. versioned cuisine/food taxonomy normalization;
2. deterministic discovery-area backfill;
3. deterministic normalization of existing raw budget/price hints;
4. targeted missing-budget selector;
5. only then targeted external price research for unresolved rows.

No P0 operational or correctness issue blocks controlled catalog expansion.
