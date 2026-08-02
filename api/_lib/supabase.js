// El ÚNICO sitio donde se leen las credenciales de la base de datos.
//
// Este fichero vive en api/, que Vercel ejecuta en el servidor. Nunca se
// empaqueta en el JavaScript que descarga el navegador, así que la clave
// service_role no sale de aquí. Si algún día alguien importa este módulo
// desde src/, la clave acabaría en el móvil de cada cliente: no se hace.
import { createClient } from "@supabase/supabase-js";

let client = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    const missing = [!url && "SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
    const err = new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
    err.code = "not_configured";
    throw err;
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Respuesta de error uniforme. Distingue "falta configuración" de
// "la base de datos no contesta", que es la diferencia que importa a las 3 de la mañana.
export function fail(res, error) {
  const isConfig = error && error.code === "not_configured";
  const status = isConfig ? 503 : 500;
  return res.status(status).json({
    ok: false,
    reason: isConfig ? "not_configured" : "database_error",
    message: error && error.message ? error.message : "Error desconocido",
  });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return res.status(405).json({ ok: false, reason: "method_not_allowed" });
}
