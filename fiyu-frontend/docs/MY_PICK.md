# My Pick local setup

My Pick uses Google's Place Autocomplete Data API only inside its Fiyu-rendered modal on `/picks`. Configure a billing-enabled Google Cloud project, enable the **Maps JavaScript API** and **Places API (New)**, then create a browser key restricted to the local and deployed Fiyu origins and to those two APIs. Put that public key in:

```powershell
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_http_referrer_restricted_browser_key
```

Do not reuse `GOOGLE_PLACES_SERVER_KEY`. Places UI Kit is not required by this implementation and may be removed from the browser-key restriction after any older widget-based deployment has stopped receiving traffic. Prediction names and secondary text exist only in the current React session; the browser submits and durably retains only the selected Google Place ID. Canonical names, locations, scores, and publication state are established by the backend.

The backend's account projection requires `fiyu-backend/supabase/migrations/202610130001_my_picks.sql`. From the linked backend project, apply outstanding checked-in migrations with:

```powershell
supabase db push
```

Production processing is not performed by the frontend or by GET requests. Configure one Railway worker/cron invocation for the backend command, supplying the same persistent catalog volume and required OSM indexes:

```powershell
python -m fiyu.cli pipeline --db data/fiyu.db my-picks-worker --limit 1 --osm-index <path-to-osm-index> --osm-address-index <path-to-osm-address-index>
```

Keep a single worker against one SQLite catalog. Use the existing Railway environment variables for provider credentials, Supabase, catalog volume, and OSM paths.
