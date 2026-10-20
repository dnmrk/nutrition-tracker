# Lessons

## 2026-10-20 — nutrition-mvp

### Mirror SQL CHECK semantics in zod, not just the numbers
- **What happened:** zod accepted a NUL byte and counted name length differently from the SQL CHECK, so the DB rejected "valid" input with a 500. `z.coerce.number()` also turned blank targets into 0.
- **Rule:** when a CHECK trims, counts characters or casts, mirror its exact semantics (NUL, code points, trimming) in the schema. Never coerce form strings without rejecting `""` and whitespace first.
- **Check:** for each CHECK in the migration, a unit test feeds the boundary value plus NUL and blank to the zod schema.

### `.refine` is dropped by `z.toJSONSchema`
- **What happened:** moving name bounds from `.min/.max` into refines removed `minLength`/`maxLength` from the JSON schema sent to the model.
- **Rule:** keep JSON-Schema-expressible bounds (`.min/.max` or `.meta`) alongside any refine on schemas that are also serialised for a model.
- **Check:** a test asserts the generated JSON schema's `maxLength`/`minLength`.

### Never build redirect origins from the Host header
- **What happened:** a dev-only workaround (`lib/origin.ts`) let `Host: evil.com` redirect off-site, and `Host: [` produced a 500.
- **Rule:** emit relative `Location` headers, or use a configured site URL. Never read Host or `request.url`'s host to build one.
- **Check:** curl every redirecting route with `Host: evil.com`, `user@evil.com` and `[`.

### Every failure path inside one error mapping
- **What happened:** the Groq client constructor (missing key) and `completion.choices[0]` on a non-completion 200 sat outside the try, so both became 500s instead of 502s.
- **Rule:** SDK construction and response-shape access belong inside the same try/mapping as the call itself.
- **Check:** tests run with the env var unset, and with a 200 whose body is HTML or `{}`.

### React 19 `<form action>` resets inputs even on failure
- **What happened:** a failed targets save wiped the user's typed values.
- **Rule:** the action returns the submitted raw values, and the inputs use them as `defaultValue`.
- **Check:** an e2e test submits invalid input and asserts the typed values are still there.

### In-flight calls need a timeout and a Cancel
- **What happened:** a hung `/api/analyze` left the user stuck on "Analyzing…" with no way out.
- **Rule:** use an AbortController timeout above the server timeout, plus a visible Cancel, and ignore late responses.
- **Check:** an e2e test against a never-resolving route (with `page.clock` to fast-forward).

### Scope `getByRole("alert")` in Next e2e tests
- **What happened:** Next's `#__next-route-announcer__` also has `role=alert`, so `auth.spec.ts:16` flaked for three tasks before anyone found the cause.
- **Rule:** scope alert locators to `main` or the form.
- **Check:** `grep -rn 'getByRole("alert")' e2e` shows only scoped uses.

### Proxy auth redirects swallow Server Action errors
- **What happened:** the proxy 307'd signed-out Server Action POSTs to /login, so the client never saw the "session expired" contract error.
- **Rule:** let `next-action` requests through the proxy redirect; the actions and layouts call `requireUser`/`getClaims` themselves.
- **Check:** an expired-session save shows the contract message. A signed-out request with a bogus `next-action` renders no data.

### Briefs must carry the plan's verbatim copy and error contracts
- **What happened:** per-task QA passed, but the whole-branch QA found the settings heading, the field labels and the save error copy didn't match the plan. `/settings` also ignored its load error.
- **Rule:** the brief for each UI task includes that screen's exact strings and error contract. Every Server Component destructures `error` and throws to `error.tsx`.
- **Check:** QA greps the plan's copy list per screen, and probes every page with the SELECT grant revoked.

### QA probe files must never land in the repo
- **What happened:** QA left `.orchestrate/probe/*.test.ts`, which vitest and eslint picked up. That broke lint and inflated the test count (52 vs 31, 94 vs 69).
- **Rule:** probes run from stdin or outside the repo. Consider excluding `.orchestrate/` in the vitest and eslint configs.
- **Check:** `git status --porcelain --ignored .orchestrate` after each QA pass.
