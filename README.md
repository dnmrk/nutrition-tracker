# NutritionTracker

Photo-based meal and macro tracker. Next.js 16 (App Router), Supabase (auth and Postgres), Groq for meal photo analysis.

## Local development

Prerequisites: Node 22.12+ and Docker (for the local Supabase stack).

One-time, install the Playwright browser:

```bash
npm install
npx playwright install chromium
```

Full local gate, in order:

```bash
npm run db:start && npx supabase db reset && npm run db:test
npm run env:local
npm run lint && npm run typecheck && npm test && npm run build
npm run e2e
```

`npm run env:local` writes `.env.local` from the running local Supabase stack. `GROQ_API_KEY` is server-only and is not needed for any test. Never add a Supabase service-role or secret key.
