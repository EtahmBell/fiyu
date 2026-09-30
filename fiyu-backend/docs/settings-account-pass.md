# Settings / account-navigation correctness pass

## Scope and root causes

The mobile hamburger was an uncontrolled `details` element in persistent app
chrome. It had no navigation, outside-pointer, or Escape dismissal handlers.
Edit Profile explicitly declared Profile as its parent. Desktop children also
returned directly to Profile. Logout and deletion were available only on the
Account child page, rather than directly on Settings.

Unrelated `.claude/` directories were present at the start and are untouched.
No score, restaurant, location, recommendation, Together, Premium, or signup
rules were changed. The saved-data store change is strictly logout cache
invalidation, not a Lists feature or saved-pin fix.

## Navigation and account UI

- Controlled hamburger with `aria-expanded` and `aria-controls`. Every menu
  link closes it immediately. Outside `pointerdown` closes it without blocking
  the underlying page; clicks within non-link menu content do not close it.
- Escape closes the menu and focuses its trigger. Pathname-keyed mounting
  resets it for programmatic navigation and browser Back/Forward. Moving to
  desktop also closes it. Event listeners are removed on close/unmount. The
  hamburger creates neither a backdrop nor a body scroll lock.
- Settings Back goes to `/profile`; Edit Profile, Account, Notifications,
  Privacy, Help, and About Back go to `/profile/settings`, on both layouts.
  Existing route names and the established hierarchical Back link are retained.
  Every Settings Back uses the declared parent, not arbitrary `back()`. The
  document-entry performance URL cannot prove the previous history entry after
  an intervening non-Settings route, so this flow no longer uses that shortcut.
- Settings directly contains a full-width, minimum 44px Log out button and a
  separate Danger zone / Delete account action. Account still exposes these
  canonical actions for existing links. Failed session loading offers Retry.
- Logout uses `authService.signOut()` and the existing Supabase SDK path.
  Pending actions are guarded against duplicate submission. Auth/network
  failures are classified by the existing connectivity error layer and remain
  retryable without a success redirect.
- Deletion retains password reauthentication and explicit destructive
  confirmation. The native modal dialog makes the background inert, starts
  focus on Cancel, fits/scrolls within the viewport, and closes on Cancel/Escape
  before submission. Closing releases scroll lock and restores trigger focus.
  While deletion is pending, dismissal and duplicate submission are disabled.
- A successful server delete followed by failed browser-session cleanup has a
  distinct “Account deleted” state. Retry performs local cleanup only; it never
  repeats the server deletion. No success is claimed for a server failure.

## Ownership inventory (repository schema, not a live database inspection)

| Data | Ownership / cleanup |
| --- | --- |
| Supabase profile, username, display name, bio, avatar URL | `fiyu_user_profiles.user_id` → `auth.users`, DELETE CASCADE |
| Saves / custom and default Lists / list items | `fiyu_restaurant_lists` and `fiyu_restaurant_list_items.user_id` → Auth CASCADE; composite list ownership FK also cascades |
| Visits, ratings, reactions, private notes | `fiyu_restaurant_visits.user_id` → Auth CASCADE; ratings/notes are visit fields |
| Seen / discovery history | `fiyu_restaurant_seen.user_id` → Auth CASCADE |
| Discovery / preview-location preference | `fiyu_user_discovery_locations.user_id` → Auth CASCADE |
| Notifications / read acknowledgement | `fiyu_user_notifications.user_id` → Auth CASCADE |
| Persisted Picks rounds and items | `fiyu_daily_pick_rounds` / `fiyu_daily_pick_round_items.user_id` → Auth CASCADE; round items also cascade from their round |
| Taste snapshots / acknowledgement | `fiyu_user_taste_snapshots.user_id` → Auth CASCADE; current Taste is derived from account data, not a separate retained identity |
| Developer settings | `fiyu_developer_settings.user_id` → Auth CASCADE |
| Together invitation/session participants and pair IDs | `fiyu_together_sessions` initiator, invitee, pair-low and pair-high → Auth CASCADE; deleting either participant deletes the joint session under existing policy |
| Together picked restaurants | `fiyu_together_pick_items.session_id` → session CASCADE |
| Together trial state | `fiyu_together_trials.user_id` → Auth CASCADE. The other participant's trial row is retained; its `consumed_session_id` becomes NULL on session deletion, preserving their existing consumption semantics |
| Premium | Existing server environment allowlist `FIYU_PREMIUM_OWNER_IDS`, not a personal DB table or billing provider. Deletion does not rewrite deployment configuration; operators should remove obsolete UUID entries. A new account UUID does not inherit them |
| Avatar upload | Product upload convention is `avatars/{authenticated UUID}/avatar.webp`; the server removes this object before deleting Auth |
| Legacy SQLite profile, Lists/items, visits/private notes, community recommendations, Picks history/rounds | Existing `delete_local_account_data` transaction deletes only exact authenticated UUID ownership. Round items cascade from deleted local rounds |
| Anonymous owner / anonymous saves, city poll votes | Not authenticated-UUID-owned. Anonymous browser identity and anonymous poll data are retained; ownership is not guessed from email |
| Contact submissions | Independent contact form data, not account-FK-owned; not deleted by guessing an email match |
| Global catalog / scores / research / enrichment / map restaurant data | Not user-owned and never targeted by deletion |

Inspected migrations: `202608090001_authenticated_user_data.sql`,
`202608090004_user_discovery_locations.sql`, `202608100001_user_notifications.sql`,
`202608210001_daily_pick_snapshots.sql`, `202608290001_developer_daily_picks_tools.sql`,
`202608310001_user_taste_snapshots.sql`, `202609090001_fiyu_together_v1.sql`,
`202609110001_together_multi_partner.sql`, plus subsequent column-only changes
and avatar bucket/path policy. No migration is required by this pass.

## Real deletion architecture and security

The existing `DELETE /profiles/me/account` endpoint is reused. It obtains the
subject from the verified bearer session (`_authenticated_user`), normalizes it
as a UUID, and does not take a caller-selected target ID. The browser sends only
its freshly reauthenticated bearer token, not the password or a target user ID,
to this endpoint. Privileged Storage/Auth requests use server-only service-role
configuration; no admin credential is added to browser code.

Sequence: authenticated subject → transactionally remove non-cascading local
rows → delete canonical avatar through Storage → delete Auth identity last.
Auth deletion invokes existing Postgres cascades. There is no distributed
transaction across SQLite, Storage, and Auth: a later failure can leave earlier
cleanup completed. The endpoint returns 503, not success, and retries safely
repeat local deletion and tolerate a missing avatar. This pass parses missing
avatar JSON structurally, including numeric/string 404 and whitespace variants,
instead of matching compact JSON substrings. Other provider failures stay fatal.

Protected backend endpoints revalidate the user through Supabase Auth, rather
than treating a cached JWT alone as proof of a still-existing account. Actual
hosted revocation/cascade behavior remains a live disposable-account check.
If the final HTTP response is lost after Auth deletion, completion is uncertain;
the client reports a transport failure, not an unverified success. Retrying may
then fail reauthentication because the identity is already gone. An operator
must verify that ambiguous external outcome; this patch does not invent an
unauthenticated deletion-status endpoint.

## Client cleanup

Successful logout/deletion removes the current account's persisted Picks,
profile/name/avatar cache, auth-return path, and Picks detail-return state. The
existing account-change event clears account queries (including personal Map,
Taste and notification queries) and saved-data stores. Public catalog caches,
anonymous ownership, and separately keyed other-account browser entries are
not erased unnecessarily.

Account-query consumers are notified immediately when cleared. Generation
guards prevent old account-query, profile, and saved-data requests from
repopulating state after logout/account switching. Profile identity clears name,
email and avatar immediately, rather than retaining them while the next account
hydrates. Successful actions replace the route with `/`.

## Changed files

Frontend:

- `src/components/layout/ApplicationNavigation.tsx` and its tests
- `src/components/profile/ProfileWorkspace.tsx` and its tests
- `src/lib/navigation/profileSubpage.ts` (hierarchy documentation)
- `src/lib/auth/authService.ts`, new `accountActions.test.ts`
- `src/lib/profile/profileIdentity.ts`, new `profileIdentity.test.tsx`
- `src/lib/accountQueryCache.ts` and its tests
- `src/lib/lists/defaultListStore.ts` and its tests (account-reset race only)

Backend:

- `src/fiyu/supabase_user_data.py`
- `tests/test_account_deletion_and_internal_routes.py`
- This report

## Validation and browser QA

Backend: 811 tests passed, including 10 focused deletion/security tests. Ruff
passes on both changed Python files. Existing FastAPI/Starlette deprecation
warning remains unrelated. Tests use temporary SQLite databases and mocked
Supabase services; simulated cascades are not proof of deployed constraints.

Frontend: 91 test files / 1,015 tests passed on the final full-suite run.
TypeScript, ESLint, production build, and `git diff --check` passed. A concurrent
build/test run encountered Discovery timing failures; that suite passed unchanged
in isolation, and subsequent full runs without competing build work passed.
Focused tests
cover every menu link, outside pointer, Escape/focus, pathname reset/unmount,
hierarchical/direct-link Back, direct Settings logout on both layouts, retryable
logout, confirmation/password/Cancel/Escape, cleanup-only retry after deletion,
authenticated transport without a target ID, cleanup/isolation, and stale
profile/query/saved-data responses. Backend tests additionally cover spoofed
target IDs, private-note deletion, other-user preservation, storage-before-Auth
ordering, partial-failure retry, and rejected access after mocked identity removal.

Browser verification used the local app and a temporary isolated mock-account
page, removed before production build. No real account was created, modified,
logged out, or deleted. Checked 390×664, 390×844, 430×932, and 1440×900:
account controls are 44px, dialog fits without horizontal overflow, Cancel starts
focused, Escape/Cancel remove the modal and restore focus/scroll. At mobile size,
verified outside tap, menu-link closure, Escape, browser Back closure, Settings
→ Edit Profile → Settings and Settings → Profile, plus direct-loaded Edit
Profile returning to Settings. Verified recoverable logout error with the local
fixture. These are Chromium viewport checks, not physical iOS/Android testing.

Live release checklist: use only an explicitly disposable account to verify
sign-in → logout → sign-in, upload an avatar, create personal rows (including
private notes and a joint session), delete, inspect actual hosted cascades and
Storage, verify the other user/global catalog survive, reject the old identity
on protected endpoints, and confirm a newly registered same-email account is
empty. Confirm deployed migrations and remove any obsolete Premium allowlist
UUID. Never run this destructive check with a real user's account.
