// El cierre de caja de un día: Félix escribe lo que marcó el datáfono y lo que
// le entró por Bizum, y el efectivo es lo que queda del total del día.
//
// Ruta propia, con PUT (crear o corregir) y DELETE (deshacer), por la misma
// razón que /api/cobro tiene la suya: PATCH /api/appointments es PÚBLICA —
// cancela sabiendo sólo el identificador— y meterle algo que exige el pase del
// panel juntaría dos niveles de permiso en un mismo sitio. Una ruta, una cosa.
//
// El efectivo NO viaja y NO se guarda: se calcula restando. Y el total del día
// tampoco se acepta de quien llama: lo calcula el servidor con las citas
// reales, porque si el total lo pusiera el navegador, la comprobación de que
// tarjeta y Bizum no se pasan del día la decidiría quien la tiene que pasar.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { closeOut } from "./_lib/shape.js";
import { claveDeDia } from "../shared/plazo-reserva.js";

// La barbería está en Zaragoza y Vercel corre en UTC. "Hoy" y "esa hora ya ha
// pasado" se deciden en la hora de la barbería, igual que el plazo de reserva:
// entre medianoche y las dos de la mañana el servidor creería que aún es ayer,
// y un cierre hecho al terminar la jornada se rechazaría por "día futuro".
const HORA_MADRID = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function minutosAhoraMadrid(now = new Date()) {
  const partes = Object.fromEntries(
    HORA_MADRID.formatToParts(now).map((p) => [p.type, p.value])
  );
  return Number(partes.hour) * 60 + Number(partes.minute);
}

function minutosDeHora(hhmmss) {
  const [h, m] = String(hhmmss).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Los importes se manejan en CÉNTIMOS, en entero. Sumar euros en coma flotante
// es cómo 10,10 + 10,20 acaba valiendo 20,299999999999997 y un cierre que
// cuadra exactamente se rechaza por pasarse del total por una millonésima.
//
// Devuelve null si lo que llega no es un importe: no numérico, negativo, con
// más de dos decimales, o cualquier cosa que no sea un número escrito. Se
// admite la coma decimal porque un teclado español la pone antes que el punto.
function importeCentimos(v) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    v = String(v);
  }
  if (typeof v !== "string") return null;
  const s = v.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(c)) return null;
  return c;
}

function euros(centimos) {
  return (centimos / 100).toFixed(2).replace(".", ",");
}

function esFecha(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function invalido(res, field, message) {
  return res.status(400).json({ ok: false, reason: "invalid_input", field, message });
}

// El total cobrado de un día, en céntimos, calculado en el servidor.
//
// Deja fuera exactamente lo que ya dice ADR.md que no es dinero cobrado: las
// canceladas, los ausentes —que valen 0 €— y las citas cuya hora todavía no ha
// llegado, que son previsión y no caja. Es la misma regla que la pantalla del
// panel, y por eso la cifra que Félix ve mientras teclea es la misma contra la
// que se le valida aquí.
async function totalDelDiaCentimos(supabase, dateKey, now = new Date()) {
  const [citas, servicios] = await Promise.all([
    supabase
      .from("appointments")
      .select("start_time, charged_price, price, service_id")
      .eq("appointment_date", dateKey)
      .eq("is_sample_data", false)
      .neq("status", "cancelled")
      .neq("status", "no_show"),
    supabase.from("services").select("id, price"),
  ]);
  for (const r of [citas, servicios]) if (r.error) throw new Error(r.error.message);

  // Las dos filas migradas antiguas no guardan precio. No se inventa: se toma
  // el que vale hoy ese servicio, igual que hace el panel.
  const precioDe = {};
  for (const s of servicios.data || []) precioDe[s.id] = Math.round(Number(s.price) * 100);

  const hoy = claveDeDia(now);
  // Un día ya pasado tiene todas sus horas pasadas; hoy, sólo las que ya han
  // sonado. Un día futuro no llega hasta aquí: se rechaza antes.
  const limite = dateKey < hoy ? Infinity : dateKey === hoy ? minutosAhoraMadrid(now) : -Infinity;

  // La cascada del dinero, y el orden importa: primero lo que Félix cobró de
  // verdad —le rebaja el precio a los clientes de años—, luego lo que costaba
  // el servicio al reservar, y sólo si no hay ninguna de las dos, lo que vale
  // hoy. Es la misma que usa el panel, y tiene que seguir siéndolo: ésta es la
  // cifra contra la que se valida un cierre, así que si se separan, Félix
  // cerraría contra un total distinto del que está leyendo.
  let total = 0;
  for (const c of citas.data || []) {
    if (minutosDeHora(c.start_time) > limite) continue;
    const cobrado = c.charged_price != null ? c.charged_price : c.price;
    total += cobrado != null ? Math.round(Number(cobrado) * 100) : (precioDe[c.service_id] ?? 0);
  }
  return total;
}

export default async function handler(req, res) {
  if (req.method !== "PUT" && req.method !== "DELETE") {
    return methodNotAllowed(res, ["PUT", "DELETE"]);
  }

  // Antes de mirar el cuerpo, como /api/cobro: nada de lo que mande quien no
  // se ha identificado llega a interpretarse, y sin pase no se toca la base.
  const denied = requireAdmin(req);
  if (denied) return res.status(denied.status).json(denied.body);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return fail(res, e);
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const dateKey = body.dateKey ?? (req.query && req.query.dia);

  if (!esFecha(dateKey)) {
    return invalido(res, "dateKey", "La fecha del cierre no es válida.");
  }

  try {
    if (req.method === "DELETE") {
      // Deshacer. El día vuelve a contarse por las marcas de cada cita, que
      // nunca se tocaron: un cierre no escribe nada en ninguna cita.
      const { error } = await supabase.from("daily_closes").delete().eq("close_date", dateKey);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, dateKey });
    }

    // No se cierra un día que todavía no ha llegado: no hay nada cobrado que
    // repartir, y el importe sería inventado.
    if (dateKey > claveDeDia()) {
      return invalido(res, "dateKey", "Ese día todavía no ha llegado. No se puede cerrar.");
    }

    const tarjeta = importeCentimos(body.tarjeta);
    if (tarjeta === null) {
      return invalido(res, "tarjeta", "El importe de tarjeta tiene que ser un número de cero para arriba, con dos decimales como mucho.");
    }
    const bizum = importeCentimos(body.bizum);
    if (bizum === null) {
      return invalido(res, "bizum", "El importe de Bizum tiene que ser un número de cero para arriba, con dos decimales como mucho.");
    }

    const total = await totalDelDiaCentimos(supabase, dateKey);
    if (total === 0) {
      return invalido(res, "dateKey", "Ese día no hay ninguna cita cobrada, así que no hay nada que cerrar.");
    }
    if (tarjeta + bizum > total) {
      return invalido(
        res,
        "tarjeta",
        `Tarjeta y Bizum suman ${euros(tarjeta + bizum)} €, más que el total del día (${euros(total)} €). Repasa los importes.`
      );
    }

    // Crear y corregir son la misma operación: una fila por día. Corregir no
    // pide deshacer antes, que es justo lo que se pidió. `closed_at` no se
    // toca al corregir —se queda cuándo se cerró— y `updated_at` sí.
    const { data, error } = await supabase
      .from("daily_closes")
      .upsert(
        { close_date: dateKey, card_total: tarjeta / 100, bizum_total: bizum / 100, updated_at: new Date().toISOString() },
        { onConflict: "close_date" }
      )
      .select()
      .single();
    if (error || !data) throw new Error(error ? error.message : "No se ha podido guardar el cierre.");

    // El total va de vuelta para que el panel pinte el efectivo con la misma
    // cifra con la que se ha validado, sin volver a calcularla por su cuenta.
    return res.status(200).json({ ok: true, close: closeOut(data), total: total / 100 });
  } catch (e) {
    return fail(res, e);
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
