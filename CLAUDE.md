# Fiyu Project Instructions

## Product

Fiyu is a Tokyo restaurant discovery application focused on authentic,
independent, underexposed restaurants.

The intended experience is:

- Nearby recommendations first
- Map and list browsing
- Strong visual restaurant cards
- A Hidden Gems to Popular Favorites discovery control
- Area and cuisine browsing
- Restaurant detail pages
- User-facing Fiyu scores
- Fresh Google Maps information

Fiyu is not a generic restaurant directory. It should feel curated,
editorial, local, modern, and trustworthy.

## Repository

- `fiyu-backend/` contains the FastAPI backend.
- Create the frontend in `fiyu-frontend/`.
- Do not rewrite or replace the backend.
- Do not change backend database schemas unless explicitly requested.

## Backend

Local API base URL:

`http://127.0.0.1:8000`

Frontend endpoints:

- `GET /public/restaurants?limit=100`
- `GET /public/restaurants/{place_id}`
- `GET /public/restaurants/{place_id}/live-details?language_code=en`

The list endpoint returns only manually published restaurants.

The live-details endpoint should only be called when a restaurant is selected
or its detail page is opened. Do not call Google live details for every card
during initial page load.

## Public data

Public restaurant data may contain:

- place_id
- name_ja
- name_en
- primary_category
- latitude
- longitude
- neighborhood
- fiyu_score
- fiyu_confidence
- confidence_band
- score_band
- why_fiyu
- food_tags
- signature_dishes
- local_language_web_signal

Google live details may contain:

- place_id
- name
- address
- latitude
- longitude
- rating
- rating_count
- price_level
- open_now
- weekday_hours
- google_maps_uri
- primary_type

Do not expose or depend on:

- internal_fiyu_score
- raw evidence
- model prompts
- research errors
- SQLite internals
- API keys

## Security

Never read, print, modify, or commit:

- `.env`
- `.env.local`
- SQLite databases
- API keys
- raw scraped datasets

Do not put `GOOGLE_PLACES_SERVER_KEY` in the frontend.

The browser map must use a separate browser-restricted key named:

`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`

## Frontend architecture

Use:

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- Accessible reusable components
- Runtime validation for API responses
- A clear API client layer
- Responsive mobile-first layouts

Keep server data, presentation components and UI state separate.

## Visual direction

Create a premium Tokyo editorial discovery aesthetic.

Avoid:

- Generic SaaS dashboard styling
- Excessive gradients
- Glassmorphism everywhere
- Clichéd Japanese motifs
- Overcrowded cards
- Fake ratings or invented restaurant content

Prefer:

- Strong typography
- Warm neutral backgrounds
- Restrained accent colors
- Clear hierarchy
- Generous whitespace
- High-quality map/list interaction
- Subtle motion
- Japanese and English text support

## Workflow

Before editing:

1. Inspect the repository.
2. Inspect the backend endpoint models.
3. Explain the proposed frontend architecture.
4. Identify assumptions and API limitations.
5. Wait for approval before large implementation changes.

After editing:

1. Run lint.
2. Run type checking.
3. Run tests.
4. Run the production build.
5. Show changed files and remaining limitations.
6. Do not commit or push unless explicitly asked.