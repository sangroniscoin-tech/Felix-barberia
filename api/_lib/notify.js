// El aviso a la barbería de que alguien ha reservado o ha cancelado.
//
// Lo manda el SERVIDOR, no el navegador. Antes lo mandaba el navegador del
// cliente, y eso significaba que quien cerrara la pestaña deprisa se quedaba
// sin avisar. Desde aquí no depende de él.
//
// Va contra el Apps Script, que es lo único que sabe mandar correo en este
// proyecto. Ese script no acepta un destinatario: lo lleva fijo dentro. La URL
// es pública —viaja en el paquete del navegador desde siempre— así que lo que
// impide que cualquiera lo use es `APPS_SCRIPT_SECRET`, que sólo existe aquí.
//
// **El aviso NO lleva datos personales.** Ni nombre, ni teléfono, ni correo:
// sólo el día, la hora y el servicio. Un correo es una copia de los datos
// fuera de la base, en una bandeja que nadie vacía nunca, y la base se limpia
// sola al año. Para saber quién es, Félix abre el panel. Añadir aquí un nombre
// es reabrir esa puerta y desmentir el aviso de privacidad, que dice que a
// Gmail no va ninguna persona.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyF4j9RdthndhkqTrLADCahcU09mCafFxJ3RGMuLiAtnQQUwKc6VbqvUVfxG6rfc942/exec";

// Tres segundos y se abandona. Se espera la respuesta a propósito —en una
// función serverless, una petición sin esperar puede morir con el proceso en
// cuanto se contesta al navegador, que es precisamente el fallo invisible del
// que venimos— pero una reserva no puede quedarse colgada esperando a Google.
const TIMEOUT_MS = 3000;

// Nunca lanza. Un correo que falla no puede tumbar una reserva: eso ya estaba
// decidido y sigue valiendo. Lo que cambia es que ahora el fallo se escribe en
// los registros del servidor en vez de desaparecer sin dejar rastro.
export async function notifyShop(subject, message) {
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!secret) {
    console.warn("[notify] APPS_SCRIPT_SECRET sin configurar: no se manda el aviso");
    return false;
  }
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ clave: secret, subject, message }),
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Apps Script responde 302 hacia googleusercontent y allí devuelve el JSON.
    // Con `redirect: "follow"` eso ya está resuelto aquí.
    const text = await res.text();
    if (!text.includes('"ok":true')) {
      console.warn("[notify] el script no confirmó el envío:", text.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[notify] no se pudo mandar el aviso:", e.message);
    return false;
  }
}

// Textos de los dos avisos, en un solo sitio para que digan lo mismo y para
// que se vea de un vistazo que ninguno lleva una persona dentro.

export function bookingNotice(appointments, serviceNames) {
  const n = appointments.length;
  const first = appointments[0];
  const detalle = appointments
    .map((a) => `  ${a.time} · ${serviceNames[a.service] || a.service}`)
    .join("\n");
  return {
    subject: n > 1 ? `Nueva reserva para ${n} personas` : "Nueva cita reservada",
    message: `Fecha: ${first.dateKey}\n${detalle}\n\nQuién es, en el panel:\nhttps://felix-barberia.vercel.app`,
  };
}

export function cancellationNotice(appointments, serviceNames) {
  const n = appointments.length;
  const first = appointments[0];
  const detalle = appointments
    .map((a) => `  ${a.time} · ${serviceNames[a.service] || a.service}`)
    .join("\n");
  return {
    subject: n > 1 ? `Anulada una reserva de ${n} personas` : "Un cliente canceló su cita",
    message: `Queda libre el ${first.dateKey}:\n${detalle}\n\nEl panel:\nhttps://felix-barberia.vercel.app`,
  };
}
