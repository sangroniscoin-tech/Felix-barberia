# CONTEXT.md

> **Budget: ~30 lines.** One line per fact. A fact belongs here only if the code doesn't
> already say it plainly, or if it's a deliberate absence someone would otherwise "fix"
> by mistake. Same pruning rule as `ADR.md`: adding is coupled to removing.

## What must never break

**Not yet answered by the client.** Asked during adoption; when the answer comes it goes
here verbatim, in their words, and becomes an acceptance criterion on every change from
then on. Until then, treat *taking a booking* and *the barber seeing today's bookings* as
the two things that must survive any change — that is an inference from the code, not
something anyone said.

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

- **No custom domain.** It lives on `felix-barberia.vercel.app`.
- **No customer accounts and no passwords.** A name and a phone is the whole identity.
- **No payments.** Nobody pays through the app.
- **No tests, linter or formatter.** Not an oversight to fix in passing — see `ADR.md`.
- Nothing was moved off Google Sheets, off Vercel, or restructured during adoption. What
  the client was offered and declined belongs here as it happens, so it is never
  re-proposed a month later.
