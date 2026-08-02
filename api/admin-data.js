// Lo que ve el panel de Félix, y solo el panel: las citas con nombre y
// teléfono, y la lista de espera entera.
//
// Esto es lo que /api/bootstrap dejó de servir a todo el mundo. Vive aquí
// detrás de la clave que se cerró antes, y ésa es la razón de que cerrar el
// panel tuviera que ir primero: sin una puerta con llave no había ningún
// sitio desde el que darle a Félix lo que sí necesita ver.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { appointmentOut, waitlistOut } from "./_lib/shape.js";
import { requireAdmin } from "./_lib/adminAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  // Primero la puerta, antes de tocar la base de datos.
  const denied = requireAdmin(req);
  if (denied) return res.status(denied.status).json(denied.body);

  try {
    const supabase = getSupabase();

    const [appointments, waitlist] = await Promise.all([
      supabase.from("appointments").select("*").eq("is_sample_data", false).neq("status", "cancelled"),
      supabase.from("waitlist").select("*").order("created_at"),
    ]);
    for (const r of [appointments, waitlist]) {
      if (r.error) throw new Error(r.error.message);
    }

    // Datos personales: no se cachean en ningún sitio, nunca.
    res.setHeader("Cache-Control", "no-store, private");

    return res.status(200).json({
      ok: true,
      appointments: appointments.data.map(appointmentOut),
      waitlist: waitlist.data.map(waitlistOut),
    });
  } catch (e) {
    return fail(res, e);
  }
}
