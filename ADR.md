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
- **A failed load is a third state, never a loaded one**, and this binds the panel as much
  as the public side. Its flag rises only on success — it used to rise in a `finally`, which
  turned every failure back into *none*: that is what made a full day read "Sin citas este
  día.", a real cita read "no se ha encontrado" from a push notice, and a taken hueco look
  free (#87). Anything reading citas has three states — loading, loaded, failed — and only
  the middle one may render a figure, a list or a zero; the other two are the skeleton and
  the red banner. A caducated session (`401`/`503`) is none of the three: it is the password
  screen, so it is never retried and never becomes an error. And a refresh that fails *after*
  a write that succeeded is reported as a failed refresh, never as a failed write.
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
- **Nothing this app loads reaches a third party, and the privacy notice now says so.** The
  browser's only automatic connections are to its own origin and, through `api/`, to
  Supabase. That took two corrections in opposite directions on 2026-08-12: the notice named
  a Gmail that #53 had already made false, while the real leak — an `@import` fetching the
  typefaces from Google on every visit, handing over each visitor's IP — was the one thing it
  did not mention. So the fonts are **self-hosted from `public/fonts/`** (#111) and the notice
  lists Supabase and Vercel only (#113). Both halves are load-bearing: re-adding a CDN font,
  an analytics snippet or any remote asset silently makes a published legal document false,
  which is why **the code and that page move together** and neither is a drive-by edit. The
  `@font-face` rules are Google's own, copied with the URL swapped — "simplifying" them
  changes how the site looks. Maps and Calendar links stay out of the notice: they open only
  when a customer taps them, which is their visit to Google, not a disclosure by the shop.
  The fonts were not the last leak: the **service photos were still `<img>`s on Unsplash**
  for four days after, found only because a customer-facing bug led to them (#119). They now
  live in `public/servicios/`; **the gallery's four are the only remote assets left**.
- **A service's photo is a property of the whole list, not of the service.** `repartirFotos`
  hands out each photo once and renders no `<img>` at all past the end of the pool. It
  replaced a per-service hash of the id, which cannot see what the others took and so put one
  photo on two services — twice, since the first fix only widened the pool. **Never choose
  per-service again**: any hash over a finite pool collides, invisibly, until a customer sees
  it. Growing the list means adding files, never weakening the guarantee.
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
- **El único reintento que existe aquí es el del reloj desajustado, y es así de estrecho a
  propósito.** El `fetch` que `api/_lib/supabase.js` le pasa a `createClient` repite una
  llamada **sólo** cuando el cuerpo de la respuesta trae la marca de que Supabase rechazó la
  credencial por haberse emitido en el futuro / no ser válida todavía — el rechazo ocurre en
  su puerta, antes de que la sentencia llegue a Postgres, así que no se escribió nada y
  repetirla es seguro. **Nunca por "cualquier 401", ni "cualquier 5xx", ni un fallo de red:
  un reintento amplio sobre una escritura duplica una cita.** Convertirlo en genérico es
  reintroducir la doble reserva. Se mira sobre `res.clone()` para no dejar sin cuerpo a quien
  llamó; como mucho 2 intentos extra con esperas de 300 ms y 1 s; cada uno deja un
  `console.warn`, porque una llamada que se salva al segundo intento no pasa por `fail()` y
  sin esa línea el tropiezo es invisible. Agotados los intentos **no cambia nada**: el mismo
  error sube a `fail()`, que contesta exactamente lo mismo que hoy. Vive en el único sitio
  donde se crea el cliente, así que las trece rutas lo heredan sin tocar ningún `handler()`.

**Getting to production**

- Production staying up outranks every other instruction. Checked before a merge and
  again after the deploy; an already-broken production stops the merge. Nothing reverts
  or redeploys automatically — an agent reports and waits.
- The health check must reach the database, not just the page: `/api/health` separates
  "environment variables missing" from "Supabase not answering". A failed load shows a red
  banner — but check the data anyway.
- **The watch lives outside the thing it watches, and that is not a preference.** The alert
  cannot ride the Web Push that already rings Félix's phone: `sendPush` signs with the VAPID
  pair in `push_keys` and reads its devices from `push_subscriptions`, both in Supabase — so
  in the outage that matters the notice is exactly what the outage prevents. That is why
  `vigilancia.yml` runs on GitHub Actions, the only piece that does not share fate with the
  app. It may never move into `api/` (12 functions, the Hobby ceiling), may never join
  `ci.yml` (the merge gate must go red for one reason only), and **may never act** — no
  revert, no redeploy, no retry, per mandate zero. It probes with a *past* date so the
  booking route is exercised without writing a row, and demands the plazo's own
  `"field":"dateKey"`: name, phone and email validate first, so reaching that rejection is
  what proves the route ran end to end. One failure never alerts — it retries after 60s, and
  only a second failure goes red, or the alert stops being read.
- **The watch keeps its own clock, because GitHub's `cron` is not one.** Asked for `*/10` it
  fired every 2–3 hours (measured over its first 8 runs), and no smaller number fixes that —
  scheduled events are delayed and dropped under load. So one run now probes, sleeps ten
  minutes and probes again for a five-hour shift, and the `cron` **changed job**: hourly, it
  only *rearms* the watcher, landing well inside that window even when delayed. Three things
  hold it up and none is cosmetic. `concurrency` with `cancel-in-progress` keeps exactly one
  watcher alive, or every `cron` tick would add another. The loop ends **by clock, not by
  counting laps** — a probe can take ~80s when its curls time out, and a run that overruns
  `timeout-minutes` goes red exactly like a real outage. And **what ended the loop is carried
  in a flag, never inferred from the time on the way out**: a failure on the last lap leaves
  the clock already past the shift's end, which reading the hour would report as a quiet
  shift — the watch going silent precisely when it has something to say. On a real failure it
  alerts and **stops**: the alert *is* the email GitHub sends when the run concludes, so
  staying in the loop would delay it by hours; the next hourly rearm means a still-broken site
  keeps producing one every few hours. It is free only because the repository is **public**
  (unlimited standard-runner minutes); going private makes this burn quota and needs a
  rethink. Two limits remain: if the runner dies nobody watches until the rearm, and GitHub
  **disables scheduled workflows after 60 days without repository activity**, so a parked
  project loses its watch silently.
- **`fail()` logs every `api/` error and its response is frozen.** A 500 that only reaches
  the browser is gone the moment the tab closes — that is why the 2026-08-10 one could never
  be diagnosed (#88). It logs route, status, reason, message and stack; the route is taken
  from `res.req` so no caller changes, and only the path, never the query. Its **status,
  `reason` and `message` may not move**: five places check `401`/`503` to bounce to the
  password screen, `message` is shown verbatim to customers in the red banner, and
  `slot_taken`/`slot_held` are told apart by that string. And `fail()` is **not** the only
  source of that shape — `admin-session.js`, `adminAuth.js` and `health.js` each hand-roll
  it, with health saying `database_unreachable` where `fail()` says `database_error`.
  Changing one changes nothing in the others; nothing keeps them in sync.
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
- **Restoring a backup only ever adds.** `_lib/restaurar.js`, reached by the `POST` branch
  of the same `/api/admin-data` that serves the copy, inserts with `ignoreDuplicates: true`
  — `ON CONFLICT DO NOTHING` — and holds no `.delete()` and no `.update()`, ever. That is
  what makes the one button capable of destroying good data not exist: pressing it with the
  wrong file cannot hurt, which is also why it carries no nuclear warning. A `23P01` from
  `appointments_no_overlap` **skips the clashing row and nothing else** — the batch is
  retried row by row so one clash cannot cost the other 191 — and the appointment already
  sitting in that slot is a real customer's: it is never moved, deleted, or the constraint
  relaxed to fit the copy in. And rows over a year old come back **without their person** —
  `customer_name`/`customer_phone` empty, `customer_email` and `raw_*` NULL, `waitlist` not
  at all — mirroring `purge_expired_personal_data` exactly, because the published privacy
  notice says that data is erased: restoring it raw would resurrect data that was legally
  gone and make a published legal document false. The money and the counts come back; the
  person does not. Tables are written in dependency order (`services`/`barbers` before
  `appointments`/`waitlist`), and what the copy never carried — `push_keys`,
  `push_subscriptions`, `slot_holds`, `app_meta` — is still not touched: restoring is not
  making a backup, so the last-backup stamp does not move.
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
