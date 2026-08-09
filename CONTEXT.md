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

## What this is

- A booking app for **Félix Barbería**, a one-chair barbershop at Calle Cereros 22,
  50003 Zaragoza, Spain. One barber, "Félix".
- Customers pick a service, a day and a time, and leave a name and a phone number. They
  can look their own bookings up again and cancel them. **They can book up to a month
  ahead** — Félix asked for it: people with a wedding want the hour set weeks out. His own
  panel has no such limit.
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
- **He marks who didn't turn up**, from the day's list once their hour has passed, or from
  the appointment itself. Only the exceptions get marked — nobody confirms attendance one
  by one. That mark is what makes the takings real: an absence is worth €0 and shows up
  beside them as "perdido por ausencias", which is the only place he sees what the
  no-shows cost him.
- **Le hace precio a los clientes de años** —10 € donde la lista dice 12— y desde el
  2026-08-07 puede apuntarlo: al cerrar el día ve sus citas cobrables con una casilla de
  importe, y cambiar una mueve el total del día. Vacía vuelve al precio de siempre. **El
  cliente no lo ve**: cuando busca su cita en la web lee el precio que le dijeron al
  reservar, y el descuento se queda entre Félix y su caja. Lo pidió porque el efectivo le
  salía de más al cerrar. Un precio fijo que la web recuerde por cliente se descartó: es
  una lista de tarifas por persona y es otra cosa.
- **Cierra la caja del día por importe.** Al terminar mira el datáfono, escribe lo que pasó
  por tarjeta y lo que le llegó por Bizum, y **el efectivo es lo que sobra** del total del
  día. Lo pidió así: marcar cliente a cliente era trabajo que su forma de cobrar no
  necesita, y como sus cortes no valen todos igual, "cuatro tarjetas" es ambiguo y 20 € no.
  Un día que no cierra se ve como **"sin cerrar"**, nunca como efectivo, y la semana y el
  mes le dicen cuántos le quedan. Un día cerrado deja de saber qué cliente pagó con qué —
  se le advirtió y le da igual: lo que necesita es el reparto del día.
- **De cada cita pasada quedan dos botones: «Vino» y «No vino».** Los tres de cobro
  —efectivo, tarjeta, Bizum— se quitaron el 2026-08-07 a petición suya: con el cierre de
  caja ya no llegaban a ninguna cifra que no tuviera, y le cargaban la pantalla que más
  mira. El panel le sigue repartiendo el dinero del día, la semana y el mes por esas tres
  vías, pero ahora **sólo desde el cierre**; lo que no está cerrado se lee «sin cerrar», que
  no es lo mismo que efectivo. El recuento de citas le dice **cuántas lleva hechas y
  cuántas le quedan por venir**: mezclarlas le hacía leer como cobrado lo que sólo estaba
  reservado.
- **Se descarga su propia copia de seguridad** desde el panel: un archivo con todo —citas,
  clientes, lista de espera, servicios, horarios, festivos, vacaciones y cierres— que le
  dice cuántas filas lleva dentro, y una fecha de la última copia que se pone en ámbar
  pasado el mes. Cae en su móvil y **es él quien la manda a otro sitio**; se le explicó que
  una copia que vive en el móvil que puedes perder no es una copia. Lleva nombres y
  teléfonos: es el mismo fichero de clientes del que ya es responsable.
- **His phone rings when a customer books or cancels** — not when he writes a booking in
  himself, which he already knows about. The notice says only the day, the hour and the
  service, because it lands on a lock screen; tapping it opens the panel on that day with
  that person's card, which is where the name and the phone live. A cancellation shows him
  who cancelled, so he can ring them back.
- **Quien se apunta a la lista de espera dice cuándo puede**: la franja —mañana, tarde o le
  da igual—, si le vale cualquier día y una nota corta. Nada es obligatorio, y los que se
  apuntaron antes de que existiera la pregunta salen como «no lo dijo», que no es lo mismo
  que «me da igual». La raya entre mañana y tarde es el cierre de mediodía de su horario.
- **Cuando se cancela una cita, la lista de espera se le pone delante.** El aviso del móvil
  dice a cuántos puede llamar y lleva al panel, a ese día: primero los que encajan por día
  y franja, luego los que dan igual, y abajo, marcados, los que no encajan — se ordena, no
  se esconde a nadie. Cada uno con el WhatsApp ya escrito y el botón de llamar. **Avisa él,
  no el sistema**, y quien recibe el aviso queda marcado pero **no sale de la lista**: si no
  contesta, vuelve a salirle en el siguiente hueco.
- **Cuando es él quien cancela, se le ofrece avisar a quien se queda sin cita**, en el
  momento y en la misma pantalla: una disculpa con el día y la hora, y una puerta abierta
  —«escríbeme y te busco otro hueco»—, en el WhatsApp de esa persona. **Escrito, no
  enviado**, como todo lo que sale de este panel. No se pregunta el motivo, y no se apunta
  si avisó: la cita queda cancelada igual. Sin teléfono —los datos viejos se purgan— la
  ventana lo dice en vez de ofrecer un botón que no lleva a ningún sitio.
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
- **No payments**, re-offered and declined on 2026-08-05. Charging through the web was the
  only way to split the takings with no typing at all; he turned it down — pago por
  adelantado, comisiones y un proveedor más. He also turned down a **default payment
  method** (everything unmarked counted as cash) and chose the daily close instead,
  because he wants to see what he is signing off before it counts.
- **No cookie banner, and that is correct.** No analytics, no trackers, nothing in
  `localStorage` or `document.cookie` — only the admin session, which is strictly
  necessary. Adding a banner would be theatre, and the privacy notice says so in writing.
- **The gallery photos still come from the code**, not from the database. Uploading them
  needs file storage; it was left out of the Supabase migration on purpose.
- **No restore button, and no copy that uploads itself.** The backup is a file he
  downloads and forwards by hand: sending it anywhere on its own means another service and
  another credential, and restoring is a rare, dangerous operation done with someone
  watching, not with a button. Both were offered as scope and deliberately left out.
- **No install-the-app banner.** Already installable, and he has a QR poster; a prompt at
  the door interrupts the one thing a customer came to do. Parked, not refused.
- **No automatic message to the customer when a hueco frees up**, declined 2026-08-07: an
  SMS or WhatsApp Business provider means a monthly bill, another account, templates Meta
  has to approve, and asking the customer's permission to write to them. He chose to send
  it himself with one tap. **Nor is the freed hueco held** for whoever is waiting — it goes
  back on the web and the first to book gets it; to keep it he blocks that stretch himself.
- What the client is offered and declines belongs here as it happens, so it is never
  re-proposed a month later.
