// Reservas temporales: guardan la hora elegida mientras el cliente rellena
// sus datos.
//
// Punto de partida, para que nadie lo confunda: el doble booking ya lo impide
// la restricción appointments_no_overlap en Postgres. Esto NO viene a arreglar
// eso. Es comodidad: que quien elige una hora no se lleve el chasco al final.
//
// Toda la validación se hace AQUÍ, en el servidor, aunque el navegador ya
// haya validado antes.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { isValidDateKey, isValidTime, holdOut } from "./_lib/shape.js";
import {
  HOLD_MINUTES, purgeExpiredHolds, conflictingHold, conflictingAppointment,
} from "./_lib/holds.js";
import { readServiceIds } from "./_lib/groups.js";

function bad(res, message, field) {
  return res.status(400).json({ ok: false, reason: "invalid_input", field, message });
}

export default async function handler(req, res) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return fail(res, e);
  }

  // ---------- Guardar una hora ----------
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

    const dateKey = body.dateKey;
    const time = body.time;
    const barberId = body.barberId || "felix";

    // Un servicio, o los de todo el grupo. Con varios se guarda el TRAMO
    // ENTERO, no solo el de la primera persona: si no, alguien podría colarse
    // en la hora de la segunda mientras el cliente rellena sus datos.
    const wanted = readServiceIds(body);
    if (wanted.error) return bad(res, wanted.error.message, wanted.error.field);

    if (!isValidDateKey(dateKey)) return bad(res, "Falta el día.", "dateKey");
    if (!isValidTime(time)) return bad(res, "Falta la hora.", "time");

    try {
      // Cada POST aprovecha para barrer las caducadas. Sin cron: la limpieza
      // va con el uso normal de la aplicación.
      await purgeExpiredHolds(supabase);

      // La duración la pone el servidor leyéndola de services, igual que al
      // crear una cita. Nunca se acepta la que mande el navegador.
      const { data: svcRows, error: svcErr } = await supabase
        .from("services").select("*").in("id", [...new Set(wanted.ids)]).eq("active", true);
      if (svcErr) throw new Error(svcErr.message);

      const byId = new Map((svcRows || []).map((s) => [s.id, s]));
      for (const id of wanted.ids) {
        if (!byId.has(id)) return bad(res, "Ese servicio no existe.", "service");
      }

      const { data: barber } = await supabase
        .from("barbers").select("id").eq("id", barberId).eq("active", true).single();
      if (!barber) return bad(res, "Ese barbero no existe.", "barberId");

      // El tramo del grupo es la suma de las duraciones, porque las personas
      // van seguidas, una detrás de otra.
      const durationMinutes = wanted.ids.reduce((sum, id) => sum + byId.get(id).duration_minutes, 0);

      // Si la hora ya está ocupada por una cita de verdad, no tiene sentido
      // guardarla: quien la pide vería una cuenta atrás sobre nada.
      const taken = await conflictingAppointment(supabase, {
        barberId: barber.id, dateKey, time, durationMinutes,
      });
      if (taken) {
        return res.status(409).json({
          ok: false,
          reason: "slot_taken",
          message: "Justo han cogido esa hora. Elige otra, por favor.",
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);

      const row = {
        id: `h${Date.now()}${Math.floor(Math.random() * 1000)}`,
        barber_id: barber.id,
        hold_date: dateKey,
        start_time: time,
        duration_minutes: durationMinutes,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      const { data, error } = await supabase.from("slot_holds").insert(row).select().single();

      if (error) {
        // 23P01 = lo rechazó slot_holds_no_overlap: otra persona está
        // rellenando sus datos sobre esa misma hora ahora mismo.
        if (error.code === "23P01") {
          return res.status(409).json({
            ok: false,
            reason: "slot_held",
            message: "Alguien está reservando esa hora ahora mismo. Se libera en unos minutos.",
          });
        }
        throw new Error(error.message);
      }

      return res.status(201).json({ ok: true, hold: holdOut(data) });
    } catch (e) {
      return fail(res, e);
    }
  }

  // ---------- Soltar una hora ----------
  // Se suelta en cuanto se sabe que ya no hace falta. Caducar es la red de
  // seguridad, no el mecanismo normal. Que ya no exista no es un error: quien
  // suelta quiere que no esté, y no está.
  if (req.method === "DELETE") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
    const id = body.id || (req.query && req.query.id);
    if (!id) return bad(res, "Falta el identificador de la reserva.", "id");

    try {
      const { error } = await supabase.from("slot_holds").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return fail(res, e);
    }
  }

  return methodNotAllowed(res, ["POST", "DELETE"]);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
