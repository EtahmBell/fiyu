# Fiyu backend agent instructions

## Product boundary
This repository builds an internal/provisional Tokyo restaurant candidate score. Do not describe it as verified localness or a public quality rating without an independent evidence layer.

## Engineering rules
- Preserve raw source files; ingestion is read-only.
- Deduplicate by `placeId` first.
- Keep score formulas deterministic and unit tested.
- Never expose full raw scraped rows through the API.
- Do not add LLM calls to the scoring path.
- Run `pytest` after scoring or ingestion changes.
- Run `python -m fiyu.cli demo` after schema changes.

## Key commands
```bash
python -m fiyu.cli ingest data/raw --db data/fiyu.db --csv-out data/processed/restaurants_scored.csv
uvicorn fiyu.api:app --reload
pytest
```
