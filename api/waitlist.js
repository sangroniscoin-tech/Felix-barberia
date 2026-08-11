// Apuntarse a la lista de espera.
//
// Esto lo hace un CLIENTE, no Félix, así que la ruta es pública y no pide
// identificación. Antes iba por POST /api/admin, la misma puerta que usa el
// panel; al ponerle candado a esa puerta los clientes se quedaron fuera con
// ella. De ahí que la lista de espera tenga la suya.
//
// Pública no quiere decir abierta: aquí solo se puede AÑADIR una fila. No se
// lee la lista, no se borra y no se sustituye. Quien llame a esto no puede
// sacar el nombre ni el teléfono de nadie que ya esté apuntado.
//
// Toda la validación se hace AQUÍ, aunque el navegador ya haya validado.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { cleanName, cleanPhone, isValidPhone, isValidDateKey } from "./_lib/shape.js";
import { normalizarFranja } from "../shared/franja-horaria.js";
import { haLlegadoAlTopeDeEspera, respuestaTope } from "./_lib/ritmo.js";

function bad(res, message, field) {
  return res.status(400).json({ ok: false, reason: "invalid_input", field, message });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return fail(res, e);
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  const name = cleanName(body.name);
  const phone = cleanPhone(body.phone);

  if (!name) return bad(res, "Falta el nombre.", "name");
  if (!isValidPhone(phone)) {
    return bad(res, "El teléfono no parece válido. Escribe al menos 9 dígitos, sin espacios ni letras.", "phone");
  }

  // El día es opcional —alguien puede apuntarse sin uno concreto— pero si
  // viene tiene que ser un día de verdad.
  const dateKey = body.dateKey == null || body.dateKey === "" ? null : body.dateKey;
  if (dateKey !== null && !isValidDateKey(dateKey)) return bad(res, "Ese día no es válido.", "dateKey");

  // Cuándo puede venir. Los dos son OPCIONALES y ninguno de los dos puede
  // tumbar una inscripción: quien no conteste se apunta igual, que es lo que
  // se acordó. Por eso una franja que no sea una de las tres se guarda como
  // `null` —"no lo dijo"— en vez de devolver un 400. Un formulario más largo
  // que rechaza gente es peor que un dato menos.
  const preferredSlot = normalizarFranja(body.preferredSlot);
  // A booleano de verdad: "false", 0 o un objeto no pueden acabar en una
  // columna `not null` de Postgres.
  const anyDate = body.anyDate === true || body.anyDate === "true";

  try {
    // El mismo tope que las citas, porque esto es la misma puerta con otro
    // nombre: pública, sólo inserta, y hasta ahora sin techo. La cuenta es
    // APARTE de la de las citas — quien acaba de reservar sigue pudiendo
    // apuntarse aquí, que es una cosa normal y no un abuso.
    //
    // Esta ruta no tiene pase de administrador que valga: Félix no se apunta a
    // su propia lista de espera, la gestiona desde el panel por otro camino.
    if (await haLlegadoAlTopeDeEspera(supabase, phone)) {
      return respuestaTope(res, "espera");
    }

    // El servicio se comprueba contra la tabla, igual que al crear una cita:
    // no se acepta cualquier cadena que mande el navegador.
    let serviceId = null;
    if (body.service) {
      const { data: service } = await supabase
        .from("services").select("id").eq("id", body.service).eq("active", true).single();
      if (!service) return bad(res, "Ese servicio no existe.", "service");
      serviceId = service.id;
    }

    const { error } = await supabase.from("waitlist").insert({
      customer_name: name,
      customer_phone: phone,
      service_id: serviceId,
      preferred_date: dateKey,
      // `preferred_date` y `any_date` conviven: se puede marcar "cualquier
      // día" estando mirando el jueves, y entonces se guardan los dos. El día
      // sigue diciendo por dónde entró, que es información real.
      preferred_slot: preferredSlot,
      any_date: anyDate,
      // El recorte a 280 ya estaba aquí antes de que el formulario público
      // mandase nota. Una nota larguísima se recorta y se guarda; no es un
      // error.
      note: typeof body.note === "string" ? body.note.trim().slice(0, 280) : "",
    });
    if (error) throw new Error(error.message);

    // A propósito no se devuelve nada de la lista, ni siquiera la fila recién
    // creada: al navegador que se apunta no le hace falta y sería superficie
    // de más en una ruta que cualquiera puede llamar.
    return res.status(201).json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
