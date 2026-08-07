// Traduce entre las filas de Postgres y las formas que la app ya usa.
// La app no cambia de vocabulario: sigue hablando de dateKey, time, service.
// Todo el trabajo de adaptación vive aquí, en un solo sitio.

export function serviceOut(r) {
  return { id: r.id, name: r.name, desc: r.description, duration: r.duration_minutes, price: Number(r.price) };
}

export function barberOut(r) {
  return { id: r.id, name: r.name, photo: r.photo_url };
}

export function appointmentOut(r) {
  const out = {
    id: r.id,
    dateKey: r.appointment_date,
    time: String(r.start_time).slice(0, 5),
    service: r.service_id,
    barberId: r.barber_id,
    name: r.customer_name,
    phone: r.customer_phone,
    email: r.customer_email,
    // El panel de Félix trabaja con un booleano; la base guarda un estado.
    noShow: r.status === "no_show",
  };
  // Cómo se cobró, o null si nadie lo ha marcado. Va SIEMPRE, incluso vacío,
  // porque "sin marcar" es una de las cifras del panel: tiene que poder
  // distinguirse de un campo que no ha llegado. Solo sale por admin-data —
  // ni busyBlockOut ni myAppointmentOut lo llevan, que es lo que mantiene la
  // contabilidad fuera de todo lo público.
  out.paymentMethod = r.payment_method ?? null;
  // Las dos filas antiguas no guardaban duración ni precio. No se inventan
  // al cargar: se rellenan aquí con lo que vale el servicio hoy.
  if (r.duration_minutes != null) out.duration = r.duration_minutes;
  if (r.price != null) out.price = Number(r.price);
  // Lo que Félix cobró de verdad, cuando no fue lo que valía el servicio. Va
  // SIEMPRE, incluso vacío, por lo mismo que `paymentMethod`: el panel tiene
  // que distinguir "se cobró el precio normal" de un campo que no ha llegado.
  // Y va SÓLO por aquí: `myAppointmentOut` no lo lleva, que es lo que mantiene
  // el descuento entre Félix y su caja — el cliente sigue leyendo el precio
  // que le dijeron al reservar.
  out.chargedPrice = r.charged_price != null ? Number(r.charged_price) : null;
  // Una cita reservada junto a otras. NULL en las dos columnas = cita suelta,
  // que es lo que son casi todas y lo que no lleva ninguno de estos campos.
  if (r.group_id != null) {
    out.groupId = r.group_id;
    out.groupPosition = r.group_position;
  }
  // Sólo cuando la columna dice algo. Las canceladas de antes de que existiera
  // la columna se quedan sin fecha, y "sin fecha" tiene que poder distinguirse
  // de una fecha inventada: la ficha dirá que está cancelada y callará cuándo.
  if (r.cancelled_at != null) out.cancelledAt = r.cancelled_at;
  return out;
}

// El cierre de caja de un día. Sin efectivo dentro: el efectivo es el total
// del día menos estas dos cifras, y se calcula al pintarlo. Guardar —o
// servir— una cifra derivada es la forma de que un día deje de cuadrar con
// las otras dos en cuanto una se corrija.
//
// Sale SÓLO por admin-data, detrás de la clave del panel: es la contabilidad
// de Félix y no la lee nadie más. Ninguna ruta pública lo lleva.
export function closeOut(r) {
  return {
    dateKey: r.close_date,
    card: Number(r.card_total),
    bizum: Number(r.bizum_total),
    closedAt: r.closed_at,
    updatedAt: r.updated_at,
  };
}

// Una cita tal y como puede verla CUALQUIERA: cuándo empieza, cuánto dura y
// con qué barbero. Ni nombre, ni teléfono, ni correo, ni id.
//
// Sin id a propósito: cancelar una cita solo pide el id, así que un id público
// es una cita que cualquiera puede cancelar. Para pintar huecos libres no hace
// falta saber de quién es cada cita.
export function busyBlockOut(r, durationMinutes) {
  return {
    dateKey: r.appointment_date,
    time: String(r.start_time).slice(0, 5),
    barberId: r.barber_id,
    duration: durationMinutes,
  };
}

// Una cita tal y como se la devolvemos a quien ha demostrado saber el teléfono
// entero. Lleva el id, porque con él se cancela, y el nombre, para que se
// reconozca. No lleva el teléfono ni el correo: quien pregunta ya sabe el
// teléfono, y devolvérselo solo sirve para confirmarle a alguien que ese
// número tiene citas.
export function myAppointmentOut(r, durationMinutes, groupSize) {
  const out = {
    id: r.id,
    dateKey: r.appointment_date,
    time: String(r.start_time).slice(0, 5),
    service: r.service_id,
    barberId: r.barber_id,
    name: r.customer_name,
    duration: durationMinutes,
    price: r.price != null ? Number(r.price) : null,
  };
  // Si la cita se reservó junto a otras, va con lo justo para pintarlas
  // juntas: de qué grupo es, en qué puesto entra y cuántas quedan en pie.
  // Quien pregunta ya ha demostrado saber el teléfono entero, que es toda la
  // identidad que hay aquí.
  if (r.group_id != null) {
    out.groupId = r.group_id;
    out.groupPosition = r.group_position;
    out.groupSize = groupSize;
  }
  return out;
}

// Las dos filas migradas antiguas no guardan duración. No se inventa: se toma
// la que vale hoy el servicio. Un bloque sin duración pintaría como libre un
// hueco ocupado.
export function durationOf(row, serviceDurations) {
  return row.duration_minutes != null
    ? row.duration_minutes
    : (serviceDurations[row.service_id] ?? 30);
}

export function scheduleOut(rows) {
  const byDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const r of rows) {
    byDay[r.weekday].push([String(r.start_time).slice(0, 5), String(r.end_time).slice(0, 5)]);
  }
  for (const d of Object.keys(byDay)) byDay[d].sort((a, b) => a[0].localeCompare(b[0]));
  return byDay;
}

export function blockedRangeOut(r) {
  return { dateKey: r.block_date, start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5), label: r.label };
}

export function vacationOut(r) {
  return { start: r.start_date, end: r.end_date, label: r.label };
}

// Una reserva temporal, tal y como la ve el navegador. No lleva —ni puede
// llevar— nombre, teléfono ni correo: la tabla no los guarda.
export function holdOut(r) {
  return {
    id: r.id,
    barberId: r.barber_id,
    dateKey: r.hold_date,
    time: String(r.start_time).slice(0, 5),
    duration: r.duration_minutes,
    expiresAt: r.expires_at,
  };
}

// Una entrada de la lista de espera, como la ve el panel. Sale SÓLO por
// admin-data, detrás de la clave: lleva nombre y teléfono.
//
// `preferredSlot` va SIEMPRE, incluso en `null`, porque `null` es un valor con
// significado —"no lo dijo"— y el panel lo pinta como tal. Si faltase, el panel
// no podría distinguir "no lo dijo" de "me da igual", que es justo lo que las
// siete entradas anteriores a #75 necesitan que se distinga.
export function waitlistOut(r) {
  return {
    id: String(r.id),
    name: r.customer_name,
    phone: r.customer_phone,
    service: r.service_id,
    dateKey: r.preferred_date,
    note: r.note,
    preferredSlot: r.preferred_slot ?? null,
    anyDate: r.any_date === true,
    // Cuándo se apuntó. Es lo que decide el orden dentro de cada grupo cuando
    // se libera un hueco —manda quien lleva esperando más—, y por eso sale
    // aunque el panel no lo pinte: sin él, el orden se lo tendría que inventar
    // la pantalla. `admin-data` ya lo ordena por `created_at`; esto lo hace
    // sobrevivir a cualquier reordenación posterior.
    createdAt: r.created_at,
    // La marca de "ya le escribí por este hueco". `null` es "nunca avisado",
    // y va siempre para que el panel no tenga que distinguir "no lo sé" de
    // "no". No sale de aquí: como el nombre y el teléfono, vive detrás de la
    // clave y nunca viaja en un aviso.
    notifiedAt: r.notified_at ?? null,
    notifiedSlot: r.notified_slot ?? null,
  };
}

// ---- Saneado y validación de lo que llega de un formulario ----
// Se aplica SIEMPRE en el servidor, aunque el navegador ya haya validado:
// cualquiera puede saltarse la validación del navegador.

export function cleanName(v) {
  if (typeof v !== "string") return "";
  // Colapsa espacios repetidos y recorta. Es lo que arregla los "Lenin " de la hoja.
  return v.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function cleanPhone(v) {
  if (typeof v !== "string" && typeof v !== "number") return "";
  // Solo dígitos: quita espacios, guiones, paréntesis y el prefijo +.
  return String(v).replace(/\D/g, "").slice(0, 15);
}

export function cleanEmail(v) {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (!e) return null; // cadena vacía y "no lo dejó" son lo mismo: null
  return e.slice(0, 254);
}

export function isValidPhone(digits) {
  // Entre 9 y 15 dígitos. Nueve es lo mínimo de un móvil español; el tope
  // de 15 es el máximo internacional. Hay un número no español en los datos
  // reales, así que no se exige que empiece por 6 o 7.
  return /^[0-9]{9,15}$/.test(digits);
}

export function isValidEmail(e) {
  if (e === null) return true; // opcional
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export function isValidDateKey(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

export function isValidTime(v) {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}
