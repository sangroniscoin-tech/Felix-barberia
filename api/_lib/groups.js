// Reservas para varias personas en una sola cita.
//
// Un grupo son 1, 2 o 3 personas a las que atiende el mismo barbero SEGUIDAS,
// empezando a la hora elegida: la segunda entra cuando acaba la primera, en el
// orden en que se han metido.
//
// Las horas de cada persona las calcula el servidor encadenando las duraciones
// que lee de `services`. Nunca se acepta la hora que mande el navegador, por lo
// mismo que no se acepta la duración ni el precio: si no, cualquiera reservaría
// tres cortes en cinco minutos.
import { toMin } from "./holds.js";
import { cleanName } from "./shape.js";

// El tope acordado con el cliente. Más de tres deja media mañana ocupada desde
// una sola reserva hecha en un móvil. Se valida AQUÍ, en el servidor: lo que
// valide el navegador es comodidad.
export const MAX_GROUP_PEOPLE = 3;

// Félix, desde su panel, puede meter hasta cinco: se lo piden por teléfono y él
// sabe lo que le cabe en el día; quien reserva desde la web, no. El tope alto
// SOLO se aplica con un pase de administrador válido. Ausente, caducado o
// inventado, se cae al tope público — cerrado por defecto, nunca abierto.
export const MAX_GROUP_PEOPLE_ADMIN = 5;

function toHHMM(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Un identificador de grupo. Con él se cancela el grupo entero, así que es tan
// secreto como el id de una cita: nunca sale por una ruta pública.
export function newGroupId() {
  return `g${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

// Lee las personas de la petición.
//
// Hay dos formas y las dos tienen que seguir valiendo:
//   { name, service }                       ← una sola cita, la de siempre.
//                                             La usa el panel de Félix.
//   { people: [{ name, service }, …] }      ← un grupo de hasta tres.
//
// Devuelve { people } o { error: { field, message } }.
export function readPeople(body, maxPeople = MAX_GROUP_PEOPLE) {
  const raw = body.people;

  if (raw === undefined || raw === null) {
    return {
      people: [{ service: body.service, name: cleanName(body.name), rawName: body.name ?? null }],
    };
  }

  if (!Array.isArray(raw)) {
    return { error: { field: "people", message: "La lista de personas no es válida." } };
  }
  if (raw.length < 1) {
    return { error: { field: "people", message: "Falta a quién es la cita." } };
  }
  if (raw.length > maxPeople) {
    return {
      error: {
        field: "people",
        message: `Como mucho se puede reservar para ${maxPeople} personas de una vez.`,
      },
    };
  }

  const people = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") {
      return { error: { field: "people", message: "La lista de personas no es válida." } };
    }
    people.push({ service: p.service, name: cleanName(p.name), rawName: p.name ?? null });
  }
  return { people };
}

// Lee los servicios de una reserva temporal: uno solo, o los de todo el grupo.
//   { service: "corte" }              ← la forma de siempre.
//   { services: ["corte", "barba"] }  ← el tramo entero del grupo.
export function readServiceIds(body, maxPeople = MAX_GROUP_PEOPLE) {
  const raw = body.services;
  if (raw === undefined || raw === null) return { ids: [body.service] };
  if (!Array.isArray(raw) || raw.length < 1) {
    return { error: { field: "services", message: "La lista de servicios no es válida." } };
  }
  if (raw.length > maxPeople) {
    return {
      error: {
        field: "services",
        message: `Como mucho se puede reservar para ${maxPeople} personas de una vez.`,
      },
    };
  }
  return { ids: raw };
}

// Encadena las horas: la primera a la hora elegida, cada siguiente cuando
// acaba la anterior. Devuelve { starts, totalMinutes } o { error }.
export function chainTimes(startTime, durations) {
  const first = toMin(startTime);
  const starts = [];
  let cursor = first;
  for (const d of durations) {
    starts.push(toHHMM(cursor));
    cursor += d;
  }
  // Un grupo no puede terminar al día siguiente. No debería llegar aquí nunca
  // —el navegador solo ofrece horas donde cabe el grupo entero— pero el
  // servidor no da nada por hecho.
  if (cursor > 24 * 60) {
    return { error: { message: "El grupo no cabe en ese horario. Elige otra hora, por favor." } };
  }
  return { starts, totalMinutes: cursor - first };
}
