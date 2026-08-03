// Los textos del aviso a la barbería: qué se le cuenta a Félix cuando un
// cliente reserva o cancela.
//
// **Ningún aviso lleva datos personales.** Ni nombre, ni teléfono, ni correo:
// sólo el día, la hora y el servicio. El aviso se pinta en la pantalla de
// bloqueo del móvil, donde lo ve cualquiera que lo coja. Quién es se ve en el
// panel, que pide la clave. Añadir aquí un nombre desmiente el aviso de
// privacidad, que dice que fuera de la base de datos no sale ninguna persona.
//
// Aquí ya no se manda nada: el envío es el push de `push.js`. Hubo un aviso por
// correo que iba contra un Apps Script; nunca llegó a funcionar y su llamada
// costaba hasta 3 segundos por reserva, así que se quitó. Si algún día hace
// falta correo, será con un servicio que se pueda manejar desde aquí.

export function bookingNotice(appointments, serviceNames) {
  const n = appointments.length;
  return {
    subject: n > 1 ? `Nueva reserva para ${n} personas` : "Nueva cita reservada",
    body: cuerpo(appointments, serviceNames),
    url: destino(appointments, "reserva"),
  };
}

export function cancellationNotice(appointments, serviceNames) {
  const n = appointments.length;
  return {
    subject: n > 1 ? `Anulada una reserva de ${n} personas` : "Un cliente canceló su cita",
    body: cuerpo(appointments, serviceNames),
    url: destino(appointments, "cancelada"),
  };
}

// A dónde lleva tocar el aviso: al panel, en el día de esa cita y con la ficha
// de quien reservó o canceló ya abierta. Antes llevaba a la portada pública y
// dejaba a Félix a medio camino: menú, panel, clave, buscar el día, buscar la
// cita entre las demás.
//
// **Nunca el id de la cita.** Un id es una cita cancelable con sólo tenerlo
// (`PATCH /api/appointments`), y esto viaja dentro de una notificación, que es
// justo donde no puede ir. Con el día y la hora se vuelve a encontrar en el
// panel, y los dos salen ya en el cuerpo del aviso: la dirección no enseña
// nada nuevo. Sin la clave del panel no abre más que la pantalla que la pide.
//
// Va en query string sobre `/`, no en una ruta propia: el proyecto no tiene
// router ni `vercel.json`, así que una ruta nueva sería un 404.
function destino(appointments, tipo) {
  const a = appointments && appointments[0];
  if (!a || !a.dateKey || !a.time) return "/";
  return `/?aviso=${tipo}&dia=${encodeURIComponent(a.dateKey)}&hora=${encodeURIComponent(a.time)}`;
}

function cuerpo(appointments, serviceNames) {
  const a = appointments[0];
  const cuantos = appointments.length > 1 ? ` · ${appointments.length} personas` : "";
  return `${a.dateKey} a las ${a.time} · ${serviceNames[a.service] || a.service}${cuantos}`;
}
