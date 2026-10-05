# Quality v4 final validation: benchmark admission gate

## Decision

**C — NOT READY.** The final blinded paid run was stopped before spending because the
mandatory benchmark-admission gate failed.

## Benchmark

- Frozen controls: **34**
- Positive: **12** (high confidence)
- Mixed: **8** (all medium confidence)
- Negative: **1** (high confidence)
- Sparse: **13** (high confidence)
- Overall confidence: **26 high**, **8 medium**
- Average independent sources per non-sparse benchmark: **5.19**
- High-confidence mixed controls: **0 / 10 required**
- High-confidence negative controls: **1 / 10 required**

The sole strict negative control is Mario Tenshin: three independent Japanese sources
corroborate `craft_execution / broth_quality / negative`. Eight restaurants have genuine
positive and negative food evidence, but each negative side is supported by only one source;
they are therefore frozen as medium-confidence mixed controls rather than promoted to high.

Source observations are overwhelmingly Japanese (113 Japanese, 1 English). Local review
platforms (47) and local food blogs (36) provide most benchmark evidence, followed by map
reviews (15) and editorial food media (7).

## Paid run

- Requests: **0**
- Web-search actions: **0**
- Tokens: **0**
- Failures: **0**
- Needs retry: **0**

No model or external call was made. This is the required protocol outcome when fewer than
roughly ten high-confidence negative or mixed controls can be assembled.

## Blinded performance and scoring

Not measured. Running the researcher after the gate failed would make recall, false-boost,
false-punishment, adjustment-distribution, +/-15 versus +/-20, and publication-floor metrics
scientifically invalid. The current case-strength design was not changed.

Production-v3 parity remains documented as 1,092/1,092 exact zero-adjustment matches with zero
monotonicity violations. That solved result was reviewed, not recomputed into a new design.

## Exact blocker

The frozen corpus supports only **one** strict recurring-negative restaurant and **zero**
high-confidence mixed controls under a corroborated-negative standard. It therefore cannot
measure high-confidence negative recall, recurring-issue recall, or mixed both-sides recall.

Before the final paid validation can run, human curation must add at least nine strict negative
controls and ten high-confidence mixed controls. Their evidence must be frozen and hidden from
the researcher. The research prompt and deterministic scorer should then run unchanged.

## Product questions

1. Production-v3 parity: **yes, still exactly documented**.
2–5. Positive, negative, recurring-negative, and mixed recall: **not measured; gate failed**.
6–10. Sparse safety and false-boost/punishment in this final run: **not measured; no run**.
11–13. Source recovery comparisons: **not measured**; benchmark curation itself is 99% Japanese
   and led mainly by local review platforms and local food blogs.
14. Mild positive bias: **unchanged and still conceptually reasonable**.
15–17. Negative sensitivity or mapping retuning: **no conclusion and no tuning justified**.
18. +/-20 remains an experimental ceiling; this gate provides no new magnitude evidence.
19. +/-15 remains the proposed initial production guardrail, not yet validated here.
20. Natural final-benchmark range: **not measurable without a blinded run**.
21. Production readiness: **no**.
22. Exact blocker: **insufficient high-confidence negative and mixed benchmark controls**.
