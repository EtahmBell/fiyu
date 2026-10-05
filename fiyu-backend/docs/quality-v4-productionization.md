# Quality-v4 shadow productionization

Quality-v4 is a versioned, internal production candidate. It is not a verified public
quality rating, does not change the active production-v3 score, and does not affect
publication state or thresholds.

## Frozen design

`fiyu.quality_v4` wraps the validated deterministic case-strength engine with an
explicit version contract and an initial configurable `[-15, +15]` adjustment
guardrail. Research yields evidence only. Normalization, provenance independence,
claim consolidation, positive and negative case strength, balance, adjustment,
Quality clamping, and the shadow Fiyu score are deterministic. The shadow score uses
the canonical production-v3 composition with only Quality replaced.

Version identifiers:

- research: `quality-v4-research-1`
- case strength: `quality-v4-case-strength-1`
- shadow score: `quality-v4-shadow-1`
- prompt: `quality-v4-two-sided-2026-10-05`

No-evidence observations produce exactly zero adjustment. Aggregate ratings,
missing websites, obscurity, and source scarcity are not research evidence.

## Durable storage

The additive `quality_v4_research_runs` table is initialized through the existing
`ensure_public_schema` mechanism. It is separate from `public_restaurants`, so it
cannot replace the score served by the public API. Each attempt stores versions,
status, prior and case-strength fields, raw and guarded adjustments, researched
Quality, production-v3 and shadow scores, model/usage/latency/error metadata, and
the raw extraction result.

Normalized observations and claim clusters are stored as immutable JSON documents.
This preserves every observation-level audit field and the exact deterministic
inputs without introducing relational tables that are not needed by the read path.
A new attempt creates a new row; historical v3 data and prior v4 attempts are not
overwritten.

## Backfill behavior

`quality-v4-backfill` is sequential and checkpoints each restaurant. It selects an
eligible, deterministic score-quartile cross-section; reports every exclusion
category; skips completed, failed, pending, and `needs_retry` rows by default; and
supports `--place-id`, `--start-after`, and deliberate `--force` reruns.

Before a paid request begins, an attempt is committed as `needs_retry`. A complete
response is then committed as `complete`; unambiguous validation/processing errors
become `failed`; ambiguous connection or timeout outcomes remain `needs_retry`.
There are no automatic provider retries. The manifest is rewritten and JSONL is
flushed after every restaurant.

Dry runs read from an immutable SQLite snapshot and do not initialize or mutate the
source database.

## Smoke validation (2026-10-05)

The canonical `data/fiyu.db` was copied to
`data/audits/quality-v4-shadow-smoke.db`. Exactly 100 eligible restaurants were run
on that copy with `gpt-5.6-luna`: 100 complete, 0 failed, 0 `needs_retry`, 100
Responses calls, 268 web-search actions, and 2,974,371 tokens. The full audit is in
`data/audits/quality-v4-shadow-smoke-report.md` and its machine-readable companion.

After the smoke run, 449 eligible rows remain. At the observed per-row usage, the
remaining scale is approximately 449 Responses calls, 1,203 web-search actions,
12,590,422 input tokens, 764,503 output tokens, and 13,354,926 total tokens. This is
a resource projection, not a dollar estimate.

## Commands requiring explicit approval

Run the next 100 on the existing shadow database:

```powershell
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\audits\quality-v4-shadow-smoke.db quality-v4-backfill --limit 100 --model gpt-5.6-luna --manifest-out data\audits\quality-v4-shadow-batch-002-manifest.json --results-out data\audits\quality-v4-shadow-batch-002-results.jsonl
```

Run all remaining eligible rows on that same shadow database:

```powershell
.\.venv\Scripts\python.exe -m fiyu.pipeline_cli --db data\audits\quality-v4-shadow-smoke.db quality-v4-backfill --limit 100000 --model gpt-5.6-luna --manifest-out data\audits\quality-v4-shadow-remaining-manifest.json --results-out data\audits\quality-v4-shadow-remaining-results.jsonl
```

Generate the offline whole-catalog audit after backfill:

```powershell
.\.venv\Scripts\python.exe scripts\audit_quality_v4_shadow.py --db data\audits\quality-v4-shadow-smoke.db --summary data\audits\quality-v4-shadow-full-summary.json --report data\audits\quality-v4-shadow-full-report.md
```

Do not point paid backfill commands at `data/fiyu.db` while the canonical database
must remain unchanged.
