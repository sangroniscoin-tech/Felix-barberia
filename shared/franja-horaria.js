// La raya entre la mañana y la tarde, sacada del horario del propio negocio.
//
// Este fichero lo leen LAS DOS PUERTAS, igual que `plazo-reserva.js`: el
// formulario de la lista de espera en `src/App.jsx` (navegador) y el servidor
// en `api/`. Por eso vive fuera de los dos: no importa nada, no depende de
// nada y no toca ninguna credencial, así que puede acabar en el paquete que
// descarga el navegador sin arrastrar nada detrás. No importes aquí nada de
// `api/_lib/`.
//
// El motivo de que la raya no sea una constante: Félix cambia su horario desde
// el panel. Un 14:00 escrito aquí diría "mañana" de una hora que ese día ya es
// tarde en cuanto mueva el cierre de mediodía. La raya sale de su horario o no
// sale: no se adivina.

// Los tres valores que puede tener la franja de una entrada de la lista de
// espera, y los únicos que acepta la base de datos. `null` NO está en la
// lista a propósito: `null` es "no lo dijo", que no es lo mismo que
// 'cualquiera', que es "me da igual, dicho por el cliente".
export const FRANJAS = ["manana", "tarde", "cualquiera"];

// Lo que llegue de fuera, convertido a uno de los tres valores o a `null`.
//
// Nunca lanza y nunca rechaza: una franja rara NO puede tumbar una
// inscripción. Es un campo opcional de un formulario que la gente puede dejar
// en blanco; quedarse sin apuntar a alguien por él sería perder un cliente
// para no perder un dato.
export function normalizarFranja(v) {
  return typeof v === "string" && FRANJAS.includes(v) ? v : null;
}

// Minutos desde medianoche de un "HH:MM". null si no lo es.
function minutos(hhmm) {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// El cierre de mediodía de un día, a partir de sus tramos de horario.
//
// `bloques` es lo que ya tiene el navegador para ese día de la semana:
// [["09:30","13:30"], ["16:30","19:30"]]. Devuelve
// { finManana: "13:30", inicioTarde: "16:30" }, o `null` si ese día no cierra
// a mediodía —un solo tramo, o tramos pegados—.
//
// `null` significa "ese día no tiene dos franjas", y quien lo llame no puede
// inventarse una: es exactamente el caso de un día de horario continuo.
//
// Si hubiera más de un hueco en el día, se toma el más largo: el cierre de
// mediodía es la parada de comer, no un descanso de veinte minutos.
export function corteDeMediodia(bloques) {
  if (!Array.isArray(bloques) || bloques.length < 2) return null;

  const tramos = bloques
    .map((b) => (Array.isArray(b) ? { ini: minutos(b[0]), fin: minutos(b[1]), texto: b } : null))
    .filter((t) => t && t.ini != null && t.fin != null)
    .sort((a, b) => a.ini - b.ini);

  let mejor = null;
  for (let i = 0; i < tramos.length - 1; i++) {
    const hueco = tramos[i + 1].ini - tramos[i].fin;
    if (hueco > 0 && (mejor === null || hueco > mejor.hueco)) {
      mejor = { hueco, finManana: tramos[i].texto[1], inicioTarde: tramos[i + 1].texto[0] };
    }
  }
  if (!mejor) return null;
  return { finManana: mejor.finManana, inicioTarde: mejor.inicioTarde };
}

// ---- A quién le sirve un hueco que se acaba de liberar ----
//
// Esto lo leen LAS DOS PUERTAS igual que lo de arriba: el panel de
// `src/App.jsx`, para ordenar a quién enseñarle el hueco, y `api/appointments.js`,
// para contar a cuántos puede llamar Félix antes de hacer sonar el aviso. Una
// segunda copia de estas reglas es exactamente cómo el aviso diría "hay 2
// esperando" y el panel enseñaría a 3.
//
// Una `entrada` aquí es siempre la forma que ve el navegador:
// { dateKey, preferredSlot, anyDate }. El servidor traduce sus columnas antes
// de llamar, para que la regla no tenga que conocer dos nombres de lo mismo.

// ¿Le encaja este hueco por la hora?
//
// Sin franja (`null`, "no lo dijo") y con 'cualquiera' encaja siempre: no se
// puede descartar a quien no dijo nada. Y si ese día no cierra a mediodía no
// hay raya, así que tampoco hay nada que descartar — no se inventa una hora
// fija, que es justo lo que este fichero existe para evitar.
export function encajaEnFranja(franja, hora, bloques) {
  if (franja !== "manana" && franja !== "tarde") return true;
  const corte = corteDeMediodia(bloques);
  if (!corte) return true;
  const m = minutos(hora);
  const raya = minutos(corte.inicioTarde);
  if (m == null || raya == null) return true;
  return m < raya ? franja === "manana" : franja === "tarde";
}

// En cuál de los tres grupos cae una entrada ante el hueco { dia, hora }.
//
//   1 — pedía ESE día y su franja encaja con esa hora.
//   2 — dijo "me da igual", marcó "cualquier día", o no llegó a decir franja.
//   3 — no encaja ni por franja ni por día.
//
// El 3 no se esconde: se ordena, no se filtra. Contar sólo cuenta 1 y 2, que
// es lo que hace que "hay 2 esperando" quiera decir "tienes 2 a los que llamar
// ahora" y no "hay 2 apuntados en algún sitio".
export function grupoDeEspera(entrada, { dia, hora, bloques }) {
  const franja = entrada.preferredSlot;
  const explicita = franja === "manana" || franja === "tarde";
  if (entrada.dateKey === dia && explicita && encajaEnFranja(franja, hora, bloques)) return 1;
  if (entrada.anyDate === true || franja == null || franja === "cualquiera") return 2;
  return 3;
}

// ¿Sigue valiendo esta entrada, o pedía un día que ya pasó?
//
// "Cualquier día" y "sin día" no caducan: no pedían ninguno. `hoy` es la clave
// del día en la hora de la barbería —`claveDeDia` de `plazo-reserva.js`—, nunca
// el UTC del servidor, o entre medianoche y las dos de la mañana la lista
// perdería el día de hoy.
export function esperaVigente(entrada, hoy) {
  if (entrada.anyDate === true) return true;
  if (!entrada.dateKey) return true;
  return entrada.dateKey >= hoy;
}

// Cuántos de los que siguen valiendo encajan de verdad con este hueco: los
// grupos 1 y 2, y nadie más. Es el número que viaja en el aviso al móvil.
export function cuantosEncajan(entradas, { dia, hora, bloques, hoy }) {
  if (!Array.isArray(entradas)) return 0;
  return entradas.filter(
    (e) => esperaVigente(e, hoy) && grupoDeEspera(e, { dia, hora, bloques }) <= 2
  ).length;
}
