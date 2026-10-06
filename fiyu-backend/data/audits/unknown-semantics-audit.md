# Unknown semantics audit

## 1. Executive summary

Unknown chain status does **not** collapse into affirmative chain evidence. It is stored and
scored explicitly as `unknown=70`, between confirmed independent (`100`) and confirmed chain
(`20` or `0`). It receives less positive credit than confirmed independence, but that is an
intentional neutral prior rather than a chain penalty. Its neutral counterfactual is therefore
identical to current behavior.

Specialist semantics are now explicitly tri-state. Stored rows distinguish `specialist`, `non_specialist`, and `unknown`; no boolean inference is needed.

Recommendation: **KEEP AS IS** for independence. Specialist recommendation:
**KEEP AS IS — TRI-STATE CONFLATION RESOLVED**.

## 2. Current field/schema semantics

Trace:

1. `RestaurantResearch` requires `specialist_status` with the three explicit values and retains
   specialist-specific rationale, evidence, source references, confidence, and schema version
   (`src/fiyu/research_worker.py`).
2. The prompt requires affirmative evidence for `specialist` and `non_specialist`, and directs
   uncertain cases to `unknown` (`src/fiyu/research_worker.py`).
3. `to_evidence()` persists the tri-state and provenance. `FiyuEvidence` uses tri-state internally;
   its deprecated boolean is derived only at the compatibility boundary (`src/fiyu/public_score.py`).
4. Persistence serializes the full evidence dataclass and structured model output
   (`src/fiyu/public_catalog.py:1260-1410`). Missing legacy evidence is reconstructed through the
   dataclass default.
5. Chain assessment preserves insufficient evidence as `unknown`; affirmative chain labels require
   behavioral corroboration (`src/fiyu/public_score.py:230-305`).
6. Independence uses 70% chain (unknown=70), 20% known-location count, and 10% specialist
   (true=100, false=40) (`src/fiyu/public_score.py:845-859`).
7. Local Discovery separately uses chain unknown=70 and specialist true=85/false=50, with fixed
   20% and 10% internal weights (`src/fiyu/local_discovery.py:260-285`).
8. Final Fiyu Score keeps fixed 45/15/15/25 weights (`src/fiyu/public_score.py:889-897`).

## 3. Data-state counts

### Effective chain state — all restaurants

| State | Count |
|---|---:|
| independent_single | 762 |
| large_chain_or_franchise | 3 |
| small_group_distinct_concept | 97 |
| small_same_brand_chain | 17 |
| unknown | 324 |

### Stored specialist state — all restaurants

| State | Count |
|---|---:|
| specialist | 836 |
| unknown | 367 |

### Specialist semantic state — all restaurants

| State | Count |
|---|---:|
| explicit_tristate_specialist | 836 |
| explicit_tristate_unknown | 367 |

Full breakdowns for published, unpublished, rejected, score-only rejected, product-eligible but
unpublished, v4, and v3 populations are in the JSON artifact.

## 4. Unknown-collapse findings

- **A — independence:** not present. Missing/insufficient evidence remains `unknown`; it is neither
  `independent_single` nor a chain classification. It receives partial neutral credit rather than
  full confirmed-independent credit.
- **B — specialist:** resolved. Every canonical row has an explicit tri-state classification.
- **C — schema representation:** explicit tri-state.
- **D — default/coercion:** resolved at the canonical boundary.
- **E — legacy:** migration provenance retains each prior boolean/missing origin.

## 5. Counterfactual definition

Neutral is **70**, reusing the scorer's existing explicit unknown prior in both components. No
weight changes or renormalization occur. For specialist only, false-to-neutral changes the
Independence component by `0.10 * (70-40) = +3`, Local Discovery by
`0.10 * (70-50) = +2`, and the uncapped final score by
`0.15 * 3 + 0.25 * 2 = +0.95`.

After migration, every canonical row already carries the explicit tri-state and no specialist
counterfactual remains. Pre-migration bounded effects are retained in the specialist migration
artifact rather than re-inferred from compatibility booleans.

## 6. Independence counterfactual results

Affected: **213**; materially affected: **0**. Delta min/p10/median/mean/p90/max: **0.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0** (absolute max 0.0). Direction: **no movement**.

| State | Count |
|---|---:|
| <= -2 | 0 |
| -1.99 to -1 | 0 |
| -0.99 to -0.5 | 0 |
| -0.49 to +0.49 | 213 |
| +0.5 to +0.99 | 0 |
| +1 to +1.99 | 0 |
| +2 to +2.99 | 0 |
| >= +3 | 0 |

## 7. Specialist counterfactual results

Affected: **0**; materially affected: **0**. Delta min/p10/median/mean/p90/max: **0.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0** (absolute max 0.0). Direction: **no movement**.

| State | Count |
|---|---:|
| <= -2 | 0 |
| -1.99 to -1 | 0 |
| -0.99 to -0.5 | 0 |
| -0.49 to +0.49 | 0 |
| +0.5 to +0.99 | 0 |
| +1 to +1.99 | 0 |
| +2 to +2.99 | 0 |
| >= +3 | 0 |

The broader all-false sensitivity bound affects **0** rows;
**0** move by at least 0.5. Its median/max delta
is **0.0 / 0.0**.

## 8. Combined counterfactual results

Affected: **0**; materially affected: **0**. Delta min/p10/median/mean/p90/max: **0.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0** (absolute max 0.0). Direction: **no movement**.

| State | Count |
|---|---:|
| <= -2 | 0 |
| -1.99 to -1 | 0 |
| -0.99 to -0.5 | 0 |
| -0.49 to +0.49 | 0 |
| +0.5 to +0.99 | 0 |
| +1 to +1.99 | 0 |
| +2 to +2.99 | 0 |
| >= +3 | 0 |

## 9. 68/70/75 threshold effects

### Independence-neutral only

| Floor | Currently below | Cross upward | Cross downward |
|---:|---:|---:|---:|
| 68 | 146 | 0 | 0 |
| 70 | 211 | 0 | 0 |
| 75 | 523 | 0 | 0 |

### Specialist-neutral only (demonstrable default subset)

| Floor | Currently below | Cross upward | Cross downward |
|---:|---:|---:|---:|
| 68 | 146 | 0 | 0 |
| 70 | 211 | 0 | 0 |
| 75 | 523 | 0 | 0 |

### Both

| Floor | Currently below | Cross upward | Cross downward |
|---:|---:|---:|---:|
| 68 | 146 | 0 | 0 |
| 70 | 211 | 0 | 0 |
| 75 | 523 | 0 | 0 |

### All-false sensitivity bound (not a factual counterfactual)

| Floor | Currently below | Cross upward | Cross downward |
|---:|---:|---:|---:|
| 68 | 146 | 0 | 0 |
| 70 | 211 | 0 | 0 |
| 75 | 523 | 0 | 0 |

There are **564** scored rows in the 65–78 band. Full band
materiality counts are in the JSON artifact.

## 10. Rejected population

| State | Count |
|---|---:|
| chain_exclusion | 20 |
| identity_issue | 13 |
| incomplete_research | 111 |
| obsolete_closed_or_replaced | 1 |
| other_product_exclusion | 5 |
| restricted_access | 8 |
| score_only_rejection | 507 |

There are **507** score-only rejects. The defensible
counterfactual materially changes **0**;
the deliberately broader all-false sensitivity bound changes
**0**.

## 11. Representative examples

- **confirmed independent:** French Cuisine H (Furansu Ryori Asshu) (`ChIJ--kHzR31GGARGv1b_Dizn2E`); chain `independent_single` (explicit_structured_classification), specialist `True` / structured `True`; Independence 100.0 -> 100.0, Local Discovery 71.11 -> 71.11, Fiyu 81.2 -> 81.2 (delta +0.00); published=True, status `auto_published` / `published`.
- **confirmed chain:** Osaka Okonomiyaki Tomokunchi Akasaka Mitsuke (`ChIJ3TJTPaONGGARmTKbeEEw3VA`); chain `small_same_brand_chain` (explicit_structured_classification), specialist `True` / structured `True`; Independence 40.0 -> 40.0, Local Discovery 48.27 -> 48.27, Fiyu 54.99 -> 54.99 (delta +0.00); published=False, status `auto_rejected` / `chain_exclusion`.
- **genuinely unknown independence:** Sonosaki (`ChIJ-xPoiWuNGGARXFHxIR5NjXw`); chain `unknown` (insufficient_chain_evidence), specialist `False` / structured `False`; Independence 76.0 -> 76.0, Local Discovery 80.08 -> 80.08, Fiyu 78.02 -> 78.02 (delta +0.00); published=False, status `needs_review` / `identity_issue`.
- **specialist true:** French Cuisine H (Furansu Ryori Asshu) (`ChIJ--kHzR31GGARGv1b_Dizn2E`); chain `independent_single` (explicit_structured_classification), specialist `True` / structured `True`; Independence 100.0 -> 100.0, Local Discovery 71.11 -> 71.11, Fiyu 81.2 -> 81.2 (delta +0.00); published=True, status `auto_published` / `published`.
- **affirmative specialist false:** no defensible example exists in stored data.
- **false default without structured field:** no defensible example exists in stored data.
- **affected by both:** no defensible example exists in stored data.

Restaurant names were not used to infer semantics.

## 12. Root-cause classification

- **Independence:** intentional scoring semantics with a distinct, bounded unknown state.
- **Specialist:** a combination of research-schema design (required boolean), data-model default
  (`False`), scoring semantics (lower false contribution), and a small legacy/migration subset.
  Persistence faithfully stores the model output; it is not the primary source of the collapse.

## 13. Recommendation

- **Independence — KEEP AS IS.** It already implements a non-renormalized neutral state. Giving
  unknown full independent credit would convert absence of evidence into positive evidence.
**Specialist — KEEP AS IS.** Tri-state semantics are explicit; future `non_specialist` requires affirmative provenance.

Exact next step: Proceed to the catalog-floor decision using the migrated scores; keep non_specialist evidence-gated and do not reinterpret unknown rows.

## 14. Production database immutability

The script opened the canonical database using SQLite immutable read-only mode and `query_only`.
The caller records before/after SHA-256 values in the JSON artifact; they must match exactly.
No network or paid requests were made.
