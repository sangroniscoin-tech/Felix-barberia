---
name: migrate
description: Moves data that already exists into a new store without losing a row — a read-only export first, a profile of what the source really contains confirmed with the client in their own words, a load into a copy that is verified before anything points at it, an agreed freeze window, and a cutover that is its own deploy with a health check either side. The source is never deleted, because it is the only rollback there is. Use whenever live data has to move — a spreadsheet, a document store, another database, a SaaS with only an API — and never as a step folded into some other issue.
---

# Migrate

Data that already exists has to end up somewhere else, and **the only acceptable outcome is
that none of it is lost.** Not almost none. A row nobody notices missing is the real
failure mode, because it surfaces six months later as a customer saying their order was
never recorded, by which time nobody can prove anything either way.

```
Step 0  Refuse       you+them   no health check and no rollback answer → don't start
Step 1  Export       you        read-only, to a file, kept
Step 2  Profile      you+them   what the source actually contains, confirmed in their words
Step 3  Load a copy  you        into the destination, with nothing pointing at it
Step 4  Verify       you        counts, spot checks, and deliberately the ugly rows
Step 5  Freeze       them       a window they agreed to, in plain words
Step 6  Cut over     you        its own deploy, health check either side
```

`/next` already calls this nuclear — "deleting or transforming existing data" is on that
list, so the ⚠️ warning fires before it ever reaches a plan. **This skill is the procedure
that warning has been missing.**

**The source is never deleted.** Not after verification passes, not later in the same
session, not when they ask. It is the only rollback that exists; the last section says why
in full.

Nothing here assumes what the source or the destination is. It works the same whether the
data sits in a spreadsheet, a document store, another SQL database, a stack of exported
CSVs, or a SaaS you can only reach through its API.

## Step 0 — Two answers, or you don't start

Both come before anything is read, written or planned. If either is missing, that is the
whole reply: say what's missing, why you won't start without it, and wait.

**1. A health check on whatever reads this data.** You need it twice — before the cutover
and after — and a check invented after the fact proves nothing, because there is no healthy
reading to compare it against. If the app has none, establish one first; Step 1 of the
`adopt` skill says how. Run it now and record the output.

**2. An answer to "what does back-to-normal mean?"** Ask it in exactly those words. Do not
accept "we'd just put it back" — push until you have a sentence with a mechanism and a time
in it:

| ❌ | ✅ |
| --- | --- |
| We'd roll back. | We point the app at the old store again, it takes about ten minutes, and the two hours of orders taken since the cutover would have to be re-entered by hand. |
| The backup would cover it. | *(then: when was one last restored? "never" means this answer doesn't exist yet)* |

**If nobody can say what rollback is, do not begin.** Write both answers down where the
client can see them and where the issue records them. A rollback nobody agreed in advance
is not a rollback; it's an argument during an outage.

## Step 1 — Export first, and read only

**Never point a writer at the source.** No credential that can write, no script that
"tidies up while it reads", no normalising in place. One direction: out.

- **Ask for read-only access**, not full credentials, and **never in chat** — the same rule
  as everywhere here. If the source needs a key, it goes into the host's own settings, and
  if they paste it to you anyway you tell them it is now exposed and walk them through
  rotating it.
- **Export to a file, name it with the date and time, and keep it.** It stays out of the
  repository — it is the client's data, not the project's.
- **The export is the artefact.** Every step below reads it, not the source. That is what
  makes the rest of this safe: whatever goes wrong later, the source is untouched and the
  file still says exactly what was there at that moment.

When only they can produce it, hand over a procedure and wait:

> Open it, find **Export** or **Download**, and choose the plain-text option — CSV or JSON,
> not the program's own format. Do it for every tab, table or list, one at a time, and send
> me the files. Don't change anything while you're doing it.

**If the source has no bulk export** — a SaaS with only an API — then the export is a
read-only script that pages through it: rate-limited, checkpointed so it can resume, and
writing every page to disk as it goes. Run it, keep the output, and treat it exactly like a
downloaded file from there on. Count what it fetched and compare against whatever total the
provider's own interface shows, before you trust it.

## Step 2 — The source has no schema. It has a convention somebody broke.

The destination has types. The source has whatever people typed under deadline, and the gap
between those two is where data quietly disappears. **This is true even of a source that
looks typed** — a `status` column of free text holds six spellings of the same state, and a
column nobody has ever seen null has forty nulls from 2019.

Profile before you design anything. These show up in almost every source:

| What you'll find | What it costs to miss |
| --- | --- |
| Dates stored as text, in more than one format, some of them ambiguous — `03/04` is two different days depending on who typed it | Rows land in the wrong year and nobody notices until a report is wrong |
| A code whose leading zero was eaten by something that decided it was a number — `01` became `1`, `007` became `7` | Identifiers stop matching anything outside the system |
| Empty meaning "nobody filled it in" and empty meaning "no", in the same column | Every one of them becomes the same null and the distinction is gone forever |
| Numbers wearing a currency symbol, a thousands separator, or a trailing space | The column refuses to load, or worse, loads as text |
| Two records that are the same thing entered twice, slightly differently | Deduplicate wrongly and you delete a real row; don't and you double a customer |
| Text that is longer, stranger or older than anyone believes — accents, emoji, apostrophes in names, right-to-left script | Truncation and encoding damage, found later by the person whose name it was |
| Free text that turned out to hold personal data nobody decided to collect | It moves into the new store and inherits every obligation attached to it |

And then the ones specific to the kind of source in front of you:

| Kind of source | What it does to the data |
| --- | --- |
| **An untyped spreadsheet** | Duplicate or renamed headers; headers that are actually the first row of data; merged cells leaving rows blank; several tabs that were the same shape once and have drifted apart; rows people used as notes — a total at the bottom, a blank separator, "ask Marta about this one" written in the name column |
| **A document store** | Documents of the same kind with different fields; a field that is a string in old records and an object in new ones; nesting that has no shape in a table; arrays that were meant to be one row each |
| **Another SQL database** | Conventions the schema never enforced — statuses spelled several ways, a nullable column that means something different when null, foreign keys maintained by hand and therefore sometimes broken, soft-deleted rows that must not come across as live |
| **A pile of CSVs** | Different delimiters, encodings and column orders between files, headers present in some and not others, and one file that is a different export of the same data |
| **An API-only SaaS** | Fields the API returns and the interface doesn't, pagination that shifts under you while you read, computed fields with no source of truth, and rate limits that make a re-run expensive |

### Confirm every inferred type with the client, in their language

You are not asking them to pick a type. You are **showing them the exceptions** and letting
them tell you what those mean — one column at a time, never a list of six.

| ❌ | ✅ |
| --- | --- |
| Should `created` be a timestamp or a date? | This column has 412 dates and 3 things that aren't dates. Want to see those 3? |
| There are nulls in `email`. | 18 people have no email address here. Is that normal, or did something go wrong? |
| I'll cast `code` to text to preserve leading zeros. | Some of these codes start with a zero, like `007`. Is the zero part of the code, or just how it got typed? |
| The status column isn't normalised. | "Paid", "PAID" and "paid ✓" all appear. Are those the same thing, or did they mean something different to whoever wrote them? |
| Deduplicating on name and email. | These two look like the same customer entered twice. Same person, or two people with the same name? |

**Their answer decides it, not your inference.** Every type you guess is a silent
transformation of their data, and silent is the word that matters — a wrong guess doesn't
fail, it succeeds quietly and wrongly.

Anything that can't be resolved gets **loaded as text and flagged**, not dropped. A row you
couldn't parse is still their data.

## Step 3 — Load into a copy

Load into the destination in its real shape, with **nothing pointing at it**. No app reads
it, no traffic reaches it, and if the whole thing is wrong you drop it and start again with
no consequence.

- **Schema changes ship the way `CLAUDE.md` says** for this project — as recorded
  migrations, not as loose statements typed once and forgotten.
- **Make the load re-runnable.** You will run it more than once; a load that only works on
  an empty table forces you to reason about half-finished state at the worst moment.
- **Keep the provenance.** Every loaded row records where it came from — which file, which
  tab, which line, which source id. It costs one column and it is what answers "where did
  this come from?" in March, when somebody disputes a number.
- **Don't improve anything on the way in.** Cleaning and migrating at once means a
  discrepancy has two possible causes and you can't tell which. Move it as it is; clean it
  afterwards, as its own `/next` request.

## Step 4 — Verify before anything points at it

**Counts first.** Rows in the export, rows loaded, rows rejected — the three must add up,
per file and per table. If they don't, do not reconcile by adjusting the count. Find the
rows.

**Then spot-check end to end**, in the real app rather than in the database: pick a record,
follow it from the source file through the new store to the screen a user looks at.

**Then go looking for the ugly ones deliberately.** This is the step people skip, and it is
the one that finds things:

- the longest value in every text column, and the shortest
- the empty ones, and anything that was empty in the source but isn't now
- anything non-ASCII — accents, emoji, apostrophes, a script that reads right to left
- the oldest row and the newest
- the largest number, the smallest, and anything negative or zero
- every row you flagged as unparseable in Step 2
- the rows the client themselves called odd

**Then have the client check a handful they choose.** Not five you picked — five they know:
"pick a few customers you know well and tell me whether these look right." They will spot in
ten seconds something no count would ever have shown.

Verification happens **before** anything points at the copy. A defect found now costs a
`DROP` and an afternoon; the same defect found after cutover costs an outage.

## Step 5 — The freeze window

Between the export and the cutover, anything written to the source is a row that will not
be in the destination. So the writing stops for a while, and **the client agrees the window
in plain terms with times in it** — not "briefly", not "during the migration".

> Between **6pm and 8pm on Thursday**, please don't add or change anything in the old
> system. Everyone who uses it needs to know, not just you. I'll tell you the moment it's
> done, and after that you carry on exactly as before — the app will just be reading from
> the new place.

Their answer to "when is it quietest?" is what picks the window. Ask who else writes to it;
the answer is almost always more people than the first answer suggested.

**If a freeze is genuinely impossible** — orders arriving through the night, a team across
four time zones — then the alternative is **dual-writing**: the app writes to both stores
for a period, you reconcile the difference, and only then does the old one stop being
written. Offer it honestly as what it is:

- a **significantly larger job** than the migration itself, with its own issue and its own
  interview
- every write path has to be found and doubled, including the ones nobody remembers
- the two stores will disagree, so reconciliation is part of the work, not a formality
- it ends with a cutover anyway — it buys a smaller window, not no window

**Never let dual-writing happen by default** because no window could be agreed. It is a
decision the client makes with the cost in front of them, or it isn't happening.

## Step 6 — Cut over as its own deploy

The change that repoints the app at the new store is **its own pull request and its own
deploy**, containing nothing else. Not bundled with a feature, not merged alongside the
load, not "while we're in there".

1. Health check **before** the merge. Unhealthy → stop, and mandate zero owns the rest of
   the conversation.
2. Merge and deploy, inside the agreed window.
3. Health check **after**. Then read a real record end to end in the live app, and tell the
   client which page to look at themselves.
4. Watch it for the rest of the window rather than declaring victory at minute two. Writes
   are the interesting half and they arrive after the reads.

If the check fails afterwards, mandate zero holds exactly as always: **you report and you
wait — you do not roll back on your own judgement.** The difference here is that the
rollback was written down and agreed in Step 0, so you put that sentence in front of them
and they say the word. That is why Step 0 refuses to start without it.

## Never delete the source

Not after verification passes. Not a week later. Not when they ask you to in this same
session — and they will, because two systems holding the same data is confusing and the old
one now looks like clutter.

**It is the only rollback that exists.** Every other safety net in this procedure is
temporary: the freeze window ends, the health check only reports the present, and the
verification only covered what you thought to look at. The untouched source is the one
thing that can still answer "what did this actually say before we moved it?" — and that
question gets asked months later, by someone who has found a number they don't believe.

Instead:

- rename it so it reads as an archive and nobody edits it by habit
- remove everyone's write access, keeping read
- tell the client, in one sentence, why it is staying and what it is for

If they insist on deleting it anyway, it's their data and their call — but it doesn't happen
in this session and it doesn't happen by your hand. Tell them plainly that the migration's
rollback disappears with it, and let them do it deliberately, later, themselves.

## One migration is one issue

Three sources that can move independently are **three issues**, three PRs, three cutovers
and three freeze windows. Even when they'd touch the same files. Even when one is small.

This is the same atomicity rule as everywhere else and it earns its keep hardest here: a
bundled migration cannot be verified per source, cannot be cut over per source, and cannot
be rolled back per source — one bad column in one table and the whole thing is stuck
half-done, which is the single worst state for live data to be in.

A migration is also never a step inside a feature issue. "Move the customers into the
database and add a search box" is two issues, and the search box is the easy one.

The test is the same: if you can't title it without "and", split it.
