# Specialist tri-state migration report

## Executive summary

The specialist boolean was migrated to the explicit states `specialist`,
`non_specialist`, and `unknown`. Historical true values became `specialist`; historical
false and missing values became `unknown`. No row was inferred to be `non_specialist`.

## Schema and provenance

- `public_restaurants.specialist_status`
- `public_restaurants.specialist_provenance_json`
- `public_restaurants.specialist_schema_version`
- Schema version: `specialist-tristate-1`
- Migration version: `specialist-tristate-migration-1`
- Historical research-run payloads were preserved unchanged.
- The compatibility boolean in canonical evidence is derived only from tri-state status.

## Migration counts

- Prior true: **836**
- Prior false: **256**
- Prior missing: **111**
- Final specialist: **836**
- Final non_specialist: **0**
- Final unknown: **367**
- Rows migrated: **1203**
- Rows skipped: **0**

## Scoring

- Scored rows: **1092**
- Rows changed: **252**
- Delta min/p10/median/mean/p90/max: **0.95 / 0.95 /
  0.95 / 0.95 / 0.95 / 0.95**
- Observed delta values: `[0.0, 0.95]`
- Quality-v4 research rows and adjustment values changed: **0**

## Floor counterfactuals

| Floor | Currently below | Cross upward | Cross downward |
|---:|---:|---:|---:|
| 68 | 155 | 9 | 0 |
| 70 | 219 | 8 | 0 |
| 75 | 539 | 16 | 0 |

Score-only rejected rows affected: **140**.
No floor or publication decision was changed.

## Publication safety

All tracked publication, eligibility, status, and rejection fields changed by **zero**.
The publication threshold remains **75**.

## Idempotency and integrity

- Second-run mutation rows: **pending**
- Duplicate new score-history rows: **pending**
- SQLite integrity: **pending**
- External or paid requests: **0**
