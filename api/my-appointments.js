// "Mis citas": las citas de un teléfono, y solo las de ese teléfono.
//
// Antes esto se hacía en el navegador: la web se descargaba la agenda entera
// y filtraba. Además filtraba por coincidencia PARCIAL, así que escribiendo
// un "6" salían las de todo el mundo. Ahora filtra el servidor, y exige el
// número entero.
//
// No hay cuentas ni sesiones en esta aplicación: saber el teléfono completo es
// toda la identidad que hay. No es gran cosa, pero es infinitamente más que
// no pedir nada, que es lo que había.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { cleanPhone, isValidPhone, myAppointmentOut, durationOf } from "./_lib/shape.js";

// Un retardo fijo en cada consulta. No frena a quien insista de verdad, pero
// deja de ser cómodo barrer números uno detrás de otro a toda velocidad.
const LOOKUP_DELAY_MS = 400;

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  res.setHeader("Cache-Control", "no-store");

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return fail(res, e);
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const phone = cleanPhone(body.phone);

  if (!isValidPhone(phone)) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_input",
      field: "phone",
      message: "Escribe tu teléfono completo, con sus 9 dígitos.",
    });
  }

  try {
    await sleep(LOOKUP_DELAY_MS);

    // Igualdad exacta. Nunca "like", nunca parcial: un teléfono a medias
    // devolvería las citas de otra gente, que es justo lo que se viene a
    // arreglar.
    const [appts, services] = await Promise.all([
      supabase.from("appointments").select("*")
        .eq("customer_phone", phone)
        .eq("is_sample_data", false)
        .neq("status", "cancelled"),
      supabase.from("services").select("id, duration_minutes"),
    ]);
    if (appts.error) throw new Error(appts.error.message);
    if (services.error) throw new Error(services.error.message);

    const serviceDurations = {};
    for (const s of services.data) serviceDurations[s.id] = s.duration_minutes;

    // Cuántas personas quedan en pie en cada grupo. Se cuenta sobre lo que se
    // acaba de leer —que ya excluye las canceladas— porque un grupo comparte
    // teléfono: si una persona se ha quitado, la reserva es de las que quedan.
    const groupSizes = {};
    for (const r of appts.data || []) {
      if (r.group_id != null) groupSizes[r.group_id] = (groupSizes[r.group_id] || 0) + 1;
    }

    const rows = (appts.data || [])
      .map((r) => myAppointmentOut(r, durationOf(r, serviceDurations), groupSizes[r.group_id]))
      .sort((a, b) => (a.dateKey + a.time > b.dateKey + b.time ? 1 : -1));

    // Sin citas no es un error: es que no tiene ninguna.
    return res.status(200).json({ ok: true, appointments: rows });
  } catch (e) {
    return fail(res, e);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
