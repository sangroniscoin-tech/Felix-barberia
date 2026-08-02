// Entrar en el panel de barbero.
//
// Aquí es donde se comprueba la clave, en el servidor. Antes se comparaban dos
// cadenas dentro del navegador con la clave escrita en el propio código: eso
// no era una puerta, era un cartel. Cualquiera podía leerla y cualquiera podía
// saltarse la comparación.
//
// Lo que sale de aquí hacia el navegador es un pase firmado que caduca. La
// clave no sale nunca.
import { getAdminPassword, passwordMatches, issueToken, SESSION_SECONDS } from "./_lib/adminAuth.js";
import { methodNotAllowed } from "./_lib/supabase.js";

// Un retardo fijo en cada intento fallido, para que no se puedan probar claves
// a toda velocidad. No es un bloqueo a propósito: bloquear la cuenta dejaría a
// Félix fuera de su propio panel, y "que Félix vea el día" pesa más que
// ponérselo algo más difícil a quien ya tiene que acertar a ciegas.
const WRONG_PASSWORD_DELAY_MS = 700;

export default async function handler(req, res) {
  // Una sesión no se cachea jamás, ni en el navegador ni por el camino.
  res.setHeader("Cache-Control", "no-store");

  const password = getAdminPassword();

  // Sirve para comprobar, después de un despliegue, que la variable de entorno
  // está puesta — sin conocer la clave y sin poder deducir nada de ella. No
  // dice la longitud, ni da pistas: solo sí o no.
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, configured: password !== null });
  }

  if (req.method === "POST") {
    if (!password) {
      return res.status(503).json({
        ok: false,
        reason: "not_configured",
        message: "Falta configurar la clave del panel en el servidor.",
      });
    }

    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

    if (!passwordMatches(body.password, password)) {
      await sleep(WRONG_PASSWORD_DELAY_MS);
      return res.status(401).json({
        ok: false,
        reason: "bad_password",
        message: "Clave incorrecta. Inténtalo de nuevo.",
      });
    }

    const now = Date.now();
    return res.status(200).json({
      ok: true,
      token: issueToken(password, now),
      expiresAt: new Date(now + SESSION_SECONDS * 1000).toISOString(),
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
