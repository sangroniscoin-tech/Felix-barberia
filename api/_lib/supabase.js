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
//
// Y lo DEJA ESCRITO. Antes no: el 2026-08-10 /api/admin-data devolvió un 500 y
// en los registros no había ni una línea que dijera por qué, así que la causa no
// se pudo averiguar entonces y ya no se puede averiguar nunca. Un error que sólo
// se cuenta al navegador es un error que se pierde en cuanto alguien cierra la
// pestaña.
//
// Lo que se contesta NO cambia — ni el estado, ni `reason`, ni `message`. Eso es
// una promesa, no un detalle: hay cinco sitios en el navegador que miran
// `401`/`503` para decidir "vuelve a pedir la clave", el `message` se le enseña
// tal cual al cliente en el banner rojo de la web, y `slot_taken` y `slot_held`
// se distinguen por esa cadena. El registro se añade AL LADO.
export function fail(res, error) {
  const isConfig = error && error.code === "not_configured";
  const status = isConfig ? 503 : 500;
  const reason = isConfig ? "not_configured" : "database_error";

  // Qué ruta ha fallado, sin obligar a las 22 llamadas a pasarlo: Node deja la
  // petición colgando de la respuesta. Sólo el camino, nunca lo que va detrás
  // de la "?" — hoy ahí no viaja ningún dato personal (el teléfono de "mis
  // citas" va en el cuerpo), y recortarlo es lo que hace que siga siendo verdad
  // el día que alguien añada un parámetro sin pensar en esto.
  const ruta = res && res.req && typeof res.req.url === "string"
    ? res.req.url.split("?")[0]
    : "ruta desconocida";

  // El mensaje del error sí; la fila que lo provocó no. Un error de Postgres
  // puede traer dentro el nombre o el teléfono de un cliente, y un registro no
  // es sitio para eso. Por eso se escribe lo que el error dice y su traza, y
  // nada que se haya ido a buscar aparte.
  console.error(`[api] ${ruta} → ${status} ${reason}: ${(error && error.message) || "Error desconocido"}`);
  if (error && error.stack) console.error(error.stack);

  return res.status(status).json({
    ok: false,
    reason,
    message: error && error.message ? error.message : "Error desconocido",
  });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return res.status(405).json({ ok: false, reason: "method_not_allowed" });
}
