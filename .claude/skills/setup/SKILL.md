---
name: setup
description: First-run setup for an empty repository — picks the stack (almost always Next.js on Vercel with Supabase), scaffolds it with the framework's own CLI, wires it to a new database with credentials that never reach the browser, gets it deployed, and verifies it is both live and closed from outside. Assume whoever is here has never written code. Ends by writing the project's CLAUDE.md, ADR.md and CONTEXT.md, after which /next takes over. Use on the first message in a repository that has no application in it yet, and whenever someone asks to set up, scaffold, connect or first deploy a project.
---

# Setup

Take an empty repository to **a live URL the person can open**, then write down what you
learned so `/next` can take over.

```
Step 0  Connectors    they click     Vercel and Supabase, in Claude's settings
Step 1  Stack         you            almost always the default; then scaffold
Step 2  Database      you            new project, one migration
Step 3  Live          they click     import the repo into Vercel
Step 4  The one key   they paste     service_role, into Vercel
Step 5  Verify        you            healthy, and closed from outside
Step 6  Memory        you            CLAUDE.md, ADR.md, CONTEXT.md
```

**Three of those steps are theirs, and no tool of yours can do them.** That is not a
failure; it is the shape of the job. Hand over a procedure and wait.

## How to talk during setup

Assume no technical vocabulary at all. "Repository", "environment variable" and "deploy"
all need saying in other words the first time.

- **Their language, not yours.** Whichever language they write in, answer in it.
- **One step at a time.** Never hand over a list of six things — give one, wait for
  "done", verify it yourself, then give the next. A list gets half-done silently.
- **Click-by-click.** Where to go, what the button says, what to paste, and *what they
  should see* when it worked. Never "configure the environment variables".
- **Verify, don't trust.** When they say a step is done, check it with a tool or a
  `curl` before moving on. Half of all setup failures are a step someone believed they
  had finished.
- **Never ask for the service_role key in chat.** It goes into Vercel, not to you. If
  they paste it here anyway, tell them plainly that it is now exposed and walk them
  through rotating it in Supabase → Settings → API Keys before carrying on.

If they open by saying they're technical, collapse the hand-holding and give them the
whole checklist at once. Nothing else changes.

## Step 0 — The two connectors

Nothing can start until Claude can see Vercel and Supabase.

> In Claude, open **Settings → Connectors**. Find **Vercel** and press Connect, then do
> the same for **Supabase**. Each opens a login page and asks you to allow access — say
> yes. When both show as connected, tell me.

Confirm it yourself with a harmless read on each (list Supabase organizations, list
Vercel projects). If a connector's tools fail on authorization it is not connected — say
so and send them back rather than working around it.

## Step 1 — The stack, then the scaffold

### Choosing it takes one second, and the answer is nearly always the same

**Next.js on Vercel with Supabase.** Don't put this to them as a question — they'd have no
basis to answer, and it is the right call something like 99 times out of 100: frontend and
backend in one deployable unit, a managed Postgres behind it, a deploy path that needs no
credentials, and an ecosystem deep enough that almost any later request has a well-trodden
answer. It also scales far past anything a first project will ask of it.

Read what they want first, then scaffold. Say what you're building on in one sentence, as
a statement, and move.

The remaining 1% is worth recognising, because the rest of this skill assumes the default
and cannot deliver anything else. Speak up **before scaffolding** if:

- It isn't a web app — a native mobile app, a desktop tool, a CLI.
- Data has to live somewhere specific: on-premise, a named cloud, a residency rule.
- The work is long-running, stateful or heavily concurrent — video processing, big
  scheduled jobs, sustained websockets. Serverless functions fit that badly.
- **There's an existing codebase or stack it has to fit into.** That one isn't a stop, it's
  a different door: hand over to the `adopt` skill, which brings a project that already
  runs under this method — health check first, then the gate and the memory files — and
  lays out what could move here without moving anything on its own initiative.
- The data genuinely isn't relational at a scale where that matters.

When one of those is true, say plainly what doesn't fit and what you'd use instead — then
let them decide. **Don't quietly scaffold something the rest of this method can't ship**:
every later step here, from the health check to the deploy, is built on the default.

### Use the framework's own CLI, bare

```bash
npx create-next-app@latest . --typescript --eslint --app --no-tailwind \
  --no-src-dir --import-alias "@/*" --use-npm --yes
```

**Bare, and not a Supabase starter.** `create-next-app -e with-supabase` exists and is
official, but it wires the opposite security model: it puts a Supabase key in the browser
under `NEXT_PUBLIC_` and leans on RLS policies as the guard. This project's whole shape is
that **no key reaches the browser at all** and RLS is closed with no policies. Starting
from that template means ripping out more than you keep, and getting it half-right leaves
a database open to the internet. Third-party all-in-one scaffolders are worse: the ones
that bundle a stack tend to target other hosts entirely, and the small ones are one
maintainer away from abandonment.

**Never write the application from memory, and never copy one from a template.** Both go
stale: the framework moves, and a year-old skeleton quietly ships year-old defaults. The
official CLI is always current, so let it do the work and add only what it can't know.

Three things about that command, all learned the hard way:

- **It refuses to run if `README.md` exists.** A repository created with a README — which
  is GitHub's default — blocks it. Move the file aside first and restore it after. A
  `.claude/` directory does *not* conflict, so skills installed beforehand survive.
- **Its flags drift between versions.** If one is rejected, run
  `npx create-next-app@latest --help` and use what that prints. Don't guess and don't
  pin a version.
- **It writes its own `CLAUDE.md` and `AGENTS.md`.** `CLAUDE.md` is a one-line
  `@AGENTS.md` import, and `AGENTS.md` carries the framework's own warning that this
  major version broke things and its docs live in `node_modules/next/dist/docs/`. **Read
  that warning and believe it** — write route handlers against those docs, not against
  what you remember. Keep the `@AGENTS.md` line at the top of the real `CLAUDE.md` you
  write in Step 6, so the warning survives.

Then four wirings the CLI can't know about:

1. **The credential boundary.** `npm i @supabase/supabase-js server-only`, then copy
   `reference/supabaseServer.ts` to `lib/supabaseServer.ts` **verbatim** — the comment
   at the top of that file explains which three properties are the guarantee and why
   paraphrasing it leaks the key.
2. **The health endpoint.** Copy `reference/health-route.ts` to
   `app/api/health/route.ts`, verbatim. `/next` calls it before every merge and after
   every deploy; its response shape is a contract.
3. **The formatter.** `npm i -D @biomejs/biome && npx biome init`. Turn its **linter
   off** — ESLint already lints, via the config the CLI generated, and two linters
   fighting over the same file wastes everyone's time. Exclude `graphify-out/` from
   Biome's files: it formats `**` and does not read `.gitignore`. Add `format` and
   `format:write` scripts to `package.json`.
4. **The gate.** A workflow at `.github/workflows/ci.yml` that runs `npm ci`, then
   `npm run format`, `npm run lint` and `npm run build`, on pull requests to `main` and
   pushes to `main`. Use the current major versions of `actions/checkout` and
   `actions/setup-node` — check what they are rather than copying a version from
   anywhere. It needs **no secrets**: the build works without environment variables, and
   that is exactly what proves no credential reached the browser bundle.

Add `.env.example` with the two variable names and no values, and `graphify-out/` to
`.gitignore`. Run all three checks locally, fix what they flag, and commit. **They must
pass before you go further** — a red CI at this point poisons every later step.

Leave the CLI's landing page alone. The client's first real request is what replaces it,
and an example feature invented now is just something they have to ask you to delete.

**Don't add a UI kit either.** If they later say the app looks plain, that's when it goes
in — `npx shadcn@latest init`, at that point, for the same reason everything else here
comes from a CLI: it installs what's current the day it runs. Adding it now means shipping
today's version into an app that won't be styled for weeks, and charging the client for a
choice nobody made.

## Step 2 — The database

You can do all of this. Ask only what they'd have an opinion about: what the app is
called, and roughly where its users are.

1. List their organizations. If there's more than one, ask which. If a project for this
   app already exists, use it rather than creating a second.
2. Check the cost first and **say the number out loud** before creating anything. A free
   tier that is already used up turns this into a paid project — their decision, not
   yours.
3. Create the project, in a region near the people who will use the app.
4. Apply this as a **migration**, not as loose SQL, so the schema has a history from day
   one:

```sql
create table public.app_meta (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.app_meta enable row level security;
revoke all on public.app_meta from anon, authenticated;
insert into public.app_meta default values;
```

`app_meta` is the anchor both verification checks aim at, and it holds no domain data, so
it survives every future schema change. **RLS on with no policy is the whole
architecture**: nothing outside the server can read it, and every later table gets the
same treatment.

5. Note the project ref and URL — `CLAUDE.md` needs both.

## Step 3 — Live, but not yet working

Connecting a repository to Vercel is a human step. No connector does it.

> Go to **https://vercel.com/new**. It shows your GitHub repositories — pick this one.
> If it isn't listed, press **Adjust GitHub App Permissions** and give Vercel access.
>
> Leave every setting as it comes and press **Deploy**. About a minute.
>
> You'll get a web address ending in `.vercel.app`. Send it to me.

Confirm it yourself: `curl` `/api/health` and expect
`{"ok":false,"reason":"not_configured"}`. **That failure is the checkpoint** — it means
the code deployed and only the credentials are missing. Anything else means something
different went wrong, and you diagnose that before moving on.

Note the project id and team id while you're there.

From now on Vercel's native Git integration deploys: a pull request gets a preview, a
merge to `main` goes to production. No token, no secret in the repository, and it stays
that way.

## Step 4 — The one key you cannot read

The connector exposes publishable keys only. The `service_role` key — full access to the
database — is deliberately unreadable by any tool you have. They copy it.

> **In Supabase:** open your project → **Settings → API Keys**. Find **`service_role`**,
> press Reveal, and copy it. Treat it like the password to the whole database — don't
> paste it into a chat, not even this one.
>
> **In Vercel:** your project → **Settings → Environment Variables**. Add these two, one
> at a time, leaving all three environments ticked:
>
> | Name | Value |
> | --- | --- |
> | `SUPABASE_URL` | the address I gave you |
> | `SUPABASE_SERVICE_ROLE_KEY` | the key you just copied |
>
> Names must match exactly — no spaces, no quotes around the value.
>
> **Then redeploy.** Environment variables only reach a *new* deploy, so nothing changes
> until you do this: **Deployments** → the **⋯** on the top one → **Redeploy**.

## Step 5 — Verify, both directions

Two checks. Both must pass, and the second is the one people skip.

```bash
# 1. The backend reaches the database
curl -s https://APP.vercel.app/api/health
# expected: {"ok":true}

# 2. The database is still closed from outside
curl -s "https://REF.supabase.co/rest/v1/app_meta?select=*" -H "apikey: PUBLISHABLE_KEY"
# expected: {"code":"42501","message":"permission denied for table app_meta"}
```

The first says the app works. **The second says nobody else can reach the data**, which
is the entire reason the architecture is shaped this way. `42501` is the pass. If that
call returns rows, stop everything and fix it before telling anyone the app is ready —
the database is open to the internet.

Then have them open the URL themselves. That is when setup is actually finished.

If health says `not_configured` after a redeploy, a variable name is wrong or the
redeploy never happened. If it says `database_unreachable`, the key is wrong or the
migration didn't apply. Tell them which of the two — never just "it failed".

## Step 6 — Write the memory

**This is the step that turns a scaffold into a project.** Skip it and every future
session re-derives the setup.

- **`CLAUDE.md`** — build it from `reference/CLAUDE.skeleton.md`, filling every
  `{{marker}}` with a real value. Keep `@AGENTS.md` as its first line.
- **`ADR.md`** and **`CONTEXT.md`** — the skeleton file explains what goes in each and
  the line budget they carry. Don't invent a domain for `CONTEXT.md`: if they haven't
  said what the app is for yet, leave it and let `/next` fill it from the first
  interview.
- **`.claude/settings.json`** — add the two verification commands from Step 5 to the
  `allow` list, now that the real URLs exist. `/next` runs both on every change.

Commit all of it to `main`.

## When it's done

Tell them in two or three plain sentences: the app is live, here is the address, and from
now on they just say what they want it to do — no commands, nothing to learn. Then stop.
Their next message is a normal request and `/next` handles it.

## If something blocks

One blocked step is not a failed setup. Say exactly what is stuck, what you already
verified works, and the one thing a human has to do. Then wait. **Never invent a
workaround that weakens the security shape** — an open database is worse than an
unfinished setup.
