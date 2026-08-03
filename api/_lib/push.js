// El aviso que hace sonar el móvil de Félix.
//
// Web Push es un estándar del navegador, no un servicio de nadie: no hay
// cuenta que crear ni clave que pedirle a un panel al que no se puede entrar.
// Ésa es la razón de que exista este fichero en vez de arreglar el correo.
//
// **Nunca lleva datos personales.** Un aviso se pinta en la pantalla de
// bloqueo, donde lo ve cualquiera que coja el teléfono: es peor sitio que una
// bandeja de entrada. Día, hora y servicio. Quién es se ve en el panel, que
// pide la clave.
import webpush from "web-push";
import { getSupabase } from "./supabase.js";

// A quién reclama el servidor de push si algo va mal. Tiene que ser un mailto
// o una URL; es del proyecto, no de ningún cliente.
const VAPID_SUBJECT = "mailto:felixbarberiazgz@gmail.com";

// La pareja de claves que demuestra que el aviso lo manda este servidor. Se
// generan solas la primera vez y se guardan; a partir de ahí son fijas —
// cambiarlas invalidaría todas las suscripciones existentes.
let cached = null;

export async function getKeys() {
  if (cached) return cached;
  const supabase = getSupabase();

  const { data } = await supabase.from("push_keys").select("public_key,private_key").eq("id", 1).maybeSingle();
  if (data && data.public_key && data.private_key) {
    cached = { publicKey: data.public_key, privateKey: data.private_key };
    return cached;
  }

  const fresh = webpush.generateVAPIDKeys();
  // `upsert` y no `insert`: si dos peticiones llegan a la vez, la segunda no
  // puede pisar la pareja que la primera ya repartió a un navegador.
  const { data: saved, error } = await supabase
    .from("push_keys")
    .upsert({ id: 1, public_key: fresh.publicKey, private_key: fresh.privateKey }, { onConflict: "id", ignoreDuplicates: true })
    .select("public_key,private_key")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (saved && saved.public_key) {
    cached = { publicKey: saved.public_key, privateKey: saved.private_key };
  } else {
    const { data: existing } = await supabase.from("push_keys").select("public_key,private_key").eq("id", 1).single();
    cached = { publicKey: existing.public_key, privateKey: existing.private_key };
  }
  return cached;
}

// La pública es pública por definición: el navegador la necesita para
// suscribirse. La privada no sale de aquí.
export async function publicKey() {
  return (await getKeys()).publicKey;
}

// Manda el aviso a todos los navegadores apuntados. Nunca lanza: una reserva
// no se cae porque falle una notificación.
//
// Una suscripción muerta —el navegador se borró, Félix cambió de móvil— se
// borra sola. El servidor de push contesta 404 o 410, y si no se limpian se
// acumulan para siempre y cada aviso tarda más.
export async function sendPush({ title, body, url }) {
  try {
    const supabase = getSupabase();
    const { data: subs } = await supabase.from("push_subscriptions").select("endpoint,p256dh,auth");
    if (!subs || subs.length === 0) return 0;

    const keys = await getKeys();
    webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);

    const payload = JSON.stringify({ title, body, url });
    const muertas = [];
    let enviados = 0;

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600 }
        );
        enviados += 1;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) muertas.push(s.endpoint);
        else console.warn("[push] fallo al enviar:", e && e.message);
      }
    }));

    if (muertas.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", muertas);
    }
    return enviados;
  } catch (e) {
    console.warn("[push] no se pudo avisar:", e.message);
    return 0;
  }
}
