// Hasta cuándo se puede reservar por la web.
//
// Este fichero lo leen LAS DOS PUERTAS: el selector de día de `src/App.jsx`
// (navegador) y la validación de `api/appointments.js` (servidor). Por eso vive
// fuera de los dos: no importa nada, no depende de nada y no toca ninguna
// credencial, así que puede acabar en el paquete que descarga el navegador sin
// arrastrar nada detrás. No importes aquí nada de `api/_lib/`.
//
// El motivo de que sea un solo número: antes había un 14 escrito en la página y
// ningún número detrás de él en el servidor, y por eso se podía guardar una cita
// para 2029 llamando directamente a la ruta. Poner un 30 a cada lado repetiría
// el fallo dentro de un año. Un sitio, dos lectores.

// El plazo acordado con el cliente: un mes, contado como 30 días naturales desde
// hoy. El día 30 entra; el 31 ya no. Días naturales y no "el mismo día del mes
// que viene" porque es predecible y no tiene casos raros con meses de 28 o 31.
export const DIAS_MAX_RESERVA = 30;

// La barbería está en Zaragoza y el servidor de Vercel corre en UTC. Si el
// "hoy" se calculase en UTC, entre medianoche y las dos de la mañana el
// servidor creería que aún es ayer y el último día del plazo se quedaría corto
// justo para quien reserva de madrugada. La cuenta se hace siempre en la hora
// de la barbería, en los dos lados.
const ZONA = "Europe/Madrid";

const FORMATO = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "2026-08-03" para el instante que se le dé, leído en la hora de la barbería.
// Se monta por partes en vez de fiarse del formato del idioma.
export function claveDeDia(now = new Date()) {
  const partes = Object.fromEntries(
    FORMATO.formatToParts(now).map((p) => [p.type, p.value])
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

// Suma días naturales a una clave de día. Se hace en UTC a propósito: sobre una
// fecha ya sin hora, sumar 24 h nunca se pasa ni se queda corto por un cambio
// de horario de verano.
export function claveSumandoDias(clave, dias) {
  const [y, m, d] = clave.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + dias * 86400000);
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

// El último día que se puede pedir por la web.
export function ultimoDiaReservable(now = new Date()) {
  return claveSumandoDias(claveDeDia(now), DIAS_MAX_RESERVA);
}

// Por qué ese día no vale, o null si vale. Devuelve el texto que se le enseña a
// quien reserva, ya en castellano: la web lo puede pintar tal cual.
//
// El "hoy" sale del reloj de quien pregunta y NUNCA de la petición: si la fecha
// contra la que se compara viniera de fuera, la comprobación la decidiría quien
// llama. En el servidor, que es donde esto es una garantía, `now` no se pasa.
//
// Las dos puntas se cierran igual: hoy entra, ayer no, el día 30 entra, el 31
// no. Esto limita lo que se puede CREAR; ninguna cita que ya exista cambia.
export function motivoFueraDePlazo(dateKey, now = new Date()) {
  const hoy = claveDeDia(now);
  if (dateKey < hoy) {
    return "Ese día ya ha pasado. Elige un día de hoy en adelante, por favor.";
  }
  if (dateKey > claveSumandoDias(hoy, DIAS_MAX_RESERVA)) {
    return `Solo se puede reservar hasta ${DIAS_MAX_RESERVA} días por delante. Elige un día más cercano, o escríbenos por WhatsApp.`;
  }
  return null;
}
