// Cambiar lo que se cobró de verdad por una cita.
//
// Félix le rebaja el precio a los clientes de años: donde la lista dice 12 él
// cobra 10. Sin esto, el total del día —que lo suma el servidor con el precio
// de cada cita— dice 12, y al cerrar la caja el efectivo, que es el total
// menos tarjeta menos Bizum, le sale de más.
//
// Escribe `charged_price` y NO toca `price`. `price` es lo que costaba el
// servicio el día que se reservó, y es lo que el cliente sigue leyendo cuando
// busca su cita con su teléfono. Separadas, siempre se puede ver qué se dijo y
// qué se cobró; pisar una perdería la otra.
//
// Esto lo hace FÉLIX, no un cliente, y por eso pide el pase del panel. Es lo
// contrario que /api/waitlist: aquella es pública porque la escribe quien
// reserva; ésta es la contabilidad del negocio y no la escribe nadie más.
//
// Tiene ruta propia en vez de colarse en PATCH /api/appointments a propósito.
// Esa ruta es PÚBLICA —cancela y marca "no se presentó" sabiendo solo el
// identificador— y meterle un campo que exige pase mezclaría dos niveles de
// permiso en un mismo sitio. Una ruta, una cosa.
//
// Hasta #79 esta misma ruta apuntaba cómo se había pagado, efectivo o tarjeta
// o Bizum. Aquello se quitó y el hueco es el que ocupa esto: `api/` está en 12
// funciones, que es el techo de Vercel Hobby, y una más no despliega.
// `payment_method` se queda con lo que se marcó entonces y ya no se escribe
// desde ningún sitio.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { appointmentOut } from "./_lib/shape.js";

// Un corte no vale mil euros. El tope no está para adivinar su tarifa sino
// para que un dedazo en el teclado no entre en la contabilidad como si tal
// cosa y descuadre el día entero.
const IMPORTE_MAXIMO = 1000;

export default async function handler(req, res) {
  if (req.method !== "PATCH") return methodNotAllowed(res, ["PATCH"]);

  // Antes de mirar el cuerpo: nada de lo que mande quien no se ha
  // identificado llega a interpretarse.
  const denied = requireAdmin(req);
  if (denied) return res.status(denied.status).json(denied.body);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return fail(res, e);
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  const id = body.id;
  if (!id) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_input",
      field: "id",
      message: "Falta el identificador de la cita.",
    });
  }

  // Vacío devuelve la cita a su precio normal. Es la vuelta atrás de un
  // dedazo, y tiene que poder distinguirse de un 0 escrito a conciencia: 0 es
  // un corte regalado, que es una cifra de verdad.
  const importe = leerImporte(body.importe);
  if (importe === INVALIDO) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_input",
      field: "importe",
      message: `Escribe un importe entre 0 y ${IMPORTE_MAXIMO} €.`,
    });
  }

  try {
    // Se valida aquí aunque el panel también lo haga: el navegador es una
    // comodidad y cualquiera puede saltárselo.
    //
    // Las canceladas se quedan fuera — no están en el panel, no cuentan en el
    // dinero y no se les cobró nada. En un grupo se cambia persona a persona,
    // a diferencia de lo que hacía la forma de pago: un descuento es de un
    // cliente concreto, no de la reserva entera.
    const { data, error } = await supabase
      .from("appointments")
      .update({ charged_price: importe })
      .eq("id", id)
      .neq("status", "cancelled")
      .select()
      .single();
    if (error || !data) {
      return res.status(404).json({ ok: false, reason: "not_found", message: "Esa cita ya no existe." });
    }
    return res.status(200).json({ ok: true, appointment: appointmentOut(data) });
  } catch (e) {
    return fail(res, e);
  }
}

// Marca de "esto no es un importe", que no puede ser null porque null es una
// respuesta válida: la de volver al precio del servicio.
const INVALIDO = Symbol("importe_invalido");

function leerImporte(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > IMPORTE_MAXIMO) return INVALIDO;
  // A céntimos: lo que llega del navegador puede traer los decimales que
  // quiera, y el dinero de un día no se suma con tres.
  return Math.round(n * 100) / 100;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
