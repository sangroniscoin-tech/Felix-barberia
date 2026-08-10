// El tope de reservas por rato.
//
// Reservar es público y no pide identificarse — un nombre y un teléfono es
// toda la identidad que hay aquí, y así se quiere. Lo que faltaba era un
// techo: sin él, el mismo número podía pedir cita cien veces seguidas y dejar
// a Félix con la agenda llena y la barbería vacía, mientras quien quería venir
// de verdad leía "no quedan huecos". Rompía dos de las cuatro promesas de
// `CONTEXT.md` a la vez.
//
// Vive en `_lib/` y no en una ruta propia porque `api/` está en 12 funciones,
// que es EXACTAMENTE el techo del plan Hobby de Vercel: la siguiente ruta no
// despliega. `_lib/` no cuenta.
//
// **Lo que esto frena, y lo que no.** Frena a quien repite con el mismo
// teléfono. A quien vaya cambiando de número en cada intento, no: para eso
// habría que contar también por IP, y una IP es un dato personal que obligaría
// a tocar el aviso de privacidad publicado. Es otro problema y tiene su propio
// coste; no se resuelve aquí y está dicho a propósito para que nadie crea que
// esto cierra más de lo que cierra.

// Lo que pidió el cliente: más de tres en una hora, no. La hora es MÓVIL —los
// 60 minutos anteriores a este intento—, no la hora en punto: con una ventana
// fija bastaría con esperar al cambio de hora para tener saldo doble.
export const RESERVAS_POR_HORA = 3;
const VENTANA_MS = 60 * 60 * 1000;

function desdeCuando(now = Date.now()) {
  return new Date(now - VENTANA_MS).toISOString();
}

// ¿Este teléfono ya ha hecho sus tres reservas en la última hora?
//
// Cuenta RESERVAS, no personas. Una reserva de varias personas son N filas con
// el mismo `group_id` y `group_position` de 1 a N; una cita suelta lleva las
// dos columnas a NULL. Por eso se cuentan sólo las cabezas de reserva: un
// padre con sus dos hijos es UNA, y contarla como tres le echaría contra el
// tope en su primer intento — que es el único modo en que este tope puede
// hacer daño a alguien real.
//
// No se mira el `status`: una cita cancelada también ocupó su turno. Si el
// saldo se devolviera al cancelar, reservar-cancelar-reservar sería justo la
// forma de saltarse esto.
export async function haLlegadoAlTopeDeCitas(supabase, phone, now = Date.now()) {
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("customer_phone", phone)
    .gte("created_at", desdeCuando(now))
    .or("group_position.is.null,group_position.eq.1");

  // Si la cuenta no se puede hacer, se deja pasar. Es deliberado: este tope
  // protege contra un abuso que todavía no ha ocurrido nunca, y "que se pueda
  // reservar" es una de las cuatro promesas que no pueden romperse. Un fallo
  // al contar no puede convertirse en una barbería que no coge citas.
  if (error) return false;
  return (count ?? 0) >= RESERVAS_POR_HORA;
}

// Lo mismo para la lista de espera, que es la misma puerta con otro nombre:
// `/api/waitlist` sólo inserta y tampoco tenía techo.
//
// Cuenta APARTE de las citas. Quien acaba de reservar tres veces sigue
// pudiendo apuntarse a la lista de espera, y al revés: son dos cosas distintas
// y compartir saldo castigaría a alguien por hacer las dos cosas normales.
export async function haLlegadoAlTopeDeEspera(supabase, phone, now = Date.now()) {
  const { count, error } = await supabase
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("customer_phone", phone)
    .gte("created_at", desdeCuando(now));

  if (error) return false;
  return (count ?? 0) >= RESERVAS_POR_HORA;
}

// Lo que lee quien choca. Nunca un error técnico: quien llega aquí casi
// siempre es alguien que se ha liado, no quien intenta llenar la agenda, y lo
// que necesita es saber qué ha pasado y por dónde seguir.
export function respuestaTope(res, que) {
  return res.status(429).json({
    ok: false,
    reason: "demasiadas_reservas",
    message: que === "espera"
      ? `Te has apuntado a la lista de espera varias veces seguidas. Espera un rato para volver a hacerlo, o escríbenos por WhatsApp y lo vemos.`
      : `Has hecho varias reservas seguidas. Espera un rato para hacer otra, o escríbenos por WhatsApp y te la apuntamos nosotros.`,
  });
}
