# Continue building Fiyu with Codex in VS Code

The repository already includes `AGENTS.md`, tests, VS Code tasks, and a demo dataset so Codex has clear project context.

## Setup

1. Open the `fiyu-backend` folder in VS Code.
2. Install the official Codex extension.
3. Sign in with the ChatGPT account that has Codex access.
4. Open the Codex sidebar. If the icon is hidden, use the Command Palette and run `Codex: Open Codex Sidebar`.
5. Create a Git repository and make a checkpoint before asking Codex to edit files.

## First Codex prompt

```text
Read README.md and AGENTS.md, then inspect the repository without editing anything.
Explain:
1. how ingestion maps the wide Apify exports,
2. how deduplication works,
3. how internal_fiyu_score is calculated,
4. how to run the tests and demo,
5. any important risks or edge cases you see.
```

## Prompt to ingest the real files

After copying the 12 exports into `data/raw/`:

```text
Inspect the files in data/raw without exposing or copying full raw rows into chat.
Run the ingestion command and tests.
Report:
- files discovered,
- raw and deduplicated restaurant counts,
- excluded closed/advertisement/non-food rows,
- candidate count,
- simple-rule count,
- score distribution by area,
- the most common missing fields,
- likely column-mapping failures.
Do not change scoring thresholds yet.
```

## Prompt to audit the score

```text
Analyze data/processed/restaurants_scored.csv.
Create a concise diagnostic report by area and broad_category.
Flag likely scoring failures, especially:
- tiny review samples ranking too highly,
- obvious chains not detected,
- hotels or non-restaurants,
- duplicate branches,
- area names that fragmented into multiple spellings,
- candidates dominated by one neighborhood or cuisine.
Propose changes, but do not implement them until I approve.
```

## Prompt to add the frontend later

```text
Create a separate Next.js frontend in a new `frontend/` directory.
Use the existing FastAPI endpoints; do not duplicate scoring logic in TypeScript.
Build:
- browser geolocation with manual fallback,
- nearby restaurant cards,
- Fiyu score and confidence display,
- area and category filters,
- link out to the existing maps_url,
- loading, empty, and error states.
Run lint and build before completing the task.
```
