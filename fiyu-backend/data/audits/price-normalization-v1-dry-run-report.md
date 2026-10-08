# Price normalization v1 dry run

Dry run only. Canonical rows mutated: **0**.

- operation: price-normalize
- mode: dry_run
- normalization version: price-normalization-v1
- published rows: 851
- current complete: 623
- current missing: 228
- locally resolvable: 155
- conflicts: 0
- insufficient existing evidence: 73
- projected complete: 778
- projected unresolved: 73
- proposed change count: 155
- canonical mutations: 0
- external requests: 0
- canonical db sha256: 184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90

## Band Thresholds

```json
{
  "budget_max": 2000,
  "moderate_max": 5000,
  "splurge_above": 10000,
  "upscale_max": 10000
}
```

## Field Source Audit

```json
{
  "api_usage": "canonical budget only",
  "canonical": "public_restaurants.budget_json and budget_source_value",
  "product_usage": "Daily Picks affordability continues using the existing canonical budget",
  "provider_price_levels": "no established mapping exists, so non-JPY/provider-level hints remain unresolved",
  "raw": "restaurants.price",
  "researched": "public_restaurants.card_enrichment_json.budget and budget provenance",
  "scoring_usage": "none"
}
```

## Provenance and safety

All proposals derive from stored local evidence. Raw values are preserved; no external requests were made.
