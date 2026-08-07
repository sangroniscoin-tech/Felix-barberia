// A cuánta gente de la lista de espera le sirve un hueco que se acaba de
// liberar.
//
// Vive en `_lib/` y no en una ruta propia a propósito: `api/` está en 12
// funciones, que es el techo exacto del plan de Vercel, y `_lib/` no cuenta.
// Esto no es un endpoint, es lo que `api/appointments.js` consulta antes de
// hacer sonar el móvil de Félix.
//
// **De aquí sale un número y nada más.** Ni un nombre, ni un teléfono: la
// consulta ni siquiera los pide. Ese número acaba en una notificación, que se
// pinta en una pantalla de bloqueo; quién es se ve en el panel, que pide la
// clave.
import { cuantosEncajan } from "../../shared/franja-horaria.js";
import { claveDeDia } from "../../shared/plazo-reserva.js";

// Los tramos de horario de un día, para saber dónde acaba su mañana. Salen de
// la base de datos, que es donde Félix los cambia desde el panel: una hora
// fija escrita aquí diría "mañana" de algo que ya es tarde en cuanto mueva el
// cierre de mediodía.
//
// El día de la semana se saca de la clave en UTC a propósito: "2026-08-07" es
// un viernes en cualquier huso, y leerla con el reloj local del servidor es lo
// que la haría caer en jueves de madrugada.
async function bloquesDelDia(supabase, dia) {
  const t = Date.parse(`${dia}T00:00:00Z`);
  if (Number.isNaN(t)) return [];
  const weekday = new Date(t).getUTCDay();
  const { data, error } = await supabase
    .from("schedule_ranges")
    .select("start_time,end_time")
    .eq("weekday", weekday)
    .order("start_time");
  if (error) throw new Error(error.message);
  return (data || []).map((r) => [String(r.start_time).slice(0, 5), String(r.end_time).slice(0, 5)]);
}

// Cuántos de la lista de espera encajan con el hueco { dia, hora }.
//
// Nunca lanza: contar a quién espera NO puede impedir que suene el aviso de
// cancelación. Si algo falla devuelve 0, y entonces sale el aviso de siempre,
// que es exactamente lo que salía antes de que esto existiera.
export async function cuantosEsperanPor(supabase, { dia, hora }) {
  try {
    if (!dia) return 0;
    // Sólo las tres columnas que deciden si encaja. Ni `customer_name` ni
    // `customer_phone`: lo que no se lee no puede escaparse en un push.
    const { data, error } = await supabase
      .from("waitlist")
      .select("preferred_date,preferred_slot,any_date");
    if (error) throw new Error(error.message);

    const bloques = await bloquesDelDia(supabase, dia);
    // A la forma que conocen las reglas compartidas, que es la del navegador:
    // así el panel y el servidor cuentan con la misma función y no pueden
    // discrepar en quién encaja.
    const entradas = (data || []).map((r) => ({
      dateKey: r.preferred_date,
      preferredSlot: r.preferred_slot ?? null,
      anyDate: r.any_date === true,
    }));

    // El "hoy" en la hora de la barbería, nunca el UTC del servidor: entre
    // medianoche y las dos de la mañana el servidor creería que aún es ayer y
    // contaría un día que ya pasó.
    return cuantosEncajan(entradas, { dia, hora, bloques, hoy: claveDeDia() });
  } catch (e) {
    console.warn("[espera] no se ha podido contar a quién espera:", e.message);
    return 0;
  }
}
