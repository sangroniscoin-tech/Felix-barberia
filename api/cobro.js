// Apuntar cómo se cobró una cita: efectivo, tarjeta o Bizum.
//
// Esto lo hace FÉLIX, no un cliente, y por eso pide el pase del panel. Es lo
// contrario que /api/waitlist: aquella es pública porque la escribe quien
// reserva; ésta es la contabilidad del negocio y no la escribe nadie más.
//
// Tiene ruta propia en vez de colarse en PATCH /api/appointments a propósito.
// Esa ruta es PÚBLICA —cancela y marca "no se presentó" sabiendo solo el
// identificador— y meterle un campo que exige pase mezclaría dos niveles de
// permiso en un mismo sitio. Una ruta, una cosa.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { appointmentOut } from "./_lib/shape.js";

// Los mismos tres que acepta el CHECK de la columna. null es "sin marcar",
// que es lo que deja el botón cuando se vuelve a tocar el que ya estaba.
const METODOS = ["efectivo", "tarjeta", "bizum"];

export default async function handler(req, res) {
  if (req.method !== "PATCH") return methodNotAllowed(res, ["PATCH"]);

  // Antes de mirar el cuerpo: nada de lo que mande quien no se ha
  // identificado llega a interpretarse.
  const denied = requireAdmin(req);
  if (denied) return res.status(denied.status).json(denied.body);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return fail(res, e);
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  // Se valida aquí aunque el panel solo mande uno de los tres: el navegador
  // es una comodidad y cualquiera puede saltárselo.
  const metodo = body.metodo === null || body.metodo === undefined || body.metodo === ""
    ? null
    : body.metodo;
  if (metodo !== null && !METODOS.includes(metodo)) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_input",
      field: "metodo",
      message: "Esa forma de pago no existe.",
    });
  }

  // Marcar un cobro dice que esa persona vino: no se le puede haber cobrado a
  // quien no se presentó. Así que el mismo UPDATE le quita la marca de
  // ausente. Al revés lo hace PATCH /api/appointments, que al marcar
  // "no_show" borra la forma de pago.
  //
  // Desmarcar (metodo null) NO toca el estado: quitar un cobro puesto por
  // error no debería revivir ni enterrar una ausencia.
  const cambios = metodo === null
    ? { payment_method: null }
    : { payment_method: metodo, status: "booked", cancelled_at: null };

  try {
    // Con groupId se marca la reserva entera de una vez, en una sola
    // sentencia: en un grupo paga uno por todos. Las canceladas se quedan
    // fuera — no están en el panel y no cuentan en el dinero.
    const groupId = body.groupId;
    if (groupId) {
      const { data, error } = await supabase
        .from("appointments")
        .update(cambios)
        .eq("group_id", groupId)
        .neq("status", "cancelled")
        .select();
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return noExiste(res);
      return res.status(200).json({ ok: true, appointments: data.map(appointmentOut) });
    }

    const id = body.id;
    if (!id) {
      return res.status(400).json({
        ok: false,
        reason: "invalid_input",
        field: "id",
        message: "Falta el identificador de la cita.",
      });
    }

    const { data, error } = await supabase
      .from("appointments")
      .update(cambios)
      .eq("id", id)
      .neq("status", "cancelled")
      .select()
      .single();
    if (error || !data) return noExiste(res);
    return res.status(200).json({ ok: true, appointment: appointmentOut(data) });
  } catch (e) {
    return fail(res, e);
  }
}

function noExiste(res) {
  return res.status(404).json({ ok: false, reason: "not_found", message: "Esa cita ya no existe." });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
