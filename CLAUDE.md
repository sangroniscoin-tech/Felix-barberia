# CLAUDE.md

Context for working on this repository from Claude Code. Changes are asked for in chat,
opened as a PR and merged to `main`, which is what triggers deployment.

This project was **adopted**, not scaffolded by this method. Everything below describes
what it actually runs on today — a React SPA on Vercel with a Google Apps Script Web App
in front of a Google Sheet — not the method's greenfield stack. Nothing here is
aspirational: if a section says the app does something, the app does it.

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
| **Google** | one Apps Script Web App over one Google Sheet, in Félix's own Google account | **No connector, no MCP server.** Dashboard only — every change there is a hand-over procedure |

- Production: **https://felix-barberia.vercel.app**
- There is **no custom domain**, so there is no registrar, no DNS zone and no mail records
  to carry across. Confirm this is still true before proposing anything that touches DNS.
- There is no Supabase project and no other database. Do not add one without an issue.

## Architecture

```
Browser (React SPA, all logic client-side)
   │
   ├── fetch GET  ?key=…            ─┐
   ├── fetch POST {key,value}        ├─► Apps Script Web App ──► Google Sheet
   └── fetch POST {action:"notify"}  ─┘   (public, unauthenticated)   (key/value rows)
                                              │
                                              └──► Gmail, for cancellation notices
```

- `src/App.jsx` — **the entire application**, ~2000 lines: UI, booking rules, admin panel,
  data access. There is no backend of this project's own and no router.
- `src/main.jsx` — mounts it. That is the whole entrypoint.
- `src/FelixBarberia.jsx` and `src/FelixBarberia.jsx (2).txt` — **dead copies** of an older
  `App.jsx`. Nothing imports them. Do not edit them; do not treat them as a second source
  of truth.
- `loadShared` / `saveShared` in `src/App.jsx` are the only data access. The Apps Script
  URL is a constant at the top of the same file.
- Data is stored as **whole JSON blobs under fixed keys** — `felix-appointments`,
  `felix-services`, `felix-barbers`, `felix-schedule`, `felix-blocked-ranges`,
  `felix-blocked-days`, `felix-festivos`, `felix-vacation-ranges`, `felix-portfolio`,
  `felix-waitlist`. A save rewrites the whole blob, so two people saving at once means the
  last one wins and the other's change is gone. Assume that when changing anything that
  writes.
- `window.storage` is referenced as a fallback. It does not exist in a browser and is
  never available in production. Treat it as dead.

## Deployment

Vercel's **native Git integration**. No `VERCEL_TOKEN` and no deploy secret in the
repository.

| Event | Result |
| --- | --- |
| PR against `main` | preview deploy + CI check |
| Merge to `main` | production deploy |

The only Action is `.github/workflows/ci.yml` — `npm install` then `npm run build`, on
every PR and every push to `main`. It is `/next`'s gate: an agent saying "it builds" is a
promise, a green check is a fact. It needs no secrets.

**CI proves the app compiles. It does not prove the app works.** There are no tests, no
linter and no formatter in this project — see `ADR.md`.

## Environment variables

**There are none.** Not in Vercel, not in GitHub, not in a `.env`. Every value the app
needs — the Apps Script URL, the WhatsApp number, the shop address, the admin password —
is a literal constant at the top of `src/App.jsx`, and therefore public.

If a change ever needs a real secret, that secret cannot live in this app as it is built
today: a Vite SPA ships everything it reads to the browser. It needs a server first, which
is a project, not a fix.

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
| Google Apps Script + Google Sheet | plain `fetch` from the browser | everything: editing, redeploying, restoring |
| Gmail (cancellation notices) | `MailApp` inside that same Apps Script | the barber's notification address is `BARBER_EMAIL` in `src/App.jsx`, and is **empty**, so barber-side notices do not send |
| WhatsApp | `https://wa.me/34610975733` links | the number is a constant in `src/App.jsx` |
| Google Calendar | "add to calendar" links | none |
| Unsplash | four hotlinked photos | none — if Unsplash changes them, the gallery changes |

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

# 2. The data store answers with real data — this is the check that can actually fail
API=$(grep -oE 'https://script\.google\.com/macros/s/[^"]+' src/App.jsx | head -1)
curl -fsSL "$API?key=felix-services" | grep -q "Corte de pelo" && echo "datos OK"
```

Expected: `web OK` then `datos OK`. Anything else is a red production — stop and report.

If the second command prints nothing, the site will still load and look normal while
silently falling back to the sample data in `src/App.jsx`. **A page that looks fine is not
proof.** That is exactly why the check reads the data store directly.

Only ever `GET` against that URL when checking health. A `POST` writes to the real
booking data.

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

No schema and no migrations. The Google Sheet holds one row per key, with a JSON string in
the value. Changing the shape of any blob means every already-stored copy is in the old
shape — the app must keep reading both, or the data has to be rewritten deliberately,
which is the `migrate` skill's job and never a side effect of a feature.
