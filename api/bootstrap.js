// Todo lo que la app necesita al arrancar, en una sola petición.
// Sustituye a las diez llamadas sueltas que hoy se hacen a Google Sheets.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { serviceOut, barberOut, appointmentOut, scheduleOut, blockedRangeOut, vacationOut, waitlistOut } from "./_lib/shape.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const supabase = getSupabase();

    const [services, barbers, appointments, schedule, blockedDays, blockedRanges, festivos, vacations, waitlist] =
      await Promise.all([
        supabase.from("services").select("*").eq("active", true).order("sort_order"),
        supabase.from("barbers").select("*").eq("active", true),
        // Las marcadas como dato de ejemplo no se muestran. Siguen en la base.
        supabase.from("appointments").select("*").eq("is_sample_data", false).neq("status", "cancelled"),
        supabase.from("schedule_ranges").select("*"),
        supabase.from("blocked_days").select("block_date"),
        supabase.from("blocked_ranges").select("*"),
        supabase.from("festivos").select("festivo_date"),
        supabase.from("vacation_ranges").select("*"),
        supabase.from("waitlist").select("*").order("created_at"),
      ]);

    for (const r of [services, barbers, appointments, schedule, blockedDays, blockedRanges, festivos, vacations, waitlist]) {
      if (r.error) throw new Error(r.error.message);
    }

    // Sin cachear: la disponibilidad tiene que ser la de ahora mismo, no la de hace un minuto.
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      ok: true,
      services: services.data.map(serviceOut),
      barbers: barbers.data.map(barberOut),
      appointments: appointments.data.map(appointmentOut),
      schedule: scheduleOut(schedule.data),
      blockedDays: blockedDays.data.map((r) => r.block_date),
      blockedRanges: blockedRanges.data.map(blockedRangeOut),
      festivos: festivos.data.map((r) => r.festivo_date),
      vacationRanges: vacations.data.map(vacationOut),
      waitlist: waitlist.data.map(waitlistOut),
    });
  } catch (e) {
    return fail(res, e);
  }
}
