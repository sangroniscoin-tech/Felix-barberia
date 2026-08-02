---
name: gaps
description: Surfaces the one thing the client didn't know to ask for — terms and conditions, a privacy policy, sign-in, backups, rate limiting, payments, file storage, scheduled work. Runs at the end of a delivery, offers exactly one suggestion per session in plain language, and turns an accepted one into its own separate issue. Use after shipping a change, and whenever deciding what someone's app is missing that they haven't mentioned.
---

# Gaps

Someone who doesn't build software knows what they want the app to *do*. They don't know
what every app needs regardless — that it has no terms of use, that anyone with the link
can edit everything, that nothing is backed up. **They can't ask for what they don't know
exists.** Naming it is your job.

Two rules hold this together, and both matter more than the catalogue below:

> **One per session.** At the end, after what they asked for is already shipped.
>
> **Never inside the same issue.** An accepted suggestion becomes its **own** issue, its
> own PR, its own deploy.

## Why one at a time

A list of nine things wrong with their app reads as a bill, and they stop reading. One
sentence at the end of a session that just delivered something reads as looking after
them, and they answer it.

It also protects the thing that makes this work: **every issue solves exactly one
problem.** Bundling "and also add a privacy policy" into the feature they asked for makes
the issue impossible to review, impossible to revert cleanly, and impossible to read back
later as the reason that code exists. Atomic is not a style preference here — it is what
lets `git blame` → commit → PR → issue recover a single intent instead of a mixture.

If they say yes to something big, it still gets its own interview. Don't shortcut Phase 1
because the idea was yours.

## When to raise it

At the very end, after you've told them what shipped. Never before — an unasked-for
warning in the middle of their request steals the moment and reads as an objection.

Skip the nudge entirely when:

- The session didn't ship anything (a question, a failed run, a blocked step).
- Production is unhealthy. Mandate zero owns the conversation until it isn't.
- They already declined the same thing. Once is a suggestion; twice is nagging.
- Nothing on the list genuinely applies yet. Silence beats a manufactured concern.

## Picking which one

Order by **what actually hurts, soonest, given what exists today** — not by the order
below. A suggestion that doesn't apply yet costs you the credibility to make the next one.

Ask yourself: if this app got fifty real users tomorrow, what breaks first, and what would
they be angry about?

### It is already storing other people's data

Highest priority, because the exposure grows every day and can't be undone retroactively.

- **No terms of use.** Nothing says what the app may be used for or what happens when
  someone misuses it.
- **No privacy notice.** It holds information about people with nothing stating what is
  kept, why, or for how long. In the EU and UK this is a legal requirement, not a nicety.
- **No way to delete or export someone's data.** People have a right to ask, and the
  answer has to be possible.
- **Personal data nobody decided to collect.** Free-text fields fill up with phone
  numbers and addresses. Worth naming before it happens.

### Anyone with the link can do anything

- **No sign-in.** Everyone shares one set of data and any visitor can change or delete
  all of it. Fine for a private trial, not once the address is shared.
- **No limit on how fast requests arrive.** One script fills the database overnight.
- **No size or type limits** on whatever gets uploaded or pasted in.

### It can't survive an accident

- **No backups, or no one has ever tested restoring one.** An untested backup is a
  belief, not a backup.
- **The database key has never been rotated**, and it has been pasted into places nobody
  is tracking.
- **No way to see that something broke** except someone reporting it.

### It's about to need machinery it doesn't have

Only raise these when what they've been asking for points at it:

- **Taking money** — mentioned selling, charging, subscriptions.
- **Storing files** — mentioned photos, documents, attachments.
- **Sending email or notifications** — mentioned telling people something happened.
- **Work that happens later or on a schedule** — reminders, reports, imports.
- **Finding things** — the list has grown past what a person can scan.

## How to say it

One sentence naming the consequence, then one question. **In their language, and never in
technical terms** — the point is to inform someone who has no way to evaluate the jargon.

| ❌ | ✅ |
| --- | --- |
| You should add a ToS and a privacy policy for GDPR compliance. | Right now there's nothing on the site saying what people's data is used for — which is something you're legally required to have in Europe. Want me to add it? |
| The API has no rate limiting. | Anyone who wanted to could fill your list with thousands of junk entries in a minute, and there's nothing stopping them. Worth me putting a limit on it? |
| You need auth. | Anyone who has the address can edit and delete everything — there's no "my stuff" versus "your stuff" yet. Do you want people to have to sign in? |
| Consider S3 for object storage. | If you want people uploading photos, that needs somewhere to put them — right now there's nowhere. Should I set that up? |

Say what it costs them in effort, which is usually nothing: they answer yes and it ships
like everything else.

**Never overstate it.** No "urgent", no "critical", no invented deadline. If they say no,
say fine and drop it — it stays in the backlog and they can change their mind.

## What happens to the answer

Either way it gets written down, because the memory of this project is its issues.

**Yes** → interview it properly, then a new issue on the normal path: `ready-for-agent`,
its own spec, its own PR. It is not related to the issue you just shipped and must not
reference it as a parent.

**No** → open the issue anyway, labelled `suggested`, then close it with reason
`not planned`. That is what stops you offering the same thing next month, and it leaves a
record that the decision was theirs.

**Not now** → leave it open on `suggested`. It's the backlog.

`suggested` sits before `ready-for-agent` on the stage ladder and follows the same rule:
exactly one stage label at a time. Before choosing what to raise, **check the tracker for
what already carries it** — open or closed. Re-suggesting something they closed last week
is the fastest way to make them stop reading these.
