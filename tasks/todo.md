# Today screen: macro rings, week strip, meals list, bottom tab bar — plan

**Request:** (verbatim from `.orchestrate/today-macro-rings/request.md`)

> Redesign the NutritionTracker "Today" screen (app/(app)/page.tsx) with three concentric macro rings, a week strip and a meals list, as a 100dvh mobile column (max-width 430px, centered on larger screens) with a bottom tab bar.
>
> Stack (no new dependencies): Next.js 16.4.2 App Router, React 19.3, TypeScript, Tailwind v4 (colors as tokens in app/globals.css under @theme, light and dark; no hex literals in components), IBM Plex Sans with tabular numerals, Supabase via @supabase/ssr (requireUser/getToday from lib/supabase/server, sumItems/fmt from lib/nutrition). The page stays a Server Component that loads data; the interactive parts are small client components: TodayScreen (server), WeekStrip, MacroRings, MealList (client). Read node_modules/next/dist/docs/ before writing code (per AGENTS.md).
>
> Data: one query loads the meals for the last 7 days ending today in the user's time zone (eaten_on between start and today), plus daily_targets. Switching days happens on the client with no refetch. With no targets set, the rings show tracks only and the legend links to "Set your daily targets" (/settings).
>
> Header: eyebrow "NutritionTracker", large title "Today" (32px/700) and an initials avatar from the user's email.
>
> Week strip: a 7-column grid on a soft pill track, each day a 62px button with a weekday letter, the date number and a small dot when that day's calories landed within 90–110% of calorie_target. ONE shared highlight (an absolutely positioned accent gradient pill, width calc((100% - 8px) / 7)) slides between days with transform: translateX(index * 100%) on a spring (CSS linear() curve, 590ms); the selected day's text turns white. Today is selected by default.
>
> Rings card: a 160px SVG with three circles per ring (a faint track and a progress circle) at radii 72, 53 and 34, stroke-width 15, round caps, rotated -90deg, in three steps of the accent blue: Protein (outer), Carbs (middle), Fat (inner). Total kcal sits in the center of the rings. Each progress circle uses pathLength="1", stroke-dasharray: 1 and stroke-dashoffset = 1 - min(1, eaten / target), with transition: stroke-dashoffset 1.1s cubic-bezier(.32,.72,0,1); a 0 g target counts as full only when eaten is 0. Beside it a legend with Protein (g), Carbs (g) and Fat (g): label, 26px tabular number that counts to the new value over 900ms (requestAnimationFrame) and "/ <target> g" in muted text, plus "<n> kcal left" or "<n> kcal over".
>
> Below, a "Meals" list: 46px icon tile (first letter of the first item), the item names joined by ", " (wrapping long names), "<n> items · <kcal> kcal" and the logged time in the user's time zone. Rows re-render with a 60ms stagger (opacity 0 and translateY(10px) to rest) when the day changes. Empty state: "No meals logged on this day." with a "Snap meal" link to /log.
>
> Bottom tab bar (replaces the header nav in app/(app)/layout.tsx, so it appears on every signed-in screen): Today, Log, History, Settings as links with aria-current="page" on the active one. Sign out moves to the Settings page.
>
> Accessibility and motion: each day button is a real button with aria-pressed and an aria-label with the full date; arrow keys move between days (Home and End jump to the ends, roving tabindex). The rings have role="img" with a text summary. prefers-reduced-motion removes the stagger and the count-up and shortens the ring fill to 200ms. No horizontal scroll at 320px wide.
>
> Tests: Vitest for the pure helpers (ring offset clamping, 7-day window across a time-zone boundary, the 90–110% goal-met rule); Playwright e2e for day switching, keyboard navigation, aria-pressed, and the empty state. Lint, typecheck, test and e2e all pass.

**Branch:** `feat/today-macro-rings`   **Base:** `main` (73bcf87)

> Node app: every command runs on the **host** in `/Users/dnmrk/Sites/nutrition-tracker` (the global "docker compose exec" rule is Shopware-only). Supabase runs in Docker via the CLI. There is no CI config; the verification commands come from `README.md` "Full local gate" and the previous plan.
>
> Precedents: data loading and error contract follow the current `app/(app)/page.tsx` and `app/(app)/history/page.tsx`; per-day grouping reuses `groupByDay` in `lib/nutrition.ts`; colocated client components follow `app/(app)/settings/targets-form.tsx`; theme tokens follow the existing `:root` vars + `@theme inline` + `prefers-color-scheme` block in `app/globals.css`; the e2e PostgREST session helper follows `userMeals()` in `e2e/log-meal.spec.ts`; page unit tests follow `app/pages.test.ts`.
>
> Next 16 docs read: `01-app/03-api-reference/04-functions/use-pathname.md` (Client-only hook, needed for `aria-current` because a Server layout cannot read the URL; `cacheComponents` is off in this repo, so no Suspense is needed), `01-app/01-getting-started/04-linking-and-navigating.md`, `05-server-and-client-components.md`. Engineers still read the docs for anything else they touch.

### Architect's calls (decisions the request leaves open)

- **State owner.** Three client components need the same selected day, and a Server Component can't hold state. So `TodayScreen` (server: header + frame) renders one small client owner `TodayDays` that holds `selected` and renders `WeekStrip`, `MacroRings` and `MealList`. No context, no URL state.
- **Selected state is a date string**, not an index. If the 7-day window shifts on a `router.refresh()` (TimeZoneSync changing tz), the same calendar day stays selected; if it left the window, fall back to today (last index).
- **All locale formatting happens on the server** (`buildWeek`): weekday letter, date number, full-date label, logged time. Client components receive strings, so server and browser ICU can never cause a hydration mismatch.
- **Client components must not import `@/lib/nutrition`** (it builds zod schemas at module scope, which would ship zod to the browser). Client-safe helpers live in a new zero-dependency `lib/today.ts`; `buildWeek` lives next to `groupByDay` in `lib/nutrition.ts` and runs on the server only. Client code rounds with `Math.round` (same as `fmt`).
- **Day order** is oldest → newest, left to right; today is the rightmost (index 6).
- **Arrow keys select and focus** (selection follows focus; switching is local and cheap). ArrowLeft/ArrowRight clamp at the ends (no wrap). Home/End jump to index 0/6. Arrows, Home and End call `preventDefault` (no page scroll).
- **Day button aria-label** = full date, e.g. `Tuesday, October 20, 2026`, plus `, goal met` when the dot shows, so the dot is not a visual-only signal (FC-18). The week strip is `role="group"` with `aria-label="Last 7 days"`.
- **Goal-met rule** compares the *rounded* day calories (what the user sees) with integer math: `r*10 >= t*9 && r*10 <= t*11`, so 90 % and 110 % are inclusive and floating point can't flip a boundary. No targets → never met.
- **0 g target with eaten > 0** renders an empty ring (offset 1). This is the literal reading of "counts as full only when eaten is 0" (**decided: human, 2026-10-20**, OQ1).
- **A progress circle at offset 1 is hidden (`opacity-0`)**: with round caps, a zero-length dash still paints a 15 px dot at 12 o'clock in Chrome/Safari.
- **Count-up:** the first render shows the final value (SSR = hydration, and no 0→N flash on page load); only changes animate. Ease-out cubic `1 - (1 - p) ** 3`, 900 ms, interruptible: a new value starts from the currently shown value. The ring fill likewise does not animate on first paint.
- **No targets:** legend shows each number with a muted ` g` (no `/ <target>`), and the kcal line is replaced by the `Set your daily targets` link. Rings show the three tracks only (no progress circles in the DOM).
- **Rings `role="img"`** sits on a wrapper around the SVG and the centre kcal (the SVG itself is `aria-hidden`), so the label must carry the kcal too. Exact format under Task 6.
- **Legend swatch:** each legend row starts with an 8 px dot in its ring colour, so the colour → macro mapping is visible.
- **Reduced motion also tames the highlight slide** (200 ms ease-out instead of the 590 ms spring). The request lists stagger/count-up/ring only; the slide is motion too, and it is one class.
- **"1 item" singular** for one item, `<n> items` otherwise (**decided: human, 2026-10-20**, OQ2).
- **Stagger plays on first paint too** (rows mount with the animation; CSS-only, works before hydration). Duration 400 ms, `cubic-bezier(.32,.72,0,1)`, fill `both`, delay `index * 60ms`.
- **Rings card wraps at narrow widths:** `flex flex-wrap`, legend `flex-1 basis-[120px] min-w-0`. At 320 px the legend drops below the rings (160 + 16 + 120 > 248 px of card content); from 375 px it sits beside them.
- **Layout column:** `min-h-dvh` column, `max-w-[430px]`, `mx-auto`; the tab bar is `sticky bottom-0`, so pages keep normal document scrolling (no inner scroll container). Safe-area insets are not handled (no `viewport-fit=cover`; not a PWA).
- **Tab bar** is text-only (no icon set; no new deps). Active tab = `aria-current="page"` + foreground colour + `font-semibold`; inactive = muted. Exact pathname match (all four routes are flat).
- **Avatar:** `role="img"` with `aria-label="Signed in as <email>"`. Initials = local part split on `.`, `_`, `-`, `+`; first character of the first two non-empty parts, uppercased; `?` if none.
- **No `loading.tsx`.** The page is server-rendered with no client fetching, and day switching is instant. Load failures already throw to `app/(app)/error.tsx`, which renders inside the layout (tab bar stays).
- **No midnight roll-over:** a Today page left open past midnight keeps the old window until the next navigation or refresh (same as today's behaviour).
- **Weight 700 is added to the Plex font load**; it currently loads 400/500/600 only, so `font-bold` on the title would be synthesized.
- **Design-spec calls adopted:** centre kcal is `text-lg` (not `text-2xl`) so 4-digit totals clear the Fat ring; `html { scroll-padding-bottom: 4rem; }` so focus never lands under the sticky tab bar; Back to `/` resets the selection to today; arcs hide instantly when a day drops to 0; the selected day's text turns white while the pill is still sliding (accepted transient).
- **Design-spec Plan gap 3 (button styles on `/log` and `/settings` still use `bg-black`/palette classes):** accepted for this slug; logged under Deferred.
- **Not changing** `vitest.config.ts`/`eslint.config.mjs` to exclude `.orchestrate/` (lesson says "consider"); QA follows that lesson's check instead.

---

## Impact call-outs

- **Data / schema:** reads only. `public.meals` (`id, eaten_on, logged_at, items`) over a 7-day `eaten_on` range, served by the existing index `meals_user_id_eaten_on_idx (user_id, eaten_on desc, logged_at desc)`; `public.daily_targets` (`calorie_target, protein_target_g, carbs_target_g, fat_target_g`). **Migrations: none.**
- **Services / registration:** none. New files are picked up by the App Router by import only. `TabBar` is mounted in `app/(app)/layout.tsx`. `requireUser()` gains an additive `email` field.
- **Events / hooks:** none emitted. Consumes the existing `tz` cookie via `getToday()`.
- **API contract:** none changed. `POST /auth/signout` (unchanged) is now called from `/settings` instead of the header.
- **UI:** `/` fully redesigned; the `(app)` layout (header nav → bottom tab bar) changes `/log`, `/history`, `/settings`; `/settings` gains Sign out. The designer's `.orchestrate/today-macro-rings/design-spec.md` is folded in: every `D-` item is an AC on the task that builds its screen (S1/S2/S4 → Task 5, S3 → Task 6, S5/S6 → Task 4), and its Plan gaps are resolved below (Task 3 AC-3.4, Task 4 scroll padding, Task 6 centre size, Deferred). New copy, verbatim:
  - `NutritionTracker` (eyebrow), `Today` (h1), `Meals` (h2)
  - `No meals logged on this day.`, `Snap meal` (→ `/log`), `Set your daily targets` (→ `/settings`)
  - `Protein`, `Carbs`, `Fat`, `/ <target> g`, `<n> kcal left`, `<n> kcal over`, `kcal` (centre unit)
  - `<n> items · <kcal> kcal` / `1 item · <kcal> kcal`
  - tabs `Today`, `Log`, `History`, `Settings`; button `Sign out` (on `/settings`)
  - aria: `Last 7 days`, day labels `<Weekday>, <Month> <d>, <yyyy>[, goal met]`, avatar `Signed in as <email>`, rings label (Task 6).
  - Removed copy: `No meals logged today.`, `<eaten> / <target> kcal`, `<label> progress` progressbars, header `Snap meal` button.
- **Permissions / ACL:** none; RLS unchanged.
- **Config / env / dependencies:** none. No package changes, no env vars. `app/layout.tsx` font weights gain `"700"` (self-hosted by `next/font`).

## Activation path

1. **Registration:** `app/(app)/page.tsx` is the `/` route in the `(app)` group; `app/(app)/layout.tsx` wraps every signed-in route and now renders `<TabBar />`.
2. **Discovery:** `proxy.ts` lets signed-in users reach `/`; the layout calls `requireUser()`; magic-link sign-in and `saveMeal` both land on `/` (`redirect("/")`).
3. **Invocation:** `TodayPage` → `requireUser()` (email) + `getToday()` → one `meals` query (`gte eaten_on = lastSevenDays(date)[0]`, `lte eaten_on = date`) + `daily_targets` → `buildWeek(...)` → `<TodayScreen email days targets>` (server) → `<TodayDays>` (client, holds `selected`) → `<WeekStrip>`, `<MacroRings>`, `<MealList key={date}>`. Clicking/arrowing a day calls `setSelected(date)`; nothing hits the server.
4. **Tab bar:** `TabBar` reads `usePathname()` and marks the matching link `aria-current="page"`; links navigate with `next/link`.

## Risks

| FC | Applies? | Covered by |
|---|---|---|
| FC-01 migration not applied | No: no migration | — |
| FC-02 manifest changes | No: no `package.json`/bundler/config change | Task 3 AC-3.3 still runs `npm run build` |
| FC-03–06 DDL / boundary 5xx / limits / CORS | No: no writes, no new endpoints | — |
| FC-07–12 async state | No: day switching is synchronous local state, no mutations | — |
| FC-13 external state re-read | Yes (tz) | Existing `TimeZoneSync`; Task 5 AC-5.9 (selection survives a refresh by date) |
| FC-14 copy/numbers verbatim | Yes | Task 4 AC-4.1/4.5, Task 5 AC-5.1/5.4/5.5, Task 6 AC-6.1/6.2/6.4; QA greps the copy list in Impact → UI |
| FC-15 shared function changed | Yes: `requireUser` (callers: layout, history, settings, today, `pages.test.ts` mock), the layout nav (`e2e/auth.spec.ts` sign-out), Today copy (`e2e/log-meal.spec.ts:44`), `app/layout.tsx` font | Task 4 AC-4.4, Task 5 AC-5.8, Task 6 AC-6.8 (full e2e) |
| FC-16 code can't run as written | Yes: react-hooks 7.1.1 rules (`set-state-in-effect`, `refs`, `purity`) | Task 5 AC-5.10, Task 6 AC-6.7 (lint with no `eslint-disable`) |
| FC-17 wrong numbers for new data shape | Yes | Task 2 AC-2.1 (fixture totals), Task 6 AC-6.1 (e2e totals) |
| FC-18 nested interactive / hidden affordance | Yes | Task 5 AC-5.6, Task 4 AC-4.3; goal dot in aria-label (AC-5.3) |
| FC-19 colour outside tokens / contrast | Yes | Task 3 AC-3.1/3.2, Task 5 AC-5.7, Task 6 AC-6.6 |
| FC-20 320 px | Yes | Task 4 AC-4.6/D-5.7, Task 5 D-2.8/D-4.5, Task 6 AC-6.5/D-3.9 |
| FC-21 states | Yes: empty day, no targets, load error, keyboard/focus | Task 5 AC-5.1/5.2/5.11, Task 6 AC-6.2 |
| FC-22 command can't run | Dry-run below | Verification commands table |
| FC-23 real DB | Yes: the repo is **linked to the production Supabase project** (`srxedrdugbeurnupuyqk`) | Never pass `--linked`/`--db-url`; `e2e/global-setup.ts` refuses non-local URLs (unchanged) |
| FC-24 device-only | Yes | Hand-off "not verified": iOS Safari `100dvh`/tab bar under the toolbar, the spring's feel, Safari's `pathLength` + round-cap rendering, dark mode on a real device, VoiceOver announcements |
| FC-25 test never seen failing | Yes | Every test-adding task: QA stashes the implementation, sees RED, restores, sees GREEN |
| FC-26 test doesn't exercise the path | Yes | Task 5 AC-5.3 (request listener attached before the click; mutation: replace `setSelected` with `router.push`), AC-5.4 (mutation: drop `onKeyDown`) |
| FC-27 time/locale flake | Yes | Task 1 (frozen `now`), Task 5 (Playwright `timezoneId: "Asia/Manila"`; seeded dates computed in-test with `localDate`; logged time asserted by pattern, not value) |
| FC-28 mocks hide constraints | No: no constraint logic; e2e seeds through real PostgREST + RLS | — |
| FC-29–32 Shopware | n/a: not a Shopware project | — |
| FC-33 serverless global | No: no module-global client | — |

Other risks:
- **R-1 Hydration mismatch** (Intl output, count-up, Date). Covered by server-side formatting and AC-5.10 (no console errors).
- **R-2 Highlight overshoot** (the spring peaks at 1.038) could stick out of the track at index 6 and cause horizontal scroll. The track is `overflow-hidden`; focus outlines are inset so they aren't clipped (AC-5.6).
- **R-3 Zod in the client bundle.** AC-5.12 greps client files for `@/lib/nutrition`.

## Verification commands

All on the host in `/Users/dnmrk/Sites/nutrition-tracker`. Dry-run by the Architect on 2026-10-20:

| Check | Command | Dry-run result |
|---|---|---|
| Lint | `npm run lint` | exit 0 |
| Types | `npm run typecheck` (`next typegen && tsc --noEmit`) | exit 0 |
| Unit | `npm test` (`vitest run`) | 6 files, 74 tests pass |
| Build | `npm run build` | exit 0 (all `(app)` routes dynamic `ƒ`) |
| DB start | `npm run db:start` | **not started** by the Architect (leaves containers running). `npx supabase start --help` exits 0; Docker is up; the Supabase images (postgres 17.11, gotrue, postgrest, kong, mailpit) are cached; ports 54321/54322/54324/3000 are free |
| DB reset | `npx supabase db reset` (local; **never** `--linked`) | not run (needs the stack); worked in the previous plan's dry-run |
| Local env | `.env.local` already has `NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"`. Run `npm run env:local` only if the stack's keys changed (it rewrites `.env.local` and drops the `VERCEL_OIDC_TOKEN` line; `vercel env pull` restores it) | checked |
| E2E | `npm run e2e` (`playwright test`), needs the stack | `npx playwright test --list` → 29 tests in 5 files; chromium 1248 is installed |
| Single e2e file | `npx playwright test e2e/today.spec.ts` | same runner |
| Stop | `npx supabase stop` after the run (leave the machine as found) | — |

Full gate, in order:

```
npm run db:start && npx supabase db reset
npm run lint && npm run typecheck && npm test && npm run build
npm run e2e
npx supabase stop
```

---

## Tasks

### Task 1: Pure helpers for the Today screen  `[mechanical]`

- **Files:** create `lib/today.ts`, `lib/today.test.ts`.
- **Interfaces:** consumes `addDays` from `@/lib/dates`. Produces (client-safe; imports nothing but `@/lib/dates`):
  ```ts
  export type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  export type Targets = { calorie_target: number; protein_target_g: number; carbs_target_g: number; fat_target_g: number };
  export type DayMeal = { id: string; initial: string; names: string; itemCount: number; kcal: number; time: string };
  export type Day = { date: string; weekday: string; dayNumber: string; label: string; totals: Totals; goalMet: boolean; meals: DayMeal[] };
  export function lastSevenDays(today: string): string[];          // oldest → newest, length 7, last === today
  export function ringOffset(eaten: number, target: number): number; // 0 = full, 1 = empty
  export function goalMet(calories: number, calorieTarget: number | null): boolean;
  export function initials(email: string): string;
  ```
- **Steps:**
  - [ ] `lastSevenDays(today)` = `Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))`.
  - [ ] `ringOffset(eaten, target)`: if `target <= 0` return `eaten <= 0 ? 0 : 1`; else return `1 - Math.min(1, Math.max(0, eaten / target))`.
  - [ ] `goalMet(calories, t)`: `false` if `t` is `null` or `t <= 0`; else `r = Math.round(calories)`; return `r * 10 >= t * 9 && r * 10 <= t * 11`.
  - [ ] `initials(email)`: local part = text before the first `@`; split on `/[._+-]+/`; drop empties; take the first code point (`[...part][0]`) of the first two parts; join; `toUpperCase()`; `"?"` if empty.
  - [ ] `lib/today.test.ts` (frozen `const now = new Date("2026-10-19T23:30:00Z")`, as in `lib/dates.test.ts`):
    - window across a tz boundary: `lastSevenDays(localDate("Asia/Manila", now))` equals `["2026-10-14", …, "2026-10-20"]`; `lastSevenDays(localDate("America/Los_Angeles", now))` ends `"2026-10-19"` and starts `"2026-10-13"`; month boundary `lastSevenDays("2026-03-03")[0] === "2026-02-25"`; length is 7.
    - ring clamping: `(0,150)→1`, `(75,150)→0.5`, `(150,150)→0`, `(300,150)→0`, `(0,0)→0`, `(5,0)→1`, `(-1,150)→1`.
    - goal met with target 2000: `1800→true`, `1799→false`, `2200→true`, `2201→false`, `1799.5→true` (rounds to 1800), `2200.5→false` (rounds to 2201); `(1900, null)→false`; `(0, 2000)→false`.
    - initials: `"dean.mark@example.test"→"DM"`, `"dean@example.test"→"D"`, `"e2e-123-abc@example.test"→"E1"`, `"@x"→"?"`, `""→"?"`.
- **Acceptance criteria:**
  - `AC-1.1` The window ends on the user's local today across a UTC day boundary, and spans exactly 7 calendar days. — **Verify:** `npx vitest run lib/today.test.ts` → all pass; QA stash-RED run fails.
  - `AC-1.2` Rings clamp to [0, 1] and over-target is full. A 0 g target with 0 g eaten is a full ring (`ringOffset(0, 0) === 0`); a 0 g target with any food eaten is an empty ring (`ringOffset(5, 0) === 1`) (OQ1, decided). — **Verify:** same command, the `ringOffset` cases pass.
  - `AC-1.3` The goal-met rule is inclusive 90–110 % of the rounded calories. — **Verify:** same command, the boundary cases pass.
  - `AC-1.4` `lib/today.ts` is client-safe. — **Verify:** `grep -n "^import" lib/today.ts` → only `@/lib/dates` (or `./dates`).

### Task 2: `buildWeek` — server-side shaping of the 7 days  `[mechanical]`

- **Files:** modify `lib/nutrition.ts`, `lib/nutrition.test.ts`.
- **Interfaces:** consumes Task 1 (`lastSevenDays`, `goalMet`, types `Day`, `DayMeal`). Produces:
  ```ts
  export function buildWeek(
    rows: { id: string; eaten_on: string; logged_at: string; items: MealItem[] }[],
    today: string, timeZone: string, calorieTarget: number | null,
  ): Day[]; // always length 7, oldest → newest
  ```
- **Steps:**
  - [ ] In `lib/nutrition.ts`, below `groupByDay`: `const byDate = new Map(groupByDay(rows).map((d) => [d.date, d]))`. For each `date` of `lastSevenDays(today)`, build a `Day`:
    - `weekday`: `Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" })` of `` new Date(`${date}T00:00:00Z`) `` (e.g. `T`);
    - `dayNumber`: `{ day: "numeric", timeZone: "UTC" }` (e.g. `20`);
    - `label`: `{ weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }` (e.g. `Tuesday, October 20, 2026`), plus `", goal met"` when `goalMet`;
    - `totals`: the group's totals, or all zeros;
    - `goalMet`: `goalMet(totals.calories, calorieTarget)`;
    - `meals`: rows in input order (the page orders by `logged_at` ascending) mapped to `DayMeal`: `initial` = first code point of `items[0].name.trim()` uppercased; `names` = `items.map((i) => i.name).join(", ")`; `itemCount` = `items.length`; `kcal` = `Math.round(sumItems(items).calories)`; `time` = `Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" })` of `logged_at`.
  - [ ] Hoist the four `Intl.DateTimeFormat` instances out of the loop (one each per call).
  - [ ] `lib/nutrition.test.ts`, new `describe("buildWeek")` with a fixture: today `2026-10-20`, tz `Asia/Manila`, target 2000; rows: `m1` (`2026-10-20`, `2026-10-19T23:30:00Z`, items Rice 72.4/6.3/0.4/4.8 + Toast 195/4/42/0.4), `m2` (`2026-10-18`, `2026-10-18T04:05:00Z`, one item `" oats"` 1900 kcal). Assert:
    - length 7; `[0].date === "2026-10-14"`; `[6].date === "2026-10-20"`;
    - `[6].weekday === "T"`, `[6].dayNumber === "20"`, `[6].label === "Tuesday, October 20, 2026"`;
    - `[6].meals[0]`: `names === "Rice, Toast"`, `itemCount === 2`, `kcal === 267`, `initial === "R"`, `time` matches `/^7:30\sAM$/` (Manila; ICU may use U+202F);
    - `[6].totals` rounds to 267/10/42/5; `[6].goalMet === false`;
    - `[4].goalMet === true`, `[4].label === "Sunday, October 18, 2026, goal met"`, `[4].meals[0].initial === "O"`;
    - an empty day has zero totals, `meals: []`, `goalMet: false`; with `calorieTarget = null`, `[4].goalMet === false`.
- **Acceptance criteria:**
  - `AC-2.1` Displayed totals, names, counts, kcal and times come out right for a two-day fixture (FC-17). — **Verify:** `npx vitest run lib/nutrition.test.ts` → all pass; stash-RED fails.
  - `AC-2.2` Dates are labelled without tz drift (calendar dates formatted as UTC; times in the user's zone). — **Verify:** the `label`/`time` assertions above pass with `TZ=America/Los_Angeles npx vitest run lib/nutrition.test.ts` too.
  - `AC-2.3` Existing nutrition behaviour unchanged. — **Verify:** `npm test` → all previous tests still pass.

### Task 3: Theme tokens, motion tokens and the 700 weight  `[mechanical]`

- **Files:** modify `app/globals.css`, `app/layout.tsx`.
- **Interfaces:** produces Tailwind utilities used by Tasks 4–6: colours `background`, `foreground`, `surface`, `muted`, `track`, `accent`, `accent-strong`, `on-accent`, `macro-protein`, `macro-carbs`, `macro-fat` (as `bg-*`, `text-*`, `stroke-*`, `border-*`, `from-*`, `to-*`, `outline-*`); easings `ease-spring`, `ease-fluid`; animation `animate-meal-in`.
- **Steps:**
  - [ ] `app/globals.css`, keep the existing structure (`:root` vars → `@theme inline` → dark media query). Exact values:

    | var | light `:root` | dark `@media (prefers-color-scheme: dark) :root` |
    |---|---|---|
    | `--background` | `#f4f5f7` | `#0a0a0a` |
    | `--foreground` | `#171717` | `#ededed` |
    | `--surface` | `#ffffff` | `#171717` |
    | `--muted` | `#5c6370` | `#a1a1aa` |
    | `--track` | `#e6e8ec` | `#262626` |
    | `--accent` | `#2563eb` | `#2563eb` |
    | `--accent-strong` | `#1d4ed8` | `#1d4ed8` |
    | `--on-accent` | `#ffffff` | `#ffffff` |
    | `--macro-protein` | `#1d4ed8` | `#3b82f6` |
    | `--macro-carbs` | `#2563eb` | `#60a5fa` |
    | `--macro-fat` | `#3b82f6` | `#93c5fd` |

    In `@theme inline` add `--color-<name>: var(--<name>);` for each new var.
  - [ ] Also in `@theme` (static values):
    ```css
    --ease-spring: linear(0, 0.116 6.25%, 0.351 12.5%, 0.590 18.75%, 0.782 25%, 0.913 31.25%, 0.991 37.5%, 1.027 43.75%, 1.038 50%, 1.035 56.25%, 1.027 62.5%, 1.017 68.75%, 1.010 75%, 1.004 81.25%, 1.001 87.5%, 0.999 93.75%, 1);
    --ease-fluid: cubic-bezier(.32, .72, 0, 1);
    --animate-meal-in: meal-in 400ms cubic-bezier(.32, .72, 0, 1) both;
    @keyframes meal-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    ```
    (The spring is a damped spring, ζ = 0.72, ω₀ = 15 rad/s, sampled over 590 ms; peak overshoot 3.8 %.)
  - [ ] `app/layout.tsx`: `weight: ["400", "500", "600", "700"]`. Nothing else.
- **Acceptance criteria:**
  - `AC-3.1` Every new pair meets contrast (FC-19). — **Inspect:** Architect's computed ratios, re-checked by QA: light — foreground/background 16.43, muted/background 5.54, muted/surface 6.05, muted/track 4.93, on-accent/accent 5.17, macro-fat/surface 3.68, macro-protein/track 5.46; dark — muted/background 7.72, muted/surface 7.00, muted/track 5.90, on-accent/accent 5.17, macro-protein/surface 4.87, macro-protein/track 4.11. Focus outline on the selected pill uses `on-accent` (5.17 on accent, 6.70 on accent-strong); `foreground` would fail on the gradient's bottom stop in light mode (2.68). Unselected focus uses `foreground` on track (14.61 / 12.93). Text ≥ 4.5, rings/dots/focus ≥ 3.
  - `AC-3.2` Hex literals live only in the theme file. — **Verify:** `grep -rnE '#[0-9a-fA-F]{3,8}\b' app components --include='*.tsx' --include='*.ts'` → no output.
  - `AC-3.3` The tokens compile and the font is self-hosted with 700. — **Verify:** `npm run build` → exit 0; `grep -c '"700"' app/layout.tsx` → 1. (Tailwind only emits `ease-spring`/`animate-meal-in` once used; Task 6 test 9 checks the computed timing functions.)
  - `AC-3.4` The new light `--background` (`#ffffff` → `#f4f5f7`) keeps the untouched screens legible (design-spec Plan gap 4). — **Inspect:** QA screenshots `/login`, `/log`, `/history`, `/settings` at 390×844 in light and dark (`page.emulateMedia({ colorScheme })`) after Task 4, and confirms text and bordered inputs stay legible.

### Task 4: Mobile column, bottom tab bar, Sign out on Settings  `[judgment]`

- **Files:** create `app/(app)/tab-bar.tsx`, `e2e/tab-bar.spec.ts`; modify `app/(app)/layout.tsx`, `app/(app)/settings/page.tsx`, `app/globals.css`, `e2e/auth.spec.ts`.
- **Interfaces:** consumes Task 3 tokens. Produces `export function TabBar(): JSX.Element` (client) and the layout column every `(app)` page renders in.
- **Steps:**
  - [ ] `tab-bar.tsx` (`"use client"`): `const TABS = [["/", "Today"], ["/log", "Log"], ["/history", "History"], ["/settings", "Settings"]] as const`. `const pathname = usePathname()`. Render `<nav aria-label="Main" className="sticky bottom-0 border-t border-track bg-surface">` → `<ul className="grid grid-cols-4">` → `<li>` → `<Link href aria-current={pathname === href ? "page" : undefined} className="flex min-h-14 items-center justify-center text-sm …">`. Active: `text-foreground font-semibold`; inactive `text-muted`. Focus-visible outline `outline-2 -outline-offset-2 outline-foreground`.
  - [ ] `layout.tsx`: keep `await requireUser()`. Replace the header with `<div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col"><div className="flex-1">{children}</div><TabBar /></div>`. Remove the `<header>`, the old nav and the Sign out form.
  - [ ] `settings/page.tsx`: after `<TargetsForm />`, add `<form action="/auth/signout" method="post" className="mt-8"><button type="submit" className="rounded-full border border-track px-4 py-2">Sign out</button></form>` (a sibling, not nested in the targets form).
  - [ ] `app/globals.css`: add `html { scroll-padding-bottom: 4rem; }` (design-spec Plan gap 1).
  - [ ] `e2e/auth.spec.ts` "sign out returns to /login": `await page.goto("/settings")` before clicking `Sign out`.
  - [ ] `e2e/tab-bar.spec.ts`:
    - for each of `/`, `/log`, `/history`, `/settings`: `page.getByRole("navigation", { name: "Main" }).getByRole("link")` has 4 links in order `Today, Log, History, Settings`; exactly one has `aria-current="page"`, and it's the one for that route;
    - clicking `History` in the tab bar from `/` lands on `/history` with `History` current;
    - at 1280×800 the nav's bounding box is ≤ 430 px wide and horizontally centred (±1 px); at 390×844 on `/settings`, the nav's bottom edge equals the viewport height;
    - no header `Sign out` on `/`: `page.getByRole("button", { name: "Sign out" })` count 0 on `/`, 1 on `/settings`.
- **Acceptance criteria:**
  - `AC-4.1` Every signed-in screen shows the 4-tab bar with exactly one `aria-current="page"` on the active tab. — **Verify:** `npx playwright test e2e/tab-bar.spec.ts` → pass.
  - `AC-4.2` The column is max 430 px and centred, and the tab bar sits at the bottom of a 100dvh column. — **Verify:** same spec (bounding-box assertions).
  - `AC-4.3` Accessibility: the nav is a landmark named `Main` with real links; no interactive element is nested in another. — **Verify:** same spec asserts `page.locator("button button, a a, a button, button a").count() === 0` on all four routes.
  - `AC-4.4` Sign out works from Settings, and the targets form still behaves (FC-15). — **Verify:** `npx playwright test e2e/auth.spec.ts e2e/settings.spec.ts` → pass.
  - `AC-4.5` Copy is verbatim. — **Verify:** `grep -F '"Today"' app/\(app\)/tab-bar.tsx`, same for `"Log"`, `"History"`, `"Settings"`; `grep -F 'Sign out' app/\(app\)/settings/page.tsx` → match; `grep -F 'Sign out' app/\(app\)/layout.tsx` → none.
  - `AC-4.6` No horizontal scroll at 320 px on `/log`, `/history`, `/settings` with the tab bar (FC-20). — **Verify:** the spec sets 320×568 and asserts `document.documentElement.scrollWidth <= 320` on each.
  - Design-spec items (S5 app frame, S6 Sign out), each asserted in `e2e/tab-bar.spec.ts` unless noted:
  - `D-5.1` On `/`, `/log`, `/history`, `/settings`: four links in order Today, Log, History, Settings; exactly one `aria-current="page"`, the current route's. — **Verify:** `npx playwright test e2e/tab-bar.spec.ts`.
  - `D-5.2` The current tab has computed `font-weight` `600`, the others `400`; every tab `boundingBox().height >= 56`. — **Verify:** same spec (`toHaveCSS`).
  - `D-5.3` Column ≤ 430 px and centred at 1280×800; nav bottom edge equals the viewport height at 390×844 and at 320×568 on `/settings` (scrolled to top). — **Verify:** same spec.
  - `D-5.4` A keyboard user never lands on a control hidden under the bar. — **Verify:** at 320×568 on `/settings`, and on `/` (no targets, empty day; re-run after Task 5/6 land): Tab through every focusable element before the nav; for each, `activeElement.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top`. `grep -n 'scroll-padding-bottom' app/globals.css` → 1 match.
  - `D-5.5` Tab links show an inset `foreground` focus outline. — **Verify:** Tab to `Log` → computed `outline-style` `solid`, `outline-offset` `-2px`.
  - `D-5.6` A load error on `/` still shows the tab bar. — **Inspect:** `error.tsx` is in `app/(app)/` and the layout renders `<TabBar />` outside `{children}`; plus the `pages.test.ts` Today rejection case (AC-5.11).
  - `D-5.7` No horizontal scroll at 320×568 on all four routes and no nested interactives. — **Verify:** AC-4.3 + AC-4.6 assertions, `/` included.
  - `D-6.1` `/settings` has exactly one `Sign out` button, in its own form after the targets form, and it signs out to `/login`; `/` has none; `page.locator("form form").count() === 0` on `/settings`. — **Verify:** same spec + `npx playwright test e2e/auth.spec.ts`.

### Task 5: Today page, TodayScreen, WeekStrip and MealList  `[judgment]`

- **Files:** create `app/(app)/today-screen.tsx`, `app/(app)/today-days.tsx`, `app/(app)/week-strip.tsx`, `app/(app)/meal-list.tsx`, `e2e/helpers/meals.ts`; modify `app/(app)/page.tsx`, `lib/supabase/server.ts`, `app/pages.test.ts`, `e2e/today.spec.ts` (rewrite), `e2e/log-meal.spec.ts` (line 44 and the session helper).
- **Interfaces:** consumes Tasks 1–3. Produces:
  - `requireUser(): Promise<{ supabase; userId: string; email: string }>` (`email: data.claims.email ?? ""`);
  - `TodayScreen({ email, days, targets }: { email: string; days: Day[]; targets: Targets | null })` (server);
  - `TodayDays({ days, targets })` (client): `const [selected, setSelected] = useState(days[days.length - 1].date)`; `index = days.findIndex(d => d.date === selected)`, falling back to `days.length - 1`; renders `<WeekStrip days index onSelect={setSelected} />`, a slot for Task 6 (`{/* MacroRings: Task 6 */}`), and `<MealList key={day.date} meals={day.meals} />`;
  - `WeekStrip({ days, index, onSelect }: { days: Day[]; index: number; onSelect: (date: string) => void })`;
  - `MealList({ meals }: { meals: DayMeal[] })`;
  - `e2e/helpers/meals.ts`: `session(page)` (moved from `userMeals` in `log-meal.spec.ts`) and `insertMeal(page, eaten_on: string, items)` (PostgREST `POST /rest/v1/meals` with the user's JWT, body `{ id: crypto.randomUUID(), user_id: session.user.id, eaten_on, items }`, `Prefer: return=minimal`, expect 201).
- **Steps:**
  - [ ] `lib/supabase/server.ts`: `requireUser` returns `{ supabase, userId: data.claims.sub, email: data.claims.email ?? "" }`. No other change.
  - [ ] `page.tsx`: `const { supabase, email } = await requireUser(); const { date, timeZone } = await getToday();` One meals query: `.from("meals").select("id, eaten_on, logged_at, items").gte("eaten_on", lastSevenDays(date)[0]).lte("eaten_on", date).order("logged_at")`, in `Promise.all` with the unchanged `daily_targets` `.maybeSingle()`. Keep `if (meals.error || targets.error) throw new Error("Failed to load today")`. `days = buildWeek(rows, date, timeZone, targets.data?.calorie_target ?? null)`. Return `<TodayScreen email={email} days={days} targets={targets.data} />`.
  - [ ] `today-screen.tsx` (no directive): `<main className="flex flex-col gap-5 px-4 py-6">`; header row: left = `<p className="text-xs font-medium uppercase tracking-wide text-muted">NutritionTracker</p>` + `<h1 className="text-[32px] font-bold leading-tight">Today</h1>`; right = avatar `<span role="img" aria-label={`Signed in as ${email}`} className="grid size-10 place-items-center rounded-full bg-track text-sm font-semibold">{initials(email)}</span>`. Then `<TodayDays …/>`.
  - [ ] `week-strip.tsx` (`"use client"`): `<div role="group" aria-label="Last 7 days" className="relative grid grid-cols-7 overflow-hidden rounded-full bg-track p-1">`. Highlight: `<div aria-hidden className="absolute inset-y-1 left-1 w-[calc((100%-8px)/7)] rounded-full bg-linear-to-b from-accent to-accent-strong transition-transform duration-[590ms] ease-spring motion-reduce:duration-200 motion-reduce:ease-out" style={{ transform: `translateX(${index * 100}%)` }} />`. Seven `<button type="button">`s: `aria-pressed={i === index}`, `aria-label={d.label}`, `tabIndex={i === index ? 0 : -1}`, `onClick={() => onSelect(d.date)}`, `onKeyDown`, `className="relative z-10 flex h-[62px] flex-col items-center justify-center gap-1 rounded-full outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"` plus `focus-visible:outline-on-accent` when selected, `focus-visible:outline-foreground` otherwise. Content: weekday (`text-xs font-medium`, `text-muted` or `text-on-accent` when selected), date number (`text-base font-semibold tabular-nums`, foreground or `text-on-accent`), dot `size-[5px] rounded-full` (`bg-macro-protein`, `bg-on-accent` when selected; `invisible` when `!d.goalMet`, so heights don't jump). Text colour transitions are fine; no other animation.
  - [ ] Keyboard: ArrowLeft → `max(0, index - 1)`, ArrowRight → `min(6, index + 1)`, Home → 0, End → 6; `preventDefault()`; `onSelect(days[next].date)`; focus `buttonRefs.current[next]` inside the handler (refs are read only in handlers, never in render — `react-hooks/refs`).
  - [ ] `meal-list.tsx` (`"use client"`): `<section aria-labelledby="meals-h"><h2 id="meals-h" className="text-lg font-semibold">Meals</h2>`. Empty: `<p>No meals logged on this day.</p>` + `<Link href="/log" className="inline-flex rounded-full bg-accent px-4 py-2 font-medium text-on-accent">Snap meal</Link>`. Else `<ul className="flex flex-col gap-3">`, each `<li className="flex animate-meal-in items-start gap-3 rounded-2xl bg-surface p-3 motion-reduce:animate-none" style={{ animationDelay: `${i * 60}ms` }}>`: tile `<span aria-hidden className="grid size-[46px] shrink-0 place-items-center rounded-xl bg-track font-semibold">{m.initial}</span>`; body `<div className="min-w-0 flex-1 [overflow-wrap:anywhere]"><p className="font-medium">{m.names}</p><p className="text-sm text-muted tabular-nums">{m.itemCount === 1 ? "1 item" : `${m.itemCount} items`} · {m.kcal} kcal</p></div>`; time `<span className="shrink-0 text-sm text-muted tabular-nums">{m.time}</span>`.
  - [ ] `app/pages.test.ts`: add `email: "dean@example.test"` to the `requireUser` mock. New `describe("Today")`: (a) `state.result = { data: [], error: null }`; `await TodayPage()`; `state.calls` contains `["gte", "eaten_on", "2026-10-14"]` and `["lte", "eaten_on", "2026-10-20"]`; (b) `state.result = { data: null, error: { code: "42501" } }` → `TodayPage()` rejects.
  - [ ] `e2e/helpers/meals.ts` + `log-meal.spec.ts`: move the cookie → session parsing out of `userMeals` into `session(page)`; `userMeals` uses it. Line 44: replace `getByText("380 kcal", { exact: true })` with `getByText("2 items · 380 kcal")`.
  - [ ] Rewrite `e2e/today.spec.ts` (keep the `item`, `logMeal` helpers; add `setTargets(page, ["2000","150","200","70"])` from the existing loop). Compute dates in-test: `today = localDate("Asia/Manila")` (import from `../lib/dates`), `label(d)` with the same `Intl` options as `buildWeek`. Tests:
    1. **Empty state (new user):** heading `Today`; text `NutritionTracker`; avatar `getByRole("img", { name: `Signed in as ${email}` })` has text `initials(email)`; group `Last 7 days` has 7 buttons; the last has name `label(today)`, `aria-pressed="true"`, `tabindex="0"`; the other 6 have `aria-pressed="false"`, `tabindex="-1"`; `No meals logged on this day.` visible; link `Snap meal` → `/log`.
    2. **Day switching without refetch:** `setTargets`; `insertMeal(page, addDays(today, -2), [item("Oats", 1900, 4, 30, 2)])`; `logMeal(page, [item("Rice", 72.4, 6.3, 0.4, 4.8)])`. On `/`, today shows the `Rice` row with `1 item · 72 kcal` and a time matching `/^\d{1,2}:\d{2}\s[AP]M$/`. The button named `` `${label(addDays(today, -2))}, goal met` `` exists. Start recording requests (`page.on("request")`) **before** the click; click it → it's `aria-pressed="true"`, today's is `"false"`; `Oats` and `1 item · 1900 kcal` are visible and `Rice` is gone; the highlight's inline `transform` is `translateX(400%)`. Then click the button for `addDays(today, -1)` → `No meals logged on this day.` and `Snap meal` show. Finally assert the recorded requests contain none whose URL pathname is `/` (document or `rsc` header).
    3. **Keyboard / roving tabindex:** focus today's button; `ArrowLeft` → the button for `today - 1` is focused and pressed; `Home` → index 0 focused and pressed; `ArrowLeft` again → still index 0; `End` → index 6; `ArrowRight` → still index 6. After each step exactly one day button has `tabindex="0"` and it is the focused one. `Tab` moves focus out of the group (no day button focused).
    4. **No horizontal scroll at 320×568**, with `logMeal` of `"x".repeat(80)` (the row text wraps and is visible) and after switching days.
    5. **No console errors / hydration warnings:** collect `console` `error` and `pageerror` events across load + two day switches → none.
- **Acceptance criteria:**
  - `AC-5.1` Empty state: a day with no meals shows `No meals logged on this day.` and a `Snap meal` link to `/log` (FC-21). — **Verify:** `npx playwright test e2e/today.spec.ts -g "Empty state"` → pass.
  - `AC-5.2` Today is selected by default; each day is a real `button` with `aria-pressed` and a full-date `aria-label`. — **Verify:** same test.
  - `AC-5.3` Switching days updates the list on the client, with no request to `/`, and the dot/aria-label marks the 90–110 % day. — **Verify:** `-g "Day switching"` → pass. Mutation (FC-26): on a scratch copy, make `onSelect` call `router.push("/?d=…")` → the no-refetch assertion fails.
  - `AC-5.4` Arrow keys, Home and End move selection and focus with a single tab stop. — **Verify:** `-g "Keyboard"` → pass. Mutation: remove `onKeyDown` → fails.
  - `AC-5.5` Meal rows show the tile letter, names joined by `, `, `<n> items · <kcal> kcal` and the local time; exactly one item reads `1 item · <kcal> kcal` (singular; never `1 items`) (OQ2, decided). — **Verify:** test 2 asserts `1 item · 72 kcal` and `1 item · 1900 kcal`; `page.getByText("1 items")` count 0; Task 2's unit fixture (`itemCount` 2 → `2 items`).
  - `AC-5.6` No nested interactive elements; the highlight is `aria-hidden`; focus outlines are inset so `overflow-hidden` doesn't clip them (FC-18). — **Verify:** test 2 asserts `page.locator("button button, a a, a button, button a").count() === 0`. **Inspect:** `week-strip.tsx` has `aria-hidden` on the highlight and `-outline-offset-2` on the buttons.
  - `AC-5.7` Components use tokens only (FC-19). — **Verify:** `grep -nE '#[0-9a-fA-F]{3,8}\b|(bg|text|border|from|to|stroke|outline)-(black|white|gray|slate|zinc|neutral|blue|sky)\b' app/\(app\)/{today-screen,today-days,week-strip,meal-list,tab-bar}.tsx` → no output.
  - `AC-5.8` Shared callers still work (FC-15). — **Verify:** `npm test` (pages tests incl. the new Today range/throw cases) and `npx playwright test e2e/log-meal.spec.ts e2e/history.spec.ts e2e/auth.spec.ts` → pass.
  - `AC-5.9` A refresh keeps the selected calendar day. — **Inspect:** `today-days.tsx` stores a date string and falls back to the last index when it isn't in `days`.
  - `AC-5.10` No hydration warnings, and lint passes without suppressions (FC-16). — **Verify:** test 5 passes; `npm run lint && npm run typecheck` → exit 0; `grep -rn "eslint-disable" app/\(app\)` → none.
  - `AC-5.11` Load failure goes to `error.tsx`, not an empty week. — **Verify:** the new `pages.test.ts` Today case rejects.
  - `AC-5.12` No zod in the client bundle. — **Verify:** `grep -n "@/lib/nutrition" app/\(app\)/{today-days,week-strip,meal-list,tab-bar}.tsx` → none (types come from `@/lib/today`).
  - `AC-5.13` 320 px, no horizontal scroll on `/` (FC-20). — **Verify:** test 4 passes.
  - Design-spec items (S1 header, S2 week strip, S4 meals list), each added to `e2e/today.spec.ts` (the colour checks run in the default light scheme):
  - `D-1.1` `NutritionTracker` above the only `h1` `Today`, computed `font-size` `32px`, `font-weight` `700`. — **Verify:** test 1: `toHaveCSS` on `h1`; `page.locator("h1")` count 1.
  - `AC-5.14` The title stays `Today` whichever day is selected, and no date line is added (OQ3, decided). — **Verify:** test 2: after selecting `today-2`, `page.locator("h1")` has text exactly `Today`, and `page.locator("main").getByText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), /)` count 0 (full dates exist only as button aria-labels).
  - `D-1.2` Avatar `role="img"` named `Signed in as <email>`, text `initials(email)`, no `tabindex`. — **Verify:** test 1.
  - `D-2.1` Seven buttons in group `Last 7 days`, oldest → newest; last is today, `aria-pressed="true"`, `tabindex="0"`, full-date name; others `"false"`/`"-1"`. — **Verify:** test 1.
  - `D-2.2` Exactly one `aria-hidden` highlight; inline `translateX(<index*100>%)`; transition `0.59s` with a `linear(` timing function; `0.2s` under reduced motion. — **Verify:** tests 2 and 9.
  - `D-2.3` Selected day's number renders `rgb(255, 255, 255)`; an unselected day's weekday renders `rgb(92, 99, 112)`. — **Verify:** test 2, after selecting `today-2`.
  - `D-2.4` All seven day buttons are 62 px tall whether or not a dot shows; the goal-met button's name ends `, goal met`. — **Verify:** test 2 (`boundingBox().height === 62`).
  - `D-2.5` Arrows clamp, Home/End jump, always one `tabindex="0"`, Tab leaves the group. — **Verify:** test 3.
  - `D-2.6` Keyboard focus on the selected day shows an inset outline not clipped by `overflow-hidden`. — **Verify:** Tab onto the selected day → computed `outline-style` `solid`, `outline-offset` `-2px`; QA screenshot of the strip at 320×568 with focus on index 6 shows all four sides.
  - `D-2.7` Switching again mid-animation ends on the last choice. — **Verify:** click `today-2` then `today-1` within 100 ms; after 1.2 s `today-1` is pressed, the highlight is `translateX(500%)`, the list shows `today-1`'s state (and, after Task 6, the Protein legend shows `today-1`'s value).
  - `D-2.8` At 320×568 each day button `boundingBox().width >= 40`, no horizontal scroll. — **Verify:** test 4.
  - `D-4.1` Rows: 46×46 tile with the first item's initial, names joined by `, `, `<n> items · <kcal> kcal` (`1 item`), time matching `^\d{1,2}:\d{2}\s[AP]M$`. — **Verify:** test 2 + tile `boundingBox()` 46×46; Task 2 unit fixture.
  - `D-4.2` Rows in `logged_at` order, earliest first. — **Verify:** log `Rice` then `Toast` today → the first `li` contains `Rice`.
  - `D-4.3` Empty day: `No meals logged on this day.` and `Snap meal` → `/log`. — **Verify:** test 1 and the second half of test 2.
  - `D-4.4` Rows enter with `meal-in` at a 60 ms stagger and replay on day change; reduced motion gives `animation-name: none`. — **Verify:** with two meals, the second row's computed `animationDelay === "0.06s"`; test 9 for reduced motion.
  - `D-4.5` An 80-char single-word name wraps; the time stays inside the row's right edge; no horizontal scroll at 320×568. — **Verify:** test 4 + `time.x + time.width <= row.x + row.width`.

### Task 6: MacroRings with legend and count-up  `[judgment]`

- **Files:** create `app/(app)/macro-rings.tsx`; modify `app/(app)/today-days.tsx` (replace the Task 6 slot), `e2e/today.spec.ts` (add tests).
- **Interfaces:** consumes `ringOffset` and types from Task 1, tokens from Task 3. Produces `MacroRings({ totals, targets }: { totals: Totals; targets: Targets | null })`, rendered by `TodayDays` with `totals={day.totals}`.
- **Steps:**
  - [ ] `RINGS = [["Protein", "protein_g", "protein_target_g", 72, "stroke-macro-protein", "bg-macro-protein"], ["Carbs", "carbs_g", "carbs_target_g", 53, "stroke-macro-carbs", "bg-macro-carbs"], ["Fat", "fat_g", "fat_target_g", 34, "stroke-macro-fat", "bg-macro-fat"]] as const`. Values shown are `Math.round(totals[key])`; `kcal = Math.round(totals.calories)`.
  - [ ] Card: `<section className="flex flex-wrap items-center justify-center gap-4 rounded-3xl bg-surface p-5">`.
  - [ ] Rings: `<div role="img" aria-label={summary} className="relative size-40 shrink-0">` → `<svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true" className="-rotate-90">`. Per ring: track `<circle cx="80" cy="80" r={r} fill="none" strokeWidth="15" className={`${stroke} opacity-20`} />`; when `targets` is set, progress `<circle data-ring="progress" cx="80" cy="80" r={r} fill="none" strokeWidth="15" strokeLinecap="round" pathLength={1} strokeDasharray="1" style={{ strokeDashoffset: off }} className={`${stroke} transition-[stroke-dashoffset] duration-[1100ms] ease-fluid motion-reduce:duration-200 ${off === 1 ? "opacity-0" : ""}`} />` with `off = ringOffset(eaten, target)`. Centre overlay (HTML, not rotated): `<div className="absolute inset-0 grid place-content-center text-center"><span className="text-lg font-bold leading-none tabular-nums">{kcal}</span><span className="text-xs leading-none text-muted">kcal</span>` (design-spec D-3.3: `text-2xl` overflows the 53 px hole at 4 digits)`</div>`.
  - [ ] `summary`: with targets `` `${kcal} kcal. Protein ${p} of ${pt} g, Carbs ${c} of ${ct} g, Fat ${f} of ${ft} g` ``; without `` `${kcal} kcal. Protein ${p} g, Carbs ${c} g, Fat ${f} g. No targets set` ``. Final values, never the animated ones.
  - [ ] Legend `<div className="flex min-w-0 flex-1 basis-[120px] flex-col gap-2">`: per macro a row with swatch `<span aria-hidden className={`size-2 rounded-full ${bg}`} />`, label (`text-sm font-medium`), then `<span className="text-[26px] font-semibold leading-none tabular-nums">{useCountUp(value)}</span>` followed by `<span className="text-sm text-muted">/ {target} g</span>` (with targets) or `<span className="text-sm text-muted">g</span>` (without). The number and target are in a `flex flex-wrap items-baseline gap-1` row. Below the three rows: with targets `<p className="text-sm text-muted tabular-nums">{Math.abs(left)} kcal {left >= 0 ? "left" : "over"}</p>` where `left = targets.calorie_target - kcal`; without targets `<Link href="/settings" className="text-sm font-medium underline">Set your daily targets</Link>`.
  - [ ] `useCountUp(value: number, ms = 900): number` (module-local, one hook call per legend row via a small `Legend` row component at module scope — not defined inside another component): `const [shown, setShown] = useState(value); const from = useRef(value);` `useEffect(() => { const start = from.current; if (start === value) return; const dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms; let raf = 0, t0 = -1; const tick = (t: number) => { if (t0 < 0) t0 = t; const p = dur ? Math.min(1, (t - t0) / dur) : 1; const v = start + (value - start) * (1 - (1 - p) ** 3); from.current = v; setShown(v); if (p < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [value, ms]);` Return `Math.round(shown)`. State is only set inside the rAF callback (satisfies `react-hooks/set-state-in-effect`).
  - [ ] Add to `e2e/today.spec.ts`:
    6. **Rings and legend from saved meals** (ports the old totals test): `setTargets`; log Rice (72.4/6.3/0.4/4.8) and Toast (195/4/42/0.4). Assert `getByRole("img", { name: "267 kcal. Protein 10 of 150 g, Carbs 42 of 200 g, Fat 5 of 70 g" })`; texts `1733 kcal left`, `/ 150 g`, `/ 200 g`, `/ 70 g`; three `[data-ring="progress"]` circles; `parseFloat(getComputedStyle(protein).strokeDashoffset)` ≈ `1 - 10.3/150` (±0.01).
    7. **Rounding agrees** (ports the old test): targets 2000; one item 200.5 kcal → img name starts `201 kcal.`; `1799 kcal left`. Over case: seed a 2100-kcal meal today via `insertMeal` with target 2000 → `100 kcal over`.
    8. **No targets:** new user with one logged meal → img name `… No targets set`; `[data-ring="progress"]` count 0; link `Set your daily targets` → `/settings`; no `kcal left`/`kcal over` text.
    9. **Count-up and reduced motion:** targets set; `insertMeal` at `today - 1` with protein 120; today empty. In one `page.evaluate`, click the `today - 1` button and sample the Protein legend number every animation frame for 400 ms. Default motion: at least one sample is strictly between 0 and 120, and after 1 s the text is `120`. With `page.emulateMedia({ reducedMotion: "reduce" })` (fresh page): no sample is strictly between 0 and 120; also `getComputedStyle(progressCircle).transitionDuration === "0.2s"`, and each meal row's `animationName === "none"`. Without reduced motion, the progress circle's `transitionDuration === "1.1s"` and `transitionTimingFunction === "cubic-bezier(0.32, 0.72, 0, 1)"`, and the highlight's `transitionDuration === "0.59s"` with a `linear(` timing function.
    10. **320×568 with large values:** targets `10000/1000/1000/1000` and a meal with an 80-char name → `scrollWidth <= 320`; the legend's bounding box starts below the rings' (wrapped).
- **Acceptance criteria:**
  - `AC-6.1` Rings and legend show the selected day's totals against targets, with `kcal left`/`kcal over` agreeing with the rounded centre number (FC-17). — **Verify:** `npx playwright test e2e/today.spec.ts -g "Rings|Rounding"` → pass.
  - `AC-6.2` No targets: tracks only, and the legend links to `Set your daily targets` (FC-21 empty/“not configured” state). — **Verify:** `-g "No targets"` → pass.
  - `AC-6.3` Ring geometry matches the request. — **Inspect:** `macro-rings.tsx`: `width="160"`, radii `72`, `53`, `34` in that order for Protein/Carbs/Fat, `strokeWidth="15"`, `strokeLinecap="round"`, `pathLength={1}`, `strokeDasharray="1"`, `-rotate-90`, offset from `ringOffset`, and an empty ring is `opacity-0`.
  - `AC-6.4` Accessibility: the rings are `role="img"` with the exact summary; the SVG is `aria-hidden`; no interactive nesting. — **Verify:** test 6/8 names match exactly; the nested-interactive count is 0 on `/`.
  - `AC-6.5` 320 px: no horizontal scroll, legend wraps below (FC-20). — **Verify:** test 10 passes.
  - `AC-6.6` Tokens only (FC-19). — **Verify:** the AC-5.7 grep extended to `macro-rings.tsx` → no output.
  - `AC-6.7` Count-up animates over ~900 ms with rAF, and reduced motion removes the count-up and stagger and shortens the ring to 200 ms; lint passes without suppressions (FC-16). — **Verify:** test 9 passes; `npm run lint` → exit 0.
  - Design-spec items (S3 rings card), each added to `e2e/today.spec.ts` unless noted:
  - `D-3.1` Geometry: 160 px, radii 72/53/34 for Protein/Carbs/Fat in that order, stroke 15, round caps, `pathLength=1`, dasharray 1, offset from `ringOffset`, rotated −90°. — **Inspect:** as AC-6.3; `grep -nE '\b(72|53|34)\b' app/\(app\)/macro-rings.tsx` shows them in that order in `RINGS`.
  - `D-3.2` Each ring, its track and its swatch use the same macro token. — **Verify:** `grep -nE 'macro-(protein|carbs|fat)' app/\(app\)/macro-rings.tsx` shows a `stroke-` and a `bg-` per macro; AC-6.6 grep → no output.
  - `D-3.3` A 4-digit centre total stays inside the inner hole. — **Verify:** seed 2345 kcal today → centre number `boundingBox().width <= 48`, number + unit block `height <= 34`, its centre within ±1 px of the rings box centre.
  - `D-3.4` Legend: label, 26 px number, `/ <target> g`; kcal line agrees with the rounded centre. — **Verify:** tests 6 and 7; `toHaveCSS("font-size", "26px")` on a legend number.
  - `D-3.5` No targets: zero progress circles, numbers + `g`, `Set your daily targets` → `/settings`, no `kcal left`/`over`. — **Verify:** test 8.
  - `D-3.6` Targets set, empty day: every `[data-ring="progress"]` has computed `opacity` `0`, and `2000 kcal left` shows (targets 2000/150/200/70). — **Verify:** new assertion selecting an empty day.
  - `D-3.7` Rings wrapper `role="img"` with the exact summary; an `svg[aria-hidden="true"]` inside it. — **Verify:** tests 6 and 8.
  - `D-3.8` Count-up 900 ms ease-out on day change only; fill 1.1 s `cubic-bezier(0.32, 0.72, 0, 1)`; reduced motion: no count-up, 0.2 s fill. — **Verify:** test 9.
  - `D-3.9` Legend below the rings at 320×568; beside them at 390×844 (legend `y < rings.y + rings.height` and `x >= rings.x + rings.width`). — **Verify:** test 10 + the 390×844 assertion.
  - `AC-6.8` Whole feature green (FC-15, FC-22). — **Verify:** the full gate (Verification commands) → every step exits 0; `find .orchestrate -name '*.test.ts' -o -name '*.spec.ts'` → no output (lesson: probe files).

---

## Open questions for the human

All three **decided: human, 2026-10-20** — the recommended answers were approved.

1. **0 g target with food eaten → empty ring** (a 0 g target is full only when eaten is 0). Covered by AC-1.2.
2. **Single item → `1 item · <kcal> kcal`** (singular). Covered by AC-5.5.
3. **Title stays `Today`; no date line** when another day is selected. The pill and the button labels carry the date. Covered by AC-5.14.

## Deferred

- Align `/log` and `/settings` buttons (`bg-black … dark:bg-white`, Tailwind `gray`/`amber` classes in `app/(app)/settings/targets-form.tsx:43`, `app/(app)/log/meal-logger.tsx:180,214,215,277`) with the new token vocabulary (design-spec Plan gap 3).

## Human-only steps

- none for deploy: no migration, no env var, no dependency. After merge, Vercel redeploys from `main` as before.
