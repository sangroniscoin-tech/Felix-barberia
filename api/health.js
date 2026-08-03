// Lo que comprueba el mandato cero. Consulta app_meta, que no guarda datos
// del negocio, así que sobrevive a cualquier cambio de esquema. No repuntar.
import { getSupabase, methodNotAllowed } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(503).json({ ok: false, reason: "not_configured" });
  }

  const { data, error } = await supabase
    .from("app_meta")
    .select("value")
    .eq("key", "schema_version")
    .single();

  if (error || !data) {
    return res.status(503).json({ ok: false, reason: "database_unreachable" });
  }

  // Si el aviso por correo está configurado o no. Dice **si existe**, nunca su
  // valor. Sin esto, un `APPS_SCRIPT_SECRET` mal escrito no da error en ningún
  // sitio: simplemente los correos no llegan, que es exactamente el fallo
  // invisible del que viene esta ruta de aviso.
  return res.status(200).json({
    ok: true,
    schema_version: data.value,
    notify: process.env.APPS_SCRIPT_SECRET ? "configurado" : "sin_configurar",
  });
}
