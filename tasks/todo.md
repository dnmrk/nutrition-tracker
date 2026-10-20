# NutritionTracker MVP — plan

**Request:** "review @perplexity.txt"
Scope as clarified by the human: critique the guide at `perplexity.txt`, then plan an MVP built from it. The MVP covers:
- Supabase magic-link auth with protected routes;
- daily targets in settings;
- photo meal logging via `/api/analyze` (a vision model: **Groq instead of Claude**, per revision 1, see G13);
- editable AI estimates before saving;
- today's totals on the dashboard;
- a history view.

Out of scope (deferred): pantry, barcode/label scanning, charts, body weight, reminders, Stripe and the scan limits.

**Revision 1 (human):**
- Replace Anthropic with Groq: free tier, Groq's best vision model.
- Photos: don't store them (former OQ2, now decided).
- Editing or deleting a saved meal: deferred (former OQ3, now decided).

**Branch:** `feat/nutrition-mvp`   **Base:** `main` (no remote yet)

> Greenfield repo: only `perplexity.txt` plus two commits. There is no CI config, `CLAUDE.md`, `AGENTS.md`, `README` or `tasks/lessons.md` in the repo, so this plan defines the verification commands and Task 1 adds them as npm scripts.
>
> The global CLAUDE.md rule "run PHP/Composer inside `docker compose exec`" is Shopware-specific and does not apply here. This is a Node app: Node commands run on the host (Node v22.23.1, npm 10.9.8). Supabase runs in Docker through the Supabase CLI (Docker 29.4.0 is running).
>
> Precedent: there is no in-repo precedent. The shapes to follow are the `create-next-app@16.4.2` `app-tw` template and Supabase's Next.js SSR guide (`@supabase/ssr`, `proxy.ts`, `getClaims`).

---

## Guide critique (perplexity.txt)

Each row says where the guide is wrong, outdated or risky, and how this plan corrects it.

| # | Guide says | Problem | Plan does |
|---|---|---|---|
| G1 | "Next.js 14" | Outdated: the current release is Next 16.4.2. Next 16 renamed `middleware.ts` to `proxy.ts` and runs it on Node. The 16.4.2 scaffold also turns on `cacheComponents` by default, which forces every cookie or auth read into `<Suspense>`. On a fresh checkout, `tsc --noEmit` fails (`LayoutProps` not found) until `next typegen` runs. All of this was dry-run here. | Next 16.4.2, React 19.3, TypeScript ^5 (5.9.3). We don't use TypeScript 7.0.2, because Next 16's default type checker can't load TS 7 without the experimental `useTypeScriptCli`. Scaffold with `--no-cache-components`. The typecheck script is `next typegen && tsc --noEmit`. |
| G2 | "Supabase auth" (no package named) | The legacy `@supabase/auth-helpers-nextjs` is deprecated. Supabase now issues publishable keys (`sb_publishable_…`), not just the anon JWT. `getSession()` must not be trusted on the server. A PKCE `?code=` magic link breaks when the email opens in a different browser than the one that requested it (for example a mail app's in-app browser). | `@supabase/ssr@0.12.7` + `@supabase/supabase-js@2.118.0`. Env var `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `proxy.ts` and every Server Function/route call `auth.getClaims()`. The magic link uses `token_hash` → `/auth/confirm` → `verifyOtp({ type: 'email', token_hash })`, which works cross-browser. Both the "Magic Link" and "Confirm signup" email templates are changed (human step H3). |
| G3 | "RLS so users only read/write own rows" | Underspecified. Without `WITH CHECK` on INSERT/UPDATE, a user can write rows for someone else, or move their row to another `user_id`. Since 2026, new `public` tables also get **no Data API grants** by default (Supabase changelog 45329; applies to all projects from 2026-10-30). Without explicit `GRANT`s every query fails. | Explicit `revoke … from anon, authenticated` + least-privilege `grant`s. Per-command policies `to authenticated`, using `(select auth.uid()) = user_id`. INSERT has `WITH CHECK`; UPDATE has both `USING` and `WITH CHECK`. `meals` gets no UPDATE or DELETE grant, because no feature needs them. All of this was verified against a local stack with 17 pgTAP assertions. |
| G4 | `image_url` column | It never says where the image lives. A public bucket would expose meal photos (health-adjacent data). The column is also unused by any MVP screen. | **Photos are not stored.** The image goes to Groq once and is discarded, and `image_url` is dropped. **Decided by the human (revision 1).** A later version could keep photos in a private bucket `meal-photos` with storage RLS on `(storage.foldername(name))[1] = auth.uid()::text`, plus signed URLs. |
| G5 | "Force the tool call … prevents parsing bugs" | A forced or schema-shaped response can still be wrong: truncation (`finish_reason: "length"`), invalid JSON, out-of-range numbers, enum casing. Provider-side enforcement doesn't replace validation at our trust boundary. | Groq JSON mode (`response_format: { type: 'json_object' }`) with the JSON Schema (`z.toJSONSchema(AnalysisSchema)`) in the system prompt. Then, on the server: check `finish_reason === 'stop'`, `JSON.parse`, lowercase `confidence`, and `AnalysisSchema.safeParse` with real bounds. Anything else returns 502 with a friendly message. G13 explains why this isn't strict `json_schema` or tool use. |
| G6 | Tool schema `items: {name, grams, calories}` | Step 4 lets users edit per-item macros, but items carry no macros, so edited items can't re-total protein/carbs/fat. | Every item is `{name, grams, calories, protein_g, carbs_g, fat_g}`, for both model output and saved rows. |
| G7 | Stored `total_calories, protein_g, carbs_g, fat_g` next to `items` | Two sources of truth: totals drift from items as soon as an item is edited, and a client can post totals that don't match. | **Items are the only source of truth.** No total columns. `sumItems(items)` (one shared TS function, unit-tested) computes totals for review, dashboard and history. The DB `CHECK (meal_items_valid(items))` enforces item shape and bounds. |
| G8 | "Daily totals across time zones" (test only) | No design. Grouping by UTC `created_at` puts a 7 am Manila breakfast on the previous day, and Vercel servers run in UTC. | Each meal stores `eaten_on date`, the user's local calendar date at save time, computed on the server from a validated IANA `tz` cookie that a client component keeps in sync. "Today" and history group by `eaten_on`, so no tz math happens in SQL. Times render with an explicit `timeZone`. |
| G9 | "Compress to under 1 MB, convert to base64, POST" | Base64 adds 33%. Unknown body caps: Server Actions default to 1 MB; Vercel functions cap at 4.5 MB. The guide gives no server-side size or type check, and no resize (phone photos are 3–12 MB). | Client resizes the long edge to 1568 px, JPEG q0.8 (retry q0.6). It posts **multipart** `image` (binary) to the route handler, not a Server Action. One shared `MAX_IMAGE_BYTES = 1_500_000` gates the client and the server (413). Allowed types are `image/jpeg`/`png`/`webp` (415). Base64 is encoded on the server, only for the Groq call (as a `data:` URL). Groq bills a flat 2 048 tokens per image for this model, so 1568 px only keeps the upload small. |
| G10 | `SUPABASE_SERVICE_ROLE_KEY` in Vercel env | Not needed: every operation is user-scoped under RLS. Having it in the deployment only adds blast radius. | **No service-role/secret key anywhere**, local or prod. The e2e login reads the magic link from local Mailpit instead. |
| G11 | "Daily scan limit … otherwise AI calls become your largest cost" | On Groq's free tier, the constraint is quota, not money. Limits apply per Groq **organization** and are shared by every user. For `qwen/qwen3.8-27b` the docs list 30 RPM, 1K RPD, 8K TPM and 200K TPD, labelled "base limits for the Developer plan" (free-tier numbers may be lower; verify at build, H4). At about 3K tokens per analysis (2 048 image + prompt + output), that is roughly 2 analyses per minute and 65 per day **for the whole app**. One user can exhaust everyone's quota. | Paid scan limits stay out of scope, and a per-user daily cap is deferred until before sign-ups open (H8). Groq 429s map to separate "busy" and "daily limit" messages (Task 5). Human step H3: turn off "Allow new users to sign up" after creating your own account. |
| G12 | Hosted Supabase email (implicit) | The built-in mailer is rate-limited and not meant for production. | Human step H3: configure custom SMTP before inviting anyone. |
| G13 | (Revision 1) Claude Vision via Anthropic | The human has no Anthropic key and wants to stay on Groq's free tier. | The provider becomes Groq, via `groq-sdk@1.6.0` and model `qwen/qwen3.8-27b`. That is the only vision model generally available on Groq; `meta-models/muse-spark-open` is a limited preview you have to request. What this changes:<br>(1) **Preview model.** Groq says preview models "may be discontinued at short notice". The model ID lives in one constant, and a missing or decommissioned model maps to 502 with a server log.<br>(2) **Schema enforcement.** Groq lists this model for strict `json_schema`, but its docs only document JSON mode, not structured outputs, with image input. The plan uses JSON mode plus Zod. Strict `json_schema` is a one-line upgrade after the real-photo check (H7).<br>(3) **Limits.** Quota is per organization (G11). We send 1 image per request (the limit is 3), and each image costs 2 048 input tokens. Requests with an image URL can be up to 20 MB; the base64 limit isn't documented. Our ≤ 1.5 MB binary becomes about 2 MB of base64 (verify at build).<br>(4) **Data.** Groq doesn't keep inference data by default, but may log inputs and outputs for up to 30 days for reliability or abuse checks. Zero Data Retention is available to every customer (H4). Logs are stored in US GCP.<br>(5) **Gone:** Anthropic's thinking/effort settings and its `zodOutputFormat` helper. |

---

## Impact call-outs

**Data / schema:** two new tables, `public.daily_targets` and `public.meals`, plus the function `public.meal_items_valid(jsonb)`.
- `daily_targets`: `user_id` PK → `auth.users` on delete cascade; `calorie_target int 1..10000`; `protein_target_g`, `carbs_target_g`, `fat_target_g int 0..1000`.
- `meals`: `id uuid` PK (client-generated, used for idempotency); `user_id` → `auth.users` on delete cascade; `eaten_on date`; `logged_at timestamptz default now()`; `items jsonb CHECK meal_items_valid`.
- Index `meals_user_id_eaten_on_idx (user_id, eaten_on desc, logged_at desc)`.
- **Migrations:** `supabase/migrations/20261020000000_nutrition_mvp.sql`. **Apply to production before merge — human step (H2).**

**Services / registration (Next.js file conventions):**
- `proxy.ts` (root);
- route handlers `app/api/analyze/route.ts` (POST), `app/auth/confirm/route.ts` (GET) and `app/auth/signout/route.ts` (POST);
- Server Actions `app/login/actions.ts#sendMagicLink`, `app/(app)/settings/actions.ts#saveTargets` and `app/(app)/log/actions.ts#saveMeal`.

**Events / hooks:** none. No webhooks, DB triggers or cron, because nothing needs them.

**API contract — `POST /api/analyze`** (same-origin only, no other callers):
- Request: `multipart/form-data`, one field `image` (File).
- 200: `{ "items": MealItem[], "confidence": "high" | "medium" | "low" }`, where `MealItem = { name: string, grams: number, calories: number, protein_g: number, carbs_g: number, fat_g: number }`. `items` may be empty (no food found).
- Errors return `{ "error": string }` with these exact strings:

| Status | Cause | `error` text |
|---|---|---|
| 400 | Missing field or not multipart | `Choose a photo to analyze.` |
| 401 | No session | `Sign in again to analyze photos.` |
| 413 | Image > 1 500 000 bytes, `content-length` > 1 700 000, or Groq 413 | `That photo is too large. Try another one.` |
| 415 | Type not jpeg/png/webp | `Use a JPEG, PNG or WebP photo.` |
| 422 | Groq 400 other than `json_validate_failed`: unreadable image | `We couldn't read that photo. Try another one or enter the meal manually.` |
| 429 | Groq 429 with `retry-after` ≤ 60 s, or absent (per-minute limit) | `Photo analysis is busy. Wait a minute and try again.` |
| 429 | Groq 429 with `retry-after` > 60 s (daily quota) | `Today's photo analysis limit is used up. Enter the meal manually or try again tomorrow.` |
| 502 | Any other upstream error, timeout, `finish_reason` ≠ `stop`, Groq `json_validate_failed`, missing or decommissioned model, or invalid output | `Couldn't analyze the photo. Try again or enter the meal manually.` |

- `GET` gets Next's default 405.

**API contract — Server Action `saveMeal({ id: string, items: MealItem[] })`:**
- On success, or a 23505 duplicate id (retry), it calls `revalidatePath('/')` then `redirect('/')`.
- Otherwise it returns `{ error: string }`:
  - validation or 23514: `Some values are out of range. Check each item and try again.`;
  - no session: `Your session expired. Sign in again.`;
  - other errors: `Couldn't save your meal. Try again.`

**API contract — Server Action `saveTargets(prev, formData)`:** returns one of:
- `{ ok: true }`;
- `{ error: 'Couldn't save targets. Try again.' }`;
- `{ error: 'Some values are out of range.' }`.

**UI (new screens; copy is verbatim):**
- Nav (in `app/(app)/layout.tsx`): `Today`, `History`, `Settings`, `Sign out`.
- `/login`:
  - heading `Sign in`; label `Email`; button `Send sign-in link`;
  - success `Check your email for a sign-in link.`;
  - send error `Couldn't send the link. Try again in a minute.`;
  - when `?error=link`: `That sign-in link is invalid or expired. Request a new one.`
- `/` (Today):
  - heading `Today`; link `Snap meal` → `/log`;
  - kcal line `{eaten} / {target} kcal` plus `{n} kcal left` or `{n} kcal over`;
  - rows `Protein`, `Carbs`, `Fat`, each `{eaten} / {target} g`;
  - with no targets, only `{eaten} kcal` and a link `Set your daily targets` → `/settings`;
  - no meals: `No meals logged today.`
- `/log`:
  - button `Snap meal`; status `Analyzing your meal…`;
  - low-confidence banner `Rough estimate — tap any item to adjust.`;
  - disclaimer `Estimates from a photo, not medical advice. Check and edit before saving.`;
  - field labels `Food`, `Grams`, `Calories`, `Protein (g)`, `Carbs (g)`, `Fat (g)`;
  - buttons `Remove`, `Add item`, `Log meal` (`Saving…` while pending), `Retake`, `Try again`, `Enter manually`;
  - when analysis returns 0 items: `No food detected. Add items manually.`
- `/settings`:
  - heading `Daily targets`;
  - labels `Calories (kcal)`, `Protein (g)`, `Carbs (g)`, `Fat (g)`;
  - button `Save targets`; success `Targets saved.`
- `/history`:
  - heading `History`; empty `No meals in the last 30 days.`;
  - day heading such as `Mon, Oct 20` (`weekday:'short', month:'short', day:'numeric'` in the user's tz);
  - day totals `{kcal} kcal · P {p} g · C {c} g · F {f} g`;
  - each meal shows its time (`hour:'numeric', minute:'2-digit'` in the user's tz) and item names.

**Permissions / ACL:** Postgres role `authenticated` gets `select, insert, update` on `daily_targets` and `select, insert` on `meals`. `anon` gets nothing on either. Every page, Server Action and route re-checks auth with `getClaims()`, not just `proxy.ts`.

**Config / env / dependencies:**
- Env vars:
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (locally, generated by `npm run env:local` from the local stack);
  - `GROQ_API_KEY`: server only, never `NEXT_PUBLIC_`; not needed for any test.
- Deps (exact pins, verified with `npm view` on 2026-10-20):
  - from the scaffold: `next@16.4.2`, `react@19.3.0`, `react-dom@19.3.0`;
  - added runtime deps: `@supabase/ssr@0.12.7`, `@supabase/supabase-js@2.118.0`, `groq-sdk@1.6.0`, `zod@4.6.7`.
- Dev deps:
  - from the scaffold: `typescript@^5`, `eslint@^9`, `eslint-config-next@16.4.2`, `tailwindcss@^4`, `@tailwindcss/turbopack@^4`, `@types/*`;
  - added: `vitest@5.0.5`, `@playwright/test@1.64.1`, `supabase@2.121.0` (the CLI).
- No native rebuild. Playwright needs Chromium revision 1248 (`npx playwright install chromium`, one-time; this machine only caches 1234).

---

## Activation path

1. **Registration:** Next's file-system routing registers:
   - `proxy.ts` (matcher: everything except `_next/static`, `_next/image`, `favicon.ico` and image files);
   - pages under `app/(app)/` and `app/login`;
   - route handlers `app/api/analyze/route.ts`, `app/auth/confirm/route.ts` and `app/auth/signout/route.ts`.

   The Supabase schema registers by applying the migration: locally with `supabase db reset`, in prod with `supabase db push` (H2).
2. **Discovery:**
   - Unauthenticated `GET /` → `proxy.ts` → `getClaims()` is empty → 307 to `/login`.
   - On `/login`, `sendMagicLink` → `signInWithOtp` sends an email whose link is `{{ .SiteURL }}/auth/confirm?token_hash=…&type=email`.
   - `/auth/confirm` → `verifyOtp` sets the session cookies → redirect to `/`.
   - Nav links reach `/log`, `/history` and `/settings`.
3. **Invocation:**
   - On `/log`, `Snap meal` → file input (`capture="environment"`) → `compressImage` → `fetch('/api/analyze', multipart)` → `analyzeMeal()` → Groq chat completions → JSON → review form.
   - `Log meal` → `saveMeal` Server Action → `meals` insert → `redirect('/')`.
   - `/` (Server Component) reads the `tz` cookie, queries `meals` where `eaten_on = today` plus `daily_targets`, and renders `sumItems`.
   - `TimeZoneSync` (root layout) keeps the `tz` cookie current.

---

## Risks

| FC | Applies? | Covered by |
|---|---|---|
| FC-01 migration not applied where code runs | Yes: Vercel deploys from `main` without migrating | Task 2 (AC-2.5) + human step H2 |
| FC-02 manifest changes what ships | Yes: new `package.json`, `next.config.ts` | Task 1 (AC-1.3 `npm run build`), Task 10 (Vercel preview check is H5, not verified locally) |
| FC-03 destructive DDL | Migration has none | Task 2 (AC-2.4 grep) |
| FC-04 boundary input → 5xx | Yes: analyze route, both actions, DB CHECK | Task 5 (AC-5.3, 5.4), Task 6 (AC-6.2), Task 7 (AC-7.6), Task 2 (AC-2.2: string-typed number gives 23514, not a cast error) |
| FC-05 client ≠ server ≠ DB limits | Yes | Task 3 (single constants), Task 2 (same numbers in SQL), Task 6 AC-6.3, Task 7 AC-7.7 |
| FC-06 CORS / router | Same-origin only, no CORS; the only new verb is POST on `/api/analyze` | Task 5 AC-5.5 (route reachable from the running app via e2e) |
| FC-07 optimistic update | n/a: no optimistic updates; saves are pessimistic, then redirect | — |
| FC-08 retry id lost | Yes: `saveMeal` | Task 2 (AC-2.2 duplicate id → 1 row), Task 7 (AC-7.4) |
| FC-09 overlapping async | Yes: new photo while analyzing | Task 7 (AC-7.5) |
| FC-10 cancel during async loses input | Yes: Retake/new photo or navigating away mid-analysis | Task 7 (AC-7.5) |
| FC-11 derived value stale after toggle | n/a: no unit/mode toggles. Totals are derived live from items | Task 7 AC-7.3 asserts live totals after an edit |
| FC-12 shared load/action error | Yes: analyze error vs save error; settings | Task 7 (AC-7.8), Task 6 (AC-6.4) |
| FC-13 external state never re-read | Yes: auth session, tz | Task 4 (proxy refreshes session on every request; AC-4.4), Task 3/4 (`TimeZoneSync` on mount and `visibilitychange`; AC-4.5) |
| FC-14 copy not verbatim | Yes | Tasks 4, 6, 7, 8, 9 (grep ACs) |
| FC-15 shared function changed | `sumItems` is shared by `/log`, `/` and `/history` | Task 3 tests; Tasks 8/9 fixture ACs |
| FC-16 code that can't run | Yes | Every task runs `npm run typecheck` |
| FC-17 wrong totals for data shape | Yes: decimal macros, multi-meal days | Task 3 (AC-3.1), Task 8 (AC-8.1), Task 9 (AC-9.1) |
| FC-18 nested interactive | Yes | Tasks 7, 8, 9 (e2e `button button` count = 0) |
| FC-19 colour / contrast | Yes | Task 1 (AC-1.5): Tailwind palette only; hex allowed only in `app/globals.css`; text ≥ 4.5:1 |
| FC-20 320 px | Yes | Tasks 7, 8, 9 (e2e at 320×568, no horizontal scroll) |
| FC-21 states | Yes | Tasks 4, 6, 7, 8, 9 |
| FC-22 command can't run here | All commands dry-run by the Architect (see Verification commands) | — |
| FC-23 verification hit a real DB | Yes | Task 4 (AC-4.6: e2e global setup refuses a non-`127.0.0.1` Supabase URL) |
| FC-24 device/prod-only behaviour | Yes | Hand-off "not verified" list: real phone camera capture; HEIC from non-Safari browsers; real Groq estimate quality; JSON mode with a real image (H7); the real free-tier quota; prod email delivery/SMTP; Vercel deploy |
| FC-25 test never seen failing | Yes | Every test task: QA stashes the implementation, sees RED, restores, sees GREEN |
| FC-26 test doesn't exercise the path | Yes | Task 5 tests go through the real SDK with an injected `fetch`, not a mocked `analyzeMeal`. Task 7's race test holds the first `/api/analyze` request in flight before the second pick |
| FC-27 time/locale flake | Yes | Task 3 (frozen `now`), Task 4 (Playwright `timezoneId: 'Asia/Manila'`; expected dates computed in-test) |
| FC-28 mocks hide constraints | Yes | Task 2: pgTAP against a freshly reset local Postgres |
| FC-29–32 Shopware | n/a: not a Shopware project | — |

Provider risks outside the checklist (revision 1):
- **R-1 Preview-model churn.** `qwen/qwen3.8-27b` can be withdrawn at short notice. Covered by Task 5 AC-5.7: the ID appears in one place and a 404 maps to 502. The human watches Groq's deprecations page.
- **R-2 Org-wide free-tier quota.** Task 5 AC-5.4 covers clear busy and daily-limit messages, with `Enter manually` as a fallback (Task 7). The per-user cap is deferred until before sign-ups open (H8).
- **R-3 Data retention.** Meal photos go to Groq (US). Step H4 turns on Zero Data Retention. Photos are never stored by the app (G4).

---

## Verification commands

Everything runs on the **host** in `/Users/dnmrk/Sites/nutrition-tracker`. There is no container for Node. Supabase runs in Docker through the CLI.

| Check | Command | Dry-run result (Architect, 2026-10-20) |
|---|---|---|
| Lint | `npm run lint` (→ `eslint`) | exit 0 on the 16.4.2 scaffold |
| Types | `npm run typecheck` (→ `next typegen && tsc --noEmit`) | exit 0. Plain `tsc --noEmit` on a fresh checkout exits 2 (`LayoutProps`), which is why `typegen` runs first |
| Unit | `npm test` (→ `vitest run`) | vitest 5.0.5 (engines `^22.12`; host is 22.23.1 ✓) |
| Build | `npm run build` (→ `next build`) | exit 0 on the scaffold (needs network for `next/font/google`) |
| DB start | `npm run db:start` (→ `supabase start -x realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta`) | OK. First run pulls images (~5 min). Ports 54321/54322/54324 free |
| DB reset | `npx supabase db reset` | Migration applied cleanly in the dry-run |
| DB tests | `npm run db:test` (→ `supabase test db`) | 17/17 pgTAP pass with the exact SQL in Task 2 |
| Local env | `npm run env:local` | Prints `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` correctly |
| E2E browsers | `npx playwright install chromium` (one-time) | Needed: 1.64.1 wants revision 1248; only 1234 is cached |
| E2E | `npm run e2e` (→ `playwright test`). Needs `db:start` running and `.env.local` present | Magic link → Mailpit API (`/api/v1/search?query=to:<email>`, `/api/v1/message/<ID>`) → `verify` with `token_hash` → PostgREST insert all verified over HTTP |

Full local gate, in order:

```
npm run db:start && npx supabase db reset && npm run db:test
npm run env:local
npm run lint && npm run typecheck && npm test && npm run build
npm run e2e
```

---

## Tasks

### Task 1: Scaffold Next.js 16 app and tooling  `[mechanical]`

**Files:** create everything from the scaffold at the repo root. Then:
- modify `package.json`, `.gitignore` and `app/layout.tsx`;
- delete the scaffold's `app/page.tsx` (Task 8 recreates the route as `app/(app)/page.tsx`);
- create `vitest.config.ts`, `.env.example` and `README.md`.

**Interfaces:** produces the npm scripts named in Verification commands, and the `@/*` path alias pointing at the repo root.

**Steps:**
- [ ] `create-next-app` refuses a non-empty directory (`perplexity.txt`), so scaffold in the scratchpad: `npx create-next-app@16.4.2 <scratchpad>/nt-scaffold --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --skip-install --disable-git --no-react-compiler --no-agents-md --no-cache-components --yes`. Copy every file (including dotfiles) into the repo root, without overwriting `perplexity.txt`, `tasks/` or `.orchestrate/`.
- [ ] `package.json`: set `"name": "nutrition-tracker"`. Add scripts:
  - `"typecheck": "next typegen && tsc --noEmit"`
  - `"test": "vitest run"`
  - `"e2e": "playwright test"`
  - `"db:start": "supabase start -x realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta"`
  - `"db:test": "supabase test db"`
  - `"env:local": "supabase status -o env --override-name api.url=NEXT_PUBLIC_SUPABASE_URL --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | grep NEXT_PUBLIC > .env.local"`
- [ ] `npm install`. Then `npm install --save-exact @supabase/ssr@0.12.7 @supabase/supabase-js@2.118.0 groq-sdk@1.6.0 zod@4.6.7`, and `npm install --save-dev --save-exact vitest@5.0.5 @playwright/test@1.64.1 supabase@2.121.0`.
- [ ] `.gitignore`: append `!.env.example`, `/test-results/` and `/playwright-report/`. The scaffold's `.env*` would otherwise ignore `.env.example`.
- [ ] `.env.example` contains exactly three keys with empty values: `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` and `GROQ_API_KEY=`, plus the comment `# Never add a Supabase service-role/secret key: the app does not need one.`
- [ ] `vitest.config.ts` uses `defineConfig` from `vitest/config`:
  - `test: { environment: 'node', include: ['**/*.test.ts'], exclude: ['node_modules/**', 'e2e/**', '.next/**'] }`;
  - `resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } }`.
- [ ] `app/layout.tsx`: set metadata title `NutritionTracker`, description `Photo-based meal and macro tracker`. Keep the scaffold's fonts.
- [ ] Delete `app/page.tsx` and `public/*.svg` from the scaffold.
- [ ] `README.md`: replace with a "Local development" section listing the full local gate (from Verification commands) and `npx playwright install chromium`.

**Acceptance criteria:**
- `AC-1.1` Lint and types pass on a clean tree. **Verify:** `rm -rf .next && npm run lint && npm run typecheck` → exit 0.
- `AC-1.2` Exact pins are recorded. **Inspect:** `package.json` has `"next": "16.4.2"`, `"@supabase/ssr": "0.12.7"`, `"groq-sdk": "1.6.0"`, `"zod": "4.6.7"` and `"vitest": "5.0.5"`, and no `typescript` 7.x.
- `AC-1.3` Production build succeeds (FC-02). **Verify:** `npm run build` → exit 0.
- `AC-1.4` No secrets or env files are committed. **Verify:** `git status --porcelain | grep -E '\.env(\.local)?$'` → no output, and `git check-ignore .env.example` → exit 1 (not ignored).
- `AC-1.5` There is no cache-components mode and no stray hex colours (FC-19). **Verify:** `grep -n cacheComponents next.config.ts` → no output.

### Task 2: Supabase local stack, migration, RLS and pgTAP tests  `[mechanical]`

**Files:**
- create `supabase/` via `npx supabase init` (config `project_id = "nutrition-tracker"`);
- create `supabase/migrations/20261020000000_nutrition_mvp.sql`, `supabase/templates/magic_link.html` and `supabase/tests/rls_and_constraints.test.sql`;
- modify `supabase/config.toml`.

**Interfaces:** produces the tables, columns and limits used by Tasks 3–9. The `meals` PK is client-supplied; a duplicate insert returns PostgREST code `23505` (HTTP 409). A bad `items` value returns `23514` (HTTP 400).

**Steps:**
- [ ] `npx supabase init`. In `supabase/config.toml`:
  - keep `site_url = "http://127.0.0.1:3000"`;
  - set `[auth.rate_limit] sign_in_sign_ups = 300` and `token_verifications = 300` (local e2e only);
  - append the block below.

  ```toml
  [auth.email.template.magic_link]
  subject = "Your NutritionTracker sign-in link"
  content_path = "./supabase/templates/magic_link.html"

  [auth.email.template.confirmation]
  subject = "Your NutritionTracker sign-in link"
  content_path = "./supabase/templates/magic_link.html"
  ```
- [ ] Create `supabase/templates/magic_link.html`:

  ```html
  <h2>Sign in to NutritionTracker</h2>
  <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
  ```
- [ ] Create the migration with exactly this SQL (verified on a local stack):

```sql
-- Validates one meal's items array; items are the source of truth for meal totals.
-- CASE forces evaluation order so casts never see non-numbers (string -> 23514, not 22P02).
create function public.meal_items_valid(items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(items) is distinct from 'array' then false
    when jsonb_array_length(items) not between 1 and 30 then false
    else not exists (
      select 1
      from jsonb_array_elements(items) as i(item)
      where case
        when jsonb_typeof(item) <> 'object' then true
        when jsonb_typeof(item -> 'name') is distinct from 'string' then true
        when char_length(btrim(item ->> 'name')) not between 1 and 80 then true
        else exists (
          select 1
          from (values ('grams', 5000), ('calories', 10000), ('protein_g', 1000), ('carbs_g', 1000), ('fat_g', 1000)) as f(k, max_v)
          where case
            when jsonb_typeof(item -> f.k) is distinct from 'number' then true
            else (item ->> f.k)::numeric not between 0 and f.max_v
          end
        )
      end
    )
  end
$$;

create table public.daily_targets (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  calorie_target integer not null check (calorie_target between 1 and 10000),
  protein_target_g integer not null check (protein_target_g between 0 and 1000),
  carbs_target_g integer not null check (carbs_target_g between 0 and 1000),
  fat_target_g integer not null check (fat_target_g between 0 and 1000)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_on date not null,
  logged_at timestamptz not null default now(),
  items jsonb not null check (public.meal_items_valid(items))
);

create index meals_user_id_eaten_on_idx on public.meals (user_id, eaten_on desc, logged_at desc);

alter table public.daily_targets enable row level security;
alter table public.meals enable row level security;

-- Supabase no longer auto-grants new public tables (changelog 45329); grant least privilege explicitly.
revoke all on public.daily_targets, public.meals from anon, authenticated;
grant select, insert, update on public.daily_targets to authenticated;
grant select, insert on public.meals to authenticated;

create policy daily_targets_select_own on public.daily_targets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy daily_targets_insert_own on public.daily_targets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy daily_targets_update_own on public.daily_targets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meals_select_own on public.meals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy meals_insert_own on public.meals
  for insert to authenticated with check ((select auth.uid()) = user_id);
```

- [ ] Create `supabase/tests/rls_and_constraints.test.sql` with exactly this content (17 assertions; passed in the dry-run):

```sql
begin;
select plan(17);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$ insert into public.meals (id, eaten_on, items) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-20', '[{"name":"Rice","grams":150,"calories":195,"protein_g":4,"carbs_g":42,"fat_g":0.4}]') $$, 'A inserts own meal');
select lives_ok($$ insert into public.meals (id, eaten_on, items) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-20', '[{"name":"Rice","grams":150,"calories":195,"protein_g":4,"carbs_g":42,"fat_g":0.4}]') on conflict (id) do nothing $$, 'retry with same id is a no-op');
select is((select count(*) from public.meals), 1::bigint, 'exactly one row after retry');
select throws_ok($$ insert into public.meals (eaten_on, items, user_id) values ('2026-10-20', '[{"name":"x","grams":1,"calories":1,"protein_g":0,"carbs_g":0,"fat_g":0}]', '22222222-2222-2222-2222-222222222222') $$, '42501', null, 'A cannot insert a meal for B (WITH CHECK)');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '[]') $$, '23514', null, 'empty items rejected');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '[{"name":"x","grams":"12","calories":1,"protein_g":0,"carbs_g":0,"fat_g":0}]') $$, '23514', null, 'string number rejected without cast error');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '[{"name":"x","grams":1,"calories":10001,"protein_g":0,"carbs_g":0,"fat_g":0}]') $$, '23514', null, 'calories above 10000 rejected');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '[{"name":"x","grams":1,"calories":1,"protein_g":0,"carbs_g":0}]') $$, '23514', null, 'missing fat_g rejected');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '{"name":"x"}') $$, '23514', null, 'non-array rejected');
select lives_ok($$ insert into public.daily_targets (calorie_target, protein_target_g, carbs_target_g, fat_target_g) values (10000, 1000, 0, 0) on conflict (user_id) do update set calorie_target = excluded.calorie_target $$, 'A upserts targets at boundary');
select throws_ok($$ insert into public.daily_targets (calorie_target, protein_target_g, carbs_target_g, fat_target_g) values (0, 0, 0, 0) on conflict (user_id) do update set calorie_target = excluded.calorie_target $$, '23514', null, 'calorie_target 0 rejected');
select throws_ok($$ delete from public.meals $$, '42501', null, 'no delete privilege');
select throws_ok($$ update public.daily_targets set user_id = '22222222-2222-2222-2222-222222222222' $$, '42501', null, 'A cannot hand targets row to B (UPDATE WITH CHECK)');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*) from public.meals), 0::bigint, 'B cannot see A meals');
select is((select count(*) from public.daily_targets), 0::bigint, 'B cannot see A targets');
update public.daily_targets set calorie_target = 5;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select calorie_target from public.daily_targets), 10000, 'B update did not touch A targets (USING)');

reset role;
set local role anon;
select throws_ok($$ select * from public.meals $$, '42501', null, 'anon has no table privilege');

select * from finish();
rollback;
```

**Acceptance criteria:**
- `AC-2.1` The migration applies on a fresh DB. **Verify:** `npm run db:start && npx supabase db reset` → exit 0, and the output includes `Applying migration 20261020000000_nutrition_mvp.sql`.
- `AC-2.2` RLS isolation, WITH CHECK on insert and update, retry idempotency (FC-08), and DB validation boundaries (FC-04/FC-28) hold against real Postgres. **Verify:** `npm run db:test` → `Tests=17`, `Result: PASS`.
- `AC-2.3` An anonymous REST read is refused. **Verify:** `curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:54321/rest/v1/meals?select=id" -H "apikey: $(grep PUBLISHABLE .env.local | cut -d= -f2 | tr -d '"')"` → `401` (body code `42501`). Run `npm run env:local` first.
- `AC-2.4` No destructive DDL (FC-03). **Verify:** `grep -nE 'DROP|TRUNCATE|ALTER .* TYPE|CASCADE' supabase/migrations/*.sql` → no output (`on delete cascade` is lowercase FK syntax and is not a hit).
- `AC-2.5` The production apply is listed as a human step. **Inspect:** this plan's H2 exists. QA never runs it.

### Task 3: Domain library: limits, schemas, totals, dates  `[judgment]`

**Files:** create `lib/nutrition.ts`, `lib/nutrition.test.ts`, `lib/dates.ts` and `lib/dates.test.ts`.

**Interfaces produced:**
- `lib/nutrition.ts`:
  - `MAX_IMAGE_BYTES = 1_500_000`; `IMAGE_TYPES = ['image/jpeg','image/png','image/webp'] as const`; `MAX_ITEMS = 30`; `NAME_MAX = 80`;
  - `ITEM_MAX = { grams: 5000, calories: 10000, protein_g: 1000, carbs_g: 1000, fat_g: 1000 } as const`;
  - `TARGET_LIMITS = { calorie_target: [1, 10000], protein_target_g: [0, 1000], carbs_target_g: [0, 1000], fat_target_g: [0, 1000] } as const`.
- Schemas (zod 4):
  - `MealItemSchema`: `name: z.string().min(1).max(NAME_MAX).refine(s => s.trim().length > 0)`; each numeric key is `z.number().min(0).max(ITEM_MAX[k])`;
  - `AnalysisSchema = z.object({ items: z.array(MealItemSchema).max(MAX_ITEMS), confidence: z.enum(['high','medium','low']) })`;
  - `SaveMealSchema = z.object({ id: z.uuid(), items: z.array(MealItemSchema).min(1).max(MAX_ITEMS) })`;
  - `TargetsSchema`: each key is `z.coerce.number().int().min(lo).max(hi)`.
  - No `.transform`/`.preprocess` in `AnalysisSchema`, because `z.toJSONSchema` must accept it.
  - `type MealItem = z.infer<typeof MealItemSchema>`.
- Functions:
  - `sumItems(items: MealItem[]): { calories: number; protein_g: number; carbs_g: number; fat_g: number }`, raw sums;
  - `fmt(n: number): string`, which is `String(Math.round(n))`;
  - `groupByDay<T extends { eaten_on: string; items: MealItem[] }>(meals: T[]): { date: string; meals: T[]; totals: ReturnType<typeof sumItems> }[]`, which keeps input order.
- `lib/dates.ts`:
  - `resolveTimeZone(raw: string | undefined): string` returns `raw` if it is ≤ 64 chars and `new Intl.DateTimeFormat('en-US', { timeZone: raw })` doesn't throw; otherwise `'UTC'`;
  - `localDate(timeZone: string, now = new Date()): string` returns `YYYY-MM-DD` via `Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })`;
  - `addDays(date: string, n: number): string` does UTC arithmetic on `YYYY-MM-DD`;
  - `TZ_COOKIE = 'tz'`.

**Steps:**
- [ ] Write the tests first (RED), then the implementation.
- [ ] `nutrition.test.ts` asserts:
  - `sumItems` on `[{calories:72.4, protein_g:6.3, carbs_g:0.4, fat_g:4.8, …}, {calories:195, protein_g:4, carbs_g:42, fat_g:0.4, …}]` → `{calories:267.4, protein_g:10.3, carbs_g:42.4, fat_g:5.2}` (`toBeCloseTo`);
  - `sumItems([])` → all 0;
  - `fmt(0.5)` → `'1'`;
  - `MealItemSchema` accepts boundary values (grams 5000, calories 10000, name of 80 chars);
  - it rejects 5000.01 grams, a negative value, a whitespace-only name, an 81-char name, `null` grams and a missing `fat_g`;
  - `SaveMealSchema` rejects `[]` and 31 items;
  - `TargetsSchema` accepts `'10000'` and rejects `'0'` calories, `'1001'` protein and `'12.5'`;
  - `z.toJSONSchema(AnalysisSchema)` does not throw;
  - `groupByDay` on 3 meals across 2 dates gives 2 groups with correct totals.
- [ ] `dates.test.ts` asserts:
  - `localDate('Asia/Manila', new Date('2026-10-19T23:30:00Z'))` → `'2026-10-20'`;
  - `localDate('America/Los_Angeles', same)` → `'2026-10-19'`;
  - `resolveTimeZone('Not/AZone')` → `'UTC'`;
  - `resolveTimeZone(undefined)` → `'UTC'`;
  - `resolveTimeZone('Europe/Berlin')` → `'Europe/Berlin'`;
  - `addDays('2026-03-01', -1)` → `'2026-02-28'`;
  - `addDays('2026-10-20', -29)` → `'2026-09-21'`.

**Acceptance criteria:**
- `AC-3.1` Totals are correct for decimal, multi-item and empty data (FC-17). **Verify:** `npx vitest run lib/nutrition.test.ts` → all pass. QA sees it fail with the implementation stashed (FC-25).
- `AC-3.2` "Today" is the user's local date across a UTC day boundary (FC-27, frozen `now`). **Verify:** `npx vitest run lib/dates.test.ts` → all pass.
- `AC-3.3` The limits match the SQL (FC-05). **Inspect:** the numbers in `ITEM_MAX`, `TARGET_LIMITS`, `MAX_ITEMS` and `NAME_MAX` equal those in `supabase/migrations/20261020000000_nutrition_mvp.sql`.
- `AC-3.4` **Verify:** `npm run typecheck` → exit 0.

### Task 4: Auth: Supabase clients, proxy, login, confirm, sign-out, app shell, tz sync, e2e harness  `[judgment]`

**Files:**
- create `lib/supabase/server.ts`, `proxy.ts`, `components/time-zone-sync.tsx`;
- create `app/login/page.tsx`, `app/login/login-form.tsx`, `app/login/actions.ts`;
- create `app/auth/confirm/route.ts`, `app/auth/signout/route.ts`, `app/(app)/layout.tsx`;
- create `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/helpers/auth.ts`, `e2e/auth.spec.ts`;
- modify `app/layout.tsx`.

**Interfaces produced:**
- `createClient(): Promise<SupabaseClient>`: the server client, built per the current `@supabase/ssr` 0.12 Next.js guide (verify at build). It uses `createServerClient(url, publishableKey, { cookies: { getAll, setAll } })` with `cookies()` from `next/headers`, and `setAll` is wrapped in try/catch for Server Components.
- `requireUser(): Promise<{ supabase: SupabaseClient; userId: string }>` calls `supabase.auth.getClaims()` and, if there are no claims, `redirect('/login')`.
- `getToday(): Promise<{ timeZone: string; date: string }>` reads the `tz` cookie via `resolveTimeZone` and `localDate`.

**Steps:**
- [ ] `proxy.ts`:
  - `export async function proxy(request: NextRequest)` builds `createServerClient` with request/response cookie `getAll`/`setAll` (including applying the `headers` argument `setAll` receives to the response, per the 0.12 guide) and awaits `supabase.auth.getClaims()`;
  - no claims and the path is not `/login`, not `/auth/*` and not `/api/*` → redirect to `/login`. API routes return their own 401;
  - claims present and path `/login` → redirect to `/`;
  - `config.matcher = ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']`.
- [ ] `app/login/actions.ts`: `sendMagicLink(prev, formData)` validates the email with `z.email().max(254)`, then calls `signInWithOtp({ email, options: { shouldCreateUser: true } })` and returns `{ ok: true } | { error }`. Login form copy is verbatim from Impact call-outs. Use `useActionState`. The button is disabled with text unchanged while pending. Status messages use `role="status"`, errors `role="alert"`.
- [ ] `app/auth/confirm/route.ts` GET:
  - reads `token_hash` and `type`;
  - when `type === 'email'`, calls `verifyOtp({ type: 'email', token_hash })` and on success redirects to `/`;
  - anything else redirects to `/login?error=link`;
  - accepts no `next` parameter (no open redirect).
- [ ] `app/auth/signout/route.ts` POST: `signOut()` → 303 to `/login`. The nav uses `<form action="/auth/signout" method="post"><button>Sign out</button></form>`.
- [ ] `app/(app)/layout.tsx`: `await requireUser()`, then a header nav with links `Today` (`/`), `History`, `Settings` and the sign-out form. Use `<nav aria-label="Main">`.
- [ ] `components/time-zone-sync.tsx` (`'use client'`):
  - on mount and on `visibilitychange` → visible, compares `Intl.DateTimeFormat().resolvedOptions().timeZone` with the `tz` cookie;
  - if they differ, sets `tz=<encoded>; path=/; max-age=31536000; samesite=lax` and calls `router.refresh()`;
  - renders `null`; it is rendered in the root `app/layout.tsx`.
- [ ] `playwright.config.ts`:
  - `testDir: 'e2e'`, `globalSetup: './e2e/global-setup.ts'`;
  - `use: { baseURL: 'http://127.0.0.1:3000', timezoneId: 'Asia/Manila' }`;
  - `webServer: { command: 'npm run dev -- --hostname 127.0.0.1 --port 3000', url: 'http://127.0.0.1:3000/login', reuseExistingServer: true }`;
  - projects: `chromium` only.
- [ ] `e2e/global-setup.ts`: `process.loadEnvFile('.env.local')`. Throw unless `NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321'` (FC-23). Throw unless `fetch('http://127.0.0.1:54324/api/v1/messages')` is ok.
- [ ] `e2e/helpers/auth.ts`: `signIn(page, email = \`e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test\`)`:
  - fills `/login` and submits;
  - polls `GET http://127.0.0.1:54324/api/v1/search?query=to:<email>` (≤ 10 s) for `messages[0].ID`;
  - fetches `/api/v1/message/<ID>` and extracts the first `href` from `.HTML` (HTML-unescape `&amp;`);
  - `page.goto(href)`, waits for URL `/`, and returns the email.
- [ ] `e2e/auth.spec.ts` tests:
  - (a) unauthenticated `/`, `/log`, `/history` and `/settings` each end at `/login`;
  - (b) the full magic-link sign-in lands on `/` with heading `Today`;
  - (c) `/auth/confirm?token_hash=bogus&type=email` → `/login?error=link` showing the invalid-link copy;
  - (d) after `Sign out`, `/` redirects to `/login`;
  - (e) an authenticated visit to `/login` redirects to `/`;
  - (f) the `tz` cookie equals `Asia/Manila` after the first load.

**Acceptance criteria:**
- `AC-4.1` Protected routes redirect anonymous users. **Verify:** `npx playwright test e2e/auth.spec.ts -g "redirect"` → pass.
- `AC-4.2` Magic-link sign-in works end-to-end through `token_hash`, and bad links show `That sign-in link is invalid or expired. Request a new one.` **Verify:** `npx playwright test e2e/auth.spec.ts` → all pass.
- `AC-4.3` Login states: the button is disabled while pending, success is `role=status`, error is `role=alert`, and the input has its visible label `Email` (FC-21). **Verify:** included in `e2e/auth.spec.ts` via `getByLabel('Email')` and `getByRole('status')`.
- `AC-4.4` Auth is checked server-side in every protected entry point, not only in the proxy (FC-13; Next 16 guidance). **Inspect:** `grep -rn "getClaims\|requireUser" app proxy.ts` shows a hit in `proxy.ts`, `app/(app)/layout.tsx`, every `actions.ts` except login, and `app/api/analyze/route.ts`.
- `AC-4.5` The tz cookie is set and refreshed. **Verify:** auth spec (f).
- `AC-4.6` E2E refuses a non-local Supabase (FC-23). **Verify:** `NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co npx playwright test e2e/auth.spec.ts` → fails in global setup.
- `AC-4.7` No service-role or secret key is used. **Verify:** `grep -rniE "service_role|SERVICE_ROLE|SECRET_KEY|sb_secret" --include=*.ts --include=*.tsx . --exclude-dir=node_modules` → no output.
- `AC-4.8` **Verify:** `npm run lint && npm run typecheck` → exit 0.

### Task 5: `/api/analyze` with Groq vision (JSON mode + server validation)  `[judgment]`

**Files:** create `lib/analyze.ts`, `lib/analyze.test.ts`, `app/api/analyze/route.ts` and `app/api/analyze/route.test.ts`.

**Interfaces:**
- Consumes `AnalysisSchema`, `MAX_IMAGE_BYTES` and `IMAGE_TYPES` (Task 3), and `createClient` (Task 4).
- Produces:
  - `ANALYZE_MODEL = 'qwen/qwen3.8-27b'`, a Groq **preview** model. This constant is the only place the ID appears;
  - `getGroq(): Groq`, which returns `new Groq({ timeout: 30_000, maxRetries: 0 })` and reads `GROQ_API_KEY`. Retries are off so the SDK doesn't sit out a daily-quota `retry-after`; the user has `Try again`;
  - `analyzeMeal(client: Groq, image: { data: string; mediaType: (typeof IMAGE_TYPES)[number] }): Promise<{ ok: true; data: z.infer<typeof AnalysisSchema> } | { ok: false; status: 413 | 422 | 429 | 502; error: string }>`.

**Steps:**
- [ ] `analyzeMeal` calls `client.chat.completions.create` with:
  - `model: ANALYZE_MODEL`, `temperature: 0.2`, `max_completion_tokens: 2048`;
  - `response_format: { type: 'json_object' }`;
  - `messages`: a system message whose content is the system prompt below + `'\n\nRespond with only a JSON object that matches this JSON Schema:\n' + JSON.stringify(z.toJSONSchema(AnalysisSchema))`, then a user message whose content is `[{ type: 'text', text: 'Estimate the food items in this photo.' }, { type: 'image_url', image_url: { url: `data:${mediaType};base64,${data}` } }]`.

  System prompt (exact text):

  > You estimate nutrition from a single meal photo. List each distinct food item you can see with an estimated portion in grams and its calories, protein, carbs and fat for that portion. Estimate portions from visual cues such as plate size, utensils and packaging. Always return your best estimate. Use confidence "low" when the image is ambiguous, blurry, partly hidden, or not clearly food; "medium" when portions are uncertain; "high" only when items and portions are clear. If the photo contains no food, return an empty items array with confidence "low".

  Architect's call: use JSON mode, not strict `json_schema` and not tool use. Groq documents JSON mode with image input for this model, but not structured outputs with images. The upgrade path, once H7 confirms a real image call works, is `response_format: { type: 'json_schema', json_schema: { name: 'meal_analysis', strict: true, schema } }`. Strict mode requires every property in `required` and `additionalProperties: false`. That upgrade is not part of the MVP.
- [ ] Server-side validation (unchanged in intent):
  - `choices[0].finish_reason !== 'stop'` → 502;
  - `message.content` null or empty → 502;
  - `JSON.parse` (throw → 502);
  - if `confidence` is a string, lowercase it;
  - `AnalysisSchema.safeParse` (fail → 502).
- [ ] Error mapping. groq-sdk uses Stainless-style error classes; check the names at build: `Groq.RateLimitError`, `Groq.BadRequestError`, `Groq.NotFoundError`, `Groq.APIError`.
  - `RateLimitError`:
    - `Number(err.headers?.get('retry-after')) > 60` → 429 with the daily-quota copy;
    - otherwise → 429 with the busy copy.
  - `APIError` with `status === 413` → 413 with the too-large copy.
  - `BadRequestError` whose error body code is `json_validate_failed` → 502. Check the body path at build; it is expected at `err.error?.error?.code`.
  - Any other `BadRequestError` → 422.
  - `NotFoundError`, or an error code `model_not_found`/`model_decommissioned` → 502, plus `console.error('groq model unavailable', ANALYZE_MODEL)`.
  - Anything else (missing key, timeout, connection) → 502.
  - Never log image data.
- [ ] `route.ts`: `export const maxDuration = 60`. `POST(request: Request)`:
  1. `getClaims()` → 401;
  2. `content-length` > 1_700_000 → 413;
  3. `await request.formData()` inside try (throw → 400);
  4. `image` not a `File` → 400;
  5. type not in `IMAGE_TYPES` → 415;
  6. `size === 0` → 400, `size > MAX_IMAGE_BYTES` → 413;
  7. `Buffer.from(await file.arrayBuffer()).toString('base64')` → `analyzeMeal(getGroq(), …)`;
  8. return `{ error }` or the data, with the status from `analyzeMeal`.

  The copy is verbatim from Impact call-outs.
- [ ] `lib/analyze.test.ts` uses a **real** groq-sdk client with an injected fetch: `new Groq({ apiKey: 'test', maxRetries: 0, fetch: fakeFetch })`. Check at build that 1.6.0 accepts `fetch`; if not, use `vi.stubGlobal('fetch', fakeFetch)`. `fakeFetch` records the request. Its default response is `{ id: 'chatcmpl-test', object: 'chat.completion', created: 0, model: 'qwen/qwen3.8-27b', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(payload) }, finish_reason: 'stop', logprobs: null }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }`. Cases:
  - valid payload → ok;
  - `"confidence":"Low"` → ok with `'low'`;
  - calories 20000 → 502;
  - non-JSON content → 502;
  - `finish_reason: 'length'` → 502;
  - `content: null` → 502;
  - HTTP 429 with `retry-after: 7` → 429 with the busy copy;
  - HTTP 429 with `retry-after: 3600` → 429 with the daily copy;
  - HTTP 413 → 413;
  - HTTP 400 with body `{"error":{"code":"json_validate_failed","message":"x"}}` → 502;
  - other HTTP 400 → 422;
  - HTTP 404 → 502;
  - HTTP 500 → 502.

  The recorded body must have `model === 'qwen/qwen3.8-27b'`, `response_format.type === 'json_object'`, a system message containing `"confidence"`, exactly 2 messages, and one `image_url` part whose `url` starts with `data:image/jpeg;base64,`.
- [ ] `route.test.ts` uses `vi.mock('@/lib/supabase/server')` (claims present or absent) and `vi.mock('@/lib/analyze', …)`, keeping the real constants and stubbing `getGroq`/`analyzeMeal`. Cases:
  - 401 without claims;
  - 400 for a JSON body;
  - 400 when the field is missing;
  - 415 for `text/plain`;
  - 413 for a 1_500_001-byte File;
  - 200 passthrough for a valid jpeg;
  - 429 passthrough of `analyzeMeal`'s status and copy.

**Acceptance criteria:**
- `AC-5.1` The model ID and request shape are pinned: one image as a data URL, JSON mode, schema in the system prompt. **Verify:** `npx vitest run lib/analyze.test.ts` → pass (asserts the recorded request).
- `AC-5.2` Model output is validated on the server: out-of-range, malformed, truncated and `json_validate_failed` output each give 502, never a 500 or an unvalidated passthrough. **Verify:** same test file.
- `AC-5.3` Boundary inputs return 4xx, not 5xx (FC-04): missing field, wrong type, empty file, oversize file, no session. **Verify:** `npx vitest run app/api/analyze/route.test.ts` → pass.
- `AC-5.4` Quota and size failures give distinct, useful messages: busy, daily limit, too large (R-2). **Verify:** `npx vitest run lib/analyze.test.ts -t "429|413"` → pass.
- `AC-5.5` No Groq network call or real key in tests. **Verify:** `env -u GROQ_API_KEY npm test` → pass.
- `AC-5.6` The key never reaches the client. **Verify:** `npm run build && grep -rl "GROQ_API_KEY\|api.groq.com" .next/static` → no output, and `grep -rn "NEXT_PUBLIC_GROQ" --include=*.ts --include=*.tsx . --exclude-dir=node_modules` → no output.
- `AC-5.7` Preview-model churn is contained (R-1). **Verify:** `grep -rln "qwen/qwen3.8-27b" app lib` → only `lib/analyze.ts` and `lib/analyze.test.ts`; the HTTP 404 case maps to 502.
- `AC-5.8` Tests were seen failing. **Verify (QA):** `git stash` `lib/analyze.ts` → tests fail; restore → pass (FC-25).

### Task 6: Settings: daily targets  `[judgment]`

**Files:** create `app/(app)/settings/page.tsx`, `app/(app)/settings/targets-form.tsx`, `app/(app)/settings/actions.ts` and `e2e/settings.spec.ts`.

**Interfaces:**
- Consumes `requireUser` and `TargetsSchema`/`TARGET_LIMITS`.
- Produces `saveTargets(prev, formData): Promise<{ ok: true } | { error: string }>`.

**Steps:**
- [ ] The page loads `daily_targets` with `.select('calorie_target, protein_target_g, carbs_target_g, fat_target_g').maybeSingle()` and prefills the form. When there is no row, the fields are empty.
- [ ] Form fields:
  - four `<input type="number" inputMode="numeric" step="1" required>`, each with `min`/`max` taken from `TARGET_LIMITS`;
  - visible `<label>`s verbatim;
  - submit `Save targets`, disabled while pending.
  - Success shows `Targets saved.` (`role="status"`); errors use `role="alert"`.
  - The success or error message clears on the next submit.
- [ ] Action:
  1. `requireUser`;
  2. `TargetsSchema.safeParse(Object.fromEntries(formData))` (fail → `Some values are out of range.`);
  3. `supabase.from('daily_targets').upsert({ user_id: userId, ...data })`; error → `Couldn't save targets. Try again.`;
  4. `revalidatePath('/')`.
- [ ] `e2e/settings.spec.ts`:
  - sign in; save 2000/150/200/70; reload; the values persist;
  - save again (idempotent upsert); still one row, same values;
  - bypass client validation via `page.evaluate` removing `min`/`max`, submit `0` calories → the alert shows `Some values are out of range.`, not a crash.

**Acceptance criteria:**
- `AC-6.1` A user sets targets, and they persist and prefill. **Verify:** `npx playwright test e2e/settings.spec.ts` → pass.
- `AC-6.2` Server validation boundary: out-of-range values posted around the client give a 4xx-style inline error, never a 500 (FC-04). **Verify:** same spec.
- `AC-6.3` Client `min`/`max` equal the server/DB limits (FC-05). **Inspect:** `targets-form.tsx` reads `TARGET_LIMITS`, with no literal numbers.
- `AC-6.4` States: pending disables the button; success (`role=status`) and error (`role=alert`) are separate and don't survive the next submit (FC-12/21). **Verify:** same spec.
- `AC-6.5` Retry/idempotency: a double submit leaves one row. **Verify:** `npm run db:test` covers the upsert path; the spec checks values after two saves.

### Task 7: Log meal: capture, compress, analyze, review/edit, save  `[judgment]`

**Files:**
- create `lib/compress-image.ts`, `app/(app)/log/page.tsx`, `app/(app)/log/meal-logger.tsx` (`'use client'`), `app/(app)/log/actions.ts`;
- create `e2e/log-meal.spec.ts` and `e2e/fixtures/meal.jpg` (a real JPEG of about 1200×800, ≤ 200 KB, committed; generate it once with any tool).

**Interfaces:**
- Consumes the analyze contract (Task 5), `SaveMealSchema`, `sumItems`, `fmt`, `ITEM_MAX`, `NAME_MAX`, `MAX_ITEMS`, `MAX_IMAGE_BYTES` and `getToday`.
- Produces:
  - `compressImage(file: File): Promise<Blob>`: `createImageBitmap(file)` → canvas with long edge ≤ 1568 → `toBlob('image/jpeg', 0.8)`. If the result is > `MAX_IMAGE_BYTES`, retry at 0.6. If it is still too big, throw `Error('too-large')`.
  - `saveMeal(input: { id: string; items: MealItem[] }): Promise<{ error: string }>`, which redirects on success.

**Steps:**
- [ ] Client state machine in `meal-logger.tsx`: `idle | analyzing | review | analyzeError`, plus separate `saveError` and `saving` flags.
- [ ] `idle`: a `<button type="button">Snap meal</button>` triggers a hidden `<input type="file" accept="image/*" capture="environment">`.
- [ ] `analyzing`: shows `Analyzing your meal…` in `role="status" aria-live="polite"`.
  - Each new pick aborts the previous request through one `AbortController` ref and bumps a request counter. A response whose counter is stale is ignored (FC-09/10).
  - Unmount aborts.
- [ ] `analyzeError`: shows the API's `error` text in `role="alert"` (a compress failure shows the 413 copy) and buttons `Try again` (re-posts the same compressed blob) and `Enter manually` (review with one empty item).
- [ ] `review`:
  - `mealId = crypto.randomUUID()` is created **once when review is entered**. It is kept across edits and save retries, and replaced only on `Retake` or a new pick (FC-08).
  - The banner `Rough estimate — tap any item to adjust.` shows when `confidence === 'low'`. The disclaimer is always shown. `No food detected. Add items manually.` shows when the analysis returned 0 items.
  - Each item is a `<fieldset>` with a `<legend>` (item name or `Item n`) holding the six labelled inputs:
    - name has `maxLength={NAME_MAX}` and `required`;
    - numbers are `type="number" step="any" min=0 max={ITEM_MAX[k]} required`.
  - Each item has a `Remove` button. `Add item` is disabled at `MAX_ITEMS`.
  - Live totals use `sumItems`/`fmt`.
  - `Log meal` is disabled while saving (text `Saving…`) or when there are 0 items. `Retake` returns to idle.
- [ ] Save: the action:
  1. `requireUser`;
  2. `SaveMealSchema.safeParse`;
  3. `eaten_on = (await getToday()).date`;
  4. `supabase.from('meals').insert({ id, user_id: userId, eaten_on, items })`. Error code `'23505'` counts as success; `'23514'` or a validation failure returns the out-of-range copy; anything else returns the generic copy;
  5. `revalidatePath('/')`, `revalidatePath('/history')`, then `redirect('/')`.

  A save error shows in its own `role="alert"`, separate from the analyze error (FC-12), and clears on the next attempt.
- [ ] `e2e/log-meal.spec.ts`. Every test mocks `/api/analyze` in the browser with `page.route`; the real route has unit coverage. Cases:
  - (a) happy path: pick `meal.jpg` → mocked 200 with 2 items → edit the first item's calories → the live total updates → `Log meal` → lands on `/` and the total includes the edit;
  - (b) low confidence → the banner text is visible;
  - (c) mocked 502 → the alert shows its copy; `Enter manually` → add a name and numbers → save works;
  - (d) idempotent retry: a `page.route` on the Server Action POST lets the first request reach the server but aborts the response (`route.fetch()` then `route.abort()`); click `Log meal` again → exactly one meal exists for that id (assert via the `/` meal count);
  - (e) race: hold the first `/api/analyze` request in flight (unresolved route promise), pick a second photo, resolve the second with item `B` and then the first with item `A` → only `B` is shown;
  - (f) `page.locator('button button, [role=button] [role=button]')` count is 0;
  - (g) at a 320×568 viewport, `document.documentElement.scrollWidth <= 320` in review with an 80-char item name.

**Acceptance criteria:**
- `AC-7.1` Snap → review → save works, and the user lands on Today with the meal counted. **Verify:** `npx playwright test e2e/log-meal.spec.ts -g "happy"`.
- `AC-7.2` Copy is verbatim (FC-14). **Verify:** `grep -F "Analyzing your meal…" app -r && grep -F "Rough estimate — tap any item to adjust." app -r && grep -F "Log meal" app -r` → each matches.
- `AC-7.3` Edits re-total live, and the saved payload carries the edited values (FC-11/17). **Verify:** spec (a).
- `AC-7.4` A retry after a lost response leaves exactly one row (FC-08). **Verify:** spec (d); plus `npm run db:test` (duplicate id).
- `AC-7.5` A stale analysis response never overwrites a newer pick, and abort happens on unmount (FC-09/10/26). **Verify:** spec (e).
- `AC-7.6` Server boundaries: out-of-range or `null` values posted around the client give the inline out-of-range error, never a 500 (FC-04). **Verify:** a spec case that removes `max` via `page.evaluate`, sets calories to 20000, saves, and sees the alert.
- `AC-7.7` Client limits come from the shared constants (FC-05). **Inspect:** `meal-logger.tsx` has no literal 5000/10000/1000/80/30.
- `AC-7.8` States are complete: analyzing (status), analyze error (alert + Try again + Enter manually), empty (0 items), saving (disabled, `Saving…`) and save error (a separate alert). Every input has a label (FC-12/21). **Verify:** specs (b), (c) and (a).
- `AC-7.9` No nested interactive elements; no horizontal scroll at 320 px (FC-18/20). **Verify:** specs (f) and (g).

### Task 8: Today dashboard  `[judgment]`

**Files:** create `app/(app)/page.tsx` and `e2e/today.spec.ts`.

**Interfaces:** consumes `requireUser`, `getToday`, `sumItems`, `fmt`, and the `meals`/`daily_targets` tables.

**Steps:**
- [ ] A Server Component runs two queries:
  - `meals.select('id, logged_at, items').eq('eaten_on', date).order('logged_at')`;
  - `daily_targets…maybeSingle()`.
- [ ] Render heading `Today` and link `Snap meal` → `/log`.
- [ ] Kcal block:
  - with targets: `{fmt(cal)} / {target} kcal` plus `{n} kcal left` or `{n} kcal over`, where n = |target − eaten| rounded;
  - without targets: `{fmt(cal)} kcal` plus link `Set your daily targets`.
- [ ] Macro rows `Protein`, `Carbs`, `Fat`: `{eaten} / {target} g`. Each has a `<progress>` with `max = target` and an `aria-label` like `Protein progress`. Without targets they show `{eaten} g` only.
- [ ] Meal list: time (formatted in `timeZone`) and comma-joined item names. Empty: `No meals logged today.`
- [ ] A query error shows `role="alert"` `Couldn't load today's meals. Refresh to try again.` (use an `error.tsx` in `app/(app)/`).
- [ ] `e2e/today.spec.ts`:
  - a new user sees `No meals logged today.` and `Set your daily targets`;
  - after setting targets 2000/150/200/70 and logging two meals via the UI (mocked analyze: items 72.4/6.3/0.4/4.8 and 195/4/42/0.4) → `267 / 2000 kcal`, `1733 kcal left`, `10 / 150 g`, `42 / 200 g`, `5 / 70 g`;
  - nested-interactive count is 0;
  - 320 px has no horizontal scroll.

**Acceptance criteria:**
- `AC-8.1` Today's totals and remaining values match a fixture with decimals (FC-17). **Verify:** `npx playwright test e2e/today.spec.ts`.
- `AC-8.2` "Today" follows the browser's timezone (`Asia/Manila` in e2e), not UTC (FC-27). **Inspect:** the page uses `getToday()`, with no `new Date().toISOString().slice(0,10)` anywhere (`grep -rn "toISOString().slice" app lib` → no output).
- `AC-8.3` Empty (no meals, no targets), error and accessibility labels on `<progress>` are present (FC-21); no nesting; 320 px OK (FC-18/20). **Verify:** same spec.

### Task 9: History view (last 30 days)  `[judgment]`

**Files:** create `app/(app)/history/page.tsx` and `e2e/history.spec.ts`.

**Interfaces:** consumes `requireUser`, `getToday`, `addDays`, `groupByDay`, `sumItems` and `fmt`.

**Steps:**
- [ ] Query `meals.select('id, eaten_on, logged_at, items').gte('eaten_on', addDays(date, -29)).order('eaten_on', { ascending: false }).order('logged_at', { ascending: false })`. Add the comment `// shortcut: fixed 30-day window, no pagination; add range paging when users exceed ~1000 meals/30d`.
- [ ] `groupByDay` → one `<section>` per day:
  - `<h2>` with the day label: `Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })` on `eaten_on + 'T00:00:00Z'`, so the stored calendar date shows unshifted;
  - the totals line verbatim;
  - a meal list with time (in the user's tz) and item names.
- [ ] Empty: `No meals in the last 30 days.` The error state comes from the shared `app/(app)/error.tsx`.
- [ ] `e2e/history.spec.ts`:
  - a new user sees the empty copy;
  - after logging 2 meals (same mocks as Task 8) one day group shows `267 kcal · P 10 g · C 42 g · F 5 g`;
  - another user (second `signIn`) sees the empty copy (UI-level isolation);
  - nested-interactive count is 0; 320 px OK.

**Acceptance criteria:**
- `AC-9.1` Day groups and totals are correct (FC-17). **Verify:** `npx playwright test e2e/history.spec.ts`.
- `AC-9.2` A user never sees another user's meals. **Verify:** same spec plus `npm run db:test`.
- `AC-9.3` Empty and error states; nesting; 320 px (FC-18/20/21). **Verify:** same spec.

### Task 10: Deploy readiness docs and final gate  `[mechanical]`

**Files:** modify `README.md`.

**Steps:**
- [ ] Add a "Deploy (human steps)" section to `README.md` that copies H1–H6 below verbatim, and a "Deferred" section that copies the deferred list below.
- [ ] Run the full local gate from Verification commands.

**Acceptance criteria:**
- `AC-10.1` The full gate is green. **Verify:** the full local gate command sequence → every step exits 0.
- `AC-10.2` The human steps are documented. **Inspect:** `README.md` contains `supabase db push`, `Confirm signup`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `Do not add a service-role or secret key`.

---

## Human-only steps (not done by Engineer or QA)

- **H1** Create the Supabase project. Copy the Project URL and the **publishable** key (Settings → API Keys).
- **H2 (migration — before merge/deploy, FC-01):** `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`. This applies `20261020000000_nutrition_mvp.sql` to production.
- **H3** Supabase dashboard → Authentication:
  - Site URL = the Vercel production URL;
  - edit **both** the "Magic Link" and "Confirm signup" templates so the link is `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`;
  - configure custom SMTP (the built-in mailer is rate-limited);
  - after creating your own account, consider turning off "Allow new users to sign up" until scan limits exist (cost control).
- **H4** In the Groq console (free tier):
  - create `GROQ_API_KEY`;
  - in Settings → Data Controls, turn on **Zero Data Retention**, since meal photos would otherwise be loggable for up to 30 days;
  - in Settings → Limits, read the real free-tier RPM/RPD/TPM/TPD for `qwen/qwen3.8-27b` and record them in `README.md`. The plan's 30/1K/8K/200K figures come from the docs' Developer-plan base table;
  - watch Groq's deprecations page, because the model is in preview.
- **H5** Create a GitHub remote (none exists) and push. Import it in Vercel. Set the env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `GROQ_API_KEY` (server-only). **Do not add a service-role or secret key.** Check that the preview build succeeds (FC-02). Magic links always point to the Site URL, so sign-in on preview deployments isn't supported in the MVP.
- **H6** Allow these if your permission settings prompt for them:
  - `npx supabase start`/`db reset`/`test db` (Docker);
  - `npx playwright install chromium` (downloads to `~/Library/Caches/ms-playwright`).
- **H7** Real-photo smoke test, after Task 7. Add `GROQ_API_KEY` to `.env.local`, run `npm run dev`, sign in at `http://127.0.0.1:3000`, and snap one real meal. This confirms JSON mode works with a real image, and that no reasoning text (`<think>`) leaks into `content`. If it fails, or reasoning shows up, send the response to the Engineer. The fix is a request-parameter change in `lib/analyze.ts`, using Groq's reasoning parameters for this model.
- **H8 (gate):** do not turn Supabase sign-ups back on (H3) until the per-user daily analysis cap (see Deferred) has shipped.

## Not verifiable locally (FC-24 — list as "not verified" in hand-off)

- Real phone camera capture through `capture="environment"`.
- HEIC photos on non-Safari browsers (`createImageBitmap` may fail; this shows the error state).
- The quality of Groq's estimates on real photos, and JSON mode with a real image (H7).
- The real free-tier quota for `qwen/qwen3.8-27b` (H4).
- There is no per-user daily cap yet. Sign-ups must stay off until it ships (H8).
- Production email delivery.
- The Vercel deploy and its function duration.

## Deferred (out of MVP scope)

- Saved-foods pantry.
- Barcode or nutrition-label scanning.
- Trend charts.
- Body weight logging.
- Reminders or daily summaries.
- Stripe and paid scan limits.
- **Per-user daily analysis cap (decided: deferred). Gate: it must ship before Supabase sign-ups are opened (H8).** Planned shape: an `analysis_usage (user_id, day, count)` table with RLS, plus a migration and a prod apply; a check-and-increment in `/api/analyze` before calling Groq, returning 429 `You've reached today's photo limit. Enter the meal manually.`; a pgTAP test and a route test.
- Storing meal photos (decided: not stored).
- Editing or deleting a saved meal (decided: deferred).
- `meal_type` (breakfast/lunch/…) and stored `confidence`.
- Google OAuth.
- Sign-in on preview deployments.
- A CI workflow (there is no remote yet).

---

## Decided (revision 1)

- **Provider:** Groq, `groq-sdk@1.6.0`, model `qwen/qwen3.8-27b` (preview), using JSON mode plus server-side Zod validation (G13).
- **Photos:** not stored (G4).
- **Edit or delete after saving:** deferred.
- **Per-user daily analysis cap:** deferred, but it must ship before Supabase sign-ups are opened (see Deferred and H8).
- **Preview model `qwen/qwen3.8-27b`:** accepted for production. Swapping models is a change to one constant, and an outage degrades to `Enter manually`.

## Open questions for the human

none: both were answered by the human at plan approval (see Decided).

## Review

**Outcome:** done with open items, on branch `feat/nutrition-mvp` (base `3a8063c`). All 10 tasks passed QA, and the whole-branch QA passed on round 2.

| Task | Model | QA verdict | Fix rounds |
|---|---|---|---|
| 1 Scaffold | haiku | PASS r1 | 0 |
| 2 Supabase, migration, RLS | haiku | PASS r1 | 0 |
| 3 Domain library | sonnet | PASS r3 | 2 (NUL/length/coerce; JSON-schema bounds) |
| 4 Auth | sonnet | PASS r2 | 1 (Host-header open redirect, 500) |
| 5 /api/analyze (Groq) | sonnet | PASS r2 | 1 (missing key and non-completion 500s, streaming cap) |
| 6 Settings | sonnet | PASS r2 | 1 (typed values lost on failed submit) |
| 7 Log meal | sonnet | PASS r2 | 1 (no timeout or Cancel) |
| 8 Today | sonnet | PASS r2 | 1 (ambiguous alert locator, error copy, rounding) |
| 9 History | sonnet | PASS r1 | 0 |
| 10 Docs and gate | haiku | PASS r1 | 0 |
| Whole branch | opus QA, then sonnet fix and sonnet re-QA | PASS r2 | 1 (verbatim copy, session-expired save, settings load error, History upper bound) |

**Final gate** (real exit codes, all 0):
- `npx supabase db reset`
- `npm run db:test` (17/17)
- `npm run lint`
- `npm run typecheck`
- `npm test` (74/74)
- `npm run build`
- `npx playwright test` (29/29, run twice)

**Open Minor findings, ranked:**
1. A 23505 on save is treated as success, so an edited retry after a lost response silently keeps the first version (`app/(app)/log/actions.ts`).
2. History has no row limit, so PostgREST `max_rows=1000` truncates the oldest days without a notice.
3. There's no `engines` field, although the README says Node 22.12+.
4. `perplexity.txt` is stale: it mentions Anthropic and the service-role key.
5. A signed-out GET with a `next-action` header gets Next's 307 plus a static shell. Nothing leaks; it could be tightened to POST only (`proxy.ts`).
6. There's no regression e2e for the History 30-day edge or the future bound. They are covered by unit tests and runtime probes.

**Not verified:**
- H7: a real Groq call with a real photo.
- Real-device camera and HEIC capture.
- Screen-reader announcements on a device.
- The final pass's AC-5.8 RED re-run, which the guard hook blocked. The Task 5 QA rounds verified it.
