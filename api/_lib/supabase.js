// El ÚNICO sitio donde se leen las credenciales de la base de datos.
//
// Este fichero vive en api/, que Vercel ejecuta en el servidor. Nunca se
// empaqueta en el JavaScript que descarga el navegador, así que la clave
// service_role no sale de aquí. Si algún día alguien importa este módulo
// desde src/, la clave acabaría en el móvil de cada cliente: no se hace.
import { createClient } from "@supabase/supabase-js";

let client = null;

// ---------------------------------------------------------------------------
// El reintento del desajuste de reloj (#121)
//
// Tres veces en una semana —medidas en el agregador de Vercel, del 19 al 25 de
// agosto de 2026— Supabase rechazó la credencial del servidor en su propia
// puerta, antes de que Postgres viera nada, diciendo "JWT issued at future".
// La credencial es válida; el rechazo dura un instante; el mismo intento
// repetido un momento después funciona. Una de esas tres le saltó a Félix en la
// cara mientras miraba el panel.
//
// Se reintenta SOLO Y EXCLUSIVAMENTE ese rechazo. Nunca "cualquier 401", nunca
// "cualquier 5xx", nunca un fallo de red. La razón es cara: un reintento amplio
// sobre una escritura PUEDE DUPLICAR UNA CITA. Este rechazo concreto ocurre
// antes de que la sentencia llegue a la base de datos, así que no se escribió
// nada y repetirla es seguro; ninguna otra cosa ofrece esa garantía. Cualquier
// "simplificación" futura que lo convierta en un reintento genérico reintroduce
// la doble reserva. Está en ADR.md por eso mismo.
//
// Si se agotan los intentos, no cambia nada de nada: el error sube igual que
// hoy y fail() contesta exactamente lo mismo. Esto hace que el fallo pase
// menos, no cambia lo que se ve cuando pasa.
// ---------------------------------------------------------------------------

// Las marcas de ESE rechazo, y de ningún otro. Se comparan en minúsculas contra
// el cuerpo de la respuesta. "JWT issued at future" es la que se observó en
// producción; las otras dos son la misma avería dicha de otra forma (`nbf` en
// lugar de `iat`, y la forma que usa GoTrue). Añadir una cadena aquí es ampliar
// lo que se reintenta: no se hace sin pensar en la duplicación de citas.
const MARCAS_DE_RELOJ_DESAJUSTADO = [
  "jwt issued at future",
  "jwt not yet valid",
  "token used before issued",
];

// Como mucho 2 intentos extra (3 en total). Peor caso ~1,3 s añadidos, y sólo
// en el camino que hoy ya iba a fallar. El camino normal no paga nada: sin la
// marca, la respuesta se devuelve tal cual a la primera.
const REINTENTOS_MAXIMOS = 2;
const ESPERAS_MS = [300, 1000];

const duerme = (ms) => new Promise((r) => setTimeout(r, ms));

// Sólo el camino, nunca lo que va detrás de la "?" — igual que en fail(), y aquí
// importa más: PostgREST mete los filtros en la query, así que ahí puede viajar
// el teléfono de un cliente. Un registro no es sitio para eso.
function rutaDe(entrada) {
  try {
    const url = typeof entrada === "string" ? entrada : entrada && entrada.url;
    return typeof url === "string" ? url.split("?")[0] : "consulta desconocida";
  } catch {
    return "consulta desconocida";
  }
}

// Se mira sobre un CLON. Leer el cuerpo lo consume, y quien llamó necesita el
// suyo intacto: si se leyera el original, la respuesta que se devuelve llegaría
// vacía a supabase-js y un error normal dejaría de parecerse a sí mismo.
async function esRechazoPorReloj(res) {
  if (res.ok) return false;
  try {
    const cuerpo = (await res.clone().text()).toLowerCase();
    return MARCAS_DE_RELOJ_DESAJUSTADO.some((marca) => cuerpo.includes(marca));
  } catch {
    // Si el cuerpo no se puede leer no se sabe qué error es, y lo que no se
    // sabe no se reintenta.
    return false;
  }
}

// El fetch que se le pasa a createClient. Envuelve al normal, así que las trece
// rutas del servidor y todas sus consultas heredan esto sin tocar un solo sitio
// de llamada.
async function fetchConReintento(entrada, opciones) {
  // Repetir una Request cuyo cuerpo ya se ha consumido lanza, y eso le cambiaría
  // el error a quien llamó. supabase-js siempre llama con (url, opciones), así
  // que esto es un cinturón además de los tirantes: si no se puede repetir con
  // seguridad, no se reintenta.
  const repetible = typeof entrada === "string" || entrada instanceof URL;

  let res = await fetch(entrada, opciones);
  if (!repetible) return res;

  for (let intento = 1; intento <= REINTENTOS_MAXIMOS; intento++) {
    if (!(await esRechazoPorReloj(res))) return res;

    const espera = ESPERAS_MS[intento - 1];
    // Queda escrito. Una llamada que se salva al segundo intento no pasa por
    // fail(), así que sin esta línea el tropiezo sería invisible y dentro de
    // tres meses no habría forma de saber si esto sigue ocurriendo.
    console.warn(
      `[api] ${rutaDe(entrada)} → reintento ${intento}/${REINTENTOS_MAXIMOS} en ${espera} ms: ` +
        `Supabase rechazó la credencial por desajuste de reloj (#121)`
    );
    await duerme(espera);
    res = await fetch(entrada, opciones);
  }

  // Agotados los intentos, se devuelve el último rechazo tal cual: el error sube
  // igual que hoy y fail() contesta exactamente lo mismo.
  return res;
}

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
    // Aquí es donde entra el reintento del desajuste de reloj (#121). Este es
    // el único sitio donde se crea el cliente, así que ponerlo aquí lo pone en
    // todas partes.
    global: { fetch: fetchConReintento },
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
