// Todo lo que la web pública necesita al arrancar, en una sola petición.
//
// PÚBLICA quiere decir que la contesta cualquiera que sepa la dirección, así
// que aquí no puede salir ni un dato de ninguna persona. Antes salían: esta
// respuesta llevaba las filas enteras de las citas —nombre, teléfono y
// correo— y la lista de espera igual, porque "Mis citas" filtraba en el
// navegador. Con eso, cualquiera se descargaba la clientela entera.
//
// Ahora las citas salen como BLOQUES OCUPADOS: cuándo empiezan, cuánto duran
// y con qué barbero. Es todo lo que hace falta para pintar los huecos libres.
// Lo demás lo sirven /api/my-appointments (a quien sabe su teléfono entero) y
// /api/admin-data (a quien tiene la clave del panel).
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import {
  serviceOut, barberOut, busyBlockOut, durationOf,
  scheduleOut, blockedRangeOut, vacationOut, holdOut,
} from "./_lib/shape.js";
import { purgeExpiredHolds } from "./_lib/holds.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const supabase = getSupabase();

    // Barrido oportunista de reservas temporales caducadas. Sin cron: la
    // limpieza va con el uso normal de la aplicación.
    await purgeExpiredHolds(supabase);

    const [services, barbers, appointments, schedule, blockedDays, blockedRanges, festivos, vacations, holds] =
      await Promise.all([
        supabase.from("services").select("*").eq("active", true).order("sort_order"),
        supabase.from("barbers").select("*").eq("active", true),
        // Solo las columnas que hacen falta para ocupar un hueco. Ni siquiera
        // se piden el nombre y el teléfono: lo que no se lee no se puede
        // filtrar mal más abajo.
        supabase.from("appointments")
          .select("appointment_date, start_time, barber_id, service_id, duration_minutes")
          .eq("is_sample_data", false).neq("status", "cancelled"),
        supabase.from("schedule_ranges").select("*"),
        supabase.from("blocked_days").select("block_date"),
        supabase.from("blocked_ranges").select("*"),
        supabase.from("festivos").select("festivo_date"),
        supabase.from("vacation_ranges").select("*"),
        // Solo las que siguen vivas: una caducada no debe ocultar una hora.
        // slot_holds no guarda datos de nadie, por diseño.
        supabase.from("slot_holds").select("*").gt("expires_at", new Date().toISOString()),
      ]);

    for (const r of [services, barbers, appointments, schedule, blockedDays, blockedRanges, festivos, vacations, holds]) {
      if (r.error) throw new Error(r.error.message);
    }

    const serviceDurations = {};
    for (const s of services.data) serviceDurations[s.id] = s.duration_minutes;

    // Sin cachear: la disponibilidad tiene que ser la de ahora mismo, no la de hace un minuto.
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      ok: true,
      services: services.data.map(serviceOut),
      barbers: barbers.data.map(barberOut),
      appointments: appointments.data.map((r) => busyBlockOut(r, durationOf(r, serviceDurations))),
      schedule: scheduleOut(schedule.data),
      blockedDays: blockedDays.data.map((r) => r.block_date),
      blockedRanges: blockedRanges.data.map(blockedRangeOut),
      festivos: festivos.data.map((r) => r.festivo_date),
      vacationRanges: vacations.data.map(vacationOut),
      holds: holds.data.map(holdOut),
    });
  } catch (e) {
    return fail(res, e);
  }
}
