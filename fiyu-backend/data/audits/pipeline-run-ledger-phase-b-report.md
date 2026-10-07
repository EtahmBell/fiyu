# Pipeline Run Ledger Phase B Report

Date: 2026-10-07

## Scope and safety

Phase B adds durable execution bookkeeping and atomic claims for standard restaurant
research. It does not change scoring weights, Quality-v4 scoring or promotion, specialist
tri-state semantics, publication rules, Picks, Taste, or public API responses. All schema
and mutation tests used disposable databases. No provider request was made.

## Previous execution model

Standard restaurant research selected a mutable queue and iterated it in process. Durable
per-restaurant state already existed in `public_restaurants`, `restaurant_research_runs`,
address research runs, and card enrichment runs. Those records preserve results and a
conservative `needs_retry` state, but there was no stable batch ID, frozen ordered
selection, atomic ownership claim, lease, or batch-level resume/status view.

Other existing run concepts remain intentionally separate:

- `candidate_source_runs` and `candidate_source_observations` describe source snapshot
  provenance and additive merge history. They are not execution queues.
- Quality-v4 has versioned research rows, manifests, JSONL checkpoints, targeted retry,
  and promotion safeguards. It was not migrated.
- Promotion manifests remain immutable audited cohort inputs.
- Address and card research retain their workflow-specific run records.

## New run and item model

The additive `pipeline-run-ledger-v1` schema contains:

- `pipeline_runs`: run type, frozen selector/config JSON, schema version, input
  fingerprint, requested/selected and aggregate counts, usage totals, status, timestamps,
  and optional parent/operator metadata.
- `pipeline_run_items`: immutable run membership and ordinal, stable item/place identity,
  semantic work key, current state, claim/lease data, attempt count, failure
  classification, result reference, and usage totals.
- `pipeline_run_item_attempts`: append-only claim-attempt history, including abandoned
  stale claims and each attempt's ownership, timing, result/failure, and usage.

Run states are `pending`, `running`, `completed`, `completed_with_failures`, `failed`, and
`cancelled`. Item states are `pending`, `claimed`, `running`, `succeeded`,
`failed_retryable`, `failed_terminal`, and `skipped`. Claim-token checks reject illegal
ownership and terminal transitions.

## Immutable selection and claim algorithm

A new research invocation evaluates the existing selector once, records the exact ordered
place IDs, selector, model, prompt version, pipeline version, and a SHA-256 input
fingerprint, then starts work. Resume reads those run items and never reevaluates `LIMIT`
against the live queue.

Claims use a short SQLite `BEGIN IMMEDIATE` transaction. The transaction selects the next
eligible ordinal, verifies no equivalent active/succeeded work exists, records a random
claim token and lease, appends an attempt, and commits. Partial unique indexes on
`(work_key, item_key)` prevent two active claims or two succeeded ledger items for the
same semantic work. The database lock is released before the provider call.

The standard research work key is:

`place_id + catalog pipeline version + research prompt version + model`

An existing completed `restaurant_research_runs` row with the same place, prompt,
pipeline, and model also causes a ledger item to be skipped before a paid request.

## Lease and crash recovery

Claims use a configurable lease (default 900 seconds). An expired claim/running item can
be reclaimed. The previous attempt becomes `abandoned` with
`stale_claim_reclaimed`; the new owner receives a new token and incremented attempt count.
Unexpired claims cannot be taken by another worker.

The local boundary is:

1. atomically claim and commit;
2. prepare existing research/address records;
3. mark the provider-request boundary and commit;
4. call the provider with no SQLite write transaction open;
5. validate and persist the existing research, score, address, and enrichment outputs;
6. mark the ledger item succeeded and refresh run aggregates.

If result persistence succeeds but the process dies before item success, resume detects
the matching completed restaurant research and skips the stale item without another
request. If the provider accepted a request but the process dies before a durable result
or provider response ID is stored, remote exactly-once behavior cannot be proven. After
lease expiry an operator-authorized resume may repeat that request. The attempt and
provider-boundary record make this residual risk visible; they cannot eliminate it.

## Retry and resume semantics

Normal resume processes pending items and expired claims. `--retry-failed` additionally
admits `failed_retryable` items from the same frozen run. Each item is attempted at most
once per command invocation, preventing a transient failure from becoming a tight paid
retry loop. Attempt history and counts are preserved.

Timeouts, connection failures, HTTP 429, and provider 5xx statuses are retryable. Other
validation/content/persistence failures remain terminal under the existing conservative
standard-research behavior. The existing public and restaurant-run statuses continue to
be written (`needs_retry` versus `failed`).

Concrete workflow:

```text
python -m fiyu.pipeline_cli --db <db> research --limit 100
python -m fiyu.pipeline_cli --db <db> pipeline-run-status <run_id>
python -m fiyu.pipeline_cli --db <db> research --resume-run <run_id>
python -m fiyu.pipeline_cli --db <db> research --resume-run <run_id> --retry-failed
```

For 100 selected items with 40 succeeded, reopening reports the same 100, with 40
succeeded and 60 pending. If 10 later fail retryably, an explicit retry reuses those ten
item rows, increments their attempt counts, and preserves prior attempt records. A fully
completed run returns no claim and makes no provider request.

## Standard research parity

The provider prompt, parsed schema, scoring inputs, score calculation, structured research,
card enrichment, address handling, review state, and persisted research records are the
existing implementation. Phase B wraps that lifecycle with claims and bookkeeping. Fake
provider integration tests verify success, terminal failure, ambiguous/transient failure,
and combined address/card behavior.

## Quality-v4 coexistence

Quality-v4 code, manifests, checkpoints, retry selector, research records, and promotion
logic are unchanged. A later migration can create generic run/items whose result
references point to `quality_v4_research_runs`, but only after preserving its current
manifest/checkpoint guarantees. No historical V4 run is migrated in Phase B.

## Failure injection results

Disposable tests cover interruption after run creation, after claim, at the provider
boundary, before result persistence, during result persistence, after a matching result is
persisted but before ledger success, stale-lease recovery, and run-finalization failure.
The frozen run/items and completed domain records remain authoritative and recoverable in
each tested boundary. A finalization failure does not erase an already succeeded item.

## Validation

- Focused ledger/research plus Phase A, Quality-v4, promotion, and publication tests:
  253 passed.
- Full backend suite: 979 passed, with one pre-existing Starlette/httpx deprecation
  warning.
- Ruff on changed Python files: passed.
- `git diff --check`: passed (Git emitted only the repository's LF-to-CRLF checkout
  notices).

## Canonical safety

- `data/fiyu.db` pre-change SHA-256:
  `184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90`
- `seed70.txt` pre-change SHA-256:
  `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39`
- Post-change hashes are identical to both values above.
- Catalog: 1203 total, 851 published, 352 unpublished, threshold 70.
- SQLite integrity: `ok`.
- Canonical migration was not run.
- External provider requests: 0.

## Remaining P0 / Phase C boundary

Phase B deliberately does not implement research concurrency or the broader database
performance pass. Phase C remains responsible for the missing `restaurants.place_id`
index, explicit SQLite timeout/single-writer policy, the approximately 5.4-second public
catalog query, the approximately 196-second publication reconciliation, and broader
transaction/connection review.
