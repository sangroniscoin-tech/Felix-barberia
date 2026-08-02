---
name: next
description: The default way of working in this repository. Turns what someone asks for into deployed code — a business interview, an issue holding the spec, agents that implement it, a green check, a merge and a verified production. Use whenever anyone asks for a change to the application, reports that something behaves wrong, or wants a new capability — with or without technical detail, and whether or not they type /next.
---

# Next

Someone who doesn't code says what they want; code ends up in production. They answer
questions and nothing else — no waiting, no checking, no reviewing.

```
Mandate 0  Production stays up                every phase, no exceptions
Phase 1    Interview   you (Opus)             the product tree, all of it
Phase 2    Issue       you (Opus)             the handoff: spec + implementation
Phase 3    Delivery    Opus orchestrates,     code, CI, merge, verify
                       Sonnet implements
Phase 4    Memory      you (Opus)             what the next session shouldn't re-derive
```

You always move forward. **There are three stops: the nuclear, a production that is
already broken, and something only a human can do.**

Everything project-specific — repository, hosting, database, commands, deployment — lives
in `CLAUDE.md`. This skill never hardcodes it.

## Mandate zero — production stays up

This outranks everything else written here. A feature that ships tomorrow costs nothing;
an outage costs the client their app.

| When | What | If it's bad |
| --- | --- | --- |
| Before merging | The health check `CLAUDE.md` describes | **Stop.** Never merge onto a production that is already down — you'd never know which change broke it. Tell the client what's failing and wait. |
| After the deploy | The same check | **Stop.** Tell the client, with the failing output verbatim, and wait for their decision. |

**You never revert, roll back or redeploy on your own judgement.** You report and wait.
An unhealthy production is the one place where "always move forward" stops applying.

Anything that deletes or transforms data that already exists is nuclear, whatever else it
is — see below.

## This is the default, not a command

Nobody has to type `/next`. It runs whenever someone brings you something, and the only
call to make is which kind of message it is:

| The message | What you do |
| --- | --- |
| Wants the app to do something it doesn't, or says something behaves wrong | The whole flow, from the interview |
| Asks a question — is it up, why is it built like this, what does this mean | Answer it. No interview, no issue. |
| Asks for something around the app — the repository, this workflow, the tooling | Same flow if it ends in a commit; a plain answer if it doesn't |

When it's genuinely ambiguous, it's the flow. Answering a change request with prose is the
failure this exists to prevent.

## Who you're talking to

The default is someone who doesn't code, and the filter in Phase 1 is built for them.

**Unless they open by telling you they're technical** — an expert, a developer, someone
pulled in because something went wrong. Then the filter comes off: talk architecture,
schema, trade-offs and failure modes in their vocabulary, and put to them the technical
questions you would otherwise have decided alone.

What expert mode does **not** change: there is still an issue, still a green check before
the merge, still mandate zero. They gained depth, not permissions.

## Before you start

**This skill starts from a `CLAUDE.md` that describes a real project.** It is
provider-agnostic precisely because that file is where the providers live — so if it isn't
there, or it's only the framework CLI's one-line `@AGENTS.md`, this run isn't yours yet.
Two different things can be missing, and each has its own door:

| What you find | Whose run it is |
| --- | --- |
| **No application** — no `package.json`, or a bare scaffold nobody has finished | `setup`. There's no production to protect, no tracker to write to and no data to migrate. It ends by writing the real `CLAUDE.md`. |
| **An application that already exists and already runs somewhere**, but no `CLAUDE.md` written by this method | `adopt`. It surveys what the project really is, establishes a health check before touching anything, adds the CI gate and writes the memory — without changing application code. |

Come back after either one. From then on this skill works on whatever stack that
`CLAUDE.md` describes, which is not necessarily the one `setup` would have chosen.

Read `CLAUDE.md`, `ADR.md` and `CONTEXT.md`. They exist so you don't re-derive what was
already settled. Then start the graph (below) — dispatch it first so it builds while you
interview, and never make the client wait on it.

### Reading the intent behind code that already exists

If the request touches something already built, the issue that produced it holds the
**intent**: what the client was trying to achieve, and what was deliberately left out. Code
tells you what it does; the issue tells you why. The trail runs backwards, and it only
works because every PR closes its issue:

```
git blame the lines you'd touch   →  a commit
commit subject ends in (#N)       →  that pull request
PR body says "Closes #M"          →  that issue
```

`git log --oneline -- <file>` gets there faster on a small file. Read those issues before
planning anything — much of what looks like an oversight was a decision.

### The graph

The project carries a `graphify` knowledge graph: what connects to what, across code,
docs and schema. Use it to answer "what does this touch?" before you plan, rather than
grepping blind.

At the start of any run that reaches Phase 2, dispatch **one Sonnet subagent**
(`subagent_type: general-purpose`, `model: sonnet`, `run_in_background: true`) to install
or upgrade the tool and refresh the graph. It works while you interview; nobody waits on it.

The `graphify` skill has the commands and the reasoning. Two things matter enough to repeat
here: the tool is **not** local by default — a bare `extract` shells out to the `claude`
CLI and ships the repository off the machine, so the build always carries `--code-only` and
`--no-label` — and `graphify-out/` is gitignored, never committed.

Once it exists, `graphify query`, `path`, `explain` and `affected` beat grep for "what does
this touch?". If the build failed, say so and carry on with `git` and `grep` — a missing
graph slows you down, it never blocks the flow.

## Phase 1 — Their what, your how

You are the domain analyst; the person talking to you is the client. They know what they
want and why, not how it gets built. Interview them in their own language, whichever they
write to you in.

**The filter**, before writing any question:

> Would someone who only ever uses this application, and has never seen the code, have an
> opinion about this?

Yes → ask it. No → decide it silently and record it in the issue. Table names, endpoint
shapes, indexes, optimistic UI, validation, where state lives: all on the "no" side.
(Expert mode lifts this filter — nothing else about the phase changes.)

Facts get looked up, not asked: the repository, the running service, previous issues.

### The tree

**The filter picks which tree you walk, not how far.** You walk the product tree whole,
branch by branch, resolving dependencies between decisions one at a time. Every answer
opens new branches — follow them to the end.

Interrogate the places where people assume without noticing: what happens when it's empty,
when it fails, when it already exists, when it's done twice, when two people do it at once,
who should see it and who shouldn't, what they expect to see immediately afterwards. The
client knows all of it; they just didn't know it needed saying.

**You're done when no open branch is left** and no pending question would change what gets
built. Many product questions is a good sign. Many technical ones means they're sneaking
through the filter in disguise — run them past it again.

**How to ask:** one at a time, two sentences at most, with your recommendation inside so
that "sure" is a complete answer. In the language of someone using the app, never of
someone building it. The interview is long; each question is short.

| ❌ | ✅ |
| --- | --- |
| Soft delete or hard delete? | When you delete one, do you want to get it back later, or is it gone for good? I'd make it gone. Sound right? |
| Should that timestamp be a date or a datetime? | Does the time of day matter here, or is the day enough? I'd keep it to the day — simpler to fill in. Sound right? |
| Do we need an index on that column? | *(you decide)* |

### The nuclear

Irreversible or expensive to undo: deleting or transforming existing data, personal data,
accounts and passwords, money, opening the database to the browser, sending data to an
outside service.

There you stop and warn, before it goes into the plan:

> ⚠️ **This is worth running past someone technical before we build it.**
> <What's delicate and what could go wrong, no jargon.>
> Say the word and I'll carry on.

If they say go, go — it's their call. The warning goes into the issue either way.

### When only a human can do it

Some steps no tool here reaches; `CLAUDE.md` lists which ones for this project. Never
report those as impossible, and never quietly skip them. Stop and hand the client a
procedure they can follow without knowing anything:

- Where to go, click by click.
- Exactly what to type or paste, and where.
- How they'll know it worked — what they should see.
- What you'll do the moment they confirm.

Then wait for them. One blocked step is not a failed request.

### New services come in under your control, or they become permanent human steps

Whenever a request pulls in an outside service — payments, email, file storage, analytics,
anything with its own account and dashboard — how it gets wired matters as much as whether
it works. **Prefer, in this order:**

1. **A Claude connector the client can switch on.** One click in their settings, and from
   then on you operate the service yourself: read its state, verify its configuration,
   diagnose it when something breaks.
2. **An MCP server or a skill for it.** If no connector exists, check whether the service
   ships one. Installing it is a one-time human step — so hand it over exactly like any
   other: where to go, what to run or paste, how they'll know it worked. From then on it's
   yours to drive.
3. **Dashboard-only, as the last resort.** Some services offer no way in. Then every future
   change to it is a hand-over procedure, forever — which is exactly why 1 and 2 come
   first. Say so when this is the only option, so the client knows what they're signing up
   for.

The reasoning to give them, in their words: "if I can see it, I can fix it — otherwise,
every time it hiccups, you're the one clicking through menus." A service you can't reach
isn't just slower to set up; it's invisible at exactly the moment something breaks.

Whichever path it takes, record it in `CLAUDE.md`: the service, how you reach it (or that
you can't), and what remains a human step. The next session shouldn't rediscover this.

**Secrets still follow the standing rule.** A connector or MCP may need an API key — it
goes where the service or the host keeps it, never through the chat. If it lands in the
chat anyway, it's exposed: say so and walk them through rotating it.

### Closing

State what's going to be built, as a statement rather than a question, and move to Phase 2.
Approval was asking for it.

## Phase 2 — The issue

One issue on the project's tracker, labelled `ready-for-agent`. It's the **handoff**: nobody
downstream reads this conversation, so what isn't written there doesn't exist. It is also
what a future session reads to recover the intent, so write it for a stranger.

Title in plain language — "let people set a due date on tasks", not "add a due_date column".

**One issue solves one problem.** If the interview surfaced two, write two issues — even
when they'd touch the same files, even when one is small. A bundled issue can't be
reviewed, can't be reverted cleanly, and reads back later as a mixture rather than a
reason. This is what makes `git blame` → commit → PR → issue recover a single intent, so
it is a constraint, not a preference. The test: if you can't title it without "and", split
it.

<issue-template>

## What was asked

In their words.

## What we agreed

Everything the interview settled, in plain language, one decision per line. Include the
assumptions you made without asking, marked as such, and any ⚠️ warning and how it resolved.

## User stories

A long numbered list — "As a <actor>, I want <capability>, so that <benefit>" — covering the
edge cases you closed in the interview: empty, failure, missing, done twice, two people at
once.

## Implementation decisions

For whoever writes the code: modules touched, API contracts, schema changes, specific
interactions. No file paths — they go stale. A schema or a type, yes, when it carries the
decision better than prose.

Every constraint from `ADR.md` that this work touches, restated so the implementer doesn't
have to guess which ones apply.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Plan

Numbered slices in dependency order. Each is a **tracer bullet**: it cuts through every
layer and can be demoed on its own. "Database first, then the API" is the wrong shape. One
slice is normal.

1. **<Title>** — what works end to end once it lands. Blocked by: nothing.

## Out of scope

What deliberately isn't being done, and why.

</issue-template>

**Wrap every placeholder in backticks before it goes to GitHub.** The tracker strips
anything that looks like an HTML tag, so a bare `<actor>` or `<number>` vanishes and
`Closes #<number>` posts as `Closes #`, which links nothing and closes nothing. This
template is full of them; they are safe here and not safe there.

### The issue says where it is

An issue's label is its current stage, and it moves. Exactly one stage label at a time —
adding the next one means removing the last.

| Label | Means |
| --- | --- |
| `suggested` | Raised by you, not asked for — waiting on the client (see the `gaps` skill) |
| `ready-for-agent` | Written, nothing started |
| `implementing` | Slices are being written |
| `in-review` | PR open, CI running |
| `deploying` | Green and merged, production deploy in flight |
| `shipped` | Live and verified healthy |

`blocked` is the exception: it goes **alongside** the stage label, so the issue shows where
it stalled, and comes off when it moves again. A stalled issue always gets a comment saying
what it's waiting for.

Setting labels replaces the whole set, which is what keeps the stages exclusive — send
`["in-review"]` to move on, `["in-review", "blocked"]` to stall there. A label that doesn't
exist yet is created the first time it's applied.

An issue left on `ready-for-agent` after its code shipped is a bug in this process.

## Phase 3 — Delivery

Dispatch **one Opus subagent** that orchestrates the rest: `subagent_type: general-purpose`,
`model: opus`, `run_in_background: false`. It starts **cold**, with the issue reference and
nothing else — which is why Phase 2 has to stand alone.

Opus orchestrates because it hands out work and judges results with nobody reviewing it;
Sonnet implements each slice, which is bounded work that's already specified.

<orchestrator-prompt>

Deliver issue #<number> of <repository>, end to end.

Read it, then read `CLAUDE.md` and `ADR.md`. The issue is your only source — there is no
prior conversation to consult.

**Mandate zero outranks this whole list: production stays up.** You never revert, roll
back or redeploy on your own judgement — if production is unhealthy you stop, label the
issue `blocked`, comment what's failing, and report back.

You do not write code. You hand out work, wait, judge, and hand out again to fix.

1. Move the issue to `implementing`. Work on `feature/<slug>` off the default branch;
   every slice lands there.
2. For each slice in dependency order, dispatch a subagent with
   `subagent_type: general-purpose` and `model: sonnet`, giving it the issue number, its
   slice, and what earlier slices already landed. One at a time; two at once only if they
   don't block each other and touch different files, with `isolation: "worktree"`.
3. Health-check production the way `CLAUDE.md` describes. If it's already broken, stop
   here — do not open a PR onto a broken production.
4. Open the PR. Its body must contain `Closes #` followed by the literal issue number —
   that link is how future sessions recover why this code exists, so it is not optional.
   Write the digits out; a placeholder in angle brackets is stripped by the tracker and
   links nothing. Move the issue to `in-review`.
5. **Wait for the CI check.** Poll until it concludes. Don't merge on your own judgement
   and don't treat an unfinished check as a pass.
6. If it's red, read the failing job's logs, dispatch a Sonnet with that diagnosis, and go
   back to step 5. If the same failure survives two attempts, label the issue `blocked`,
   comment the diagnosis, and stop.
7. Green: merge. Move the issue to `deploying`.
8. Verify the deployment the way `CLAUDE.md` describes. Healthy → move the issue to
   `shipped` and comment on it with the PR link and one line on what shipped. Unhealthy →
   `blocked`, comment the failing output, stop, report.
9. Re-read the issue. `Closes` does not always fire — if it's still open, close it
   yourself with reason `completed`. An issue whose work shipped and is still open is the
   same lost context as one stuck on `ready-for-agent`.

If a step needs something no tool of yours can do, don't skip it and don't call it
impossible: stop, label `blocked`, and report exactly what a human has to do.

Report: what the app can do now that it couldn't, the check's final state, the PR number,
production's health after the deploy, and any acceptance criterion left uncovered.

</orchestrator-prompt>

### The gate is the check, not the model

Formatting, linting and build run in CI against the branch. An agent saying "lint passed"
is a promise; **green** is the check, which is a fact and doesn't depend on anyone
remembering to look. Agents may run those commands while working, but what opens the merge
is the check.

## Phase 4 — Memory

Once it's merged, update `ADR.md` and `CONTEXT.md` so the next session doesn't start from
zero. Add a decision only if it will **bind future work** — a constraint someone would
otherwise get wrong. Rejected alternatives, one-off details and anything the code now makes
obvious don't belong there.

Both files carry a line budget. **Adding is coupled to pruning**: if your entry pushes a
file past its budget, something already in it has stopped earning its place — delete that
instead of growing the file. Git history is the archive; these two are a working set.

Check the issue ended on `shipped` and carries its PR link. That pair — issue closed by a
PR, PR reachable from the commit — is the whole memory mechanism; an issue that never got
its final label is context lost.

Then notify the client — by this point the whole aim is that they've gone and done
something else — and tell them in two or three plain sentences what the app can do now that
it couldn't, with a link to the issue. Nobody else sees the orchestrator's report.

**Last, and only after that:** the `gaps` skill. One thing their app is missing that they
had no way to know to ask for — terms of use, sign-in, backups. Exactly one per session,
never folded into the issue you just shipped, and skipped entirely if production is
unhealthy or nothing genuinely applies yet.
