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
  };
}

export function cancellationNotice(appointments, serviceNames) {
  const n = appointments.length;
  return {
    subject: n > 1 ? `Anulada una reserva de ${n} personas` : "Un cliente canceló su cita",
    body: cuerpo(appointments, serviceNames),
  };
}

function cuerpo(appointments, serviceNames) {
  const a = appointments[0];
  const cuantos = appointments.length > 1 ? ` · ${appointments.length} personas` : "";
  return `${a.dateKey} a las ${a.time} · ${serviceNames[a.service] || a.service}${cuantos}`;
}
