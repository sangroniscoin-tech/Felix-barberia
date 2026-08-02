// Crear y cancelar citas.
//
// Toda la validación se hace AQUÍ, en el servidor, aunque el navegador ya
// haya validado antes: la validación del navegador es comodidad para el
// cliente, no una garantía. Cualquiera puede saltársela.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import {
  appointmentOut, cleanName, cleanPhone, cleanEmail,
  isValidPhone, isValidEmail, isValidDateKey, isValidTime,
} from "./_lib/shape.js";

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

  // ---------- Crear una cita ----------
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

    const name = cleanName(body.name);
    const phone = cleanPhone(body.phone);
    const email = cleanEmail(body.email);
    const dateKey = body.dateKey;
    const time = body.time;
    const serviceId = body.service;
    const barberId = body.barberId || "felix";

    if (!name) return bad(res, "Falta el nombre.", "name");
    if (!isValidPhone(phone)) {
      return bad(res, "El teléfono no parece válido. Escribe al menos 9 dígitos, sin espacios ni letras.", "phone");
    }
    if (!isValidEmail(email)) return bad(res, "Ese correo no parece válido.", "email");
    if (!isValidDateKey(dateKey)) return bad(res, "Falta el día de la cita.", "dateKey");
    if (!isValidTime(time)) return bad(res, "Falta la hora de la cita.", "time");

    try {
      // La duración y el precio se toman del servicio en el servidor, no de lo
      // que mande el navegador: si no, cualquiera podría reservar 5 minutos a 0 €.
      const { data: service, error: svcErr } = await supabase
        .from("services").select("*").eq("id", serviceId).eq("active", true).single();
      if (svcErr || !service) return bad(res, "Ese servicio no existe.", "service");

      const { data: barber } = await supabase
        .from("barbers").select("id").eq("id", barberId).eq("active", true).single();
      if (!barber) return bad(res, "Ese barbero no existe.", "barberId");

      const row = {
        id: `c${Date.now()}${Math.floor(Math.random() * 1000)}`,
        appointment_date: dateKey,
        start_time: time,
        service_id: service.id,
        barber_id: barber.id,
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        duration_minutes: service.duration_minutes,
        price: service.price,
        status: "booked",
        source: "web",
        raw_name: body.name ?? null,
        raw_phone: body.phone != null ? String(body.phone) : null,
        raw_email: body.email ?? null,
      };

      const { data, error } = await supabase.from("appointments").insert(row).select().single();

      if (error) {
        // 23P01 = lo rechazó la restricción de solapamiento: alguien cogió el
        // hueco primero. No es un fallo nuestro, es la garantía funcionando.
        if (error.code === "23P01") {
          return res.status(409).json({
            ok: false,
            reason: "slot_taken",
            message: "Justo han cogido esa hora. Elige otra, por favor.",
          });
        }
        throw new Error(error.message);
      }

      return res.status(201).json({ ok: true, appointment: appointmentOut(data) });
    } catch (e) {
      return fail(res, e);
    }
  }

  // ---------- Cancelar una cita ----------
  // No se borra la fila: se marca como cancelada, para que quede el rastro
  // de que existió. Una cita borrada no se puede explicar tres meses después.
  if (req.method === "DELETE" || req.method === "PATCH") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
    const id = body.id || (req.query && req.query.id);
    if (!id) return bad(res, "Falta el identificador de la cita.", "id");

    const allowed = ["booked", "no_show", "cancelled"];
    const status = allowed.includes(body.status) ? body.status : "cancelled";

    try {
      const { data, error } = await supabase
        .from("appointments").update({ status }).eq("id", id).select().single();
      if (error || !data) {
        return res.status(404).json({ ok: false, reason: "not_found", message: "Esa cita ya no existe." });
      }
      return res.status(200).json({ ok: true, appointment: appointmentOut(data) });
    } catch (e) {
      return fail(res, e);
    }
  }

  return methodNotAllowed(res, ["POST", "PATCH", "DELETE"]);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
