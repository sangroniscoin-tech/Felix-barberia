// Apuntar el navegador de Félix a los avisos, y darle la clave pública que
// necesita para suscribirse.
//
// Detrás de la clave del panel a propósito: sin eso, cualquiera podría
// suscribir su navegador a los avisos de la barbería y enterarse de cada
// reserva. No lleva datos de clientes, pero saber cuándo entra trabajo en un
// negocio tampoco es de nadie más.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { publicKey, sendPush } from "./_lib/push.js";

export default async function handler(req, res) {
  const denied = requireAdmin(req);
  if (denied) return res.status(denied.status).json(denied.body);

  // La clave pública, para que el navegador pueda suscribirse.
  if (req.method === "GET") {
    try {
      return res.status(200).json({ ok: true, publicKey: await publicKey() });
    } catch (e) {
      return fail(res, e);
    }
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

    // Un aviso de prueba, para que Félix compruebe al momento que funciona en
    // vez de tener que esperar a que reserve alguien.
    if (body.test) {
      const n = await sendPush({
        title: "Los avisos funcionan",
        body: "Así te avisaré cuando alguien reserve o cancele.",
        url: "/",
      });
      return res.status(200).json({ ok: true, sent: n });
    }

    const sub = body.subscription;
    if (!sub || typeof sub.endpoint !== "string" || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ ok: false, reason: "bad_request", message: "Falta la suscripción." });
    }

    try {
      const supabase = getSupabase();
      // Por `endpoint`, que es la clave primaria: volver a darle al botón en el
      // mismo navegador actualiza la fila en vez de duplicarla.
      const { error } = await supabase.from("push_subscriptions").upsert({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: typeof body.userAgent === "string" ? body.userAgent.slice(0, 300) : null,
        last_ok_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return fail(res, e);
    }
  }

  // Desactivar los avisos en este navegador.
  if (req.method === "DELETE") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
    const endpoint = body.endpoint;
    if (!endpoint) return res.status(400).json({ ok: false, reason: "bad_request", message: "Falta la suscripción." });
    try {
      const supabase = getSupabase();
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return fail(res, e);
    }
  }

  return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
