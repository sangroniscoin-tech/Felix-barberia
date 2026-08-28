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
import { claveDeDia } from "../shared/plazo-reserva.js";

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
        // DE HOY EN ADELANTE, y "hoy" leído en la hora de la barbería. Antes
        // salían todas las que existen: 207 filas de las que 180 ya habían
        // pasado, en la petición que hace TODO EL MUNDO al abrir la web. No
        // servían para nada —`motivoFueraDePlazo` no deja reservar un día que
        // ya pasó— y la lista sólo crecía: cada cita atendida se quedaba ahí
        // para siempre, así que esto empeoraba solo sin que nadie tocase nada.
        //
        // `claveDeDia()` y no una fecha en UTC, y el motivo NO es que UTC se
        // comiera citas: el servidor va por detrás de Zaragoza, así que un
        // "hoy" en UTC se pasaría de generoso —de madrugada dejaría entrar el
        // día de ayer— y eso no rompe nada. El motivo es que ESTA ventana y la
        // que decide `motivoFueraDePlazo` tienen que ser LA MISMA: allí "ayer"
        // se rechaza con "Ese día ya ha pasado", medido en la hora de la
        // barbería. Sirviendo con otro reloj, la web podría pintar como libre
        // un hueco de un día que el servidor va a rechazar. Por eso se lee del
        // mismo fichero que ya leen las dos puertas, y no se inventa aquí.
        //
        // El día de hoy entra ENTERO, no desde la hora que sea: si son las
        // 15:00, la cita de las 10:00 sigue haciendo falta para pintar bien el
        // día. Y no se corta por arriba: hoy no ahorraría nada y sería una
        // regla más que se rompe sola si el plazo cambia.
        //
        // Esto NO borra nada. El panel sigue viendo las citas pasadas por
        // `/api/admin-data`, que no lleva filtro de fecha: el dinero, los
        // recuentos y la búsqueda por nombre dependen de ellas.
        supabase.from("appointments")
          .select("appointment_date, start_time, barber_id, service_id, duration_minutes")
          .eq("is_sample_data", false).neq("status", "cancelled")
          .gte("appointment_date", claveDeDia()),
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
