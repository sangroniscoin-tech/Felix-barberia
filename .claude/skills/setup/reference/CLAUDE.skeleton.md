# The three memory files

Written at the end of setup, once the real values exist. Together they are what stops
the next session re-deriving everything from scratch.

Fill every `{{marker}}` with a real value. **Use `{{double braces}}` and never angle
brackets** — GitHub strips anything shaped like an HTML tag, so a placeholder in angle
brackets posts as nothing at all, and this project writes issues and pull requests on
GitHub constantly.

**Only the greenfield path is Vercel + Supabase.** `adopt` writes this file too, for a
project that already exists and runs on whatever it runs on. The structure below stays;
every operational section — the health check, the deploy model, the environment
variables, what the connectors can't do — describes *that* project's real providers, and
the sections that don't apply are deleted rather than left aspirational. `/next` reads
this file instead of hardcoding anything, so a section naming a provider the project
doesn't use is not a harmless leftover: it is an instruction, and it will be followed.

---

## `CLAUDE.md`

Keep `@AGENTS.md` as the literal first line: the Next.js CLI wrote `AGENTS.md`, it
carries the framework's own warning about its current major version, and it must stay
reachable.

````markdown
@AGENTS.md

# CLAUDE.md

Context for working on this repository from Claude Code. Changes are asked for in chat,
opened as a PR and merged to `main`, which is what triggers deployment.

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

## The knowledge graph

`.claude/skills/graphify/` holds the bootstrap. The container is ephemeral, so the tool
is absent at the start of every session; a background Sonnet subagent installs and
refreshes it while the interview runs. It is **not local by default** — always
`extract . --code-only` then `cluster-only . --no-label`. `graphify-out/` is gitignored
and never committed.

## The three places this lives

| | Identifier | How to reach it |
| --- | --- | --- |
| **GitHub** | `{{owner}}/{{repo}}`, default branch `main` | `mcp__github__*` tools |
| **Supabase** | project `{{name}}`, ref **`{{ref}}`**, region `{{region}}`, org `{{org}}` | `mcp__Supabase__*`, passing that `project_id` |
| **Vercel** | project `{{name}}`, id **`{{prj_…}}`**, team **`{{team_…}}`** | `mcp__Vercel__*`, passing `teamId` |

- Production: **https://{{app}}.vercel.app**
- Supabase API: `https://{{ref}}.supabase.co`

{{If the Supabase organization holds unrelated projects, name them here and say to
confirm the ref before applying any migration.}}

## Architecture

```
Browser ──fetch /api/*──► Vercel Lambda ──service_role──► Supabase
(no keys)                 (Next.js)                       (RLS closed)
```

- `components/` — the client. Only `fetch` to same origin; no Supabase SDK, no keys.
- `app/api/**/route.ts` — the backend.
- `lib/supabaseServer.ts` — the only place credentials are read.
- `app/api/health/route.ts` — what mandate zero checks. It queries `app_meta`, which
  holds no domain data so it survives every schema change. Don't repoint it.

Every table has RLS on, **no policies**, and no grants to `anon` or `authenticated`. The
publishable key grants nothing — that is the design, not a bug:

```console
$ curl "https://{{ref}}.supabase.co/rest/v1/app_meta?select=*" -H "apikey: {{publishable-key}}"
{"code":"42501","message":"permission denied for table app_meta"}
```

## Deployment

Vercel's **native Git integration**, connected in the dashboard. No `VERCEL_TOKEN`, no
secret in the repository.

| Event | Result |
| --- | --- |
| PR against `main` | preview deploy + CI check |
| Merge to `main` | production deploy |

The only Action is `.github/workflows/ci.yml` — `format`, `lint`, `build` on every PR and
every push to `main`. It is `/next`'s gate: an agent saying "lint passed" is a promise, a
green check is a fact. It needs no secrets.

## Environment variables

They live **only in Vercel**: project `{{name}}` → Settings → Environment Variables. Not
in the repository, not in GitHub secrets.

| Variable | Source |
| --- | --- |
| `SUPABASE_URL` | `https://{{ref}}.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → `service_role` |

## What the connectors can't do

Ask the user for these. Never report them as impossible and never quietly skip them:
hand over a procedure — where to click, what to paste, how they'll know it worked, and
what you'll do once they confirm. Then wait.

- **Writing environment variables in Vercel.** Readable, not writable.
- **Creating GitHub repositories or secrets.**
- **Reading the Supabase `service_role` key.** Publishable keys only.
- **Connecting the repository to a Vercel project.**

The Vercel connector expires periodically and has to be reauthorized from the claude.ai
connector settings. If its tools fail on authorization, say so rather than declaring
deployment unreachable — `curl` to the health endpoint still works for checking state.

## Outside services this project uses

{{One row per service beyond the core stack — payments, email, storage, analytics. Added
the day the service is, never later.}}

| Service | Reached via | Still a human step |
| --- | --- | --- |
| {{Stripe}} | {{connector / MCP server / dashboard only}} | {{e.g. creating API keys}} |

New services come in agent-reachable or not at all lightly: a Claude connector first, an
MCP server or skill second, dashboard-only as a last resort that turns every future change
into a hand-over procedure. The `next` skill carries the full rule; this table is where
what was decided gets remembered.

## Checking it's all still standing

```bash
curl -s https://{{app}}.vercel.app/api/health     # {"ok":true}
curl -s "https://{{ref}}.supabase.co/rest/v1/app_meta?select=*" \
  -H "apikey: {{publishable-key}}"                # 42501
```

`/api/health` separates "environment variables missing" (`reason: not_configured`) from
"the database isn't answering" (`reason: database_unreachable`).

## Local development

```bash
npm install
cp .env.example .env.local   # and paste the service_role key
npm run dev
```

| Command | What it is |
| --- | --- |
| `npm run format` | `biome format .` — fails on unformatted files; `format:write` fixes |
| `npm run lint` | ESLint, via the config the Next.js CLI generated |
| `npm run build` | `next build` — works without env vars, which proves no credential reached the browser bundle |

Those three are what CI runs. Biome formats, ESLint lints, and they don't overlap —
Biome's linter is off on purpose.

## Schema

```sql
{{the current CREATE TABLE statements}}
```

Schema changes with `mcp__Supabase__apply_migration` on `project_id: {{ref}}`, never
`execute_sql`, so they're recorded as migrations.
````

---

## `ADR.md`

Constraints that bind future work — what an agent would otherwise get wrong. Open it with
its own budget line, because the budget is what forces the pruning:

> **Budget: ~50 lines.** One decision per entry, in two groups: how the app is built, and
> how work reaches production. Delete an entry once the code makes it obvious, or once a
> later one supersedes it — git history is the archive. Adding is coupled to pruning.

These are true of every project built this way, so start with them:

**The application**

- The database is reachable only from the server. The browser holds no credentials and
  talks only to same-origin `/api/*`. RLS is on with no policies and no grants, so the
  publishable key is useless by design. Anything needing direct client access to the
  database breaks this guarantee and needs a rethink, not a workaround.
- That guarantee is enforced by the compiler, not by discipline: no credential carries a
  `NEXT_PUBLIC_` prefix, and `lib/supabaseServer.ts` imports `server-only`, so the build
  fails if a client component imports it.
- The Supabase client is created lazily, so `next build` needs no environment variables —
  which is what lets CI verify the bundle without secrets.
- Environment variables live only in Vercel. Connectors read them; writing them is manual.
- Schema changes ship as Supabase migrations, never ad-hoc SQL.
- `app_meta` exists only so the health check has an anchor that no feature will rename.
- If authentication is ever added it belongs in the `/api` layer — already the single
  chokepoint every request passes through.

**Getting to production**

- Production staying up outranks every other instruction. Checked before a merge and
  again after the deploy; an already-broken production stops the merge. Nothing reverts
  or redeploys automatically — an agent reports and waits.
- CI is the merge gate. An agent's self-report is a promise; a green check is a fact.
- Deployment is Vercel's native Git integration, not an Action: an Action would need a
  token to do what the integration does with no credentials at all.
- `/next` is the default way of working, not a command. Nobody should need to know it
  exists.
- Every PR closes its issue, and the issue's label is its stage. Auto-close doesn't
  always fire, so the issue is verified closed by hand.
- **One issue solves one problem, and one PR closes one issue.** Bundling is what makes a
  change unreviewable, unrevertable, and unreadable as a reason a year later.
- **What the client didn't know to ask for is raised one item per session**, after their
  own request shipped, and always as a separate issue. A list of everything missing gets
  ignored; one sentence gets answered.
- ESLint lints, Biome formats, and they don't overlap. Biome's linter is off.
- The knowledge graph is local-only and never committed: `graphify` falls back to the
  `claude` CLI on `PATH`, so a bare `extract` becomes a nested agent shipping the
  repository off the machine. Always `--code-only` and `--no-label`.
- **The application was scaffolded by the framework's own CLI, bare, and is never pinned to
  a template.** Versions come from `create-next-app@latest` at setup time; upgrades come
  from the framework's own tooling. Not `-e with-supabase`: that starter puts a key in the
  browser under `NEXT_PUBLIC_` and makes RLS policies the guard, which is the inverse of
  the shape above. Nothing in this project's history should be copied forward into a new
  one.
- **The same rule governs what gets added later, and nothing is added before it's asked
  for.** A UI kit arrives the day someone says the app looks plain, via `npx shadcn@latest
  init` — not at setup. Reach for the tool's own installer over a copied snippet every
  time: the installer is current on the day it runs, and a snippet is current on the day it
  was written.

Then add whatever setup actually decided that a future session would otherwise get wrong.

---

## `CONTEXT.md`

What the product means, so a session doesn't infer it from the code. Open it with:

> **Budget: ~30 lines.** One line per fact. A fact belongs here only if the code doesn't
> already say it plainly, or if it's a deliberate absence someone would otherwise "fix"
> by mistake. Same pruning rule as `ADR.md`: adding is coupled to removing.

Two sections: **What this is**, and **Deliberately absent** — the things that were not
forgotten, so nobody fills them in passing.

**If nobody has said what the app is for yet, leave this file empty and say so in it.** A
wrong domain here is worse than an empty one, because the next session believes it.
