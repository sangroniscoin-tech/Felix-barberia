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
- **Anything both doors have to agree on lives in `shared/`, once.** `DIAS_MAX_RESERVA` —
  how far ahead you can book — is imported by the day selector in `src/App.jsx` and by the
  validation in `api/appointments.js`; a copy on each side is exactly what let the page
  offer 14 days while the server accepted 2029, and the past too. `franja-horaria.js` is
  the same rule for **where the morning ends**: it is derived from that day's own schedule
  blocks, never a written-in hour, and the public form, the panel and the server all read
  it. Two notions of "afternoon" is how two screens come to disagree about the same
  customer. "Today" is computed in `Europe/Madrid`, not the server's UTC, or between
  midnight and 02:00 the window's last day falls short. A valid admin pass skips the
  booking-window check at both ends, like the group size: the pass moves a number, never
  skips a check.
- **The waiting list is written one row at a time, by id.** It used to be saved like every
  other collection — wipe the table, reinsert what the browser holds — which regenerated
  every `id` and `created_at`. That destroys the only thing the list is ordered by, who
  signed up first, and would erase the franja and the notified mark of everyone else every
  time Félix removed one person. `waitlistEntry` in `api/admin.js` touches the single row;
  the wipe-and-replace path stays only for collections whose rows carry no history, and
  **any new `waitlist` column must be carried through it the same day it is added**.
- The Google Sheet is frozen as the migration's rollback, holding data as of 2026-08-02.
  It was found **in the trash** during the migration; restoring it is the only reason the
  data survived. Never write to it, never delete it, never let it be trashed again.
- Customer data never goes in a recorded migration — migrations travel into backups and
  checkouts. Migrated rows keep `raw_name`, `raw_phone`, `raw_email` and `source`.
- The privacy notice's responsible-party block — name, NIF, domicile, contact email — is
  **public by legal obligation**, not a credential that leaked into `src/`. Leave it there.
- **A `pg_cron` job erases personal data a year after the appointment** — name, phone,
  email and the `raw_*` columns — keeping the row so the takings survive; waitlist entries
  go entirely. It runs in Postgres, not on a request, because a retention deadline cannot
  depend on traffic. It is the only thing here that runs unasked. The published notice
  describes it, so **the code and that page move together**: changing what the sweep keeps
  is editing a legal document. `NOT NULL` on name and phone stands — erased rows hold `''`,
  and `api/` is what actually rejects an empty name on insert.
- Erased appointments have no phone, and **everything that groups by person groups by
  phone** — client lists, both rankings. They must filter those rows out or they collapse
  into one phantom client; they stay in the money and the counts, where they represent
  nobody. Anything new that keys on `phone` inherits this.
- **The published privacy notice still names Gmail as a recipient**, which stopped being
  true with #53: no data leaves for Google at all now. It over-discloses rather than
  under-discloses, so it is not urgent — but it is a legal document describing a route that
  no longer exists, and correcting it is its own issue, never a drive-by edit.
- **The notification takes Félix to the person, and travels without an id.** The push `url`
  carries `?aviso=reserva|cancelada&dia=&hora=` — day and time, which the notice's own text
  already shows on the lock screen; **never the appointment id**, which is a cancellable
  booking to anyone holding it. The destination survives the password screen and is applied
  only once the panel has its appointments, or it would decide "not there" against a list
  that hasn't arrived. The service worker **navigates** an open window before focusing it:
  focusing alone leaves it wherever it was, which is what made the notice a dead end.
  A cancellation's notice also carries **how many people on the waiting list that hueco
  actually fits** — a count, never a name, for the same reason the id is missing. Counting
  can fail without silencing the notice: it falls back to zero and Félix still gets told.
- **Whether Félix is told is decided by the admin pass, on the server.** `tellShop` returns
  early when the request carries a valid one, so his own bookings and cancellations don't
  ring his own phone while a customer's do. The panel therefore has to send the pass on
  **every** write, not only the ones that need permission — it went without it on cancel,
  and that alone was enough to make the app notify him of what he had just done himself.
- **Cancelled appointments are visible one day at a time and nowhere else.**
  `/api/admin-data?canceladas=<day>` serves them in their own array, only for that day, only
  behind the admin key. They never join `appointments`, so they stay out of the agenda, the
  search, the money, the counts and both rankings — that exclusion is what keeps the takings
  honest. Their card is read-only. `cancelled_at` is what breaks the tie between two
  cancellations in the same slot; it is `NULL` for everything cancelled before #54.
- **Money counts what was collected, not what was booked.** A `no_show` appointment is
  worth zero in every money figure, and so is one whose hour has not passed yet — a
  booking for next week is forecast, not takings. The appointment *counts* keep the
  no-shows, because the slot was occupied and could not be resold, and the panel splits
  them into "hechas" and "por venir" **off the same `hasPassed` boundary the money uses**:
  a second notion of "already happened" is what makes two cards on one screen disagree.
  Any new money figure must exclude `noShow` explicitly — the per-appointment price helper
  deliberately does **not** know about it, because the losses figure has to price exactly
  the ones that were not collected.
- **The day's close is the only live record of how money came in** (#79 removed the
  per-appointment buttons). `daily_closes` holds one row per closed day with the card and
  Bizum totals Félix reads off the datáfono; **cash is derived, `total − card − bizum`, and
  is never stored**, because a stored derived figure is how a day stops adding up. The
  day's total is computed **server-side** from that day's passed, uncancelled, non-`no_show`
  appointments — never accepted from the browser — and "today" is `Europe/Madrid`, not the
  server's UTC. If a later `no_show` drops a day's total below what was declared, it reads
  as a close to review with cash pinned at 0, **never negative**. Written only by
  `PUT`/`DELETE /api/cierre`, checking the admin pass before parsing the body; it may never
  join the public `PATCH /api/appointments`, which cancels on the id alone. It leaves only
  through `admin-data`. The annual purge leaves it — the row loses its person, keeps its
  money.
- **`payment_method` is frozen history, and the same day must never be counted twice.** The
  column keeps everything marked before #79 and takes nothing new — `PATCH /api/cobro` was
  reused for prices in #82, so nothing writes it anywhere. A period still composes **day by
  day**: a closed day from its close with the fourth figure at 0, an open day from whatever
  marks it happens to carry — never both for one day, which is where the double count would
  be. `NULL` is now the normal state and is still never folded into cash: it reads as "sin
  cerrar". Never backfill it — assuming a year of takings were cash would be inventing them.
- **What a cita is worth reads `charged_price` → `price` → the service's price today**, and
  that cascade lives in **two places that must never drift**: `apptPrice` in the panel and
  `totalDelDiaCentimos` in `api/cierre.js`. The server's is what a close is validated
  against, so a drift means Félix closing against a total he is not the one reading.
  `charged_price` is what he actually charged (#82 — he cuts long-standing clients a price);
  `price` is the quote frozen at booking and **is never overwritten**, because it is what
  the customer still reads in "mis citas" and the only record of what was promised.
  `myAppointmentOut` must never carry `charged_price`. `NULL` means "charged the normal
  price" and no row was ever backfilled. Written only by `PATCH /api/cobro`, admin pass
  checked before the body is parsed, one appointment at a time even inside a group — a
  discount belongs to one client, unlike the payment mark it replaced.

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
  token to do what the integration does with no credentials at all. **There is no
  staging** — whatever is on `main` is what customers get.
- **`api/` is at 12 functions, which is exactly Vercel Hobby's per-deployment ceiling.**
  `cierre.js` was the twelfth and it deployed; the *next* new route will not. A new
  capability has to go inside an existing function, or the plan has to change — either way
  it is a decision to take before writing the route, not after the deploy fails. The
  backup export is the precedent: it is a branch of the panel's own data route
  (`?copia=1`), not a route of its own, and its shared code lives under `_lib/`, which
  Vercel does not count. That is the shape any new capability has to take from here.
- **The backup is a full server-side dump, and it pages.** It reads every business table
  directly — including the cancelled appointments the panel never receives — so it cannot
  be rebuilt from whatever the browser happened to have loaded. It fetches in 1000-row
  chunks because PostgREST caps a response silently, and a truncated backup looks exactly
  like a complete one. Anything new that dumps or counts rows inherits that. It writes
  nothing but the last-backup stamp, and that stamp is taken from the **server's** clock,
  never from the request.
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
