# Discovery-area backfill v1 dry run

Dry run only. Canonical rows mutated: **0**.

- operation: discovery-area-backfill
- mode: dry_run
- normalization version: discovery-area-derivation-v1
- published rows: 851
- current complete: 47
- current missing: 804
- deterministically fillable: 803
- lower precision fillable: 0
- unresolved: 0
- conflicts: 1
- projected complete: 850
- projected unknown: 1
- proposed change count: 803
- canonical mutations: 0
- external requests: 0
- canonical db sha256: 184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90
- discovery area definition: a user-facing Tokyo neighborhood when stored evidence supports it; otherwise the correct ward; never inferred from restaurant attributes

## Field Source Audit

```json
{
  "canonical": "public_restaurants.discovery_area plus type/source/provenance columns",
  "evidence_order": [
    "existing dedicated area",
    "verified neighborhood",
    "candidate neighborhood",
    "stored address neighborhood",
    "stored ward",
    "reviewed source-bucket ward",
    "unknown"
  ],
  "product_usage": "existing area fallback, map, Picks, and API remain unchanged in E1",
  "raw": "restaurants.address/city/neighborhood/search_area/latitude/longitude",
  "verified": "verified_restaurant_addresses and public_restaurants normalized location columns"
}
```

## Provenance and safety

All proposals derive from stored local evidence. Raw values are preserved; no external requests were made.
