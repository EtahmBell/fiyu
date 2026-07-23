# Fiyu backend MVP

A working Python backend for combining Apify restaurant exports, cleaning and deduplicating them, calculating a transparent **internal/provisional Fiyu candidate score**, exporting a reviewable CSV, and serving nearby candidates through a FastAPI API.

## What this version does

- Reads `.csv`, `.tsv`, `.json`, `.jsonl`, `.ndjson`, and `.xlsx` exports.
- Recursively combines all supported files in a directory.
- Maps the very wide Apify schema to a small normalized restaurant record.
- Deduplicates by `placeId`, then `cid`/`fid`, then a conservative fallback key.
- Removes closed listings, advertisements, invalid rows, and obvious non-food results.
- Detects likely chains using known chain terms, repeated exact names, and repeated website domains.
- Preserves the original rule as `matches_simple_rule`:
  - no website;
  - rating at least 4.2;
  - no more than 100 reviews;
  - not a likely chain.
- Adds continuous scoring so borderline records are not discarded.
- Writes a clean CSV and SQLite database.
- Serves nearby candidates through an API.

## Important product boundary

`internal_fiyu_score` is a **candidate-generation score**, not a verified public quality or localness rating. It is designed to help Fiyu decide which restaurants deserve independent evaluation.

## Score components

The default score is:

```text
45% Bayesian-adjusted quality
30% review underexposure relative to area/category peers
10% limited digital footprint
10% evidence confidence
 5% independent-business likelihood
minus penalties for tiny samples, low ratings, or chain likelihood
```

The weights and thresholds are configurable in `scoring.example.json` or with CLI flags.

## Setup in VS Code

### Windows PowerShell

```powershell
cd path\to\fiyu-backend
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e ".[dev]"
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
```

### macOS/Linux

```bash
cd path/to/fiyu-backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e '.[dev]'
```

On Windows, edit `.vscode/settings.json` if necessary and change:

```json
"python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python"
```

to:

```json
"python.defaultInterpreterPath": "${workspaceFolder}\\.venv\\Scripts\\python.exe"
```

Do the same for the Python command in `.vscode/tasks.json`, or simply run the commands below in the VS Code terminal.

## Put your Apify exports in the project

Copy all 12 datasets into:

```text
data/raw/
```

The filenames can identify the area, such as:

```text
shinjuku.csv
shibuya.csv
setagaya.xlsx
```

When `searchString` is missing, the filename becomes the fallback area name.

## Run ingestion

```bash
python -m fiyu.cli ingest data/raw \
  --db data/fiyu.db \
  --csv-out data/processed/restaurants_scored.csv
```

PowerShell equivalent:

```powershell
python -m fiyu.cli ingest data/raw --db data/fiyu.db --csv-out data/processed/restaurants_scored.csv
```

The output summary reports raw rows, duplicates, excluded rows, candidate count, and simple-rule count.

### Flexible thresholds

```bash
python -m fiyu.cli ingest data/raw \
  --db data/fiyu.db \
  --csv-out data/processed/restaurants_scored.csv \
  --target-rating 4.2 \
  --minimum-rating 3.9 \
  --soft-review-cap 100 \
  --minimum-review-count 5 \
  --maximum-review-count 500 \
  --minimum-candidate-score 55
```

Or edit a JSON file:

```bash
python -m fiyu.cli ingest data/raw --config scoring.example.json
```

## Run the included demo

```bash
python -m fiyu.cli demo
```

## Start the backend

```bash
uvicorn fiyu.api:app --reload --port 8000
```

Open:

```text
http://127.0.0.1:8000/docs
```

### Useful endpoints

```text
GET /health
GET /stats
GET /areas
GET /restaurants/candidates?min_score=60&limit=50
GET /restaurants/candidates?area=Shinjuku%20City&simple_rule_only=true
GET /restaurants/nearby?lat=35.6895&lng=139.6917&radius_km=3&limit=20
GET /restaurants/nearby?lat=35.6895&lng=139.6917&category=ramen
```

## Run tests

```bash
pytest
```

## Clean output columns

The generated CSV includes the restaurant identity and core source fields, plus:

- `adjusted_rating`
- `quality_score`
- `underexposure_score`
- `digital_footprint_score`
- `confidence_score`
- `independent_score`
- `score_penalty`
- `internal_fiyu_score`
- `candidate_tier`
- `confidence_band`
- `matches_simple_rule`
- `candidate_eligible`
- `score_reasons`

## Recommended next product steps

1. Run ingestion on the 12 exports.
2. Sort `restaurants_scored.csv` by `internal_fiyu_score`.
3. Spot-check the top 100 across all areas.
4. Record only obvious failure labels: `credible`, `uncertain`, `not_hidden`, `chain`, `closed`, `wrong_category`.
5. Tune thresholds in `scoring.example.json`.
6. Connect a simple frontend to `/restaurants/nearby`.
7. Keep the internal score separate from any future independently evaluated public Fiyu Score.
