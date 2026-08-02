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

The first one binds hardest, and the app's storage model works against it: a save
rewrites a whole JSON blob, so two writes at once lose one. Read `ADR.md` before touching
anything that writes.

## What this is

- A booking app for **Félix Barbería**, a one-chair barbershop at Calle Cereros 22,
  50003 Zaragoza, Spain. One barber, "Félix".
- Customers pick a service, a day and a time, and leave a name and a phone number. They
  can look their own bookings up again and cancel them.
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
- **The security shape was left as it is, by choice** (adoption, Aug 2026). The client was
  shown that the admin password is public and that customer names and phones can be read
  by anyone with the data-store URL, and chose to keep the current setup for now. It is
  written up in `ADR.md` as a known risk. Do not re-propose it as a fix in passing; if it
  comes back it comes back as their decision, once, with its own issue.
- **No customer accounts and no passwords.** A name and a phone is the whole identity.
- **No payments.** Nobody pays through the app.
- **No tests, linter or formatter.** Not an oversight to fix in passing — see `ADR.md`.
- Nothing was moved off Google Sheets, off Vercel, or restructured during adoption. What
  the client was offered and declined belongs here as it happens, so it is never
  re-proposed a month later.
