# V4 specialist tri-state lineage audit

## 1. Executive summary

The discrepancy is **label-only**. All 313 recently promoted rows were recomputed
with the current specialist tri-state evaluator and match their stored scores exactly.
The canonical production label for these semantics is `public-v4-quality-research-specialist-tristate`.

## 2. Version definitions

- `public-v4-quality-research` was introduced by `a60c8cb` as the original Quality-v4
  production label and remains hardcoded in `QUALITY_PRODUCTION_SCORE_VERSION`.
- `public-v4-quality-research-specialist-tristate` was introduced later by `3dce647`; the specialist migration
  assigns it to every V4 row (identified by a guarded Quality-v4 adjustment).
- The current evaluator does not branch on either string. Both populations use the
  same Quality-v4 research inputs and deterministic scoring functions.

## 3. 313 vs 548 population counts

| Population | Rows | Published | Unpublished | Specialist status |
|---|---:|---:|---:|---|
| legacy label | 313 | 0 | 313 | `{"specialist": 229, "unknown": 84}` |
| canonical tri-state label | 548 | 536 | 12 | `{"specialist": 439, "unknown": 109}` |

Both populations have complete `specialist_status`, specialist provenance, and
`specialist-tristate-1` schema metadata. Their Quality research, case-strength,
shadow-score, prompt, and ±15 guardrail versions are identical.

## 4. 313 cohort identity proof

- Cohort IDs: **313**
- Matching legacy-label rows: **313**
- Missing / extras: **0 / 0**

## 5. Canonical recomputation parity

- 313 population: **313 / 313 exact**, mismatches **0**, max **0.0**.
- 548 population: **548 / 548 exact**, mismatches **0**, max **0.0**.
- All stored numeric pointer fields exact: **313 / 313** and **548 / 548**.
- All persisted Quality research/scorer fields exact: **313 / 313** and **548 / 548**.

## 6. Specialist-tristate counterfactual

Using the repository's tested `rescore_specialist_status` compatibility helper,
**84** of 313 scores differ under the old
boolean-false-as-non-specialist interpretation. Old minus current delta distribution:
`{"count": 313, "max": 0.0, "median": 0.0, "min": -0.95}`.
Floor-70 status changes: **1**.

This demonstrates that the stored scores reflect tri-state behavior; the ambiguous
legacy false values are currently `unknown`, not `non_specialist`.

## 7. Field-level semantic comparison

Both populations use:

- `quality-v4-research-1`, `quality-v4-case-strength-1`, and `quality-v4-shadow-1`
- prompt `quality-v4-two-sided-2026-10-05`
- specialist schema `specialist-tristate-1` and migration provenance
- the same chain, weights, caps, and rounding path
- persisted researched Quality and raw/guarded Quality adjustments

No material schema, version, provenance, or component divergence was found beyond
the current pointer/history production label.

For all 313 recent rows, specialist migration metadata predates Quality-v4 research
completion, and the specialist values agree across the canonical columns, evidence,
and provenance. The earlier 548 were researched before the specialist migration and
were then deterministically rescored by that migration; their current pointers also
match the same evaluator exactly.

## 8. Score-history lineage

The 313 have prior V3 history, a V4 history row, and current pointers to their
expected V4 numeric values. Exact duplicate history keys: **0**.
The V4 history records for the cohort carry the same stale production label; prior
V3 history must remain untouched.

For the 548 earlier rows, all 548 retain a pre-V4 history record: 486 have V3
history, while 21 entered V4 from V1 and 41 from V2. This is expected historical
lineage, not a missing-score anomaly. Every row has one canonical tri-state V4
history record and there are no exact duplicate history keys.

## 9. Existing 548 validation

The 548 canonical-label rows recompute **548 / 548** exactly from current canonical inputs. No historical
source-artifact drift qualification is needed for this result.

## 10. Root cause of label divergence

`quality_v4_promotion.py` replaces the recomputed result's version with
`quality_v4.QUALITY_PRODUCTION_SCORE_VERSION`, whose value predates the tri-state
migration. The later canonical V4 tri-state constant was never wired into that
promotion path. This is not a source-shadow mapping or history-helper default issue.

## 11. Floor-70 impact

- Numeric score impact: **0**
- Floor-70 pass/fail impact: **0**
- Expected additions: **313**
- Expected final catalog: **851**
- Publication reconciliation logic impact: **none**

## 12. Recommended fix

Before floor-70 reconciliation, run a manifest-scoped, metadata-only migration for
the exact 313 IDs. Relabel the current pointer and its matching V4 history record,
including the embedded `score_json.score_version`; recompute the history fingerprint
because it includes the label. Do not change score values, Quality research rows,
V3 history, publication state, eligibility/review fields, or threshold. No score
recomputation is needed.

## 13. Reporting-label quirks

The real-run report's “dry run” title and the idempotency summary's
`stored_v3_pointer_distribution_before` key are both cosmetic stale labels. The
underlying `dry_run: false`, pointer values, and audit invariants are coherent.

## 14. No-mutation confirmation

- Canonical SHA before/after: `A8138441F832266E8CC1BE2338209D49A249D49F68BE0697E0FBA00DAF354938` / `A8138441F832266E8CC1BE2338209D49A249D49F68BE0697E0FBA00DAF354938`
- Shadow SHA before/after: `98BAA6F48236D6DC33AFD97A3B1BD751CB3E8A324A72636B6C3FB2F44C21F592` / `98BAA6F48236D6DC33AFD97A3B1BD751CB3E8A324A72636B6C3FB2F44C21F592`
- `seed70.txt` SHA before/after: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39` / `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39`
- SQLite integrity: canonical `ok`, shadow `ok`
- External requests: **0**
