# ADR.md

> **Budget: ~50 lines.** One decision per entry, in two groups: how the app is built, and
> how work reaches production. Delete an entry once the code makes it obvious, or once a
> later one supersedes it — git history is the archive. Adding is coupled to pruning.

This project was adopted while already live. Most of what follows was never decided by
anyone — it is what is true, plus what changing it would cost. An entry here is not an
endorsement.

**The application**

- The browser holds **no database credentials**. It talks only to same-origin `/api/*`;
  `api/_lib/supabase.js` is the single place the `service_role` key is read, and it runs
  on the server. Never import it from `src/` — a Vite SPA ships everything it reads.
- RLS is on with no policies and no grants to `anon`/`authenticated`. Anything that wants
  the browser to reach Postgres directly breaks this and needs a rethink, not a workaround.
- **The admin panel's password lives only in `ADMIN_PASSWORD` on Vercel.** `api/_lib/
  adminAuth.js` is the single place it is read, like `_lib/supabase.js` for the database
  key. `/api/admin` requires a signed, expiring bearer token on **every** write, checked
  before the body is parsed. The signing key is derived from the password itself, so there
  is no second secret to configure and rotating the password invalidates every open
  session. A missing variable **fails closed** — never open-by-default on half a config.
- **Nothing public carries a person.** `/api/bootstrap` returns busy blocks — day, time,
  duration, barber — and **no id**, because `PATCH /api/appointments` cancels on the id
  alone: a public id is a cancellable booking. Identity is served by exactly two routes,
  `/api/my-appointments` (exact full phone, never a partial match) and `/api/admin-data`
  (the panel's key). Never widen the public payload to "just add the name".
- Writes that a **customer** performs need a public route of their own that does one
  thing. `/api/waitlist` only inserts. Routing a customer action through `/api/admin` is
  what broke joining the waiting list the moment that endpoint grew a lock.
- **A booking for several people is N appointment rows sharing a `group_id`**, back to
  back, inserted in **one multi-row `INSERT`** — that statement is the all-or-nothing, not
  a transaction someone has to remember to open. Inserting them in a loop is what would
  leave half a reservation and somebody at the door believing two were coming. `group_id`
  cancels the whole group, so it is as secret as an appointment id: it never leaves a
  public route. The start times are chained **server-side** from the services' durations,
  for the same reason the duration and the price already were. **How many people are
  allowed depends on who is asking**: 5 with a valid admin pass, 3 without one, decided on
  the server. A missing, expired or invented pass falls to the public limit — the pass
  raises a number and nothing else, and never skips a check.
- Two appointments for one barber cannot overlap: a Postgres exclusion constraint
  enforces it. The old guarantee was a read-then-write check in the browser, which is
  what silently lost a booking when two people reserved in the same second. Never make
  an availability check the guarantee again — it can only be a courtesy on top.
- `slot_holds` keeps a chosen time for 5 minutes while the customer fills the form. It is
  the courtesy the entry above allows, never the guarantee: a lost or failed hold must
  still let the booking through. Its exclusion constraint carries the validity window
  inside it — `tstzrange(created_at, expires_at)` — because `now()` is not immutable and
  cannot go in an index predicate. Expired rows are swept with normal use; no cron.
- **Nothing a customer sees comes from the code.** State starts empty and a `loaded` flag
  says whether `/api/bootstrap` has answered; empty means *not known yet*, never *none*.
  So "no quedan huecos" and "sin citas" cannot render before `loaded`, the booking screen
  does not mount until then — its step count and barber are computed once, at mount — and
  `saveCollection`, which writes a whole collection, refuses to run pre-load or it would
  overwrite the real rows with an empty list. The constants it replaced showed customers
  15 €/10 €/22 € for half a second before the real prices arrived.
- The whole app is one ~2000-line file. Splitting it is a real improvement and also a
  large diff over code with no tests — it needs its own issue, not a drive-by.
- Apps Script survives **only** to send the email notice, and no agent can reach it: any
  change there is a click-by-click procedure for the client.
- The Google Sheet is frozen as the migration's rollback, holding data as of 2026-08-02.
  It was found **in the trash** during the migration; restoring it is the only reason the
  data survived. Never write to it, never delete it, never let it be trashed again.
- Customer data never goes in a recorded migration — migrations travel into backups and
  checkouts. Migrated rows keep `raw_name`, `raw_phone`, `raw_email` and `source`.
- The privacy notice's responsible-party block — name, NIF, domicile, contact email — is
  **public by legal obligation**, not a credential that leaked into `src/`. Leave it there.
  That page also promises the data is deleted a year after the appointment, and **nothing
  deletes it**: Félix does it by hand from his panel. Automating it or rewording the
  promise are the only two honest options; letting it drift is not one.
- `BARBER_EMAIL` carries the shop's address, so **every booking and every cancellation
  sends the customer's name and phone to a Gmail inbox** — a route out of the database
  that the privacy notice has to keep describing. Turning it on or off is that one
  constant; changing what leaves with it is a change to a published legal document too.
  It is a business address, public like the responsible-party block, not a credential.

**Getting to production**

- Production staying up outranks every other instruction. Checked before a merge and
  again after the deploy; an already-broken production stops the merge. Nothing reverts
  or redeploys automatically — an agent reports and waits.
- The health check must reach the database, not just the page: `/api/health` separates
  "environment variables missing" from "Supabase not answering". A failed load shows a red
  banner — but check the data anyway.
- Vercel preview deployments are behind SSO and cannot be curl'd from a session. Ship
  server changes to production before pointing the client at them; that is the only way
  to verify environment variables without the client's browser.
- CI is the merge gate, and it runs `npm run build` only. **Green means it compiles, not
  that it works.** There are no tests, no linter and no formatter to add to it.
- Deployment is Vercel's native Git integration, not an Action: an Action would need a
  token to do what the integration does with no credentials at all. There is no staging —
  whatever is on `main` is what customers get, live about 20 seconds after the merge. A
  merge whose output is byte-identical to an existing preview publishes nothing, which is
  correct, not a fault.
- `/next` is the default way of working, not a command. Nobody should need to know it
  exists.
- Every PR closes its issue, and the issue's label is its stage. Auto-close doesn't
  always fire, so the issue is verified closed by hand.
- **One issue solves one problem, and one PR closes one issue.** Bundling is what makes a
  change unreviewable, unrevertable, and unreadable as a reason a year later.
- **What the client didn't know to ask for is raised one item per session**, after their
  own request shipped, and always as a separate issue. A list of everything missing gets
  ignored; one sentence gets answered.
- The knowledge graph is local-only and never committed: `graphify` falls back to the
  `claude` CLI on `PATH`, so a bare `extract` becomes a nested agent shipping the
  repository off the machine. Always `--code-only` and `--no-label`.
