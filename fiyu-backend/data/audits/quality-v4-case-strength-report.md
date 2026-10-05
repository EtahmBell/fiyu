# Quality v4 case-strength rescore

## Scope

This is an offline rescore of the frozen challenge evidence: 98 complete rows and
2 failed rows. No external call was made and no production state was changed.

## Deterministic design

- Claims consolidate on normalized family + normalized aspect + polarity + provenance
  independence. Free-form `underlying_claim_identity` is retained in the source corpus but
  is not a corroboration key.
- Positive case strength activates at 8/100. Negative movement activates at 12/100 and an
  isolated negative source receives only a 0.08 corroboration multiplier. Two independent
  negative sources receive 0.65; three receive 1.60.
- Repeated sources and repeated claims have diminishing returns. Cross-source synthesis
  observations are excluded so they cannot double-count their inputs.
- Mixed evidence attenuates the dominant direction nonlinearly. The balance is mapped through
  explicit nonlinear anchors to a hard +/-20 ceiling.
- No qualifying evidence produces exactly zero case strengths, zero balance, and zero
  adjustment. Missing websites, missing editorial coverage, and obscurity are not inputs.

## Existing-evidence results

- Adjustment: {"count": 98, "min": -1.66, "p10": 0.0, "median": 3.26, "mean": 3.22, "p90": 6.26, "max": 8.37}
- Directions: 79 positive, 1 negative,
  18 near neutral.
- Large movements: 1 at |adjustment| >= 8 and
  0 at |adjustment| >= 12.
- Natural observed range: -1.66 to +8.37. This corpus does
  not support treating +/-20 as a normal range; it remains only a safety ceiling.

## Bucket behavior

- **positive** (23): positive strength {'count': 23, 'min': 11.17, 'p10': 27.41, 'median': 38.92, 'mean': 38.66, 'p90': 50.38, 'max': 52.04}; negative strength {'count': 23, 'min': 0.0, 'p10': 0.0, 'median': 0.0, 'mean': 0.2, 'p90': 0.57, 'max': 2.03}; adjustment {'count': 23, 'min': 0.0, 'p10': 2.14, 'median': 3.81, 'mean': 4.04, 'p90': 6.22, 'max': 6.57}; directions +22/-0/neutral 1; both sides 3.
- **mixed** (25): positive strength {'count': 25, 'min': 6.7, 'p10': 21.16, 'median': 38.28, 'mean': 38.07, 'p90': 54.08, 'max': 60.32}; negative strength {'count': 25, 'min': 0.0, 'p10': 0.0, 'median': 0.0, 'mean': 0.16, 'p90': 0.67, 'max': 1.69}; adjustment {'count': 25, 'min': 0.0, 'p10': 1.29, 'median': 3.72, 'mean': 4.07, 'p90': 7.01, 'max': 8.37}; directions +23/-0/neutral 2; both sides 4.
- **negative** (25): positive strength {'count': 25, 'min': 11.55, 'p10': 24.34, 'median': 35.32, 'mean': 34.86, 'p90': 47.26, 'max': 51.88}; negative strength {'count': 25, 'min': 0.0, 'p10': 0.0, 'median': 0.0, 'mean': 1.5, 'p90': 1.56, 'max': 30.94}; adjustment {'count': 25, 'min': -1.66, 'p10': 1.72, 'median': 3.29, 'mean': 3.29, 'p90': 5.54, 'max': 6.54}; directions +24/-1/neutral 0; both sides 6.
- **sparse** (25): positive strength {'count': 25, 'min': 0.0, 'p10': 0.0, 'median': 0.0, 'mean': 15.84, 'p90': 44.05, 'max': 52.89}; negative strength {'count': 25, 'min': 0.0, 'p10': 0.0, 'median': 0.0, 'mean': 0.04, 'p90': 0.0, 'max': 1.1}; adjustment {'count': 25, 'min': 0.0, 'p10': 0.0, 'median': 0.0, 'mean': 1.56, 'p90': 4.84, 'max': 6.76}; directions +10/-0/neutral 15; both sides 1.


## Claim consolidation

Mario Tenshin now consolidates three independent weak/thin-broth and low-umami reports into
`craft_execution / broth_quality / negative`. Its negative case strength is
30.94, balance is
-17.29, and adjustment is
-1.66. The old free-form-ID policy gave it +0.27.

## Sparse safety

No evidence is exactly neutral by construction. Obscurity, website absence, editorial absence,
and other missing catalog fields never enter this Quality formula. Sparse-bucket updates occur
only where the frozen research actually contains food-specific sources; see diagnostics for all
sparse examples. A single isolated negative cannot lower Quality.

## Interpretation and paid-run decision

Case strength is materially clearer and more authoritative than the old tiny additive bonuses:
the observed maximum rises from under +2 in the earlier experiment to +8.37,
while repeated copied material and isolated criticism remain constrained. The result is still
strongly positivity-biased: this reflects both upstream selection and, importantly, extraction
bias in the frozen corpus.

A second, smaller verified challenge run is necessary before production. The benchmark has only
one medium-confidence negative label and 24 low-confidence proxy negatives, while only one row
moves negatively even after consolidation. Existing evidence validates the mechanics and Mario-
type consolidation, but it cannot validate negative recall or the -6 to -15 calibration range.

It was not responsible to execute that paid run from this corpus: the strict admission rule for
15 verified mixed and 15 verified negative controls could not be met. Paying for another run on
the same proxy labels would repeat the benchmark defect. The next experiment must first freeze
human-auditable, restaurant-level benchmark evidence that is kept out of the research prompt.

## Direct answers

1. **Case strength vs tiny bonuses:** better for interpretability and authority; the maximum
   observed revision is now +8.37, while no-evidence behavior stays exact.
2. **Deterministic normalization:** yes; it creates corroboration that free-form IDs missed.
3. **Mario Tenshin:** yes; three sources consolidate as negative broth quality.
4. **Strong positive movement:** yes; observed +8.37 and controlled multi-family tests exceed +10.
5. **Strong negative movement:** architecturally yes (controlled tests exceed -10), but not yet
   empirically calibrated on a verified restaurant cohort.
6. **Mild positivity bias:** yes in the rules, and a much larger observed bias from the corpus.
7. **Reasonable bias:** the mild rule asymmetry is reasonable for the upstream-selected pool;
   the observed 79-positive/1-negative split is too confounded by extraction bias to approve.
8. **Bad restaurants catchable:** the architecture supports it; empirical recall remains unknown.
9. **Sparse safety:** yes: 13 no-evidence sparse rows are exactly zero, and no absence penalty exists.
10. **Obscurity raises Quality:** never; it is not a Quality input.
11. **Absence lowers Quality:** never; it is not a Quality input.
12. **Natural observed adjustment distribution:** median +3.26, p90 +6.26, range -1.66 to +8.37.
13. **Natural positive range:** mostly +1 to +6, with one evidence-supported +8.37 tail case.
14. **Natural negative range:** not estimable from this biased corpus; only Mario moved (-1.66).
15. **+/-20 ceiling:** sensible as an experimental safety ceiling, not justified as a production cap.
16. **Smaller ceiling:** +15/-15 would improve initial safety without changing any current row.
17. **Research value:** yes; evidence can now move final Fiyu by meaningful amounts rather than ~0.4.
18. **Most useful families:** craft/execution dominates (229 qualifying observations), followed by
    food reputation (93), ingredient/product (56), and consistency (22). Negative family coverage
    is still too thin for comparative effectiveness claims.
19. **Sources/languages:** Japanese supplied 383/400 qualifying observations. Local review
    platforms (183) and local food blogs (108) supplied most usable evidence; language itself is
    never rewarded.
20. **Another paid experiment:** yes, after verified benchmark curation; it was not run here.
21. **Production readiness:** no.
22. **Exact remaining defect:** no high-confidence negative/mixed benchmark exists to measure
    extraction recall, false-negative rate, or real-world negative-tail calibration.

## Offline publication-floor counterfactuals

{
  "68": {
    "production_pass": 69,
    "experimental_pass": 72,
    "crossed_up": 3,
    "crossed_down": 0
  },
  "70": {
    "production_pass": 56,
    "experimental_pass": 67,
    "crossed_up": 11,
    "crossed_down": 0
  },
  "75": {
    "production_pass": 36,
    "experimental_pass": 40,
    "crossed_up": 4,
    "crossed_down": 0
  }
}
