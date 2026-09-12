// Utilidades de las reservas temporales (slot_holds).
//
// Una reserva temporal guarda la hora elegida un rato —`HOLD_MINUTES`— mientras el
// cliente rellena sus datos. NO es la garantía contra el doble booking: de eso
// se sigue encargando la restricción appointments_no_overlap en Postgres. Esto
// es una cortesía encima, y nunca puede sustituirla.

// Cuánto dura una reserva temporal. Lo acordado con el cliente: 7 minutos.
//
// Es un ACUERDO CON FÉLIX, no una conveniencia técnica, igual que los 30 días
// de `DIAS_MAX_RESERVA`. Eran 5; el 12/09 él mismo pidió subirlo, después de ver
// a un cliente quedarse sin tiempo una y otra vez, y lo dejó en 7 sabiendo lo
// que cuesta: una hora que alguien empieza y abandona tarda ese mismo rato en
// volver a estar libre, y su propio panel queda atado por las reservas de la
// web (#160). Un número que parece técnico se cambia por comodidad técnica; éste
// no se toca sin él.
//
// Vive AQUÍ y en ningún sitio más. Ningún comentario, ningún texto y ningún otro
// fichero puede quedarse con una copia: una copia es lo que se queda atrás
// cuando el acuerdo cambia.
export const HOLD_MINUTES = 7;

// ---------- Cuánto le queda a una reserva temporal ----------
//
// El rato que falta, en milisegundos, medido con el reloj del SERVIDOR. Es lo
// único que sale hacia el navegador: nunca la hora absoluta de caducidad.
//
// El navegador no tiene forma de saber si su propio reloj está en hora, así que
// comparar una marca del servidor contra `Date.now()` del móvil se come el
// plazo entero: lo deja en tres minutos, o en cero. A un cliente de Félix con el teléfono
// adelantado le caducaba la hora en el primer tick, antes de escribir nada, una
// y otra vez (#159). Con una duración, el navegador sólo resta instantes de su
// propio reloj, y eso es correcto aunque ese reloj esté mal puesto.
//
// Nunca sale negativo: una caducada vale 0, que es exactamente lo que el
// navegador tiene que entender por "ya no vale".
export function remainingMsOf(row, now = Date.now()) {
  const end = new Date(row.expires_at).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - (now instanceof Date ? now.getTime() : now));
}

// ---------- De quién es una reserva temporal (client_id) ----------
//
// Un valor aleatorio y opaco que se genera el propio navegador. NO es una
// persona y nunca puede serlo: ni teléfono, ni nombre, ni nada derivado de
// ellos (`ADR.md`: nada de lo público lleva a una persona). Sirve para una
// sola cosa: que la reserva temporal HUÉRFANA de alguien —la que el servidor
// llegó a crear, pero cuya respuesta nunca le llegó al móvil— no le bloquee a
// él mismo todo lo que dure la reserva (#157).
//
// Un valor raro se trata como AUSENTE, nunca como un error: quien no lo manda
// se comporta exactamente como antes de que esto existiera, y uno mal formado
// no puede costarle la cita a nadie.
export function sanitizeClientId(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length < 8 || s.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

// Retira las reservas temporales que ya tenga este mismo navegador. Es lo que
// hace que la siguiente se pueda guardar cuando la anterior quedó huérfana, y
// lo que cumple lo que el código ya decía querer: una persona tiene una sola
// reserva temporal a la vez.
//
// Que falle no rompe la petición: como mucho se vuelve al comportamiento de
// antes, que es el 409. Deja un aviso en el log porque el fallo que vuelve es
// invisible desde fuera.
export async function dropOwnHolds(supabase, clientId) {
  if (!clientId) return;
  try {
    const { error } = await supabase.from("slot_holds").delete().eq("client_id", clientId);
    if (error) console.warn("[holds] no se pudieron retirar las reservas temporales propias:", error.message);
  } catch (e) {
    console.warn("[holds] no se pudieron retirar las reservas temporales propias:", e.message);
  }
}

// Soltar lo que ya no hace falta una vez la cita existe: la reserva temporal
// que mandó el navegador y, si se identificó, cualquier otra suya que hubiera
// quedado por ahí. Nada de esto puede romper una cita ya guardada, así que
// todo se traga: caducan solas en unos minutos.
export async function releaseHolds(supabase, { holdId = null, clientId = null } = {}) {
  if (holdId) {
    try {
      await supabase.from("slot_holds").delete().eq("id", holdId);
    } catch {
      // Caduca sola.
    }
  }
  await dropOwnHolds(supabase, clientId);
}

export function toMin(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

// Dos tramos solapan si cada uno empieza antes de que acabe el otro.
export function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

// Borrado oportunista de las caducadas: se hace con el uso normal de la
// aplicación, sin cron y sin tareas programadas. Que falle no es motivo para
// romper la petición que lo lanzó.
export async function purgeExpiredHolds(supabase) {
  try {
    await supabase.from("slot_holds").delete().lt("expires_at", new Date().toISOString());
  } catch {
    // Silencio a propósito: la limpieza es mantenimiento, no parte del trato.
  }
}

// Las reservas temporales vivas de un barbero en un día. Se compara expires_at
// contra la hora de ahora, así que una caducada que aún esté en la tabla no
// cuenta.
export async function liveHoldsFor(supabase, barberId, dateKey) {
  const { data, error } = await supabase
    .from("slot_holds")
    .select("*")
    .eq("barber_id", barberId)
    .eq("hold_date", dateKey)
    .gt("expires_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return data || [];
}

// ¿Choca este tramo con alguna reserva temporal viva que no sea la propia?
// "Propia" se sabe de dos maneras, y hacen falta las dos:
//   - exceptId: el holdId que manda el navegador, cuando lo tiene.
//   - clientId: el identificador del navegador, para cuando NO lo tiene —
//     porque la respuesta del POST se perdió por el camino y nunca llegó a
//     saber el id de la hora que él mismo acababa de reservarse (#157).
// Sin la segunda, una persona con mala cobertura se choca contra sí misma y
// se le acusa de ello: "alguien está reservando esa hora", siendo ese alguien
// ella.
export async function conflictingHold(supabase, { barberId, dateKey, time, durationMinutes, exceptId, clientId }) {
  const holds = await liveHoldsFor(supabase, barberId, dateKey);
  const start = toMin(time);
  const end = start + durationMinutes;
  return holds.find((h) => {
    if (exceptId && h.id === exceptId) return false;
    if (clientId && h.client_id && h.client_id === clientId) return false;
    const hStart = toMin(h.start_time);
    return overlaps(start, end, hStart, hStart + h.duration_minutes);
  }) || null;
}

// ¿Choca este tramo con una cita ya reservada?
export async function conflictingAppointment(supabase, { barberId, dateKey, time, durationMinutes }) {
  const { data, error } = await supabase
    .from("appointments")
    .select("start_time, duration_minutes")
    .eq("barber_id", barberId)
    .eq("appointment_date", dateKey)
    .eq("status", "booked");
  if (error) throw new Error(error.message);
  const start = toMin(time);
  const end = start + durationMinutes;
  return (data || []).find((a) => {
    const aStart = toMin(a.start_time);
    return overlaps(start, end, aStart, aStart + (a.duration_minutes || 30));
  }) || null;
}
