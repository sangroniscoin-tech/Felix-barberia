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

  try {
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
