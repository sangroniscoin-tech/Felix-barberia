# CONTEXT.md

> **Budget: ~30 lines.** One line per fact. A fact belongs here only if the code doesn't
> already say it plainly, or if it's a deliberate absence someone would otherwise "fix"
> by mistake. Same pruning rule as `ADR.md`: adding is coupled to removing.

## What must never break

The client's own words, asked at adoption. All four, not a priority order. These are
acceptance criteria on every change from here on:

- **"Que no se pierda una cita"** — no booking already made ever disappears or duplicates.
- **"Que Félix vea el día"** — the admin panel always shows who is coming in today.
- **"Que se pueda reservar"** — a customer can pick a time and end up with a booking.
- **"Que la web se vea"** — the address opens and shows the barbershop, even if booking
  is broken.

The first one used to bind hardest: two people booking at once lost one of the bookings.
Postgres now refuses overlapping appointments outright. Read `ADR.md` before writing.

## What this is

- A booking app for **Félix Barbería**, a one-chair barbershop at Calle Cereros 22,
  50003 Zaragoza, Spain. One barber, "Félix".
- Customers pick a service, a day and a time, and leave a name and a phone number. They
  can look their own bookings up again and cancel them.
- **A booking can be for up to 3 people** — a father and his son. Each picks their own
  service and gives their own name; one phone for the lot. They are seen back to back, so
  only times where the whole group fits are offered, and the whole reservation can be
  cancelled at once or one person taken out of it. Félix takes those by phone from his own
  panel, where the limit is 5 rather than 3: he knows what fits in his day.
- Picking a time holds it for 5 minutes while the customer fills in their details, with a
  visible countdown. For everyone else that hour disappears, and comes back on its own if
  nobody confirms. Félix's panel is bound by the same holds — his own choice, made knowing
  he may have to wait up to five minutes to write a booking in by hand.
- Félix uses the same site's admin panel to see the day, add bookings by hand, block time
  off, set holidays and holidays-of-obligation, manage the waiting list and the photo
  gallery, and change opening hours.
- Everything is in Spanish, for customers in Zaragoza. It is installable as a phone app
  (PWA) and is used mostly on phones.
- Services and prices live in the data store, not the code, and Félix can change them
  from the admin panel: today, corte €12, solo barba €8, corte + barba €17, corte +
  diseño €14. Opening hours are Monday to Saturday with a midday close; Sunday shut.
- Contact is a WhatsApp link to +34 610 97 57 33. That number is how customers actually
  reach the shop.

## Deliberately absent

- **No custom domain, by choice.** Asked at adoption; the client is happy on
  `felix-barberia.vercel.app`. Don't re-offer one unasked.
- **No customer accounts and no passwords.** A name and a phone is the whole identity.
  Félix's own panel password is the one exception, and it lives in Vercel, not the code.
- **No payments.** Nobody pays through the app.
- **No tests, linter or formatter.** Not an oversight to fix in passing — see `ADR.md`.
- **The gallery photos still come from the code**, not from the database. Uploading them
  needs file storage; it was left out of the Supabase migration on purpose.
- What the client is offered and declines belongs here as it happens, so it is never
  re-proposed a month later.
