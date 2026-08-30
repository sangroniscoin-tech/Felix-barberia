# CLAUDE.md

Context for working on this repository from Claude Code. Changes are asked for in chat,
opened as a PR and merged to `main`, which is what triggers deployment.

This project was **adopted**, not scaffolded by this method. Everything below describes
what it actually runs on today — a React SPA on Vercel, with Vercel Functions in front of
Supabase. It started on a Google Apps Script Web App over a Google Sheet; that was migrated
on 2026-08-02. Nothing here is aspirational: if a section says the app does something, the
app does it.

## Where memory lives

| File | Holds | Read it |
| --- | --- | --- |
| `ADR.md` | Architectural constraints that bind future work | Before changing anything structural |
| `CONTEXT.md` | What the product means, and what is deliberately absent | Before adding a feature |
| Closed issues | The intent behind existing code | `git blame` a line → its commit → its issue |

Both files carry a line budget and are pruned as they grow: adding a decision is coupled
to removing one that stopped earning its place. Git history is the archive.

## Mandate zero: production stays up

Above everything else in this file. Before merging anything, and again after the deploy,
run the health check below. If production is unhealthy — **either time** — stop, say
what's failing, and wait for a decision. Never merge onto a production that is already
down: nobody could then tell which change broke it.

**Never revert, roll back or redeploy on your own judgement.** Report and wait. A feature
that ships tomorrow costs nothing; an outage costs the client their app.

This is a working barbershop's booking system. An outage means customers cannot book and
Félix cannot see who is coming in today.

## How changes get asked for

`/next` is **the default way of working here, not a command anyone types**. Any message
asking the app to do something new, or reporting that it behaves wrong, runs the whole
path: a plain-language interview, an issue holding the spec, agents that implement it, a
green check, a merge, and a verified production. A question is just answered.

**One issue solves one problem.** If you can't title it without "and", it's two issues.

**Don't ask the client to authorise anything.** He has now said it twice, which is the
point: on 2026-08-11, *"no me preguntes tanto para darte autorización de cosas, tú hazlo"*,
and on 2026-08-30, broadening it — *"te doy mis consentimiento y el permiso para todo lo que
quieras ejecutar, para que no me preguntes tanto"*. Having to repeat it three weeks later
means what was written the first time was still too cautious. So: **no permission is asked
to execute anything** — not to delete data, not for changes his customers will see, not for
spending inside what he already pays for. Build it, ship it, verify it, and **tell him what
changed afterwards**, in plain words.

Interviewing him about **what** to build is the job, is not what wore him down, and does not
change. Two things still do not happen without him, and neither of them is asking permission:

- **Mandate zero**, which outranks his instruction and mine. A production that is *already*
  broken stops everything, and nothing is reverted, rolled back or redeployed on an agent's
  judgement. He set that rule himself, and a broad permission to act is not a permission to
  act blind on something already down: he authorised shipping, not deciding alone how to undo
  an outage.
- **Opening accounts or taking on new services** — what starts costing real money or puts a
  third party where there wasn't one. Not a formality: that decision is his and it has a bill.

An issue's label is its stage, exactly one at a time: `suggested` → `ready-for-agent` →
`implementing` → `in-review` → `deploying` → `shipped`, with `blocked` added alongside
whichever stage stalled. Setting labels replaces the whole set, which is what keeps them
exclusive. `suggested` means the `gaps` skill raised it and the client hasn't answered;
a declined one is closed `not planned` so it is never offered twice.

Every PR body says `Closes #` and the literal issue number. That link is this project's
memory: `git blame` a line → the `(#N)` in its commit subject → the PR → the `Closes` →
the issue that explains why. Write real digits; a placeholder in angle brackets is
stripped and links nothing.

**The client does not read code and does not speak English.** Talk in Spanish, in plain
words, one step at a time.

## The knowledge graph

`.claude/skills/graphify/` holds the bootstrap. The container is ephemeral, so the tool
is absent at the start of every session; a background Sonnet subagent installs and
refreshes it while the interview runs. It is **not local by default** — always
`extract . --code-only` then `cluster-only . --no-label`. `graphify-out/` is gitignored
and never committed.

## The three places this lives

| | Identifier | How to reach it |
| --- | --- | --- |
| **GitHub** | `sangroniscoin-tech/Felix-barberia`, **public**, default branch `main` | `mcp__github__*` tools |
| **Vercel** | project `felix-barberia`, id **`prj_GevdvSRTvEI8xW4vmUQKBrFkx7at`**, team **`team_qYwi8BkG4rFi0bjpCfDY6s2D`** | `mcp__Vercel__*`, passing `teamId` |
| **Supabase** | project `sangroniscoin-tech's Project`, ref **`ozosjyulagynyxhnvyxr`**, region `eu-west-1`, org `Félix barbería` | `mcp__Supabase__*`, passing that `project_id` |
| **Google** | one Apps Script Web App, and the **frozen** Sheet that is the migration's rollback | **No connector for Apps Script.** Dashboard only |

- Production: **https://felix-barberia.vercel.app**
- There is **no custom domain**, so there is no registrar, no DNS zone and no mail records
  to carry across. Confirm this is still true before proposing anything that touches DNS.
- Supabase API: `https://ozosjyulagynyxhnvyxr.supabase.co`
- The org holds **two** projects, and only the ref above is this app's. The other —
  `inventario-come-aqui-24-horas`, ref `dwuxqbsdgyhhmsuquvra`, region `eu-west-3` — belongs
  to nothing in this repository and is not referenced anywhere in it. Confirm the ref
  before applying any migration: the connector lists both, and picking the wrong one
  writes to a database nobody is watching.

## Architecture

```
Browser (React SPA)  ──fetch /api/*──►  Vercel Functions  ──service_role──►  Supabase
(no credentials)                        (api/, server-side)                  (RLS on, no policies)
                                             │
                                             └── Web Push ──► Félix's phone
                                                 (day/hour/service only; taps
                                                  through to that person's card)
```

The browser no longer calls Google at all: that leg was removed in #53.

- `api/` — the server. `_lib/supabase.js` is the **only** place credentials are read; it
  never enters the browser bundle. Twelve routes: `bootstrap.js` (everything the app needs
  on load), `appointments.js` (create/cancel), `holds.js` (the 5-minute hold on a chosen
  time), `my-appointments.js` (a phone's own bookings), `waitlist.js`, `push.js`,
  `admin-session.js` (exchanges the pass for a session), `admin.js` (config),
  `admin-data.js` (the panel's own read), `cierre.js` (the day's takings), `cobro.js` (how
  an appointment was paid), `health.js` (mandate zero).
- **`api/` is at twelve functions, which is exactly the Hobby plan's ceiling: a thirteenth
  route does not deploy.** This is why shared server logic lives in `api/_lib/` — that
  directory is bundled into the routes that import it and does not count against that ceiling.
  New server behaviour extends an existing route or goes into `_lib/`; it does not get a
  file of its own in `api/` without moving the plan.
- `shared/` — the handful of rules the server and the browser must not disagree about
  (`plazo-reserva.js`, `franja-horaria.js`, `formato-copia.js`). Imported by both sides, so
  a change here lands in two places at once.
- Every table has RLS **on with no policies** and no grants to `anon`/`authenticated`, so
  the publishable key grants nothing. All access goes through the server.
- **Two appointments can no longer overlap**: an exclusion constraint on `appointments`
  enforces it in Postgres. Don't reintroduce a read-then-write availability check as the
  guarantee — that is the pattern that lost bookings before.
- Validation and sanitising happen **in `api/`**, always, even though the browser also
  validates. The browser's version is a convenience and can be bypassed.
- **Google Sheets is no longer the data store.** The sheet
  (`1p-ew-zrLBYLLoxTS2VOf2O2_dqq1wUCGQ68epznJvn4`) is frozen as the migration's rollback
  and holds data as of 2026-08-02. Do not write to it, do not delete it.

- `src/App.jsx` — **the entire client**, ~5,900 lines: UI, booking rules, admin panel. No
  router.
- `src/main.jsx` — mounts it. That is the whole entrypoint.
- `src/FelixBarberia.jsx` and `src/FelixBarberia.jsx (2).txt` — **dead copies** of an older
  `App.jsx`. Nothing imports them. Do not edit them; do not treat them as a second source
  of truth.
- `apiGet` / `apiSend` in `src/App.jsx` are the only data access, and they only ever talk
  to same-origin `/api/*`. Unlike what they replaced, they do **not** swallow errors.
- Tables (fourteen): `appointments`, `services`, `barbers`, `schedule_ranges`,
  `blocked_days`, `blocked_ranges`, `festivos`, `vacation_ranges`, `waitlist`,
  `slot_holds` (the 5-minute hold), `daily_closes` (the day's card and bizum totals),
  `push_keys` (the VAPID pair), `push_subscriptions` (Félix's devices), `app_meta`. One row
  per thing — the old whole-JSON-blob model, and its last-write-wins data loss, is gone.
- **No image is hotlinked any more**: every photo the live app shows is served from
  `public/`. The only Unsplash URLs left in the repository are inside the two dead
  `FelixBarberia` copies, which nothing imports. Letting Félix upload his own photos still
  needs file storage, not a text column; it is a separate issue.

## Deployment

Vercel's **native Git integration**. No `VERCEL_TOKEN` and no deploy secret in the
repository.

| Event | Result |
| --- | --- |
| PR against `main` | preview deploy + CI check |
| Merge to `main` | production deploy, live in about 20 seconds |

Both confirmed by observation on 2026-08-02. An earlier merge produced no deployment
because its build output was byte-identical to a preview Vercel had already built — it had
nothing to publish, which is the expected behaviour, not a fault.

**The functions run in Dublin (`dub1`), not in Vercel's default `iad1`** — `vercel.json`
pins it, so that the code sits in the same AWS region as the Supabase project (`eu-west-1`).
Confirm it with the middle segment of `x-vercel-id` on any `/api/*` response: `iad1::dub1`
means the request entered at a US edge and the function ran in Dublin, which is correct.
Move the database and the region moves with it. See `ADR.md`.

**Preview deployments are behind Vercel's SSO**, so they cannot be curl'd from a session.
Anything that needs verifying against a real deploy has to go to production — which is why
server changes ship before the client is pointed at them.

There are **three** Actions, and none needs a secret.

`.github/workflows/ci.yml` — `npm install` then `npm run build`, on every PR and every push
to `main`. It is `/next`'s gate: an agent saying "it builds" is a promise, a green check is
a fact.

`.github/workflows/vigilancia.yml` — **the only alarm this project has.** It checks every ten
minutes that the site is still taking bookings and goes red, which is what emails the
repository's owner. **Don't delete it as leftover and don't "fix" its hourly cron by raising
the frequency** — GitHub delays scheduled events by hours, which is why the ten-minute loop
lives *inside* a run and the cron only re-arms it. The file itself carries the full
reasoning, including why the alarm cannot ride on Web Push (the server signs those with keys
that live in Supabase, so the outage to report is the one that prevents reporting it), that
it is free only because this repository is **public**, and that GitHub disables scheduled
workflows after 60 days of inactivity — silently, which is when it is needed most.

`.github/workflows/avisos.yml` — **watches the one breakage nothing else can see**: `avisos`
falling to zero, meaning the site is fine, bookings are still being saved, and Félix's phone
has stopped ringing. It is its own file rather than a step in `vigilancia.yml` for a reason
that file explains at length: GitHub emails when a *run* ends, and vigilancia's run lasts
five hours and is cancelled by its own re-arm, so a failure raised inside it would wait hours
or be swallowed. Hourly is deliberate — a zero costs no bookings, so it can wait — and when
`/api/health` is not answering it exits **green**, because that outage is vigilancia's to
report and two reds for one fault is how alarms stop being read.

**CI proves the app compiles. It does not prove the app works.** There are no tests, no
linter and no formatter in this project — see `ADR.md`.

## Environment variables

They live **only in Vercel**: project `felix-barberia` → Settings → Environment Variables.
Not in the repository, not in GitHub secrets. Set by hand — the connector reads them but
cannot write them.

| Variable | Source |
| --- | --- |
| `SUPABASE_URL` | `https://ozosjyulagynyxhnvyxr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → `service_role` |
| `ADMIN_PASSWORD` | chosen by the client; the admin panel's key |

The first two are read **only** by `api/_lib/supabase.js` and the third **only** by
`api/_lib/adminAuth.js`, both of which run on the server. Never add a credential to `src/`
— a Vite SPA ships everything it reads to the browser.

Still public constants at the top of `src/App.jsx`, because they always were: the WhatsApp
number, the shop address, and the responsible-party block
the privacy notice is legally obliged to publish. **The admin password is not among them**
— it moved to Vercel and is checked server-side in `api/_lib/adminAuth.js`. See `ADR.md`.

## What the connectors can't do

Ask the user for these. Never report them as impossible and never quietly skip them:
hand over a procedure — where to click, what to paste, how they'll know it worked, and
what you'll do once they confirm. Then wait.

- **Anything in Google** — editing the Apps Script, redeploying the Web App, opening the
  Sheet, reading or restoring its version history. There is no connector for it at all.
- **Writing environment variables in Vercel.** Readable, not writable.
- **Creating GitHub repositories or secrets.**

The Vercel connector expires periodically and has to be reauthorized from the claude.ai
connector settings. If its tools fail on authorization, say so rather than declaring
deployment unreachable — `curl` to the site still works for checking state.

## Outside services this project uses

| Service | Reached via | Still a human step |
| --- | --- | --- |
| Supabase (Postgres) | `api/` on the server, and `mcp__Supabase__*` | nothing |
| Web Push (booking + cancellation notices) | `api/_lib/push.js` on the server; the VAPID pair lives in `push_keys`, the devices in `push_subscriptions` | nothing — it is a browser standard, no account and no dashboard. Only Félix pressing "Activar" on his own phone, once |
| Google Apps Script | **nothing calls it any more** (#53). Still deployed, still unreachable by any connector | only if it is ever revived, which nothing needs |
| WhatsApp | `https://wa.me/34610975733` links | the number is a constant in `src/App.jsx` |
| Google Calendar | "add to calendar" links | none |
| Unsplash | **nothing any more.** The service photos came into `public/servicios/` in #119 and the gallery's followed; the browser now fetches every image from this site | none |

New services come in agent-reachable or not at all lightly: a Claude connector first, an
MCP server or skill second, dashboard-only as a last resort that turns every future change
into a hand-over procedure. The `next` skill carries the full rule; this table is where
what was decided gets remembered.

## Checking it's all still standing

Both commands, both times — before the merge and after the deploy. The second one is the
one that matters: the first only proves Vercel served a page.

```bash
# 1. The site is up and is this app
curl -fsS https://felix-barberia.vercel.app/ | grep -q "Félix Barbería" && echo "web OK"

# 2. The server can reach the database — this is the check that can actually fail
curl -fsS https://felix-barberia.vercel.app/api/health   # {"ok":true,"schema_version":"1","avisos":1}

# 3. Real data comes back through the API
curl -fsS https://felix-barberia.vercel.app/api/bootstrap | grep -q "Corte de pelo" && echo "datos OK"
```

Expected: `web OK`, then `{"ok":true,…}`, then `datos OK`. Anything else is a red
production — stop and report.

`/api/health` separates **`not_configured`** (the Vercel environment variables are missing)
from **`database_unreachable`** (Supabase isn't answering). Those need different fixes.

**`avisos` is how many phones are subscribed to the push notices.** It is not an error
count. A `0` there is its own quiet failure: the site would be green, bookings would still
be saved, and nobody would be told a customer had booked — which is exactly the breakage
that shows up nowhere else. One is the number to expect: Félix's phone.

The app no longer silently falls back to sample data — a failed load shows a red banner
telling customers not to book. But check the data anyway: a page that looks fine has never
been proof of anything here.

## Local development

```bash
npm install
npm run dev
```

| Command | What it is |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `vite build` — the only check that exists |
| `npm run preview` | serves the built `dist/` |

`npm run build` is what CI runs. There is no `test`, no `lint` and no `format`.

## Data

Schema changes ship with `mcp__Supabase__apply_migration` on `project_id:
ozosjyulagynyxhnvyxr`, never `execute_sql`, so they are recorded as migrations.

**Never put customer data in a migration.** The 33 rows migrated from Sheets were loaded
with `execute_sql` on purpose: migrations get copied into backups and checkouts, and names
and phone numbers should not travel with them.

Every migrated row keeps `raw_name`, `raw_phone`, `raw_email` and `source` — exactly what
the sheet said before normalising. That is what answers "where did this come from?" later.
`is_sample_data` marks the two fabricated rows that came from the code's demo data; they
are in the table but never served.
