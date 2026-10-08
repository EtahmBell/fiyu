# Expansion smoke25 map/Picks readiness remediation

## Verdict

All 17 published smoke additions are now map-ready using the existing local-only location hierarchy. No score or publication state changed, and no external request was made.

## Root cause

The smoke workflow ran the staged standard-research, Quality-v4, promotion, and publication-reconciliation commands. It did not call the location step embedded in `run_candidate_pipeline`; all 17 therefore had null coordinates, `map_display_eligible=0`, and `location_attempted_at=NULL`. The stored research/address context was sufficient for all 17.

## Results

- Published additions: 17
- Map-ready before: 0
- Map-ready after: 17
- Unresolved/conflicts: 0 / 1
- Overall map/Picks-ready published: 848 → 865
- Methods: {'broader_defensible_fallback': 1, 'local_osm_verified_address': 5, 'neighborhood_or_chome_approximate': 11}
- Precisions: {'area': 1, 'chome': 13, 'neighborhood': 3}
- External requests: 0
- Public detail HTTP 200: 17/17; map dataset: 17/17

## Location quality sample (all resolved additions)

| Restaurant | Resolved lat/lon | Precision | Method/provenance | Ward | Discovery area | Map eligible |
|---|---:|---|---|---|---|---|
| Kudaka Teppanyaki Asakusa | 35.710765, 139.792416 | chome | neighborhood_or_chome_approximate | Taito City | Taito Initial | yes |
| Ajidokoro Nomidokoro Gen | 35.772550, 139.761546 | neighborhood | neighborhood_or_chome_approximate | Adachi City | Adachi Initial | yes |
| Tomarigi | 35.729712, 139.573172 | chome | neighborhood_or_chome_approximate | Nerima City | Suginami Initial | yes |
| DAGAYA | 35.678369, 139.711870 | chome | local_osm_verified_address | Shibuya | Shibuya Initial | yes |
| Yoidokoro Yoshida | 35.678139, 139.627508 | chome | local_osm_verified_address | Suginami City | Suginami Initial | yes |
| Ichiriki | 35.780458, 139.757449 | neighborhood | neighborhood_or_chome_approximate | Adachi City | Adachi Initial | yes |
| Shukudokoro Doremi | 35.567937, 139.693097 | chome | neighborhood_or_chome_approximate | Ota City | Ota Initial | yes |
| Teppanyaki Acalli | 35.648939, 139.734122 | chome | neighborhood_or_chome_approximate | Minato City | Minato Initial | yes |
| shu Sake Bar | 35.601425, 139.697605 | chome | neighborhood_or_chome_approximate | Ota City | Ota Initial | yes |
| Umasando | 35.721938, 139.785995 | chome | local_osm_verified_address | Taito City | Taito Initial | yes |
| Izakaya Kuji | 35.757479, 139.621624 | neighborhood | neighborhood_or_chome_approximate | Nerima City | Suginami Initial | yes |
| How Lovely | 35.682875, 139.676870 | chome | neighborhood_or_chome_approximate | Shibuya | Shibuya Initial | yes |
| Kanei Soba | 35.731375, 139.697026 | chome | local_osm_verified_address | Toshima City | Toshima Initial | yes |
| Spice Bistro Dharkan | 35.687458, 139.759131 | area | broader_defensible_fallback | Chiyoda City | Chiyoda Initial | yes |
| Tezukuri Pan Cake Fujiya | 35.681385, 139.829814 | chome | neighborhood_or_chome_approximate | Koto City | Koto Initial | yes |
| Sosaku Izakaya Jiyu | 35.562697, 139.718659 | chome | neighborhood_or_chome_approximate | Ota City | Ota Initial | yes |
| Akafuji | 35.685355, 139.612929 | chome | local_osm_verified_address | Suginami City | Suginami Initial | yes |

`area` is the broadest accepted fallback and is intentionally approximate. `chome` and `neighborhood` results use stable OSM polygon interior points and are also marked approximate.

## Future workflow

`seed → standard research → resolve-cohort-locations → Quality-v4 → publication reconciliation → map/Picks readiness reporting`

The new exact-cohort command reuses the existing POI/address/polygon/area-anchor hierarchy, makes zero external calls, refuses an unscoped unpublished run, checkpoints per row, and reports map-ready, map-ineligible, method distribution, unresolved, and conflict counts. Location failure remains nonfatal.

## Product and database parity

- Scores exact: 1228/1228
- Score versions exact: 1228/1228
- Publication exact: 1228/1228; additions/removals 0/0
- Original 851 unchanged: 851/851
- SQLite integrity: ok; foreign keys: 0; duplicate place IDs: 0; broken pointers: 0
- Database SHA before/after: `DAD1D8A292BBC30282E182F15F39D557E6F4BAB3D682B8AE8D5A3ECDF804E58C` / `A2A50594234F575F960AB9F2270F3CC6E1F588A6B5DCA5EE1C2CC8B09053B586`
- Backup SHA: `C8ACAD3B30766029CC1E44D9B2F324FA17D5E635E1A7DFCA9EE60DAB24DF9532`
- `seed70.txt` SHA: `BF5EE61572EB2FB1B12F2487F800673EB965583DDFA1F22DCABFFE860F618C39`
