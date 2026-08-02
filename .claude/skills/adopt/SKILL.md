---
name: adopt
description: Brings a project that already exists and is already live under this method — surveys what it really runs on, establishes a health check before anything is touched, interviews the client about everything pointed at it, lays out what could move to this method's own stack and what should stay, adds a CI gate, and writes the CLAUDE.md, ADR.md and CONTEXT.md that /next reads. It writes documentation and adds CI; it never changes application code. Use on the first message in a repository that has an application but no CLAUDE.md written by this method, and whenever someone asks to take over, inherit, document or bring an existing app under this way of working.
---

# Adopt

Someone already has an app. It has users, it was built by somebody else, and it is running
right now. Bring it under this method **without changing what it does.**

```
Step 0  Survey       you      four axes, read-only — code, data, deploy, secrets
Step 1  The check    you      find or establish the health check, before anything else
Step 2  Interview    them     what the code can't tell you, and what breaks migrations
Step 3  Proposal     them     what could move, in what order, what each buys — they choose
Step 4  The gate     you      CI running this project's own commands
Step 5  Memory       you      CLAUDE.md, ADR.md, CONTEXT.md, from what is actually there
Step 6  Hand over    —        /next, from their next message on
```

**Adoption writes documentation and adds CI. It never changes application code.** Not a
rename, not a tidy-up, not the obvious bug you spotted in Step 0, and not a move they
agreed to in Step 3 — that becomes an issue and ships through `/next` like everything
else. It is the only way anyone can later tell what adoption did apart from what it broke.

**Assume nothing about the stack.** It could be anything: a PHP site on shared hosting, a
Rails app on Heroku, a Django app on a VPS, a static site with a headless CMS, a
spreadsheet with a thin app over it, a pile of serverless functions. This skill works on
all of them because it profiles rather than recognises.

## How to talk during adoption

The default is someone who doesn't code, and everything `setup` says about that holds:
their language, one step at a time, click-by-click, verify rather than trust, and **never
ask for a secret key in chat** — it goes into their host's own settings, and if they paste
it here anyway you tell them plainly it is now exposed and walk them through rotating it.

Two things are different here, and both raise the stakes rather than lowering them:

- **The app is already their livelihood.** In `setup` a mistake costs an afternoon. Here it
  costs them the thing that was working this morning.
- **They may not know how their own app works.** Whoever built it may be long gone, so the
  answers you get are as likely to be wrong as missing. Anything they tell you about the
  infrastructure gets checked against the repository or the provider before you write it
  down as fact.

If they open by saying they're technical, drop the hand-holding. Nothing else relaxes — the
survey, the health check, the gate and the no-code-changes rule all still apply.

## Step 0 — Survey before you touch anything

The survey is **read-only**, which is the only reason it comes before the health check:
nothing you do here can break a running app.

Don't try to recognise the stack. Establish **four axes**, and everything else follows:

| Axis | What you're establishing | Where the answer usually is |
| --- | --- | --- |
| **Where the code runs** | Serverless functions, a long-running process, a container, a box someone rented, or a host that just serves files | A platform manifest at the repository root, a `Dockerfile` or compose file, a process file, a CI job that ships somewhere, or nothing at all — which is itself the answer |
| **Where the data lives** | A relational database, a document store, a spreadsheet, a third-party SaaS reached over its API, files on disk, or several of these at once | A connection string's shape, an ORM's schema or migrations directory, an SDK import, the base URL of an outbound API call |
| **How it gets deployed** | On a push, on a button, or when a person runs a command from their laptop | `.github/workflows/` and its equivalents, a provider's Git integration, a deploy script in `package.json` or a `Makefile`, or the provider dashboard's deployment history |
| **Where the secrets are kept** | A provider's settings, a secrets manager, a `.env` on a server — or committed, which happens | `.env.example` and what it names, the config the code reads at boot, the provider's environment settings, and `git log` over any `.env` path |

Alongside those, read what the repository says about itself: what language and framework
and how old the pinned versions are, whether any CI exists and whether it runs on pull
requests or only after the fact, and `git log` over the last few months — who commits, how
often, and whether anyone still does.

Then tell them what you found, in plain language, before asking them anything. It is often
the first time anyone has described to them what they actually own.

## Step 1 — The health check, before anything else

Mandate zero outranks everything in this skill too, and it bites harder here than anywhere
else in the method: **`setup` cannot break a production, because there isn't one yet. Here
there is, and it isn't yours.**

So before you write a single file:

1. **Find their check.** Plenty of projects already have one — a health or status
   endpoint, an uptime monitor, a provider dashboard with a green light. Use theirs.
2. **If there is none, establish one that needs no code change.** The cheapest honest check
   is a request to a URL a real user opens, asserting the status code *and* one string that
   only appears when the app truly works — something loaded from the data store, not the
   page shell. Ask the client which page proves it: "if this page looks right, is the app
   working?" If everything sits behind a login, find the one public URL that still touches
   the data, or agree what they will look at by hand and when.
3. **Record exactly how to run it** — a command anyone can paste, with the expected output
   written next to it. That pair goes into `CLAUDE.md`, and every later `/next` run depends
   on it being true.
4. **Run it now and read the result out to them.**

**If you cannot verify that production is healthy right now, you cannot safely change
anything.** Say exactly that, say what you tried, and stop. That isn't a failed adoption —
it's the most useful thing anyone has told them about their app in a while.

An adoption that adds CI on top of a production that was already broken leaves nobody able
to say which one did it. It's the same reason `/next` never merges onto a red production,
and it applies before adoption has merged anything at all.

## Step 2 — The interview

The code answers where things are. **It never answers what is pointed at them**, and that
is what breaks migrations. Ask these one at a time, in their language, with your
recommendation inside so "yes" is a complete answer — the same shape `/next` uses.

They will not volunteer any of it. Nobody thinks to mention their email until it stops
arriving.

### What is pointed at it

| What you have to find out | How to ask it |
| --- | --- |
| Where the domain is registered, and where DNS actually resolves today. They are often two different companies, and the login for one is not the login for the other. | Who did you buy the web address from, and do you still have that login? |
| **Whether there is email on that domain.** Moving DNS without carrying the mail records across is how somebody loses their business email on a Tuesday afternoon. Check the domain's mail records yourself; do not rely on the answer. | Do you get email at an address that ends in your website's name? |
| The DNS records' TTL, and whether it has to be lowered days before any cutover. | *(you check it, you don't ask)* |
| Whether certificates renew themselves today, and whether they would on the target. | *(you check it)* |
| Webhooks and integrations calling the current URLs — payments, delivery, a CRM, a form service. Any URL that stops answering is somebody's outage. | Is anything else plugged into it? Payments, a booking system, forms, anything that sends you a notification when something happens? |
| Other clients of the same URLs — a mobile app, another site embedding this one, a partner's script, a bookmark everyone uses. | Does anyone reach this any way other than typing the address? |
| Scheduled work that runs on a timer and has to keep running — nightly imports, reminder emails, reports. | Does anything happen automatically at a certain time, without anyone pressing anything? |
| Whether addresses would change, and therefore what redirects existing links and search results need. | If someone has an old link saved, or finds you on Google, they must still land in the right place — I'll set that up. |

### Who and what is inside it

| What you have to find out | How to ask it |
| --- | --- |
| Whether there are accounts with passwords. Auth is frequently the hardest thing to move, and sometimes it cannot be moved without resetting everyone's password — which is a product decision, not a technical one. | Do people log in? Roughly how many, and would it be a problem if they all had to set a new password once? |
| Where secrets live now, who has seen them, and whether any ever sat in the repository or in a chat. | *(you check the repository; then)* Has anyone else ever had the passwords for this? |
| What backups exist, when one was last restored, and whether anyone has ever tested it. An untested backup is a belief. | If it all vanished tonight, what would we get it back from — and has anyone ever tried? |
| Where the data is allowed to live — a residency rule, a contract with a customer, a regulator. | Is there anything saying your data has to stay in a particular country? |
| What is already published and names the current provider: terms, a privacy notice, a cookie banner. | *(you read the site; then)* These mention the company hosting it, so they'd need a line changing. |

### What it costs, and when it can move

| What you have to find out | How to ask it |
| --- | --- |
| What they pay today, to whom, and on what billing cycle. "Cheaper" is often the only argument that lands — and sometimes the honest answer is that this method costs slightly more. | What are you paying for it at the moment, and to which companies? |
| Whether anyone is using it right now, and when it is quietest. Every cutover needs a window and they are the only one who knows. | When is it deadest — a day of the week, or a time of night? |
| Who else can deploy, and whether anyone has to stay able to. Cutting off the person who has kept it alive for three years is a decision, not a side effect. | Is there anyone else who can change or publish the site today? |
| **What must never break, and what would be worst if it did.** Ask it in exactly those words. Write the answer down verbatim; it becomes an acceptance criterion on every change from here on. | What must never break? And if something did go wrong, what would be the worst thing to lose? |

Same filter as `/next`: if someone who only ever uses the app would have an opinion, ask
it. The framework, the file layout and the deploy mechanics are on the other side of that
filter — you read those, you don't ask. Facts get looked up, not asked.

## Step 3 — The proposal

They came asking to be governed by this method, and this method has a canonical stack —
**Next.js on Vercel with Supabase**, which is why `setup` picks it without asking. So
adoption owes them the path, laid out concretely. Saying nothing because their stack works
is not neutrality; it's withholding the thing they came for.

Two rules hold at once, and neither yields:

> **Nothing moves without the client choosing it.** Adoption never rewrites anything on its
> own initiative.
>
> **The path gets laid out anyway**, in enough detail that they can choose.

### What the proposal contains

One list, ordered by **what it is worth to them** — and where two are worth about the same,
the cheap reversible one goes first. The client cannot tell a five-minute change apart from
a database cutover unless you tell them, and left to themselves they will assume everything
on the list is equally frightening.

For each move: what it is in plain words, what it actually buys them, what it risks, how
long it takes, and **whether it can be undone and how fast**. Then, separately, what you
recommend leaving exactly where it is.

Weigh them honestly, so "reversible" isn't a word you're using loosely:

| Weight | The kind of move it is | Undone in |
| --- | --- | --- |
| Cheap, reversible | Adding the CI gate, a health check, redirects, a staging URL | Minutes — delete a file |
| Moderate | Moving the deploy path onto a Git integration so a merge publishes it | An hour — repoint the old one |
| Expensive | Moving the host: domains, certificates, environment variables, webhooks pointed at the old address, and an outage while DNS catches up | A day, and the old host has to still exist |
| **Nuclear** | Moving the data. `/next` already classifies anything that transforms data that already exists this way, and this is the largest version of it | Only via the source you kept — see `migrate` |

Say it the way they'd say it back to someone else:

| ❌ | ✅ |
| --- | --- |
| Migrate the datastore to Postgres for relational integrity. | Your data would live somewhere you can actually ask questions of — "how many orders came from Madrid last year" — instead of somewhere that gets confused when two people edit at once. |
| Move hosting to Vercel for preview deployments. | Every change would get its own private copy you can look at before it goes live. Right now there's one version, and it's the real one. |
| Their CI is non-standard. | Nothing checks a change before it's published, so a mistake is only visible once your customers see it. |
| We should modernise the stack. | *(not a proposal — delete it)* |

### Be honest when the answer is "leave it"

**A working thing on an unfashionable stack that nobody is overpaying for is not a problem
to solve.** If the survey found no cost they resent, no limit they've hit, no data they
can't get at and no outage they've suffered, say so plainly: the right move is nothing, and
adoption is already complete without it. That answer buys you the credibility to be
believed the day you do recommend a move.

Never move something because you'd have built it differently. That isn't a reason; it's a
preference, and they pay for it.

### What happens to an accepted move

**Each accepted move is its own issue.** A proposal with five moves is five issues, not one
— they ship one at a time, each through `/next`, each with its own interview, its own PR
and its own verified deploy. That is the same atomicity rule as everywhere else, and it is
what makes any of it revertable.

**Moving the data is never part of adoption.** It is the `migrate` skill: a separate
decision, a separate issue, and a separate day, with a freeze window the client agreed to.

## Step 4 — The gate

`/next` merges on a green check rather than on an agent's promise. A project with no check
gives it no gate, so this is the one thing adoption adds that isn't documentation.

1. **Use the project's own commands.** Whatever already exists — package scripts, a
   `Makefile`, the language's own tool config: `test`, `lint`, `typecheck`, `format`,
   `build`. Their names, not the ones this method happens to use elsewhere.
2. **Add a workflow that runs them** on pull requests to the default branch and on pushes
   to it. Nothing more: adoption's CI does not deploy, does not publish and holds no
   secrets. If their build genuinely cannot run without a secret, that's a finding for
   Step 5, not a secret you create in passing.
3. **Prove it red before you trust it green.** A workflow that passes because it ran
   nothing is worse than no workflow — it turns a promise into a false fact. Watch the
   check actually execute the commands.

The workflow lands the way everything lands from now on: a pull request against the default
branch, health check before you merge it and again after. Adoption's first act is a
demonstration of the method it is installing.

**If the project has no format, lint, build or test commands at all, that is a finding you
report — not something you invent silently.** Say what's missing, say what it costs them
(every change from here is checked by an agent's opinion instead of a fact), and offer it
as its own `/next` request afterwards. Dropping a linter config into someone else's
codebase mid-adoption is a code change by another name, and the first run will fail on
hundreds of pre-existing violations that have nothing to do with you.

## Step 5 — Write the memory, from what is actually there

Three files. They are the deliverable — skip them and the next session re-derives the whole
survey, badly.

- **`CLAUDE.md`** — structure from `skills/setup/reference/CLAUDE.skeleton.md`, filled in
  from this project. **Every operational section describes this project's real providers.**
  The skeleton's Vercel and Supabase sections are the greenfield path and nothing more; the
  health check, the deploy model, the environment variables and the "what the connectors
  can't do" list all describe whatever this app truly runs on today. `/next` is
  provider-agnostic on purpose — it reads this file instead of hardcoding anything — so a
  wrong section here becomes a wrong action later.
- **`ADR.md`** — the constraints that bind future work, including the ones nobody chose.
  See below.
- **`CONTEXT.md`** — what the product means and what is deliberately absent, in the
  client's own words from Step 2, starting with what must never break. If they haven't said
  what it's for, leave it empty and say so in it; a wrong domain is worse than a missing
  one, because the next session believes it.

Both carry the line budgets the skeleton describes. They start fuller here than in a
greenfield project — an inherited app has more that isn't obvious from the code — so prune
harder, not less.

Record any proposal they accepted as issues, and any they declined in `CONTEXT.md` under
what is deliberately absent. A move declined once and re-proposed next month is the fastest
way to stop being listened to.

### Record what is, including what is wrong

An ADR entry here is not something you endorse. It is **a constraint that binds the next
session**: what is true today, plus what changing it would cost.

| ❌ | ✅ |
| --- | --- |
| The API key shouldn't be in the browser. | The browser holds the API key today, so every user has it. Changing that needs a server this app doesn't have — a project, not a fix. |
| Move the data into a real database. | Rows get added by hand as well as by the app. Anything assuming the app is the only writer is wrong. |
| Add tests. | There are no tests. CI runs build and lint only, so green means it compiles, not that it works. |
| Automate the deploy. | Deploys happen when someone runs a command on their laptop. Nothing but the provider's dashboard records what is live. |
| Email should be on a proper provider. | The domain's mail records point at the same provider as the site. Any DNS change has to carry them across or the client's email stops. |

**Never document an architecture the project doesn't have.** A `CLAUDE.md` describing the
shape you wish were there is worse than none at all: a later session reads it, believes it,
and plans a change against a system that doesn't exist.

### When their security shape is worse than this method's

You will find keys in the browser, a data store open to the internet, one password four
people share, no row-level security anywhere. Write it down as above — and then **leave it
alone.**

It is a `gaps` item: raised once, later, after something has shipped, as its own issue with
its own interview. Not mid-adoption, for exactly the reason nothing else is — you'd be
rewriting a working app during the one operation whose whole promise is that it changes
nothing.

**One exception, and it is narrow.** A live credential committed to the repository, or
pasted to you in chat, is not a shape — it's an exposure happening right now. Say so the
moment you see it, hand them the rotation procedure for their provider click by click, and
wait. Rotating a key is not a code change, and adoption is the natural moment for it.

## Step 6 — Hand it over

Tell them in plain sentences: what they have, in their words; how you know it's healthy and
how that gets checked from now on; what got added, which is a check on every change and
three files so nobody re-derives this; what they chose to move and what is coming first;
and what changes for them day to day, which is nothing except that they now say what they
want and it gets built.

Then stop. Their next message is an ordinary request and `/next` handles it — on their
stack, because `CLAUDE.md` now says what their stack is.

The first `/next` runs are where everything you deliberately didn't do goes: the moves they
accepted, the bug from Step 0, the missing tests, the key in the browser. One issue each,
in the order that hurts them most.

## If something blocks

One blocked step is not a failed adoption. Say what's stuck, what you already verified
works, and the single thing a human has to do — where to click, what to paste, what they'll
see when it worked, and what you'll do the moment they confirm. Then wait.

**Never work around it by changing the application.** An adoption that stalls waiting on
access is recoverable; an adoption that silently rewrote something to get past a wall is
how a working app becomes an outage nobody can explain.
