// Utilidades de las reservas temporales (slot_holds).
//
// Una reserva temporal guarda la hora elegida durante 5 minutos mientras el
// cliente rellena sus datos. NO es la garantía contra el doble booking: de eso
// se sigue encargando la restricción appointments_no_overlap en Postgres. Esto
// es una cortesía encima, y nunca puede sustituirla.

// Cuánto dura una reserva temporal. Lo acordado con el cliente: 5 minutos.
export const HOLD_MINUTES = 5;

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
// exceptId es el holdId que manda el navegador: su propia reserva no puede
// impedirle confirmar la cita.
export async function conflictingHold(supabase, { barberId, dateKey, time, durationMinutes, exceptId }) {
  const holds = await liveHoldsFor(supabase, barberId, dateKey);
  const start = toMin(time);
  const end = start + durationMinutes;
  return holds.find((h) => {
    if (exceptId && h.id === exceptId) return false;
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
