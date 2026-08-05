// Lo que ve el panel de Félix, y solo el panel: las citas con nombre y
// teléfono, y la lista de espera entera.
//
// Esto es lo que /api/bootstrap dejó de servir a todo el mundo. Vive aquí
// detrás de la clave que se cerró antes, y ésa es la razón de que cerrar el
// panel tuviera que ir primero: sin una puerta con llave no había ningún
// sitio desde el que darle a Félix lo que sí necesita ver.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { appointmentOut, waitlistOut, closeOut } from "./_lib/shape.js";
import { requireAdmin } from "./_lib/adminAuth.js";

// Un día, o nada. Lo que llegue en la query lo escribe quien quiera: si no es
// exactamente una fecha, no se consulta nada — nunca se mete en la consulta
// tal cual. Se valida aquí, en el servidor, como todo lo demás.
function pedirDia(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return valor;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  // Primero la puerta, antes de tocar la base de datos.
  const denied = requireAdmin(req);
  if (denied) return res.status(denied.status).json(denied.body);

  try {
    const supabase = getSupabase();

    // Las canceladas de UN día, y sólo si se piden. Es lo que deja que tocar
    // un aviso de cancelación abra la ficha de quien canceló: sin esto no hay
    // forma de volver a verle, porque la consulta de siempre las excluye.
    //
    // Un día concreto y no todas: el panel no tiene ninguna pantalla de
    // canceladas —eso es otra tarea— y lo que no hace falta no se sirve.
    const dia = pedirDia(req.query && req.query.canceladas);

    const consultas = [
      // Esta consulta NO cambia. El dinero, los recuentos, los rankings y la
      // lista del día salen de aquí, y las canceladas siguen fuera de todos.
      supabase.from("appointments").select("*").eq("is_sample_data", false).neq("status", "cancelled"),
      supabase.from("waitlist").select("*").order("created_at"),
      // Los cierres de caja, todos. Es una fila por día trabajado y sólo
      // lleva una fecha y dos importes: cabe de sobra aquí, y así el panel
      // reparte el dinero de cualquier día, semana o mes sin una segunda
      // vuelta al servidor por cada pantalla que se abre.
      supabase.from("daily_closes").select("*").order("close_date"),
    ];
    if (dia) {
      consultas.push(
        supabase.from("appointments").select("*")
          .eq("is_sample_data", false)
          .eq("status", "cancelled")
          .eq("appointment_date", dia)
      );
    }

    const [appointments, waitlist, closes, cancelled] = await Promise.all(consultas);
    for (const r of [appointments, waitlist, closes, cancelled]) {
      if (r && r.error) throw new Error(r.error.message);
    }

    // Datos personales: no se cachean en ningún sitio, nunca.
    res.setHeader("Cache-Control", "no-store, private");

    const salida = {
      ok: true,
      appointments: appointments.data.map(appointmentOut),
      waitlist: waitlist.data.map(waitlistOut),
      closes: closes.data.map(closeOut),
    };
    // Sin el parámetro, la respuesta es exactamente la de siempre: ni un campo
    // más. Quien no pregunta por canceladas no se entera de que existen.
    if (dia) salida.cancelled = cancelled.data.map(appointmentOut);

    return res.status(200).json(salida);
  } catch (e) {
    return fail(res, e);
  }
}
