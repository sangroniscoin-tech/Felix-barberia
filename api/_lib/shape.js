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
  // Las dos filas antiguas no guardaban duración ni precio. No se inventan
  // al cargar: se rellenan aquí con lo que vale el servicio hoy.
  if (r.duration_minutes != null) out.duration = r.duration_minutes;
  if (r.price != null) out.price = Number(r.price);
  return out;
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

export function waitlistOut(r) {
  return { id: String(r.id), name: r.customer_name, phone: r.customer_phone, service: r.service_id, dateKey: r.preferred_date, note: r.note };
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
