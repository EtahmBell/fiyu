# Fiyu restaurant pipeline operator runbook

This is the supported production workflow for the Tokyo catalog. Commands use the
single `fiyu pipeline` namespace and preserve the existing Phase A source ledger,
Phase B pipeline-run ledger, Quality-v4 implementation, and publication safeguards.

Examples below use PowerShell and the canonical database. Replace identifiers and
artifact names deliberately. Paid commands are explicitly labeled.

## Normal production commands

### A. Import a new source snapshot

One invocation represents the complete current snapshot for one stable `source_key`.
It is additive across sources and deduplicates by Place ID.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db ingest data\raw\new-source `
  --source-key apify-tokyo-october `
  --csv-out data\processed\restaurants_scored.csv `
  --summary-out data\audits\apify-tokyo-october-import.json
```

### B. Refresh an existing source

Use exactly the same stable source key with the replacement complete snapshot.
Omitted source observations become source-local stale; canonical candidates are not
deleted.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db ingest data\raw\apify-refresh `
  --source-key apify-tokyo-october `
  --summary-out data\audits\apify-tokyo-october-refresh.json
```

### C. Inspect source impact

The import output contains its run ID. The status command is read-only and returns
source counts plus cohort-relative cheap-score and default seed-eligibility changes.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db source-run-status 17 `
  --summary-out data\audits\source-run-17-status.json
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db source-runs --limit 20
```

### D. Find and seed the next controlled candidate batch

Always inspect the deterministic selection before applying it. Reuse the same seed
when reproducing a selection.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db inspect --limit 20
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db seed-unseeded `
  --limit 50 --min-score 60 --seed tokyo-expansion-001 --dry-run `
  --manifest-out data\audits\tokyo-expansion-001-seed-dry-run.json
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db seed-unseeded `
  --limit 50 --min-score 60 --seed tokyo-expansion-001 `
  --manifest-out data\audits\tokyo-expansion-001-seed.json
```

`import-candidates` is a retained historical top-N seeding alias. Do not use repeated
small invocations as pagination; `seed-unseeded` is the canonical batch command.

### E. Create and execute a standard research batch — paid

Dry-run reports the frozen selection and maximum request budget without creating a
run or making a provider request. The real command creates a durable run and
checkpoints each restaurant.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db research --limit 25 --dry-run `
  --summary-out data\audits\research-001-plan.json
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db research --limit 25 `
  --summary-out data\audits\research-001-result.json
```

### F. Check research status and recent runs

These commands are read-only. Completed status explicitly reports no remaining work.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db run-status 42 `
  --summary-out data\audits\pipeline-run-42-status.json
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db runs `
  --type standard_restaurant_research --limit 20
```

### G. Stop and resume — paid when work remains

Stop with the normal process interrupt. A claimed item becomes reclaimable after its
lease expires; completed item checkpoints remain durable.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db research-resume 42
```

Fresh selector flags are rejected for resume commands. A run with no remaining work
is also rejected rather than silently creating another batch.

### H. Retry transient failures — paid

This command selects only `failed_retryable` items inside the existing frozen run.
It refuses runs with no retryable failures.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db research-retry 42 --dry-run
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db research-retry 42
```

### I. Resolve locations for the frozen cohort — local, no external calls

Run the established POI/address/polygon/area-anchor hierarchy after standard
research and before Quality-v4. Location failure remains nonfatal and is reported
as map-ineligible; it does not block later scoring or publication.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db resolve-cohort-locations `
  --cohort-manifest data\audits\tokyo-expansion-001-seed.json `
  --osm-index C:\data\osm\fiyu-kanto-index.sqlite `
  --osm-address-index C:\data\osm\fiyu-kanto-address-index-v2.sqlite `
  --dry-run --summary-out data\audits\tokyo-expansion-001-location-plan.json
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db resolve-cohort-locations `
  --cohort-manifest data\audits\tokyo-expansion-001-seed.json `
  --osm-index C:\data\osm\fiyu-kanto-index.sqlite `
  --osm-address-index C:\data\osm\fiyu-kanto-address-index-v2.sqlite `
  --summary-out data\audits\tokyo-expansion-001-location.json
```

The summary reports cohort size, published members, map-ready before/after,
map-ineligible rows, resolution-method distribution, unresolved rows, conflicts,
and zero external requests. Always review the dry-run before the real mutation.

### J. Run Quality-v4 where required — paid

The established Quality-v4 selector, sequential request behavior, retry
classification, checkpointing, and manifests are unchanged.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db quality-v4-backfill `
  --limit 100 --dry-run --manifest-out data\audits\quality-v4-next-plan.json
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db quality-v4-backfill `
  --limit 100 --manifest-out data\audits\quality-v4-next.json `
  --results-out data\audits\quality-v4-next-results.jsonl
```

Retry only provider-retryable failures with `quality-v4-backfill --retry-failed`.
Never use broad `--force` as a retry substitute.

### K. Promote an audited Quality-v4 cohort

Dry-run first. Real promotion requires the operation-specific backup path and audited
cohort manifest.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db quality-v4-promote `
  --source-db data\audits\quality-v4-shadow.db `
  --cohort-manifest data\audits\quality-v4-promotion-cohort.json --dry-run `
  --summary-out data\audits\quality-v4-promotion-dry-run.json `
  --report-out data\audits\quality-v4-promotion-dry-run.md
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db quality-v4-promote `
  --source-db data\audits\quality-v4-shadow.db `
  --cohort-manifest data\audits\quality-v4-promotion-cohort.json `
  --backup-out data\audits\pre-quality-v4-promotion.db `
  --summary-out data\audits\quality-v4-promotion.json `
  --report-out data\audits\quality-v4-promotion.md
```

### L. Dry-run publication reconciliation

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db reconcile-publication `
  --threshold 70 `
  --cohort-manifest data\audits\floor70-prepublication-v4-promotion-cohort.json `
  --dry-run `
  --summary-out data\audits\publication-reconciliation-dry-run.json `
  --report-out data\audits\publication-reconciliation-dry-run.md `
  --changes-out data\audits\publication-reconciliation-dry-run.jsonl
```

### M. Execute publication reconciliation

Omit `--dry-run` only after reviewing the planned changes. A non-overwriting backup
is mandatory.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db reconcile-publication `
  --threshold 70 `
  --cohort-manifest data\audits\floor70-prepublication-v4-promotion-cohort.json `
  --backup-out data\audits\pre-publication-reconciliation.db `
  --summary-out data\audits\publication-reconciliation.json `
  --report-out data\audits\publication-reconciliation.md `
  --changes-out data\audits\publication-reconciliation.jsonl
```

### N. Check final catalog status

These reports use stored state and do not run full publication reconciliation.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db catalog-status `
  --summary-out data\audits\catalog-status.json
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db funnel `
  --summary-out data\audits\catalog-funnel.json
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db coverage `
  --summary-out data\audits\catalog-coverage.json
```

### O. Back up before mutations

The backup command uses SQLite's backup API, includes committed WAL state, checks
integrity, and refuses to overwrite an existing file.

```powershell
.\.venv\Scripts\python.exe -m fiyu.cli pipeline --db data\fiyu.db backup `
  --output data\audits\pre-operation-backup.db `
  --summary-out data\audits\pre-operation-backup.json
```

Promotion and reconciliation additionally retain their mandatory operation-specific
`--backup-out` safeguards.

## Command output and exit behavior

Current operator commands print a concise result and accept `--summary-out` where a
durable machine-readable envelope is useful. The `operator-summary-v1` envelope
contains operation, mode, run ID, timestamps, normalized counts, safety facts,
artifact references, and operation-specific details.

- Exit 0: command or read-only inspection succeeded.
- Exit 2: command-line usage error from `argparse`.
- Exit 3: a paid research operation completed with retryable or terminal item failures.
- Unhandled invariant/precondition failures exit nonzero and do not masquerade as success.

## Advanced and migration commands

The following remain available under `fiyu pipeline`, but are not routine catalog
expansion steps: `research-low-footprint`, `retry-research`,
`retry-address-research`, `run`, `score`, `verify-location`,
`restore-best-location`, `backfill-published-locations`,
`backfill-card-enrichment`, `backfill-canonical-details`,
`retry-card-enrichment`, `quality-v4-fix-specialist-version`,
`specialist-tristate-migrate`, `review`, `approve`, `reject`, and `publish`.

`fiyu.public_cli` remains an advanced compatibility surface for the established
location, address, discovery-area, localization, export, and manual publication
tools. Its `seed`, `research`, and `recalculate` paths are historical; normal new
catalog work should use `fiyu pipeline`.

Standalone `scripts/audit_*`, Quality-v4 experiment builders, and evaluation scripts
are historical/audit tools. They are not production workflow commands unless a
specific certified audit procedure names them.

## Fixture and destructive commands

- `python -m fiyu.cli demo` destructively initializes only its disposable demo path.
- Whole-corpus replacement requires the internal `allow_destructive=True` guard and
  refuses canonical `data/fiyu.db`.
- `production-snapshot --force` may replace only the explicitly named hosted snapshot
  output; it does not mutate its source.
- Manual `publish`/`unpublish`, promotion, specialist migration, and publication
  reconciliation are catalog mutations. Use dry-run where supported and create a
  non-overwriting backup first.

## Compatibility aliases

- `python -m fiyu.pipeline_cli ...` delegates to the same implementation as
  `python -m fiyu.cli pipeline ...` and prints a compatibility notice.
- `pipeline-run-status` is retained as an alias of `run-status`.
- `python -m fiyu.cli ingest ...` is retained as an alias of `fiyu pipeline ingest`
  and prints a compatibility notice.

No compatibility alias contains an independent scoring, research, or publication
implementation.
